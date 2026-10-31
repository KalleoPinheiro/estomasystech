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
import { ACTING_PATIENT_COOKIE } from '@/lib/auth/acting-patient';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
import { linkPortalAccount } from '../support/portal-account';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = {
  session: undefined as string | undefined,
  acting: undefined as string | undefined,
  forwardedFor: '203.0.113.9' as string | null,
};
const cookieWrites: Array<{ name: string; value: string; options: unknown }> =
  [];
const refreshed = vi.fn();
const afterQueue: Array<() => Promise<unknown> | unknown> = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === SESSION_COOKIE && cookieStore.session !== undefined) {
        return { name, value: cookieStore.session };
      }
      if (name === ACTING_PATIENT_COOKIE && cookieStore.acting !== undefined) {
        return { name, value: cookieStore.acting };
      }
      return undefined;
    },
    set: (name: string, value: string, options: unknown) => {
      cookieWrites.push({ name, value, options });
    },
  }),
  headers: async () =>
    new Headers(
      cookieStore.forwardedFor
        ? { 'x-forwarded-for': cookieStore.forwardedFor }
        : {},
    ),
}));
const calendarSync = vi.fn();
vi.mock('@/lib/calendar-sync', () => ({
  scheduleCalendarSync: (...args: unknown[]) => calendarSync(...args),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => Promise<unknown> | unknown) => {
    afterQueue.push(task);
  },
}));

const actions = () => import('@/app/portal/actions');

const unique = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const yearsAgo = (years: number) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
};

const signIn = (role: Parameters<typeof sessionToken>[0], email: string) => {
  cookieStore.session = sessionToken(role, email, undefined, CLINIC_A_ID, null);
};

const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

async function adultPatient(
  extra: { referredByPartnerId?: string | null; guardianId?: string } = {},
) {
  const { patients } = await repos();
  const patient = Patient.create({
    fullName: unique('Adulto'),
    email: `${unique('adulto')}@x.com`,
    phone: '11999990000',
    birthDate: yearsAgo(35),
    ...extra,
  });
  await patients.save(patient);
  await linkPortalAccount({
    role: 'patient',
    email: patient.email as string,
    recordId: patient.id,
    clinicId: CLINIC_A_ID,
  });
  return patient;
}

async function guardianOf(relationship: 'mae' | 'conjuge', birthDates: Date[]) {
  const r = await repos();
  const guardian = Guardian.create({
    fullName: unique('Responsável'),
    relationship,
    phone: '11999990000',
    email: null,
  });
  await r.guardians.save(guardian);
  const email = `${unique('resp')}@x.com`;
  await r.userAccounts.save(
    UserAccount.create({
      email,
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'guardian',
      clinicId: CLINIC_A_ID,
      guardianId: guardian.id,
    }),
  );
  const patients: Patient[] = [];
  for (const birthDate of birthDates) {
    const patient = Patient.create({
      fullName: unique('Representado'),
      email: `${unique('rep')}@x.com`,
      phone: '11988880000',
      birthDate,
      guardianId: guardian.id,
    });
    await r.patients.save(patient);
    patients.push(patient);
  }
  return { guardian, email, patients };
}

const auditOf = async (patientId: string, resourceType: string) =>
  (await (await repos()).auditEvents.findAll({ patientId })).filter(
    (event) => event.resourceType === resourceType,
  );

beforeEach(async () => {
  await ensureTestClinics();
  await completeClinicRegistration(CLINIC_A_ID);
  cookieStore.session = undefined;
  cookieStore.acting = undefined;
  cookieStore.forwardedFor = '203.0.113.9';
  refreshed.mockClear();
  afterQueue.length = 0;
  cookieWrites.length = 0;
  calendarSync.mockClear();
});

