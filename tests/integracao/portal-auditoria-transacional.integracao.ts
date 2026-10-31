import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
import { linkPortalAccount } from '../support/portal-account';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

const unique = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

async function patientSignedIn(referredByPartnerId: string | null = null) {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const birthDate = new Date();
  birthDate.setFullYear(birthDate.getFullYear() - 35);
  const patient = Patient.create({
    fullName: unique('Integração Portal'),
    email: `${unique('int')}@x.com`,
    phone: '11999990000',
    birthDate,
    referredByPartnerId,
  });
  await repos.patients.save(patient);
  await linkPortalAccount({
    role: 'patient',
    email: patient.email as string,
    recordId: patient.id,
    clinicId: CLINIC_A_ID,
  });
  cookieStore.value = sessionToken(
    'patient',
    patient.email as string,
    undefined,
    CLINIC_A_ID,
    null,
  );
  return { repos, patient };
}

/** Faz TODA gravação de auditoria nova falhar (o ato e a trilha são uma transação só). */
async function withFailingAudit(run: () => Promise<void>) {
  const db = await getDb();
  await db.execute(
    sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada_portal CHECK (false) NOT VALID`,
  );
  try {
    await run();
  } finally {
    await db.execute(
      sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada_portal`,
    );
  }
}

beforeEach(async () => {
  await ensureTestClinics();
  await completeClinicRegistration(CLINIC_A_ID);
  refreshed.mockClear();
});

describe('Feature: atos de LGPD do portal gravam e auditam na mesma transação (ADR-075, Postgres real)', () => {
  it('Dado o aceite do termo, Quando a trilha falha, Então o aceite é desfeito e a tela não atualiza', async () => {
    const { repos, patient } = await patientSignedIn();
    const { acceptConsent } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await acceptConsent({ purpose: 'treatment' });

      expect(result.success).toBe(false);
      expect(await repos.consentRecords.findByPatientId(patient.id)).toEqual(
        [],
      );
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  it('Dado o aceite do termo, Quando tudo corre bem, Então o aceite e a trilha ficam gravados juntos', async () => {
    const { repos, patient } = await patientSignedIn();
    const { acceptConsent } = await import('@/app/portal/actions');

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result.success).toBe(true);
    expect(await repos.consentRecords.findByPatientId(patient.id)).toHaveLength(
      1,
    );
    const events = await repos.auditEvents.findAll({ patientId: patient.id });
    expect(events.filter((e) => e.resourceType === 'consent')).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado termo aceito, Quando a revogação perde a trilha, Então o termo segue aceito', async () => {
    const { repos, patient } = await patientSignedIn();
    const { acceptConsent, revokeConsent } = await import(
      '@/app/portal/actions'
    );
    await acceptConsent({ purpose: 'image' });
    refreshed.mockClear();

    await withFailingAudit(async () => {
      const result = await revokeConsent({ purpose: 'image' });

      expect(result.success).toBe(false);
      const kinds = (
        await repos.consentRecords.findByPatientId(patient.id)
      ).map((record) => record.kind);
      expect(kinds).toEqual(['accept']);
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  it('Dado paciente indicado, Quando a autorização do parceiro perde a trilha, Então nada é gravado', async () => {
    const setup = await getRepositories(clinicScope(CLINIC_A_ID));
    const partner = Partner.create({
      fullName: unique('Dra. Integração'),
      email: `${unique('p')}@x.com`,
      phone: '11977770000',
    });
    await setup.partners.save(partner);
    const { repos, patient } = await patientSignedIn(partner.id);
    const { acceptPartnerConsent } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await acceptPartnerConsent({});

      expect(result.success).toBe(false);
      expect(
        await repos.partnerShareConsents.findByPatientId(patient.id),
      ).toEqual([]);
    });
  });

  it('Dado o pedido do titular, Quando a trilha falha, Então o pedido não existe', async () => {
    const { repos, patient } = await patientSignedIn();
    const { openDataRequest } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await openDataRequest({
        kind: 'correction',
        details: 'Corrigir o nome',
      });

      expect(result.success).toBe(false);
      expect(await repos.dataSubjectRequests.findByPatient(patient.id)).toEqual(
        [],
      );
    });
  });
});
