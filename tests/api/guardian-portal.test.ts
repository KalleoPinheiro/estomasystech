import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { ACTING_PATIENT_COOKIE } from '@/lib/auth/acting-patient';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor, sessionToken } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const admin = () =>
  cookieHeaderFor('company_admin', 'admin-gp@x.com', CLINIC_A_ID);
let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}@x.com`;
};

/** Cookie do responsável; `acting` é o paciente escolhido (cookie do portal). */
const guardianCookie = (email: string, acting?: string) => ({
  cookie: [
    `${SESSION_COOKIE}=${sessionToken('guardian', email, undefined, CLINIC_A_ID)}`,
    acting ? `${ACTING_PATIENT_COOKIE}=${acting}` : '',
  ]
    .filter(Boolean)
    .join('; '),
});

const portalRequest = (
  url: string,
  headers: Record<string, string>,
  method = 'GET',
  body?: unknown,
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('Feature: Responsável acessa o portal em nome do paciente (ADR-027)', () => {
  let guardiansRoute: typeof import('@/app/api/guardians/route');
  let guardianByIdRoute: typeof import('@/app/api/guardians/[id]/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let accountsRoute: typeof import('@/app/api/accounts/route');
  let portalPatientRoute: typeof import('@/app/api/portal/patient/route');
  let patientsListRoute: typeof import('@/app/api/portal/guardian/patients/route');
  let actingForRoute: typeof import('@/app/api/portal/guardian/acting-for/route');
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');
  let exportRoute: typeof import('@/app/api/portal/patient/export/route');
  let dataRequestsRoute: typeof import('@/app/api/portal/patient/data-requests/route');
  let revokeRoute: typeof import('@/app/api/portal/patient/guardian-access/route');

  beforeAll(async () => {
    await ensureTestClinics();
    guardiansRoute = await import('@/app/api/guardians/route');
    guardianByIdRoute = await import('@/app/api/guardians/[id]/route');
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    accountsRoute = await import('@/app/api/accounts/route');
    portalPatientRoute = await import('@/app/api/portal/patient/route');
    patientsListRoute = await import(
      '@/app/api/portal/guardian/patients/route'
    );
    actingForRoute = await import('@/app/api/portal/guardian/acting-for/route');
    consentRoute = await import('@/app/api/portal/patient/consent/route');
    exportRoute = await import('@/app/api/portal/patient/export/route');
    dataRequestsRoute = await import(
      '@/app/api/portal/patient/data-requests/route'
    );
    revokeRoute = await import(
      '@/app/api/portal/patient/guardian-access/route'
    );
  });

  const createGuardian = async (fullName = 'Ana Responsável') => {
    const response = await guardiansRoute.POST(
      jsonRequest(
        '/api/guardians',
        'POST',
        {
          fullName,
          relationship: 'filho',
          phone: '11999990000',
          email: unique('resp-contato'),
        },
        admin(),
      ),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const createPatient = async (fullName: string, guardianId?: string) => {
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName, phone: '11911112222', guardianId },
        admin(),
      ),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const grantAccess = async (
    guardianId: string,
    email: string,
    guardianAuthorization = true,
  ) =>
    accountsRoute.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        { email, role: 'guardian', guardianId, guardianAuthorization },
        admin(),
      ),
    );

  const portal = async (headers: Record<string, string>) => {
    const response = await portalPatientRoute.GET(
      portalRequest('/api/portal/patient', headers),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<{
        patient: { id: string; fullName: string };
        actingFor: { patientId: string; fullName: string } | null;
        guardianAccess: {
          fullName: string;
          relationshipLabel: string;
          lastAccessAt: string | null;
        } | null;
      }>,
    };
  };

  const trail = async (patientId: string, resourceType: string) => {
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    return auditEvents.findAll({ patientId, resourceType });
  };

  it('concessão: exige a atestação da equipe, um paciente ativo ligado e um acesso por responsável', async () => {
    const guardianId = await createGuardian();
    const email = unique('resp-login');

    const semAtestacao = await grantAccess(guardianId, email, false);
    expect(semAtestacao.status).toBe(400);
    expect(((await semAtestacao.json()) as Envelope<null>).error).toContain(
      'autorizou',
    );

    const semPaciente = await grantAccess(guardianId, email);
    expect(semPaciente.status).toBe(400);
    expect(((await semPaciente.json()) as Envelope<null>).error).toContain(
      'paciente ativo',
    );

    await createPatient('Maria Souza', guardianId);
    expect((await grantAccess(guardianId, email)).status).toBe(200);
    const duplicada = await grantAccess(guardianId, unique('outro-login'));
    expect(duplicada.status).toBe(400);
    expect(((await duplicada.json()) as Envelope<null>).error).toContain(
      'já tem acesso',
    );

    const semCadastro = await grantAccess('inexistente', unique('x'));
    expect(semCadastro.status).toBe(400);
  });

  it('um paciente: o responsável acessa em nome dele, com aviso na resposta e trilha ator=responsável, titular=paciente', async () => {
    const guardianId = await createGuardian();
    const patientId = await createPatient('José Idoso', guardianId);
    const email = unique('resp-um');
    expect((await grantAccess(guardianId, email)).status).toBe(200);

    const { status, body } = await portal(guardianCookie(email));

    expect(status).toBe(200);
    expect(body.data.patient.id).toBe(patientId);
    expect(body.data.actingFor).toEqual({
      patientId,
      fullName: 'José Idoso',
    });
    expect(body.data.guardianAccess).toBeNull();
    const [event] = await trail(patientId, 'guardian-access');
    expect(event.actorRole).toBe('guardian');
    expect(event.actorId).toBe(email);
    expect(event.patientId).toBe(patientId);
    expect(event.action).toBe('read');
  });

  it('vários pacientes: sem escolha responde 409; escolher grava a trilha e vale só para os ligados', async () => {
    const guardianId = await createGuardian();
    const first = await createPatient('Luiza Filha', guardianId);
    const second = await createPatient('Pedro Filho', guardianId);
    const stranger = await createPatient('Carla Sem Vínculo');
    const email = unique('resp-dois');
    expect((await grantAccess(guardianId, email)).status).toBe(200);

    const list = await patientsListRoute.GET(
      portalRequest('/api/portal/guardian/patients', guardianCookie(email)),
    );
    const listed = (
      (await list.json()) as Envelope<{
        patients: { id: string; fullName: string }[];
        selectedPatientId: string | null;
      }>
    ).data;
    expect(listed.patients.map((p) => p.id).sort()).toEqual(
      [first, second].sort(),
    );
    expect(listed.selectedPatientId).toBeNull();
    expect(JSON.stringify(listed)).not.toContain('Carla');

    expect((await portal(guardianCookie(email))).status).toBe(409);
    expect((await portal(guardianCookie(email, stranger))).status).toBe(409);

    const foreign = await actingForRoute.PUT(
      portalRequest(
        '/api/portal/guardian/acting-for',
        guardianCookie(email),
        'PUT',
        { patientId: stranger },
      ),
    );
    expect(foreign.status).toBe(404);

    const chosen = await actingForRoute.PUT(
      portalRequest(
        '/api/portal/guardian/acting-for',
        guardianCookie(email),
        'PUT',
        { patientId: second },
      ),
    );
    expect(chosen.status).toBe(200);
    expect(chosen.cookies.get(ACTING_PATIENT_COOKIE)?.value).toBe(second);
    expect(chosen.cookies.get(ACTING_PATIENT_COOKIE)?.httpOnly).toBe(true);
    const [choice] = await trail(second, 'guardian-acting-for');
    expect(choice.actorRole).toBe('guardian');
    expect(choice.actorId).toBe(email);

    const result = await portal(guardianCookie(email, second));
    expect(result.status).toBe(200);
    expect(result.body.data.patient.id).toBe(second);

    const cleared = await actingForRoute.DELETE(
      portalRequest(
        '/api/portal/guardian/acting-for',
        guardianCookie(email, second),
        'DELETE',
      ),
    );
    expect(cleared.status).toBe(200);
    expect(cleared.cookies.get(ACTING_PATIENT_COOKIE)?.value).toBe('');
  });

  it('atos do titular ficam fechados ao responsável: consentimento, cópia dos dados e pedidos LGPD respondem 403', async () => {
    const guardianId = await createGuardian();
    const patientId = await createPatient('Rita Dependente', guardianId);
    const email = unique('resp-403');
    expect((await grantAccess(guardianId, email)).status).toBe(200);
    const headers = guardianCookie(email, patientId);

    const postConsent = await consentRoute.POST(
      portalRequest('/api/portal/patient/consent', headers, 'POST', {}),
    );
    const download = await exportRoute.GET(
      portalRequest('/api/portal/patient/export', headers),
    );
    const request = await dataRequestsRoute.POST(
      portalRequest('/api/portal/patient/data-requests', headers, 'POST', {
        kind: 'rectification',
        description: 'x',
      }),
    );
    // Ler o estado do consentimento é permitido (decide o envio de fotos).
    const readConsent = await consentRoute.GET(
      portalRequest('/api/portal/patient/consent', headers),
    );

    expect([postConsent.status, download.status, request.status]).toEqual([
      403, 403, 403,
    ]);
    expect(readConsent.status).toBe(200);
  });

  it('evidência para o titular: o paciente vê quem acessa em nome dele e quando foi o último acesso', async () => {
    const guardianId = await createGuardian('Ana Evidência');
    const patientId = await createPatient('Tomás Titular', guardianId);
    const loginPaciente = unique('paciente-evid');
    const email = unique('resp-evid');
    expect((await grantAccess(guardianId, email)).status).toBe(200);
    const { auditEvents, userAccounts } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    const { UserAccount } = await import('@/domain/auth/user-account');
    await userAccounts.save(
      UserAccount.create({
        email: loginPaciente,
        passwordHash: 'scrypt$x',
        role: 'patient',
        clinicId: CLINIC_A_ID,
        patientId,
      }),
    );
    const patientHeaders = cookieHeaderFor(
      'patient',
      loginPaciente,
      CLINIC_A_ID,
    );

    const before = await portal(patientHeaders);
    expect(before.body.data.guardianAccess).toEqual({
      fullName: 'Ana Evidência',
      relationshipLabel: 'Filho(a)',
      lastAccessAt: null,
    });
    expect(before.body.data.actingFor).toBeNull();

    await portal(guardianCookie(email));
    const after = await portal(patientHeaders);
    expect(after.body.data.guardianAccess?.lastAccessAt).toEqual(
      expect.any(String),
    );
    expect(
      (
        await auditEvents.findAll({
          patientId,
          resourceType: 'guardian-access',
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  it('encerramento: desvincular o paciente, desativar a conta ou excluir o cadastro fecha o acesso', async () => {
    const guardianId = await createGuardian();
    const patientId = await createPatient('Nina Dependente', guardianId);
    const email = unique('resp-fim');
    expect((await grantAccess(guardianId, email)).status).toBe(200);
    const headers = guardianCookie(email, patientId);
    expect((await portal(headers)).status).toBe(200);

    // Excluir o cadastro com conta de portal é recusado.
    const blocked = await guardianByIdRoute.DELETE(
      jsonRequest(`/api/guardians/${guardianId}`, 'DELETE', undefined, admin()),
      context(guardianId),
    );
    expect(blocked.status).toBe(409);

    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const account = await userAccounts.findByEmail(email);
    if (!account) throw new Error('conta não criada');
    await userAccounts.save(account.deactivate());
    expect((await portal(headers)).status).toBe(404);
    await userAccounts.save(account);
    expect((await portal(headers)).status).toBe(200);

    const unlink = await patientByIdRoute.PUT(
      jsonRequest(
        `/api/patients/${patientId}`,
        'PUT',
        { guardianId: null },
        admin(),
      ),
      context(patientId),
    );
    expect(unlink.status).toBe(200);
    expect((await portal(headers)).status).toBe(404);
  });

  it('revogação (ADR-028): o paciente encerra sozinho o acesso, só para ele, com trilha ator=paciente', async () => {
    const guardianId = await createGuardian('Ana Revogada');
    const patientId = await createPatient('Paulo Titular', guardianId);
    const otherPatientId = await createPatient('Irmã de Paulo', guardianId);
    const login = unique('paciente-revoga');
    const email = unique('resp-revoga');
    expect((await grantAccess(guardianId, email)).status).toBe(200);
    const { userAccounts, auditEvents, patients } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    const { UserAccount } = await import('@/domain/auth/user-account');
    await userAccounts.save(
      UserAccount.create({
        email: login,
        passwordHash: 'scrypt$x',
        role: 'patient',
        clinicId: CLINIC_A_ID,
        patientId,
      }),
    );
    const patientHeaders = cookieHeaderFor('patient', login, CLINIC_A_ID);
    const revoke = (headers: Record<string, string>) =>
      revokeRoute.DELETE(
        portalRequest('/api/portal/patient/guardian-access', headers, 'DELETE'),
      );

    // O responsável não revoga a própria autorização.
    expect((await revoke(guardianCookie(email, patientId))).status).toBe(403);
    expect((await portal(guardianCookie(email, patientId))).status).toBe(200);

    expect((await revoke(patientHeaders)).status).toBe(200);

    const events = await trail(patientId, 'guardian-access-revocation');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorRole: 'patient',
      actorId: login,
      action: 'update',
      resourceId: patientId,
    });
    // Fecha o acesso para este paciente; o outro dele segue aberto.
    // Cookie do paciente revogado não o reabre: cai no único que sobrou.
    const stillOpen = await portal(guardianCookie(email, patientId));
    expect(stillOpen.body.data.patient.id).toBe(otherPatientId);
    const listed = await patientsListRoute.GET(
      portalRequest('/api/portal/guardian/patients', guardianCookie(email)),
    );
    const { data } = (await listed.json()) as Envelope<{
      patients: { id: string }[];
    }>;
    expect(data.patients.map((p) => p.id)).toEqual([otherPatientId]);
    // O titular deixa de ver o responsável e a revogação não se repete.
    expect((await portal(patientHeaders)).body.data.guardianAccess).toBeNull();
    expect((await revoke(patientHeaders)).status).toBe(404);
    expect(await trail(patientId, 'guardian-access-revocation')).toHaveLength(
      1,
    );
    expect(
      await auditEvents.findAll({
        patientId: otherPatientId,
        resourceType: 'guardian-access-revocation',
      }),
    ).toHaveLength(0);

    // A equipe vê a revogação e restaura desvinculando e vinculando de novo.
    const detail = await patientByIdRoute.GET(
      jsonRequest(`/api/patients/${patientId}`, 'GET', undefined, admin()),
      context(patientId),
    );
    expect(
      ((await detail.json()) as Envelope<{ guardianPortalRevokedAt: string }>)
        .data.guardianPortalRevokedAt,
    ).toEqual(expect.any(String));
    for (const body of [{ guardianId: null }, { guardianId }]) {
      const res = await patientByIdRoute.PUT(
        jsonRequest(`/api/patients/${patientId}`, 'PUT', body, admin()),
        context(patientId),
      );
      expect(res.status).toBe(200);
    }
    expect(
      (await patients.findById(patientId))?.guardianPortalRevokedAt,
    ).toBeNull();
    expect((await portal(guardianCookie(email, patientId))).status).toBe(200);
  });

  it('revogação: paciente sem responsável ligado recebe 404 e nada é gravado', async () => {
    const patientId = await createPatient('Sem Responsável');
    const login = unique('paciente-sem-resp');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const { UserAccount } = await import('@/domain/auth/user-account');
    await userAccounts.save(
      UserAccount.create({
        email: login,
        passwordHash: 'scrypt$x',
        role: 'patient',
        clinicId: CLINIC_A_ID,
        patientId,
      }),
    );

    const response = await revokeRoute.DELETE(
      portalRequest(
        '/api/portal/patient/guardian-access',
        cookieHeaderFor('patient', login, CLINIC_A_ID),
        'DELETE',
      ),
    );

    expect(response.status).toBe(404);
    expect(await trail(patientId, 'guardian-access-revocation')).toHaveLength(
      0,
    );
  });

  it('a conta do paciente não entra na rota de escolha do responsável e vice-versa', async () => {
    const response = await patientsListRoute.GET(
      portalRequest(
        '/api/portal/guardian/patients',
        cookieHeaderFor('partner', 'parceiro@x.com', CLINIC_A_ID),
      ),
    );
    expect(response.status).toBe(403);

    const asPatient = await patientsListRoute.GET(
      portalRequest(
        '/api/portal/guardian/patients',
        cookieHeaderFor('patient', 'sem-conta@x.com', CLINIC_A_ID),
      ),
    );
    expect(asPatient.status).toBe(404);
  });
});