describe('Feature: guarda das ações do portal (ADR-074)', () => {
  it('Dado que não há sessão, Quando aceita o termo, Então responde Não autenticado e nada é gravado', async () => {
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result).toMatchObject({ success: false, error: 'Não autenticado' });
    expect(refreshed).not.toHaveBeenCalled();
  });

  it.each(['atendente', 'company_admin', 'partner'] as const)(
    'Dado o papel %s, Quando aceita o termo do paciente, Então é recusado e nada é gravado',
    async (role) => {
      signIn(role, `${role}@clinica.com`);
      const { acceptConsent } = await actions();

      const result = await acceptConsent({ purpose: 'treatment' });

      expect(result.success).toBe(false);
      expect(refreshed).not.toHaveBeenCalled();
    },
  );

  it('Dado finalidade inventada, Quando aceita, Então a entrada é recusada antes de qualquer gravação', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'marketing' as never });

    expect(result.success).toBe(false);
    expect(
      (await (await repos()).consentRecords.findByPatientId(patient.id)).length,
    ).toBe(0);
  });
});

describe('Feature: aceite e revogação do termo gravam e auditam juntos (LGPD)', () => {
  it('Dado paciente adulto, Quando aceita o termo, Então o registro leva o IP do proxy confiável, o controlador e a trilha, e a tela atualiza', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    // O cliente forja o começo da cadeia; só o último salto é do proxy confiável.
    cookieStore.forwardedFor = '6.6.6.6, 198.51.100.7';
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ accepted: true });
    const [record] = await (await repos()).consentRecords.findByPatientId(
      patient.id,
    );
    expect(record).toMatchObject({
      kind: 'accept',
      purpose: 'treatment',
      ipAddress: '198.51.100.7',
    });
    expect(record.controllerSnapshot).toContain('CNPJ');
    const [event] = await auditOf(patient.id, 'consent');
    expect(event).toMatchObject({
      action: 'create',
      resourceId: record.id,
      actorId: patient.email,
    });
    expect(event.detail).toContain(
      `treatment · hash ${record.textHash.slice(0, 12)}`,
    );
    expect(event.detail).not.toContain('representante');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado termo já aceito, Quando aceita de novo, Então não grava registro nem trilha e devolve o aceite existente', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { acceptConsent } = await actions();
    const first = await acceptConsent({ purpose: 'image' });

    const again = await acceptConsent({ purpose: 'image' });

    expect(again.error).toBeNull();
    expect(again.data?.acceptedAt).toBe(first.data?.acceptedAt);
    expect(
      await (await repos()).consentRecords.findByPatientId(patient.id),
    ).toHaveLength(1);
    expect(await auditOf(patient.id, 'consent')).toHaveLength(1);
  });

  it('Dado termo aceito, Quando revoga, Então grava a revogação sem apagar o aceite e audita como update', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { acceptConsent, revokeConsent } = await actions();
    await acceptConsent({ purpose: 'treatment' });

    const result = await revokeConsent({ purpose: 'treatment' });

    expect(result.data).toMatchObject({ accepted: false, revoked: true });
    const records = await (await repos()).consentRecords.findByPatientId(
      patient.id,
    );
    expect(records.map((record) => record.kind).sort()).toEqual([
      'accept',
      'revoke',
    ]);
    const events = await auditOf(patient.id, 'consent');
    expect(events.map((event) => event.action).sort()).toEqual([
      'create',
      'update',
    ]);
    expect(events.find((event) => event.action === 'update')?.detail).toBe(
      'revogação de consentimento (treatment)',
    );
  });

  it('Dado a clínica sem controlador identificável, Quando aceita, Então 404 e não há aceite nem trilha', async () => {
    const { patients } = await getRepositories(clinicScope(CLINIC_B_ID));
    const patient = Patient.create({
      fullName: unique('Sem controlador'),
      email: `${unique('sc')}@x.com`,
      phone: '11999990001',
      birthDate: yearsAgo(30),
    });
    await patients.save(patient);
    await linkPortalAccount({
      role: 'patient',
      email: patient.email as string,
      recordId: patient.id,
      clinicId: CLINIC_B_ID,
    });
    cookieStore.session = sessionToken(
      'patient',
      patient.email as string,
      undefined,
      CLINIC_B_ID,
      null,
    );
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result.success).toBe(false);
    const scoped = await getRepositories(clinicScope(CLINIC_B_ID));
    expect(
      await scoped.consentRecords.findByPatientId(patient.id),
    ).toHaveLength(0);
    expect(
      (await scoped.auditEvents.findAll({ patientId: patient.id })).filter(
        (event) => event.resourceType === 'consent',
      ),
    ).toHaveLength(0);
  });
});

