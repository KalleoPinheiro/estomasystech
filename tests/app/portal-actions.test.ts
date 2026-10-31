import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Guardian } from '@/domain/guardian/guardian';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
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
  }),
  headers: async () =>
    new Headers(
      cookieStore.forwardedFor
        ? { 'x-forwarded-for': cookieStore.forwardedFor }
        : {},
    ),
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
  extra: { referredByPartnerId?: string | null } = {},
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
