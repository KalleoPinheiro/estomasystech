import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, completeClinicRegistration } from '../support/clinics';
import { linkAllPortalAccounts } from '../support/portal-account';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Mock leve do SDK "googleapis" — não fazemos chamada HTTP real. Cobre os
 * ramos de troca de código bem-sucedida/malsucedida do callback OAuth sem
 * depender de rede real ao Google (a mock não é um mock elaborado de fetch,
 * apenas substitui o client OAuth2 do SDK oficial).
 */
const googleMockState: {
  tokenBehavior: 'success' | 'no-refresh-token' | 'throw';
  userinfoEmail: string | null;
} = { tokenBehavior: 'success', userinfoEmail: null };

vi.mock('googleapis', () => {
  class MockOAuth2Client {
    async getToken(_code: string) {
      if (googleMockState.tokenBehavior === 'throw') {
        throw new Error('falha simulada na troca do código');
      }
      return {
        tokens: {
          refresh_token:
            googleMockState.tokenBehavior === 'no-refresh-token'
              ? undefined
              : 'refresh-token-abc',
        },
      };
    }
    setCredentials() {}
    generateAuthUrl(_opts: unknown) {
      return 'https://accounts.google.com/mock-auth-url';
    }
  }
  return {
    google: {
      auth: { OAuth2: MockOAuth2Client },
      oauth2: () => ({
        userinfo: {
          get: async () => ({
            data: { email: googleMockState.userinfoEmail ?? undefined },
          }),
        },
      }),
    },
  };
});

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Feature: Fechamento de branches — login e rotas do portal', () => {
  let loginRoute: typeof import('@/app/api/auth/login/route');

  let patientsRoute: typeof import('@/app/api/patients/route');
  let partnersRoute: typeof import('@/app/api/partners/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let conditionsRoute: typeof import('@/app/api/patients/[id]/conditions/route');
  let assessmentsRoute: typeof import('@/app/api/conditions/[id]/assessments/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let photoByIdRoute: typeof import('@/app/api/photos/[id]/route');

  let partnerPortalRoute: typeof import('@/app/api/portal/partner/route');
  let patientPortalRoute: typeof import('@/app/api/portal/patient/route');
  let photosRoute: typeof import('@/app/api/portal/patient/photos/route');
  let photoByIdPortalRoute: typeof import('@/app/api/portal/patient/photos/[id]/route');
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');
  let conditionPhotosListRoute: typeof import('@/app/api/conditions/[id]/photos/route');
  let confirmRoute: typeof import('@/app/api/portal/patient/appointments/[id]/confirm/route');

  let createSessionToken: typeof import('@/lib/auth/session').createSessionToken;

  beforeAll(async () => {
    process.env.AUTH_SECRET = 'test-secret-gaps';
    await completeClinicRegistration(CLINIC_A_ID);

    loginRoute = await import('@/app/api/auth/login/route');

    patientsRoute = await import('@/app/api/patients/route');
    partnersRoute = await import('@/app/api/partners/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    conditionsRoute = await import('@/app/api/patients/[id]/conditions/route');
    assessmentsRoute = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    photoByIdRoute = await import('@/app/api/photos/[id]/route');

    partnerPortalRoute = await import('@/app/api/portal/partner/route');
    patientPortalRoute = await import('@/app/api/portal/patient/route');
    photosRoute = await import('@/app/api/portal/patient/photos/route');
    photoByIdPortalRoute = await import(
      '@/app/api/portal/patient/photos/[id]/route'
    );
    consentRoute = await import('@/app/api/portal/patient/consent/route');
    conditionPhotosListRoute = await import(
      '@/app/api/conditions/[id]/photos/route'
    );
    confirmRoute = await import(
      '@/app/api/portal/patient/appointments/[id]/confirm/route'
    );

    ({ createSessionToken } = await import('@/lib/auth/session'));
  });

  const cookieHeader = (token: string) => ({
    cookie: `estomasystech_session=${token}`,
  });
  const sessionFor = (
    email: string,
    role: 'company_admin' | 'partner' | 'patient',
  ) =>
    createSessionToken(
      process.env.AUTH_SECRET as string,
      Date.now() + 3_600_000,
      email,
      role,
    );

  describe('POST /api/auth/login — conta individual desativada', () => {
    it('Dado conta individual desativada, Quando POST login, Então retorna 401', async () => {
      process.env.AUTH_SECRET = 'test-secret-gaps';
      process.env.AUTH_PASSWORD = 'senha-clinica';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { UserAccount } = await import('@/domain/auth/user-account');
      const { userAccounts } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      const account = UserAccount.create({
        email: 'inativo.gaps@clinica.com',
        passwordHash: await hashPassword('senha-individual'),
        role: 'company_admin',
        clinicId: 'legacy-clinic',
      });
      await userAccounts.save(account.deactivate());

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 'senha-individual', email: 'inativo.gaps@clinica.com' },
          { 'x-forwarded-for': '10.0.1.1' },
        ),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(401);
      expect(body.error).toContain('Email ou senha incorretos');
      delete process.env.AUTH_PASSWORD;
    });
  });

  describe('GET /api/portal/partner — fluxo completo com pacientes indicados', () => {
    it('Dado parceiro com paciente indicado (condição + avaliação), Quando GET portal do parceiro, Então retorna dados agrupados', async () => {
      const partnerEmail = 'parceiro.completo.gaps@example.com';
      const partnerResponse = await partnersRoute.POST(
        jsonRequest('/api/partners', 'POST', {
          fullName: 'Dr. Parceiro Completo',
          email: partnerEmail,
          phone: '11922223333',
        }),
      );
      const partnerBody = (await partnerResponse.json()) as Envelope<{
        id: string;
      }>;
      const partnerId = partnerBody.data.id;

      const referredResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Indicado Gaps',
          email: 'paciente.indicado.gaps@example.com',
          phone: '11933334444',
          referredByPartnerId: partnerId,
        }),
      );
      const referredBody = (await referredResponse.json()) as Envelope<{
        id: string;
      }>;
      const referredPatientId = referredBody.data.id;

      const conditionResponse = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${referredPatientId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida indicada',
        }),
        context(referredPatientId),
      );
      const conditionBody = (await conditionResponse.json()) as Envelope<{
        id: string;
      }>;

      await assessmentsRoute.POST(
        jsonRequest(
          `/api/conditions/${conditionBody.data.id}/assessments`,
          'POST',
          {
            lengthMm: 10,
            widthMm: 5,
          },
        ),
        context(conditionBody.data.id),
      );

      await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId: referredPatientId,
          startsAt: '2027-02-08T12:00:00.000Z',
          endsAt: '2027-02-08T13:00:00.000Z',
          procedure: 'Retorno',
          priceCents: 10000,
        }),
      );
      // Consentimento do paciente para o parceiro (#292): sem ele, só o status.
      const { getRepositories } = await import('@/infrastructure/container');
      const { PartnerShareConsent } = await import(
        '@/domain/consent/partner-share-consent'
      );
      const { PARTNER_SHARE_CONSENT } = await import(
        '@/lib/partner-share-consent-text'
      );
      const { partnerShareConsents } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      await partnerShareConsents.save(
        PartnerShareConsent.accept({
          patientId: referredPatientId,
          partnerId,
          consentText: PARTNER_SHARE_CONSENT.text,
          textVersion: PARTNER_SHARE_CONSENT.version,
        }),
      );

      await linkAllPortalAccounts();
      const response = await partnerPortalRoute.GET(
        jsonRequest(
          '/api/portal/partner',
          'GET',
          undefined,
          cookieHeader(sessionFor(partnerEmail, 'partner')),
        ),
      );
      const body = (await response.json()) as Envelope<{
        partner: { id: string };
        referredPatients: Array<{
          patient: { id: string };
          appointments: Array<{ id: string }>;
          conditions: Array<{
            condition: { id: string };
            assessments: Array<{ id: string }>;
          }>;
        }>;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.partner.id).toBe(partnerId);
      const entry = body.data.referredPatients.find(
        (r) => r.patient.id === referredPatientId,
      );
      expect(entry).toBeDefined();
      expect(entry?.appointments.length).toBeGreaterThan(0);
      expect(entry?.conditions.length).toBeGreaterThan(0);
      expect(entry?.conditions[0]?.assessments.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/portal/patient — fluxo completo com fatura, retorno e fotos', () => {
    it('Dado paciente sem consentimento vigente, Quando POST photos no portal, Então 403 e nada é gravado (COMP3-01)', async () => {
      const patientEmail = 'paciente.sem.consent@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Sem Consentimento',
          email: patientEmail,
          phone: '11933332222',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      const conditionResponse = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patientBody.data.id}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida sem consentimento',
        }),
        context(patientBody.data.id),
      );
      const conditionBody = (await conditionResponse.json()) as Envelope<{
        id: string;
      }>;

      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const form = new FormData();
      form.set('file', new File([png], 'foto.png', { type: 'image/png' }));
      form.set('conditionId', conditionBody.data.id);
      await linkAllPortalAccounts();
      const response = await photosRoute.POST(
        new NextRequest('http://localhost/api/portal/patient/photos', {
          method: 'POST',
          body: form,
          headers: cookieHeader(sessionFor(patientEmail, 'patient')),
        }),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(403);
      expect(body.error).toContain('Consentimento pendente');

      const photosResponse = await conditionPhotosListRoute.GET(
        jsonRequest(`/api/conditions/${conditionBody.data.id}/photos`, 'GET'),
        context(conditionBody.data.id),
      );
      const photosBody = (await photosResponse.json()) as Envelope<unknown[]>;
      expect(photosBody.data).toHaveLength(0);
    });

    it('Dado aceite de texto defasado, Quando POST photos no portal, Então 403 — hash antigo não vale (COMP3-03)', async () => {
      const patientEmail = 'paciente.consent.antigo@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Consentimento Antigo',
          email: patientEmail,
          phone: '11911110000',
        }),
      );
      const consentPatientId = (
        (await patientResponse.json()) as Envelope<{ id: string }>
      ).data.id;
      const conditionResponse = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${consentPatientId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida com termo antigo',
        }),
        context(consentPatientId),
      );
      const conditionId = (
        (await conditionResponse.json()) as Envelope<{ id: string }>
      ).data.id;

      // Aceite de uma versão anterior do termo: hash não cobre o CONSENT_TEXT vigente.
      const { getRepositories } = await import('@/infrastructure/container');
      const { ConsentRecord } = await import('@/domain/consent/consent-record');
      const repos = await getRepositories(clinicScope('legacy-clinic'));
      await repos.consentRecords.save(
        ConsentRecord.create({
          patientId: consentPatientId,
          consentText: 'Versão anterior do termo de consentimento da clínica.',
          textVersion: 'v1',
          purpose: 'image',
        }),
      );

      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const form = new FormData();
      form.set('file', new File([png], 'foto.png', { type: 'image/png' }));
      form.set('conditionId', conditionId);
      await linkAllPortalAccounts();
      const response = await photosRoute.POST(
        new NextRequest('http://localhost/api/portal/patient/photos', {
          method: 'POST',
          body: form,
          headers: cookieHeader(sessionFor(patientEmail, 'patient')),
        }),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(403);
      expect(body.error).toContain('Consentimento pendente');
    });

    it('Dado paciente com aceite vigente e duas condições, Quando enviar foto em ambas, Então o gate é por paciente (edge case)', async () => {
      const patientEmail = 'paciente.duas.condicoes@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Duas Condições',
          email: patientEmail,
          phone: '11900001111',
        }),
      );
      const twoPatientId = (
        (await patientResponse.json()) as Envelope<{ id: string }>
      ).data.id;
      await linkAllPortalAccounts();
      const token = sessionFor(patientEmail, 'patient');
      await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent?purpose=image',
          'POST',
          undefined,
          cookieHeader(token),
        ),
      );

      const conditionIds: string[] = [];
      for (const title of ['Ferida A', 'Ferida B']) {
        const response = await conditionsRoute.POST(
          jsonRequest(`/api/patients/${twoPatientId}/conditions`, 'POST', {
            kind: 'wound',
            title,
          }),
          context(twoPatientId),
        );
        conditionIds.push(
          ((await response.json()) as Envelope<{ id: string }>).data.id,
        );
      }

      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      for (const conditionId of conditionIds) {
        const form = new FormData();
        form.set('file', new File([png], 'foto.png', { type: 'image/png' }));
        form.set('conditionId', conditionId);
        const response = await photosRoute.POST(
          new NextRequest('http://localhost/api/portal/patient/photos', {
            method: 'POST',
            body: form,
            headers: cookieHeader(token),
          }),
        );
        const body = (await response.json()) as Envelope<{
          triageStatus: string;
        }>;

        expect(response.status).toBe(200);
        expect(body.data.triageStatus).toBe('pending');
      }
    });

    it('Dado paciente com fatura pendente, follow-up e foto, Quando GET portal do paciente, Então retorna tudo agregado', async () => {
      const patientEmail = 'paciente.completo.gaps@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Completo Gaps',
          email: patientEmail,
          phone: '11944445555',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      const patientId = patientBody.data.id;

      // Fatura: agenda e completa uma consulta passada.
      const apptResponse = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2026-07-13T12:00:00.000Z',
          endsAt: '2026-07-13T13:00:00.000Z',
          procedure: 'Avaliação',
          priceCents: 12000,
        }),
      );
      const apptBody = (await apptResponse.json()) as Envelope<{ id: string }>;
      await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${apptBody.data.id}`, 'PATCH', {
          action: 'complete',
        }),
        context(apptBody.data.id),
      );

      // Condição ativa para envio de foto pelo paciente.
      const conditionResponse = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida do paciente completo',
        }),
        context(patientId),
      );
      const conditionBody = (await conditionResponse.json()) as Envelope<{
        id: string;
      }>;

      await linkAllPortalAccounts();
      const patientToken = sessionFor(patientEmail, 'patient');

      // Gate de consentimento (COMP3-01): envio remoto exige aceite vigente.
      await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent?purpose=image',
          'POST',
          undefined,
          cookieHeader(patientToken),
        ),
      );

      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
      const form = new FormData();
      form.set('file', file);
      form.set('conditionId', conditionBody.data.id);
      const photoUploadResponse = await photosRoute.POST(
        new NextRequest('http://localhost/api/portal/patient/photos', {
          method: 'POST',
          body: form,
          headers: cookieHeader(patientToken),
        }),
      );
      const photoBody = (await photoUploadResponse.json()) as Envelope<{
        id: string;
      }>;

      // Escalar triagem gera follow-up pendente.
      await photoByIdRoute.PATCH(
        jsonRequest(`/api/photos/${photoBody.data.id}`, 'PATCH', {
          triage: 'escalated',
        }),
        context(photoBody.data.id),
      );

      const response = await patientPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient',
          'GET',
          undefined,
          cookieHeader(patientToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        patient: { id: string };
        invoices: Array<{ id: string }>;
        followUps: Array<{ id: string }>;
        conditions: Array<{
          condition: { id: string };
          photos: Array<{ id: string }>;
        }>;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.patient.id).toBe(patientId);
      expect(body.data.invoices.length).toBeGreaterThan(0);
      expect(body.data.followUps.length).toBeGreaterThan(0);
      const conditionEntry = body.data.conditions.find(
        (c) => c.condition.id === conditionBody.data.id,
      );
      expect(conditionEntry?.photos.length).toBeGreaterThan(0);
    });

    it('Dado sessão de paciente válida mas sem cadastro de paciente correspondente, Quando GET portal do paciente, Então retorna 404', async () => {
      const response = await patientPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient',
          'GET',
          undefined,
          cookieHeader(sessionFor('fantasma.gaps@example.com', 'patient')),
        ),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/portal/patient/photos — branches restantes', () => {
    let conditionId: string;
    let patientToken: string;
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);

    beforeAll(async () => {
      const patientEmail = 'paciente.fotos.gaps@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Fotos Gaps',
          email: patientEmail,
          phone: '11955556666',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      const conditionResponse = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patientBody.data.id}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida a resolver',
        }),
        context(patientBody.data.id),
      );
      const conditionBody = (await conditionResponse.json()) as Envelope<{
        id: string;
      }>;
      conditionId = conditionBody.data.id;
      await linkAllPortalAccounts();
      patientToken = sessionFor(patientEmail, 'patient');
    });

    it('Dado arquivo maior que 5 MB, Quando POST photos, Então retorna 400', async () => {
      const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1);
      const file = new File([bigBytes], 'grande.png', { type: 'image/png' });
      const form = new FormData();
      form.set('file', file);
      form.set('conditionId', conditionId);
      const response = await photosRoute.POST(
        new NextRequest('http://localhost/api/portal/patient/photos', {
          method: 'POST',
          body: form,
          headers: cookieHeader(patientToken),
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado condição já resolvida, Quando POST photos, Então retorna 400', async () => {
      const resolveResponse = await (
        await import('@/app/api/conditions/[id]/route')
      ).PATCH(
        jsonRequest(`/api/conditions/${conditionId}`, 'PATCH', {
          action: 'resolve',
        }),
        context(conditionId),
      );
      expect(resolveResponse.status).toBe(200);

      const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
      const form = new FormData();
      form.set('file', file);
      form.set('conditionId', conditionId);
      const response = await photosRoute.POST(
        new NextRequest('http://localhost/api/portal/patient/photos', {
          method: 'POST',
          body: form,
          headers: cookieHeader(patientToken),
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/portal/patient/photos/:id — sessão sem paciente correspondente', () => {
    it('Dado sessão de paciente válida sem cadastro correspondente, Quando GET foto, Então retorna 404', async () => {
      const response = await photoByIdPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient/photos/ghost',
          'GET',
          undefined,
          cookieHeader(sessionFor('fantasma-foto.gaps@example.com', 'patient')),
        ),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET/POST /api/portal/patient/consent — branches restantes', () => {
    it('Dado sessão de paciente sem cadastro correspondente, Quando GET consent, Então retorna 404', async () => {
      const response = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(
            sessionFor('fantasma-consent.gaps@example.com', 'patient'),
          ),
        ),
      );

      expect(response.status).toBe(404);
    });

    it('Dado paciente desativado, Quando POST consent, Então retorna 404', async () => {
      const patientEmail = 'paciente.consent.inativo.gaps@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Consent Inativo',
          email: patientEmail,
          phone: '11966667777',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      await patientByIdRoute.PATCH(
        jsonRequest(`/api/patients/${patientBody.data.id}`, 'PATCH', {
          active: false,
        }),
        context(patientBody.data.id),
      );

      await linkAllPortalAccounts();
      const response = await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent?purpose=image',
          'POST',
          undefined,
          cookieHeader(sessionFor(patientEmail, 'patient')),
        ),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/portal/patient/appointments/:id/confirm — branches restantes', () => {
    it('Dado consulta já confirmada, Quando POST confirm novamente, Então retorna a mesma consulta (idempotente)', async () => {
      const patientEmail = 'paciente.confirm.idempotente.gaps@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Confirm Idempotente',
          email: patientEmail,
          phone: '11977778888',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      const appointmentResponse = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId: patientBody.data.id,
          startsAt: '2027-03-08T12:00:00.000Z',
          endsAt: '2027-03-08T13:00:00.000Z',
          procedure: 'Avaliação',
          priceCents: 9000,
        }),
      );
      const appointmentBody = (await appointmentResponse.json()) as Envelope<{
        id: string;
      }>;
      await linkAllPortalAccounts();
      const token = sessionFor(patientEmail, 'patient');

      const first = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentBody.data.id}/confirm`,
          'POST',
          undefined,
          cookieHeader(token),
        ),
        context(appointmentBody.data.id),
      );
      expect(first.status).toBe(200);

      const second = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentBody.data.id}/confirm`,
          'POST',
          undefined,
          cookieHeader(token),
        ),
        context(appointmentBody.data.id),
      );
      const secondBody = (await second.json()) as Envelope<{ status: string }>;

      expect(second.status).toBe(200);
      expect(secondBody.data.status).toBe('confirmed');
    });

    it('Dado consulta já passada, Quando POST confirm, Então retorna 400', async () => {
      const patientEmail = 'paciente.confirm.passado.gaps@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Confirm Passado',
          email: patientEmail,
          phone: '11988889999',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      const appointmentResponse = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId: patientBody.data.id,
          startsAt: '2020-01-06T12:00:00.000Z',
          endsAt: '2020-01-06T13:00:00.000Z',
          procedure: 'Avaliação',
          priceCents: 8000,
        }),
      );
      const appointmentBody = (await appointmentResponse.json()) as Envelope<{
        id: string;
      }>;

      await linkAllPortalAccounts();
      const response = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentBody.data.id}/confirm`,
          'POST',
          undefined,
          cookieHeader(sessionFor(patientEmail, 'patient')),
        ),
        context(appointmentBody.data.id),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('consultas futuras');
    });

    it('Dado paciente desativado, Quando POST confirm, Então retorna 404', async () => {
      const patientEmail = 'paciente.confirm.inativo.gaps@example.com';
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Confirm Inativo',
          email: patientEmail,
          phone: '11999990000',
        }),
      );
      const patientBody = (await patientResponse.json()) as Envelope<{
        id: string;
      }>;
      const appointmentResponse = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId: patientBody.data.id,
          startsAt: '2027-04-05T12:00:00.000Z',
          endsAt: '2027-04-05T13:00:00.000Z',
          procedure: 'Avaliação',
          priceCents: 8500,
        }),
      );
      const appointmentBody = (await appointmentResponse.json()) as Envelope<{
        id: string;
      }>;
      await patientByIdRoute.PATCH(
        jsonRequest(`/api/patients/${patientBody.data.id}`, 'PATCH', {
          active: false,
        }),
        context(patientBody.data.id),
      );

      await linkAllPortalAccounts();
      const response = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentBody.data.id}/confirm`,
          'POST',
          undefined,
          cookieHeader(sessionFor(patientEmail, 'patient')),
        ),
        context(appointmentBody.data.id),
      );

      expect(response.status).toBe(404);
    });
  });
});