describe('Feature: responsável age só pelo menor que escolheu (ADR-027, ADR-032)', () => {
  it('Dado responsável de um menor, Quando aceita o termo, Então o registro leva o parentesco e a trilha diz pelo representante legal', async () => {
    const { email, patients } = await guardianOf('mae', [yearsAgo(8)]);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result.success).toBe(true);
    const [record] = await (await repos()).consentRecords.findByPatientId(
      patients[0].id,
    );
    expect(record.signer).toMatchObject({ relationship: 'mae' });
    const events = await auditOf(patients[0].id, 'consent');
    expect(events[0].detail).toContain(' · pelo representante legal');
  });

  it('Dado responsável de paciente adulto, Quando aceita o termo, Então 403 do titular e nada é gravado', async () => {
    const { email, patients } = await guardianOf('conjuge', [yearsAgo(40)]);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('O aceite dos termos é do próprio paciente');
    expect(
      await (await repos()).consentRecords.findByPatientId(patients[0].id),
    ).toHaveLength(0);
  });

  it('Dado responsável de dois menores sem escolha, Quando aceita, Então pede para escolher e nada é gravado', async () => {
    const { email, patients } = await guardianOf('mae', [
      yearsAgo(5),
      yearsAgo(9),
    ]);
    signIn('guardian', email);
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    expect(result).toMatchObject({
      success: false,
      error: 'Escolha o paciente que você está representando.',
    });
    for (const patient of patients) {
      expect(
        await (await repos()).consentRecords.findByPatientId(patient.id),
      ).toHaveLength(0);
    }
  });

  it('Dado cookie com paciente de outro responsável, Quando aceita, Então o cookie não vale e nada é gravado no outro paciente', async () => {
    const mine = await guardianOf('mae', [yearsAgo(6)]);
    const other = await guardianOf('mae', [yearsAgo(7)]);
    signIn('guardian', mine.email);
    cookieStore.acting = other.patients[0].id;
    const { acceptConsent } = await actions();

    const result = await acceptConsent({ purpose: 'treatment' });

    // Com um único representado válido, o cookie estranho é ignorado e o
    // aceite vai para o MEU menor, nunca para o do outro responsável.
    expect(result.success).toBe(true);
    expect(
      await (await repos()).consentRecords.findByPatientId(
        other.patients[0].id,
      ),
    ).toHaveLength(0);
    expect(
      await (await repos()).consentRecords.findByPatientId(mine.patients[0].id),
    ).toHaveLength(1);
  });
});

