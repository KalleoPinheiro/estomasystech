import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { NursingPrescription } from '@/domain/clinical/nursing-prescription';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { PrescriptionDocument } from '@/lib/documents/prescription-pdf';
import { buildPatient } from '../../support/builders';
import { ensureClinic } from '../../support/clinics';
import { linkPortalAccount } from '../../support/portal-account';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/** Receituário no portal (#956, ADR-116): só os do titular, desenhados do gravado. */

const rendered: PrescriptionDocument[] = [];
vi.mock('@/lib/documents/prescription-pdf', async (original) => {
  const actual =
    await original<typeof import('@/lib/documents/prescription-pdf')>();
  return {
    ...actual,
    renderPrescriptionPdf: async (doc: PrescriptionDocument) => {
      rendered.push(doc);
      return new Uint8Array([9]);
    },
  };
});

const CLINIC = 'clinica-portal-receituario-lib';

let lib: typeof import('@/lib/server/portal-prescriptions');
let portal: typeof import('@/lib/server/data/portal');

const sessionFor = (email: string): PatientPortalSession => ({
  expiresAtMs: Date.now() + 3_600_000,
  subject: email,
  role: 'patient',
  clinicId: CLINIC,
  professionalId: null,
  actingPatientId: null,
});

async function seed() {
  const repos = await getRepositories(clinicScope(CLINIC));
  const patient = buildPatient({ fullName: 'Joana Portal' });
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
    content: {
      issuer: {
        name: 'Clínica',
        document: null,
        registry: null,
        address: null,
      },
      city: 'Campinas',
      patientName: 'Joana Portal',
      items: [{ label: 'Cuidados com lesões', frequency: 'diária' }],
      freeText: 'Beber água.',
      signer: { name: 'Enf. Ana', registry: null },
    },
  });
  await repos.nursingPrescriptions.save(prescription);
  return { session: sessionFor(patient.email as string), prescription };
}

beforeAll(async () => {
  lib = await import('@/lib/server/portal-prescriptions');
  portal = await import('@/lib/server/data/portal');
  await ensureClinic(CLINIC);
});

describe('Feature: receituário no portal (#956, ADR-116)', () => {
  it('Dado receituário do titular, Quando baixa, Então desenha o conteúdo gravado com número e data', async () => {
    const { session, prescription } = await seed();

    const pdf = await lib.renderPortalPrescription(session, prescription.id);

    expect(pdf).toEqual({
      bytes: new Uint8Array([9]),
      fileName: `receituario-${prescription.documentNumber}.pdf`,
    });
    expect(rendered.at(-1)).toMatchObject({
      patientName: 'Joana Portal',
      freeText: 'Beber água.',
      documentNumber: prescription.documentNumber,
      issuedOn: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
    });
  });

  it('Dado receituário de outro paciente, Quando baixa, Então não encontra', async () => {
    const mine = await seed();
    const other = await seed();

    const attempt = lib.renderPortalPrescription(
      mine.session,
      other.prescription.id,
    );

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({ entity: 'Receituário' });
  });

  it('Dado o portal do titular, Quando carrega a tela, Então traz os receituários dele', async () => {
    const { session, prescription } = await seed();

    const view = await portal.loadPatientPortalView(session);

    expect(view.prescriptions).toEqual([
      {
        id: prescription.id,
        documentNumber: prescription.documentNumber,
        issuedAt: prescription.issuedAt.toISOString(),
      },
    ]);
    expect(await lib.listPortalPrescriptions(session)).toEqual(
      view.prescriptions,
    );
  });
});
