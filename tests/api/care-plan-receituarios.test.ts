import { beforeAll, describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_INCOMPLETE_MESSAGE,
  EMPTY_PRESCRIPTION_MESSAGE,
} from '@/lib/server/prescription';
import { buildPatient, buildProfessional } from '../support/builders';
import {
  CLINIC_B_ID,
  ensureClinic,
  ensureTestClinics,
} from '../support/clinics';
import { validCnpj } from '../support/cnpj';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Receituário de enfermagem (#956, ADR-116): emitido do plano de cuidados no
 * escopo da empresa, com conteúdo congelado na emissão, emissão auditada e PDF
 * sem cache compartilhado.
 */

const CLINIC = 'clinica-receituario';
const INCOMPLETE_CLINIC = 'clinica-receituario-incompleta';

let collection: typeof import('@/app/api/care-plans/[id]/receituarios/route');
let item: typeof import('@/app/api/care-plans/[id]/receituarios/[prescriptionId]/route');

const context = (id: string) => ({ params: Promise.resolve({ id }) });

interface Envelope<T> {
  data: T;
  error: string | null;
}

const issue = (
  id: string,
  headers: Record<string, string>,
  body: unknown = {},
) =>
  collection.POST(
    jsonRequest(`/api/care-plans/${id}/receituarios`, 'POST', body, headers),
    context(id),
  );

const list = (id: string, headers: Record<string, string>) =>
  collection.GET(
    jsonRequest(
      `/api/care-plans/${id}/receituarios`,
      'GET',
      undefined,
      headers,
    ),
    context(id),
  );

const download = (
  id: string,
  prescriptionId: string,
  headers: Record<string, string>,
) =>
  item.GET(
    jsonRequest(
      `/api/care-plans/${id}/receituarios/${prescriptionId}`,
      'GET',
      undefined,
      headers,
    ),
    { params: Promise.resolve({ id, prescriptionId }) },
  );

async function seedPlan(
  clinicId: string,
  options: { interventions?: number; withProfessional?: boolean } = {},
): Promise<string> {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient({ fullName: 'Maria das Dores' });
  await repos.patients.save(patient);
  let professionalId: string | undefined;
  if (options.withProfessional) {
    const professional = buildProfessional({
      fullName: 'Enf. Ana Lima',
      registry: 'COREN-SP 123456',
    });
    await repos.professionals.save(professional);
    professionalId = professional.id;
  }
  const plan = CarePlan.create({ patientId: patient.id, professionalId });
  await repos.carePlans.save(plan);
  for (let i = 0; i < (options.interventions ?? 1); i += 1) {
    await repos.carePlanInterventions.save(
      CarePlanIntervention.create({
        carePlanId: plan.id,
        interventionCode: '3660',
        frequency: 'a cada troca de curativo',
        priority: 'alta',
      }),
    );
  }
  return plan.id;
}

const issuedOf = async (clinicId: string, carePlanId: string) => {
  const { nursingPrescriptions } = await getRepositories(clinicScope(clinicId));
  return nursingPrescriptions.findByCarePlanId(carePlanId);
};

const emissionsOf = async (clinicId: string, resourceId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  return (
    await auditEvents.findAll({ resourceType: 'receituario', resourceId })
  ).filter((event) => event.action === 'create');
};

beforeAll(async () => {
  collection = await import('@/app/api/care-plans/[id]/receituarios/route');
  item = await import(
    '@/app/api/care-plans/[id]/receituarios/[prescriptionId]/route'
  );
  await ensureTestClinics();
  await ensureClinic(CLINIC);
  await ensureClinic(INCOMPLETE_CLINIC);
  const { clinics } = await getRepositories(clinicScope(CLINIC));
  const clinic = await clinics.findById(CLINIC);
  await clinics.update(
    (clinic as NonNullable<typeof clinic>).updateInfo({
      cnpj: validCnpj('445566770001'),
      city: 'São Paulo',
      professionalName: 'Resp. Técnica',
      professionalRegistry: 'COREN-SP 999999',
    }),
  );
});

describe('Feature: Receituário de enfermagem emitido e congelado (#956, ADR-116)', () => {
  it('Dado plano com intervenção, Quando o Admin emite com observações e baixa, Então recebe o PDF sem cache e a emissão é auditada uma vez', async () => {
    const planId = await seedPlan(CLINIC, { withProfessional: true });

    const issued = await issue(planId, adminCookieHeader(CLINIC), {
      freeText: 'Manter a pele seca.',
    });
    const { data } = (await issued.json()) as Envelope<{
      id: string;
      documentNumber: string;
    }>;
    const pdf = await download(planId, data.id, adminCookieHeader(CLINIC));
    const bytes = new Uint8Array(await pdf.arrayBuffer());

    expect(issued.status).toBe(200);
    expect(data.documentNumber).toMatch(/^RCT-[0-9A-F]{8}$/);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('cache-control')).toContain('no-store');
    expect(pdf.headers.get('content-disposition')).toBe(
      `attachment; filename="receituario-${data.documentNumber}.pdf"`,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(await emissionsOf(CLINIC, data.id)).toHaveLength(1);
    const [stored] = await issuedOf(CLINIC, planId);
    expect(stored?.content?.freeText).toBe('Manter a pele seca.');
  });

  it('Dado receituário emitido, Quando o plano muda e emite de novo, Então lista os dois e o antigo guarda o conteúdo de antes', async () => {
    const planId = await seedPlan(CLINIC);
    const firstResponse = await issue(planId, adminCookieHeader(CLINIC));
    const first = ((await firstResponse.json()) as Envelope<{ id: string }>)
      .data;
    const repos = await getRepositories(clinicScope(CLINIC));
    await repos.carePlanInterventions.save(
      CarePlanIntervention.create({
        carePlanId: planId,
        interventionCode: '3590',
        frequency: 'semanal',
        priority: 'media',
      }),
    );

    await issue(planId, adminCookieHeader(CLINIC));
    const listed = (await (
      await list(planId, adminCookieHeader(CLINIC))
    ).json()) as Envelope<{ id: string }[]>;

    expect(listed.data).toHaveLength(2);
    const old = await repos.nursingPrescriptions.findById(first.id);
    expect(old?.content?.items).toHaveLength(1);
    const again = await download(planId, first.id, adminCookieHeader(CLINIC));
    expect(again.status).toBe(200);
  });

  it('Dadas observações acima do limite, Quando emite, Então recusa com 400 e não grava', async () => {
    const planId = await seedPlan(CLINIC);

    const response = await issue(planId, adminCookieHeader(CLINIC), {
      freeText: 'x'.repeat(2001),
    });

    expect(response.status).toBe(400);
    expect(await issuedOf(CLINIC, planId)).toHaveLength(0);
  });

  it('Dado plano sem intervenção, Quando emite, Então recusa com 400 e não grava', async () => {
    const planId = await seedPlan(CLINIC, { interventions: 0 });

    const response = await issue(planId, adminCookieHeader(CLINIC));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(EMPTY_PRESCRIPTION_MESSAGE);
    expect(await issuedOf(CLINIC, planId)).toHaveLength(0);
  });

  it('Dada clínica sem cadastro completo, Quando emite, Então recusa com 400', async () => {
    const planId = await seedPlan(INCOMPLETE_CLINIC);

    const response = await issue(planId, adminCookieHeader(INCOMPLETE_CLINIC));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(CLINIC_INCOMPLETE_MESSAGE);
  });

  it('Dado plano de outra empresa, Quando emite, lista ou baixa, Então responde 404', async () => {
    const planId = await seedPlan(CLINIC);
    const issued = await issue(planId, adminCookieHeader(CLINIC));
    const { data } = (await issued.json()) as Envelope<{ id: string }>;
    const other = adminCookieHeader(CLINIC_B_ID);

    expect((await issue(planId, other)).status).toBe(404);
    expect((await list(planId, other)).status).toBe(404);
    expect((await download(planId, data.id, other)).status).toBe(404);
    expect(await issuedOf(CLINIC, planId)).toHaveLength(1);
  });

  it('Dado Atendente, Quando emite, lista ou baixa, Então responde 403 (rota clínica)', async () => {
    const planId = await seedPlan(CLINIC);
    const atendente = cookieHeaderFor('atendente', undefined, CLINIC);

    expect((await issue(planId, atendente)).status).toBe(403);
    expect((await list(planId, atendente)).status).toBe(403);
    expect((await download(planId, 'x', atendente)).status).toBe(403);
  });

  it('Dado Profissional sem vínculo com o paciente, Quando emite ou baixa, Então responde 404', async () => {
    const planId = await seedPlan(CLINIC);
    const unlinked = cookieHeaderFor(
      'profissional',
      undefined,
      CLINIC,
      'prof-sem-vinculo',
    );

    expect((await issue(planId, unlinked)).status).toBe(404);
    expect((await download(planId, 'x', unlinked)).status).toBe(404);
  });

  it('Dada requisição sem sessão, Quando emite, lista ou baixa, Então responde 401', async () => {
    const none = { cookie: '' };

    expect((await issue('x', none)).status).toBe(401);
    expect((await list('x', none)).status).toBe(401);
    expect((await download('x', 'y', none)).status).toBe(401);
  });
});