describe('Feature: consentimento do parceiro indicador (#292, #375)', () => {
  async function referredPatient() {
    const { partners } = await repos();
    const partner = Partner.create({
      fullName: unique('Dra. Indicadora'),
      email: `${unique('ind')}@x.com`,
      phone: '11977770000',
    });
    await partners.save(partner);
    const patient = await adultPatient({ referredByPartnerId: partner.id });
    return { partner, patient };
  }

  it('Dado paciente indicado, Quando autoriza, Então grava com o IP, audita e a repetição não duplica a trilha', async () => {
    const { partner, patient } = await referredPatient();
    signIn('patient', patient.email as string);
    const { acceptPartnerConsent } = await actions();

    const first = await acceptPartnerConsent({});
    const again = await acceptPartnerConsent({});

    expect(first.data?.active).toBe(true);
    expect(again.error).toBeNull();
    expect(again.data?.active).toBe(true);
    const records = await (await repos()).partnerShareConsents.findByPatientId(
      patient.id,
    );
    expect(records).toHaveLength(1);
    const events = await auditOf(patient.id, 'partner-consent');
    expect(events).toHaveLength(1);
    expect(events[0].detail).toContain(`parceiro ${partner.id}; versão `);
  });

  it('Dado autorização ativa, Quando revoga, Então grava a revogação e audita pelo paciente', async () => {
    const { partner, patient } = await referredPatient();
    signIn('patient', patient.email as string);
    const { acceptPartnerConsent, revokePartnerConsent } = await actions();
    await acceptPartnerConsent({});

    const result = await revokePartnerConsent({});

    expect(result.data?.active).toBe(false);
    const events = await auditOf(patient.id, 'partner-consent');
    expect(events.find((event) => event.action === 'update')?.detail).toBe(
      `revogação pelo paciente; parceiro ${partner.id}`,
    );
  });

  it('Dado paciente sem parceiro indicador, Quando autoriza, Então 404 e nada é gravado', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { acceptPartnerConsent } = await actions();

    const result = await acceptPartnerConsent({});

    expect(result.success).toBe(false);
    expect(
      await (await repos()).partnerShareConsents.findByPatientId(patient.id),
    ).toHaveLength(0);
  });

  it('Dado responsável de adulto, Quando autoriza o parceiro, Então 403 com a mensagem do titular', async () => {
    const { email, patients } = await guardianOf('conjuge', [yearsAgo(40)]);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { revokePartnerConsent } = await actions();

    const result = await revokePartnerConsent({});

    expect(result.error).toContain('Este pedido é do próprio paciente');
  });

  it('Dado responsável de menor indicado, Quando autoriza, Então a trilha diz pelo representante legal', async () => {
    const { partners } = await repos();
    const partner = Partner.create({
      fullName: unique('Dra. Menor'),
      email: `${unique('pm')}@x.com`,
      phone: '11977770001',
    });
    await partners.save(partner);
    const { email, patients, guardian } = await guardianOf('mae', [
      yearsAgo(9),
    ]);
    const r = await repos();
    await r.patients.save(
      Patient.create({
        fullName: patients[0].fullName,
        email: patients[0].email,
        phone: '11988880000',
        birthDate: yearsAgo(9),
        guardianId: guardian.id,
        referredByPartnerId: partner.id,
      }),
    );
    const minor = (await r.patients.findByGuardian(guardian.id)).find(
      (p) => p.referredByPartnerId === partner.id,
    ) as Patient;
    signIn('guardian', email);
    cookieStore.acting = minor.id;
    const { acceptPartnerConsent } = await actions();

    const result = await acceptPartnerConsent({});

    expect(result.success).toBe(true);
    const events = await auditOf(minor.id, 'partner-consent');
    expect(events[0].detail).toContain('; pelo representante legal');
  });
});

describe('Feature: pedido do titular (LGPD art. 18)', () => {
  it('Dado paciente adulto, Quando pede correção, Então o pedido fica pendente, a trilha registra e o aviso aos Admins sai depois', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { openDataRequest } = await actions();

    const result = await openDataRequest({
      kind: 'correction',
      details: 'Meu telefone mudou',
    });

    expect(result.success).toBe(true);
    expect(result.data?.request).toMatchObject({
      kind: 'correction',
      status: 'pending',
    });
    const stored = await (await repos()).dataSubjectRequests.findByPatient(
      patient.id,
    );
    expect(stored).toHaveLength(1);
    const [event] = await auditOf(patient.id, 'data_request');
    expect(event).toMatchObject({ action: 'create', detail: 'correction' });
    expect(afterQueue).toHaveLength(1);
    await expect(afterQueue[0]()).resolves.toBeUndefined();
  });

  it('Dado pedido do mesmo tipo em análise, Quando pede de novo, Então conflito, sem segundo pedido nem segunda trilha nem aviso', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { openDataRequest } = await actions();
    await openDataRequest({ kind: 'erasure' });
    afterQueue.length = 0;

    const again = await openDataRequest({ kind: 'erasure' });

    expect(again.success).toBe(false);
    expect(again.error).toContain('Você já tem um pedido deste tipo');
    expect(
      await (await repos()).dataSubjectRequests.findByPatient(patient.id),
    ).toHaveLength(1);
    expect(await auditOf(patient.id, 'data_request')).toHaveLength(1);
    expect(afterQueue).toHaveLength(0);
  });

  it('Dado o representante do menor, Quando pede eliminação, Então 403 e a correção segue permitida com a trilha do representante', async () => {
    const { email, patients } = await guardianOf('mae', [yearsAgo(10)]);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { openDataRequest } = await actions();

    const erasure = await openDataRequest({ kind: 'erasure' });
    const correction = await openDataRequest({
      kind: 'correction',
      details: 'Corrigir a data de nascimento',
    });

    expect(erasure.error).toBe(
      'A eliminação dos dados do menor é pedida diretamente à clínica.',
    );
    expect(correction.success).toBe(true);
    const events = await auditOf(patients[0].id, 'data_request');
    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe('correction · pelo representante legal');
  });

  it('Dado responsável de paciente adulto, Quando pede correção, Então 403 do titular', async () => {
    const { email, patients } = await guardianOf('conjuge', [yearsAgo(40)]);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { openDataRequest } = await actions();

    const result = await openDataRequest({
      kind: 'correction',
      details: 'Corrigir o nome',
    });

    expect(result.error).toContain('Este pedido é do próprio paciente');
  });
});

