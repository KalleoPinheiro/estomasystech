import { describe, expect, it, vi } from 'vitest';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import {
  loadConsentStatus,
  loadPatientPortalView,
} from '@/lib/server/data/portal';
import { buildPatient } from '../../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';
import { linkPortalAccount } from '../../support/portal-account';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

vi.mock('@/application/portal/portal-identity', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/application/portal/portal-identity')
  >()),
  consentSignerFor: async () => {
    throw new Error('falha inesperada');
  },
}));

vi.mock('@/lib/waitlist-names', () => ({
  waitlistWithNames: async () => {
    throw new Error('lista indisponível');
  },
}));

describe('Feature: termo lido no servidor, erro inesperado (#553)', () => {
  it('Dado falha que não é recusa de papel, Quando lê o termo, Então propaga em vez de fingir que não pode assinar', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { clinicScope } = await import('@/lib/auth/tenant-scope');
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = buildPatient({ fullName: 'Hugo Erro' });
    await repos.patients.save(patient);
    await linkPortalAccount({
      role: 'patient',
      email: patient.email as string,
      recordId: patient.id,
    });

    await expect(
      loadConsentStatus(
        {
          role: 'patient',
          subject: patient.email,
          clinicId: CLINIC_A_ID,
          actingPatientId: null,
        } as unknown as PatientPortalSession,
        'treatment',
      ),
    ).rejects.toThrow('falha inesperada');
  });

  it('Dado bloco auxiliar que falha, Quando monta a tela, Então a tela chega sem ele em vez de cair inteira', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { clinicScope } = await import('@/lib/auth/tenant-scope');
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = buildPatient({ fullName: 'Iago Bloco' });
    await repos.patients.save(patient);
    await linkPortalAccount({
      role: 'patient',
      email: patient.email as string,
      recordId: patient.id,
    });

    const view = await loadPatientPortalView({
      role: 'patient',
      subject: patient.email,
      clinicId: CLINIC_A_ID,
      actingPatientId: null,
    } as unknown as PatientPortalSession);

    expect(view.data.patient.id).toBe(patient.id);
    expect(view.consent).toBeNull();
    expect(view.waitlist).toEqual([]);
    expect(view.dataRequests).toEqual([]);
  });
});
