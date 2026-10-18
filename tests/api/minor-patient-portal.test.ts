import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { zonedParts } from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor, sessionToken } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const admin = () =>
  cookieHeaderFor('company_admin', 'admin-minor@x.com', CLINIC_A_ID);
const atendente = () =>
  cookieHeaderFor('atendente', 'recepcao-minor@x.com', CLINIC_A_ID);
const profissional = () =>
  cookieHeaderFor('profissional', 'prof-minor@x.com', CLINIC_A_ID);
let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}@x.com`;
};
const sessionCookie = (role: 'guardian' | 'patient', email: string) => ({
  cookie: `${SESSION_COOKIE}=${sessionToken(role, email, undefined, CLINIC_A_ID)}`,
});
const portalRequest = (
  url: string,
  headers: Record<string, string>,
  method = 'GET',
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/**
 * Data de nascimento `years` anos antes de hoje no fuso da aplicação (meia-noite
 * UTC do dia civil, como a tela grava): sem o fuso, o teste falharia entre 21h
 * e meia-noite de Brasília.
 */
const bornYearsAgo = (years: number, extraDays = 0) => {
  const today = zonedParts(new Date());
  return new Date(
    Date.UTC(today.year - years, today.month - 1, today.day + extraDays),
  ).toISOString();
};

describe('Feature: Paciente menor no portal (#372, ADR-032)', () => {
  let guardiansRoute: typeof import('@/app/api/guardians/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let accountsRoute: typeof import('@/app/api/accounts/route');
  let portalPatientRoute: typeof import('@/app/api/portal/patient/route');
  let guardianPatientsRoute: typeof import('@/app/api/portal/guardian/patients/route');
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');
  let revokeConsentRoute: typeof import('@/app/api/portal/patient/consent/revoke/route');
  let majorityRoute: typeof import('@/app/api/guardians/majority/route');
  let keepRoute: typeof import('@/app/api/guardians/majority/[patientId]/keep/route');

  beforeAll(async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    guardiansRoute = await import('@/app/api/guardians/route');
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    accountsRoute = await import('@/app/api/accounts/route');
    portalPatientRoute = await import('@/app/api/portal/patient/route');
    guardianPatientsRoute = await import(
      '@/app/api/portal/guardian/patients/route'
    );
    consentRoute = await import('@/app/api/portal/patient/consent/route');
    revokeConsentRoute = await import(
      '@/app/api/portal/patient/consent/revoke/route'
    );
    majorityRoute = await import('@/app/api/guardians/majority/route');
    keepRoute = await import(
      '@/app/api/guardians/majority/[patientId]/keep/route'
    );
  });

  const createGuardian = async (relationship: string) => {
    const response = await guardiansRoute.POST(
      jsonRequest(
        '/api/guardians',
        'POST',
        { fullName: 'Rita Representante', relationship, phone: '11999990000' },
        admin(),
      ),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const createPatient = async (
    fullName: string,
    birthDate: string | null,
    guardianId?: string,
  ) => {
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName, phone: '11911112222', birthDate, guardianId },
        admin(),
      ),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const createAccount = (body: Record<string, unknown>) =>
    accountsRoute.POST(jsonRequest('/api/accounts', 'POST', body, admin()));

  const grantGuardian = async (guardianId: string) => {
    const email = unique('rep');
    const response = await createAccount({
      email,
      role: 'guardian',
      guardianId,
      guardianAuthorization: true,
    });
    return { email, response };
  };

  const consentUrl = (purpose: string) =>
    `/api/portal/patient/consent?purpose=${purpose}`;

  const consentRecords = async (patientId: string) => {
    const { consentRecords: repo } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    return repo.findByPatientId(patientId);
  };

  it('menor não ganha conta própria de paciente (400)', async () => {
    const patientId = await createPatient('Lia Criança', bornYearsAgo(10));
    const response = await createAccount({
      email: unique('lia'),
      role: 'patient',
      patientId,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as Envelope<null>).error).toContain(
      'menor de 18 anos',
    );
  });

  it('conta antiga de paciente que é menor não entra no portal (403)', async () => {
    const patientId = await createPatient('Teo Antigo', bornYearsAgo(30));
    const email = unique('teo');
    expect(
      (await createAccount({ email, role: 'patient', patientId })).status,
    ).toBe(200);
    // A data de nascimento é corrigida depois: o paciente é menor.
    const update = await patientByIdRoute.PUT(
      jsonRequest(
        `/api/patients/${patientId}`,
        'PUT',
        { birthDate: bornYearsAgo(12) },
        admin(),
      ),
      { params: Promise.resolve({ id: patientId }) },
    );
    expect(update.status).toBe(200);

    const response = await portalPatientRoute.GET(
      portalRequest('/api/portal/patient', sessionCookie('patient', email)),
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as Envelope<null>).error).toContain(
      'representante legal',
    );
  });

  it('cuidador sem tutela não representa o menor: concessão recusada e menor fora da lista', async () => {
    const caregiver = await createGuardian('cuidador');
    await createPatient('Bia Menor', bornYearsAgo(8), caregiver);
    const denied = await grantGuardian(caregiver);
    expect(denied.response.status).toBe(400);
    expect(((await denied.response.json()) as Envelope<null>).error).toContain(
      'representante legal',
    );

    // Com um adulto também ligado, a conta sai, mas só o adulto aparece.
    const adult = await createPatient(
      'Caio Adulto',
      bornYearsAgo(70),
      caregiver,
    );
    const granted = await grantGuardian(caregiver);
    expect(granted.response.status).toBe(200);
    const list = await guardianPatientsRoute.GET(
      portalRequest(
        '/api/portal/guardian/patients',
        sessionCookie('guardian', granted.email),
      ),
    );
    const listed = (
      (await list.json()) as Envelope<{ patients: { id: string }[] }>
    ).data.patients.map((p) => p.id);
    expect(listed).toEqual([adult]);
  });

  it('mãe aceita e revoga os termos pelo menor; o registro guarda quem assinou', async () => {
    const mother = await createGuardian('mae');
    const patientId = await createPatient(
      'Davi Menor',
      bornYearsAgo(9),
      mother,
    );
    const { email, response } = await grantGuardian(mother);
    expect(response.status).toBe(200);
    const headers = sessionCookie('guardian', email);

    const before = await consentRoute.GET(
      portalRequest(consentUrl('treatment'), headers),
    );
    const beforeBody = (
      (await before.json()) as Envelope<{ canSign: boolean; accepted: boolean }>
    ).data;
    expect(beforeBody).toMatchObject({ canSign: true, accepted: false });

    for (const purpose of ['treatment', 'image']) {
      const accepted = await consentRoute.POST(
        portalRequest(consentUrl(purpose), headers, 'POST'),
      );
      expect(accepted.status).toBe(200);
    }
    const records = await consentRecords(patientId);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.signer).toEqual({
        guardianId: mother,
        relationship: 'mae',
      });
    }

    const status = await consentRoute.GET(
      portalRequest(consentUrl('image'), headers),
    );
    expect(
      (
        (await status.json()) as Envelope<{
          accepted: boolean;
          signedByRelationship: string | null;
        }>
      ).data,
    ).toMatchObject({ accepted: true, signedByRelationship: 'mae' });

    const revoked = await revokeConsentRoute.POST(
      portalRequest(
        '/api/portal/patient/consent/revoke?purpose=image',
        headers,
        'POST',
      ),
    );
    expect(revoked.status).toBe(200);
    const latest = (await consentRecords(patientId)).find(
      (record) => record.kind === 'revoke',
    );
    expect(latest?.signer?.guardianId).toBe(mother);

    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const trail = await auditEvents.findAll({
      patientId,
      resourceType: 'consent',
    });
    expect(trail.length).toBeGreaterThanOrEqual(3);
    expect(trail.every((event) => event.actorRole === 'guardian')).toBe(true);
    expect(
      trail.every((event) => event.detail?.includes('representante legal')),
    ).toBe(true);
  });

  it('responsável de adulto continua sem assinar (403) e o GET diz que não pode', async () => {
    const mother = await createGuardian('mae');
    await createPatient('Eva Adulta', bornYearsAgo(40), mother);
    const { email } = await grantGuardian(mother);
    const headers = sessionCookie('guardian', email);

    const read = await consentRoute.GET(
      portalRequest(consentUrl('treatment'), headers),
    );
    expect(
      ((await read.json()) as Envelope<{ canSign: boolean }>).data.canSign,
    ).toBe(false);
    const post = await consentRoute.POST(
      portalRequest(consentUrl('treatment'), headers, 'POST'),
    );
    expect(post.status).toBe(403);
    const revoke = await revokeConsentRoute.POST(
      portalRequest(
        '/api/portal/patient/consent/revoke?purpose=treatment',
        headers,
        'POST',
      ),
    );
    expect(revoke.status).toBe(403);
  });

  it('aos 18 anos: aviso à clínica, manter com o responsável sai do aviso e a conta do paciente também tira', async () => {
    const father = await createGuardian('pai');
    const kept = await createPatient('Fábio Fez 18', bornYearsAgo(18), father);
    const transferred = await createPatient(
      'Gabi Fez 18',
      bornYearsAgo(18, -3),
      father,
    );
    const minor = await createPatient(
      'Hugo Quase 18',
      bornYearsAgo(18, 1),
      father,
    );
    expect((await grantGuardian(father)).response.status).toBe(200);

    const list = async (headers = admin()) => {
      const response = await majorityRoute.GET(
        portalRequest('/api/guardians/majority', headers),
      );
      return {
        status: response.status,
        ids: (
          (await response.json()) as Envelope<{ patientId: string }[] | null>
        ).data?.map((item) => item.patientId),
      };
    };

    const first = await list();
    expect(first.status).toBe(200);
    expect(first.ids).toEqual(expect.arrayContaining([kept, transferred]));
    expect(first.ids).not.toContain(minor);
    expect((await list(atendente())).status).toBe(200);
    expect((await list(profissional())).status).toBe(403);

    // O menor ainda não pode ser marcado.
    const early = await keepRoute.POST(
      portalRequest(`/api/guardians/majority/${minor}/keep`, admin(), 'POST'),
      { params: Promise.resolve({ patientId: minor }) },
    );
    expect(early.status).toBe(400);

    const keep = await keepRoute.POST(
      portalRequest(`/api/guardians/majority/${kept}/keep`, admin(), 'POST'),
      { params: Promise.resolve({ patientId: kept }) },
    );
    expect(keep.status).toBe(200);
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const [decision] = await auditEvents.findAll({
      patientId: kept,
      resourceType: 'patient',
    });
    expect(decision.detail).toContain('maioridade');

    expect(
      (
        await createAccount({
          email: unique('gabi'),
          role: 'patient',
          patientId: transferred,
        })
      ).status,
    ).toBe(200);

    const after = await list();
    expect(after.ids).not.toContain(kept);
    expect(after.ids).not.toContain(transferred);
  });

  it('paciente que fez 18 anos confirma em nome próprio o termo que a mãe aceitou', async () => {
    const mother = await createGuardian('mae');
    const patientId = await createPatient(
      'Ivo Menor',
      bornYearsAgo(17),
      mother,
    );
    const { email } = await grantGuardian(mother);
    expect(
      (
        await consentRoute.POST(
          portalRequest(
            consentUrl('treatment'),
            sessionCookie('guardian', email),
            'POST',
          ),
        )
      ).status,
    ).toBe(200);

    // Fez 18: a clínica corrige a data e dá a conta ao próprio paciente.
    await patientByIdRoute.PUT(
      jsonRequest(
        `/api/patients/${patientId}`,
        'PUT',
        { birthDate: bornYearsAgo(18) },
        admin(),
      ),
      { params: Promise.resolve({ id: patientId }) },
    );
    const own = unique('ivo');
    expect(
      (await createAccount({ email: own, role: 'patient', patientId })).status,
    ).toBe(200);
    const headers = sessionCookie('patient', own);

    const read = await consentRoute.GET(
      portalRequest(consentUrl('treatment'), headers),
    );
    expect(
      (
        (await read.json()) as Envelope<{
          canSign: boolean;
          accepted: boolean;
          signedByRelationship: string | null;
        }>
      ).data,
    ).toMatchObject({
      canSign: true,
      accepted: true,
      signedByRelationship: 'mae',
    });

    expect(
      (
        await consentRoute.POST(
          portalRequest(consentUrl('treatment'), headers, 'POST'),
        )
      ).status,
    ).toBe(200);
    const records = await consentRecords(patientId);
    expect(records).toHaveLength(2);
    expect(records.some((record) => record.signer === null)).toBe(true);

    // Já assinado por ele: um novo POST não grava outro aceite.
    await consentRoute.POST(
      portalRequest(consentUrl('treatment'), headers, 'POST'),
    );
    expect(await consentRecords(patientId)).toHaveLength(2);
  });
});