let bookingSeq = 0;
// Consultas distantes ganham um deslocamento único (a agenda da clínica não
// aceita sobreposição); as de última hora usam horas fixas, dentro da janela.
const hoursAhead = (hours: number) =>
  new Date(
    Date.now() +
      hours * 3_600_000 +
      (hours >= 24 ? ++bookingSeq * 2 * 3_600_000 : 0),
  );

async function bookedFor(patientId: string, startsInHours: number) {
  const { appointments } = await repos();
  const start = hoursAhead(startsInHours);
  const appointment = Appointment.create({
    patientId,
    slot: TimeSlot.create(start, new Date(start.getTime() + 3_600_000)),
    procedure: 'Curativo',
    price: Money.fromCents(10_000),
  });
  await appointments.save(appointment);
  return appointment;
}

async function waitingFor(patientId: string) {
  const { waitlist } = await repos();
  const entry = WaitlistEntry.create({
    patientId,
    fromDate: '2027-03-01',
    toDate: '2027-03-10',
    source: 'patient',
  });
  await waitlist.save(entry);
  return entry;
}

describe('Feature: cancelar a própria consulta (#553, PR 2b)', () => {
  it('Dado consulta com antecedência, Quando o paciente cancela, Então fica cancelada pelo paciente, com trilha e refresh', async () => {
    const patient = await adultPatient();
    const appointment = await bookedFor(patient.id, 24 * 5);
    signIn('patient', patient.email as string);
    const { cancelAppointment } = await actions();

    const result = await cancelAppointment({
      appointmentId: appointment.id,
      reason: 'Imprevisto',
    });

    expect(result.success).toBe(true);
    const stored = await (await repos()).appointments.findById(appointment.id);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.cancellation?.by).toBe('patient');
    const events = await auditOf(patient.id, 'appointment');
    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe('cancelada pelo paciente no portal');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado a mesma consulta já cancelada, Quando repete, Então sucesso idempotente sem segunda trilha', async () => {
    const patient = await adultPatient();
    const appointment = await bookedFor(patient.id, 24 * 5);
    signIn('patient', patient.email as string);
    const { cancelAppointment } = await actions();
    await cancelAppointment({ appointmentId: appointment.id });

    const again = await cancelAppointment({ appointmentId: appointment.id });

    expect(again.success).toBe(true);
    expect(await auditOf(patient.id, 'appointment')).toHaveLength(1);
  });

  it('Dado consulta dentro da antecedência mínima, Quando cancela, Então é recusado e nada muda', async () => {
    const patient = await adultPatient();
    const appointment = await bookedFor(patient.id, 2);
    signIn('patient', patient.email as string);
    const { cancelAppointment } = await actions();

    const result = await cancelAppointment({ appointmentId: appointment.id });

    expect(result.success).toBe(false);
    const stored = await (await repos()).appointments.findById(appointment.id);
    expect(stored?.status).toBe('scheduled');
    expect(await auditOf(patient.id, 'appointment')).toHaveLength(0);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado consulta de outro paciente, Quando cancela, Então 404 e a consulta segue marcada', async () => {
    const owner = await adultPatient();
    const intruder = await adultPatient();
    const appointment = await bookedFor(owner.id, 24 * 5);
    signIn('patient', intruder.email as string);
    const { cancelAppointment } = await actions();

    const result = await cancelAppointment({ appointmentId: appointment.id });

    expect(result.success).toBe(false);
    const stored = await (await repos()).appointments.findById(appointment.id);
    expect(stored?.status).toBe('scheduled');
  });

  it('Dado o papel atendente, Quando cancela, Então recusado pela guarda', async () => {
    signIn('atendente', 'atendente@clinica.com');
    const { cancelAppointment } = await actions();

    const result = await cancelAppointment({ appointmentId: 'x' });

    expect(result.success).toBe(false);
  });

  it('Dado consulta com evento no Google Agenda, Quando cancela, Então a remoção só é agendada depois da confirmação', async () => {
    const patient = await adultPatient();
    const appointment = (await bookedFor(patient.id, 24 * 5)).withGoogleEventId(
      'evt-1',
    );
    await (await repos()).appointments.save(appointment);
    signIn('patient', patient.email as string);
    const { cancelAppointment } = await actions();

    const result = await cancelAppointment({ appointmentId: appointment.id });

    expect(result.success).toBe(true);
    expect(calendarSync).toHaveBeenCalledTimes(1);
  });

  it('Dado consulta sem evento externo ou cancelamento recusado, Quando cancela, Então o calendário não é tocado', async () => {
    const patient = await adultPatient();
    const plain = await bookedFor(patient.id, 24 * 5);
    const late = (await bookedFor(patient.id, 4)).withGoogleEventId('evt-2');
    await (await repos()).appointments.save(late);
    signIn('patient', patient.email as string);
    const { cancelAppointment } = await actions();

    await cancelAppointment({ appointmentId: plain.id });
    await cancelAppointment({ appointmentId: late.id });
    await cancelAppointment({ appointmentId: plain.id });

    expect(calendarSync).not.toHaveBeenCalled();
  });
});

