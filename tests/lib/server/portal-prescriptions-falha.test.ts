import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient } from '../../support/builders';
import { ensureClinic } from '../../support/clinics';
import { linkPortalAccount } from '../../support/portal-account';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/** Bloco dos receituários que falha some sozinho, sem derrubar o portal (#956). */

vi.mock('@/lib/server/portal-prescriptions', () => ({
  listPortalPrescriptions: async () => {
    throw new Error('receituários indisponíveis');
  },
}));

const CLINIC = 'clinica-portal-receituario-falha';

beforeAll(async () => {
  await ensureClinic(CLINIC);
});

describe('Feature: portal sem os receituários (#956, ADR-116)', () => {
  it('Dada falha ao ler os receituários, Quando carrega o portal, Então a tela vem com a lista vazia', async () => {
    const repos = await getRepositories(clinicScope(CLINIC));
    const patient = buildPatient({ fullName: 'Rita Portal' });
    await repos.patients.save(patient);
    await linkPortalAccount({
      role: 'patient',
      email: patient.email as string,
      recordId: patient.id,
      clinicId: CLINIC,
    });
    const session: PatientPortalSession = {
      expiresAtMs: Date.now() + 3_600_000,
      subject: patient.email as string,
      role: 'patient',
      clinicId: CLINIC,
      professionalId: null,
      actingPatientId: null,
    };
    const { loadPatientPortalView } = await import('@/lib/server/data/portal');

    const view = await loadPatientPortalView(session);

    expect(view.prescriptions).toEqual([]);
    expect(view.data.patient.id).toBe(patient.id);
  });
});
