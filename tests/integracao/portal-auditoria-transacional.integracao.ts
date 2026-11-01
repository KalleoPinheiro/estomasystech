import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Guardian } from '@/domain/guardian/guardian';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
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
const cookieWrites: string[] = [];
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
    set: (name: string) => {
      cookieWrites.push(name);
    },
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
  cookieWrites.length = 0;
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

describe('Feature: ações restantes do portal gravam e auditam na mesma transação (#553, PR 2b, Postgres real)', () => {
  it('Dado consulta futura, Quando o cancelamento perde a trilha, Então a consulta segue marcada e o calendário não é tocado', async () => {
    const { repos, patient } = await patientSignedIn();
    const start = new Date(Date.now() + 40 * 86_400_000);
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(start, new Date(start.getTime() + 3_600_000)),
      procedure: 'Curativo',
      price: Money.fromCents(10_000),
    });
    await repos.appointments.save(appointment);
    const { cancelAppointment } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await cancelAppointment({ appointmentId: appointment.id });

      expect(result.success).toBe(false);
      const stored = await repos.appointments.findById(appointment.id);
      expect(stored?.status).toBe('scheduled');
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  it('Dado entrada na lista de espera, Quando a saída perde a trilha, Então a entrada segue aguardando', async () => {
    const { repos, patient } = await patientSignedIn();
    const entry = WaitlistEntry.create({
      patientId: patient.id,
      fromDate: '2027-03-01',
      toDate: '2027-03-10',
      source: 'patient',
    });
    await repos.waitlist.save(entry);
    const { leaveWaitlist } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await leaveWaitlist({ id: entry.id });

      expect(result.success).toBe(false);
      expect((await repos.waitlist.findById(entry.id))?.status).toBe('waiting');
    });
  });

  it('Dado responsável ligado, Quando o encerramento do acesso perde a trilha, Então o acesso segue ativo', async () => {
    const setup = await getRepositories(clinicScope(CLINIC_A_ID));
    const guardian = Guardian.create({
      fullName: unique('Responsável Integração'),
      relationship: 'mae',
      phone: '11999990000',
      email: null,
    });
    await setup.guardians.save(guardian);
    const { repos, patient } = await patientSignedIn();
    await repos.patients.save(patient.update({ guardianId: guardian.id }));
    const { revokeGuardianAccess } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await revokeGuardianAccess({});

      expect(result.success).toBe(false);
      const stored = await repos.patients.findById(patient.id);
      expect(stored?.guardianPortalRevokedAt).toBeFalsy();
    });
  });

  it('Dado responsável com paciente, Quando a escolha perde a trilha, Então nenhum cookie é gravado', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const guardian = Guardian.create({
      fullName: unique('Responsável Cookie'),
      relationship: 'mae',
      phone: '11999990000',
      email: null,
    });
    await repos.guardians.save(guardian);
    const email = `${unique('resp')}@x.com`;
    await repos.userAccounts.save(
      UserAccount.create({
        email,
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'guardian',
        clinicId: CLINIC_A_ID,
        guardianId: guardian.id,
      }),
    );
    const child = Patient.create({
      fullName: unique('Representado'),
      email: `${unique('rep')}@x.com`,
      phone: '11988880000',
      birthDate: new Date(Date.now() - 10 * 365 * 86_400_000),
      guardianId: guardian.id,
    });
    await repos.patients.save(child);
    cookieStore.value = sessionToken(
      'guardian',
      email,
      undefined,
      CLINIC_A_ID,
      null,
    );
    const { actForPatient } = await import('@/app/portal/actions');

    await withFailingAudit(async () => {
      const result = await actForPatient({ patientId: child.id });

      expect(result.success).toBe(false);
      expect(cookieWrites).toEqual([]);
      expect(refreshed).not.toHaveBeenCalled();
    });
  });
});