describe('Feature: sair da lista de espera (#553, PR 2b)', () => {
  it('Dado entrada própria, Quando sai da lista, Então a entrada é removida com trilha', async () => {
    const patient = await adultPatient();
    const entry = await waitingFor(patient.id);
    signIn('patient', patient.email as string);
    const { leaveWaitlist } = await actions();

    const result = await leaveWaitlist({ id: entry.id });

    expect(result.success).toBe(true);
    const stored = await (await repos()).waitlist.findById(entry.id);
    expect(stored?.status).toBe('removed');
    const [event] = await auditOf(patient.id, 'waitlist-entry');
    expect(event.detail).toBe('saiu da lista pelo portal (paciente)');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado entrada de outro paciente, Quando tenta sair, Então 404, nada muda e nada é auditado', async () => {
    const owner = await adultPatient();
    const intruder = await adultPatient();
    const entry = await waitingFor(owner.id);
    signIn('patient', intruder.email as string);
    const { leaveWaitlist } = await actions();

    const result = await leaveWaitlist({ id: entry.id });

    expect(result.success).toBe(false);
    const stored = await (await repos()).waitlist.findById(entry.id);
    expect(stored?.status).toBe('waiting');
    expect(await auditOf(owner.id, 'waitlist-entry')).toHaveLength(0);
  });

  it('Dado o responsável agindo pelo menor, Quando sai da lista, Então a trilha cita o representante', async () => {
    const { email, patients } = await guardianOf('mae', [yearsAgo(10)]);
    const entry = await waitingFor(patients[0].id);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { leaveWaitlist } = await actions();

    const result = await leaveWaitlist({ id: entry.id });

    expect(result.success).toBe(true);
    const [event] = await auditOf(patients[0].id, 'waitlist-entry');
    expect(event.detail).toBe('saiu da lista pelo portal (responsável)');
  });
});

