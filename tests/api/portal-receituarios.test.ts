import { beforeAll, describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { NursingPrescription } from '@/domain/clinical/nursing-prescription';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient } from '../support/builders';
import { ensureClinic } from '../support/clinics';
import { linkPortalAccount } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Receituário no portal (#956, ADR-116): o paciente vê e baixa só os dele,
 * exatamente como emitidos; o anonimizado não aparece; o parceiro não entra.
 */

const CLINIC = 'clinica-portal-receituario';

let list: typeof import('@/app/api/portal/patient/receituarios/route');
let item: typeof import('@/app/api/portal/patient/receituarios/[id]/route');

interface Envelope<T> {
  data: T;
  error: string | null;
}

const content = (patientName: string) => ({
  issuer: { name: 'Clínica', document: null, registry: null, address: null },
  city: null,
  patientName,
  items: [{ label: 'Cuidados com lesões', frequency: 'diária' }],
  freeText: null,
  signer: { name: 'Enf. Ana', registry: 'COREN-SP 1' },
});

async function seedPatientWithPrescription() {
  const repos = await getRepositories(clinicScope(CLINIC));
  const patient = buildPatient({ fullName: 'Maria Portal' });
  await repos.patients.save(patient);
  await linkPortalAccount({
    role: 'patient',
    email: patient.email as string,
    recordId: patient.id,
    clinicId: CLINIC,
  });
  const plan = CarePlan.create({ patientId: patient.id });
  await repos.carePlans.save(plan);
  const prescription = NursingPrescription.create({
    carePlanId: plan.id,
    patientId: patient.id,
    issuedBy: 'ana@clinica.com',
    content: content(patient.fullName),
  });
  await repos.nursingPrescriptions.save(prescription);
  const anonymized = NursingPrescription.restore({
    id: `anon-${prescription.id}`,
    carePlanId: plan.id,
    patientId: patient.id,
    issuedBy: 'ana@clinica.com',
    issuedAt: new Date('2025-01-01T12:00:00Z'),
    content: null,
  });
  await repos.nursingPrescriptions.save(anonymized);
  const cookie = cookieHeaderFor('patient', patient.email as string, CLINIC);
  return { patient, prescription, anonymized, cookie };
}

const listFor = (headers: Record<string, string>) =>
  list.GET(
    jsonRequest('/api/portal/patient/receituarios', 'GET', undefined, headers),
  );

const downloadFor = (id: string, headers: Record<string, string>) =>
  item.GET(
    jsonRequest(
      `/api/portal/patient/receituarios/${id}`,
      'GET',
      undefined,
      headers,
    ),
    { params: Promise.resolve({ id }) },
  );

beforeAll(async () => {
  list = await import('@/app/api/portal/patient/receituarios/route');
  item = await import('@/app/api/portal/patient/receituarios/[id]/route');
  await ensureClinic(CLINIC);
});

describe('Feature: receituário no portal do paciente (#956, ADR-116)', () => {
  it('Dado paciente com receituário, Quando lista, Então vê só o dele com conteúdo, sem o anonimizado', async () => {
    const mine = await seedPatientWithPrescription();
    await seedPatientWithPrescription();

    const response = await listFor(mine.cookie);
    const body = (await response.json()) as Envelope<{ id: string }[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      {
        id: mine.prescription.id,
        documentNumber: mine.prescription.documentNumber,
        issuedAt: mine.prescription.issuedAt.toISOString(),
      },
    ]);
  });

  it('Dado receituário do paciente, Quando baixa, Então recebe o PDF sem cache e a leitura é auditada', async () => {
    const { prescription, patient, cookie } =
      await seedPatientWithPrescription();

    const response = await downloadFor(prescription.id, cookie);
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="receituario-${prescription.documentNumber}.pdf"`,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const { auditEvents } = await getRepositories(clinicScope(CLINIC));
    const reads = (
      await auditEvents.findAll({
        resourceType: 'receituario',
        resourceId: prescription.id,
      })
    ).filter((event) => event.action === 'read');
    expect(reads).toHaveLength(1);
    expect(reads[0]?.patientId).toBe(patient.id);
  });

  it('Dado receituário de outro paciente ou anonimizado, Quando baixa, Então 404 igual', async () => {
    const mine = await seedPatientWithPrescription();
    const other = await seedPatientWithPrescription();

    const foreign = await downloadFor(other.prescription.id, mine.cookie);
    const anonymized = await downloadFor(mine.anonymized.id, mine.cookie);
    const missing = await downloadFor('inexistente', mine.cookie);

    expect(foreign.status).toBe(404);
    expect(anonymized.status).toBe(404);
    expect(missing.status).toBe(404);
    const body = (await foreign.json()) as { error: string };
    expect(body.error).toBe(
      ((await anonymized.json()) as { error: string }).error,
    );
  });

  it('Dado parceiro ou equipe, Quando lista ou baixa, Então o portal do paciente recusa', async () => {
    const { prescription } = await seedPatientWithPrescription();

    for (const headers of [
      cookieHeaderFor('partner', 'parceiro@x.com', CLINIC),
      cookieHeaderFor('company_admin', undefined, CLINIC),
    ]) {
      expect((await listFor(headers)).status).toBe(403);
      expect((await downloadFor(prescription.id, headers)).status).toBe(403);
    }
    expect((await listFor({ cookie: '' })).status).toBe(401);
    expect((await downloadFor(prescription.id, { cookie: '' })).status).toBe(
      401,
    );
  });
});