describe('Feature: encerrar o acesso do responsável (#553, PR 2b)', () => {
  async function patientWithGuardian() {
    const { guardian } = await guardianOf('mae', []);
    return {
      guardian,
      patient: await adultPatient({ guardianId: guardian.id }),
    };
  }

  it('Dado paciente com responsável, Quando encerra o acesso, Então revoga, audita e o aviso sai só depois', async () => {
    const { patient } = await patientWithGuardian();
    signIn('patient', patient.email as string);
    const { revokeGuardianAccess } = await actions();

    const result = await revokeGuardianAccess({});

    expect(result.success).toBe(true);
    const stored = await (await repos()).patients.findById(patient.id);
    expect(stored?.guardianPortalRevokedAt).toBeTruthy();
    expect(
      await auditOf(patient.id, 'guardian-access-revocation'),
    ).toHaveLength(1);
    expect(afterQueue).toHaveLength(1);
    expect(
      await auditOf(patient.id, 'guardian-access-revocation-notice'),
    ).toHaveLength(0);
    await afterQueue[0]();
    expect(
      await auditOf(patient.id, 'guardian-access-revocation-notice'),
    ).toHaveLength(1);
  });

  it('Dado acesso já encerrado, Quando repete, Então 404, sem segunda trilha nem aviso', async () => {
    const { patient } = await patientWithGuardian();
    signIn('patient', patient.email as string);
    const { revokeGuardianAccess } = await actions();
    await revokeGuardianAccess({});
    afterQueue.length = 0;

    const again = await revokeGuardianAccess({});

    expect(again.success).toBe(false);
    expect(
      await auditOf(patient.id, 'guardian-access-revocation'),
    ).toHaveLength(1);
    expect(afterQueue).toHaveLength(0);
  });

  it('Dado paciente sem responsável, Quando encerra, Então 404', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { revokeGuardianAccess } = await actions();

    const result = await revokeGuardianAccess({});

    expect(result.success).toBe(false);
    expect(afterQueue).toHaveLength(0);
  });

  it('Dado o responsável logado, Quando tenta encerrar o próprio acesso, Então recusado', async () => {
    const { email, patients } = await guardianOf('mae', [yearsAgo(10)]);
    signIn('guardian', email);
    cookieStore.acting = patients[0].id;
    const { revokeGuardianAccess } = await actions();

    const result = await revokeGuardianAccess({});

    expect(result.success).toBe(false);
    const stored = await (await repos()).patients.findById(patients[0].id);
    expect(stored?.guardianPortalRevokedAt).toBeFalsy();
  });
});

describe('Feature: agir em nome do paciente (#553, PR 2b)', () => {
  it('Dado paciente representado, Quando o responsável escolhe, Então a trilha registra e o cookie é gravado depois', async () => {
    const { email, patients } = await guardianOf('mae', [
      yearsAgo(10),
      yearsAgo(8),
    ]);
    signIn('guardian', email);
    const { actForPatient } = await actions();

    const result = await actForPatient({ patientId: patients[1].id });

    expect(result.success).toBe(true);
    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0]).toMatchObject({
      name: ACTING_PATIENT_COOKIE,
      value: patients[1].id,
    });
    const [event] = await auditOf(patients[1].id, 'guardian-acting-for');
    expect(event.detail).toBe('responsável passou a agir em nome do paciente');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado paciente que não é dele, Quando escolhe, Então 404 e nenhum cookie é gravado', async () => {
    const { email } = await guardianOf('mae', [yearsAgo(10)]);
    const stranger = await guardianOf('mae', [yearsAgo(9)]);
    signIn('guardian', email);
    const { actForPatient } = await actions();

    const result = await actForPatient({ patientId: stranger.patients[0].id });

    expect(result.success).toBe(false);
    expect(cookieWrites).toHaveLength(0);
    expect(
      await auditOf(stranger.patients[0].id, 'guardian-acting-for'),
    ).toHaveLength(0);
  });

  it('Dado o paciente titular, Quando tenta agir em nome de alguém, Então recusado sem cookie', async () => {
    const patient = await adultPatient();
    signIn('patient', patient.email as string);
    const { actForPatient } = await actions();

    const result = await actForPatient({ patientId: patient.id });

    expect(result.success).toBe(false);
    expect(cookieWrites).toHaveLength(0);
  });

  it('Dado que agia em nome de um paciente, Quando deixa de agir, Então o cookie é apagado e a tela atualiza', async () => {
    const { email } = await guardianOf('mae', [yearsAgo(10)]);
    signIn('guardian', email);
    const { stopActingForPatient } = await actions();

    const result = await stopActingForPatient({});

    expect(result.success).toBe(true);
    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0]).toMatchObject({
      name: ACTING_PATIENT_COOKIE,
      value: '',
      options: expect.objectContaining({ maxAge: 0 }),
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });
});
