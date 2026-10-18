import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ConditionPhoto,
  PATIENT_MAX_PHOTOS_PER_DAY,
} from '@/domain/clinical/condition-photo';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  PARTNER_SHARE_CONSENT_TEXT,
  PARTNER_SHARE_CONSENT_TEXT_VERSION,
} from '@/lib/partner-share-consent-text';
import { CLINIC_A_ID, completeClinicRegistration } from '../support/clinics';
import { pinClock, unpinClock } from '../support/clock';
import { linkPortalAccount } from '../support/portal-account';
import { jsonRequest as staffRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.AUTH_SECRET = 'test-secret-e2e';

/**
 * Os testes de portal usam este `jsonRequest` local, sem cookie por padrão,
 * para exercitar o 401 de verdade. Setup via rotas da equipe (que exigem papel
 * admin) usa `staffRequest`, autenticado por padrão — importado do builder
 * compartilhado em `tests/support/request.ts`.
 */
const jsonRequest = (
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Feature: Rotas do portal (paciente e parceiro)', () => {
  let meRoute: typeof import('@/app/api/portal/me/route');
  let patientPortalRoute: typeof import('@/app/api/portal/patient/route');
  let partnerPortalRoute: typeof import('@/app/api/portal/partner/route');
  let confirmRoute: typeof import('@/app/api/portal/patient/appointments/[id]/confirm/route');
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');
  let consentRevokeRoute: typeof import('@/app/api/portal/patient/consent/revoke/route');
  let photosRoute: typeof import('@/app/api/portal/patient/photos/route');
  let photoByIdRoute: typeof import('@/app/api/portal/patient/photos/[id]/route');
  let slotsRoute: typeof import('@/app/api/portal/patient/slots/route');
  let portalProceduresRoute: typeof import('@/app/api/portal/patient/procedures/route');
  let portalAppointmentsRoute: typeof import('@/app/api/portal/patient/appointments/route');
  let followUpsRoute: typeof import('@/app/api/follow-ups/route');
  let auditRoute: typeof import('@/app/api/audit/route');
  let proceduresRoute: typeof import('@/app/api/procedures/route');

  let patientsRoute: typeof import('@/app/api/patients/route');
  let partnersRoute: typeof import('@/app/api/partners/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let conditionsRoute: typeof import('@/app/api/patients/[id]/conditions/route');
  let assessmentsRoute: typeof import('@/app/api/conditions/[id]/assessments/route');

  let patientId: string;
  let patientEmail: string;
  let otherPatientId: string;
  let otherPatientEmail: string;
  let partnerId: string;
  let partnerEmail: string;
  let referredPatientId: string;
  let appointmentId: string;
  let conditionId: string;
  const INTERNAL_NOTE = 'nota interna teste';

  let patientCookieToken: string;
  let otherPatientCookieToken: string;
  let partnerCookieToken: string;

  beforeAll(async () => {
    // Relógio fixo: as datas do cenário são absolutas e o portal só agenda
    // até 60 dias à frente (#213) — sem fixar, o teste apodreceria com o tempo.
    pinClock('2027-02-15T12:00:00.000Z');
    await completeClinicRegistration(CLINIC_A_ID);
    meRoute = await import('@/app/api/portal/me/route');
    patientPortalRoute = await import('@/app/api/portal/patient/route');
    partnerPortalRoute = await import('@/app/api/portal/partner/route');
    confirmRoute = await import(
      '@/app/api/portal/patient/appointments/[id]/confirm/route'
    );
    consentRoute = await import('@/app/api/portal/patient/consent/route');
    consentRevokeRoute = await import(
      '@/app/api/portal/patient/consent/revoke/route'
    );
    photosRoute = await import('@/app/api/portal/patient/photos/route');
    photoByIdRoute = await import('@/app/api/portal/patient/photos/[id]/route');
    slotsRoute = await import('@/app/api/portal/patient/slots/route');
    portalProceduresRoute = await import(
      '@/app/api/portal/patient/procedures/route'
    );
    portalAppointmentsRoute = await import(
      '@/app/api/portal/patient/appointments/route'
    );
    followUpsRoute = await import('@/app/api/follow-ups/route');
    auditRoute = await import('@/app/api/audit/route');
    proceduresRoute = await import('@/app/api/procedures/route');

    patientsRoute = await import('@/app/api/patients/route');
    partnersRoute = await import('@/app/api/partners/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    conditionsRoute = await import('@/app/api/patients/[id]/conditions/route');
    assessmentsRoute = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );

    const { createSessionToken } = await import('@/lib/auth/session');

    // Paciente principal
    patientEmail = 'portal.paciente@example.com';
    const patientResponse = await patientsRoute.POST(
      staffRequest('/api/patients', 'POST', {
        fullName: 'Joana Portal',
        email: patientEmail,
        phone: '11977776666',
      }),
    );
    const patientBody = (await patientResponse.json()) as Envelope<{
      id: string;
    }>;
    patientId = patientBody.data.id;

    // Segundo paciente, para testar posse/negação
    otherPatientEmail = 'portal.outro@example.com';
    const otherPatientResponse = await patientsRoute.POST(
      staffRequest('/api/patients', 'POST', {
        fullName: 'Carlos Outro',
        email: otherPatientEmail,
        phone: '11955554444',
      }),
    );
    const otherPatientBody = (await otherPatientResponse.json()) as Envelope<{
      id: string;
    }>;
    otherPatientId = otherPatientBody.data.id;

    // Parceiro
    partnerEmail = 'portal.parceiro@example.com';
    const partnerResponse = await partnersRoute.POST(
      staffRequest('/api/partners', 'POST', {
        fullName: 'Dr. Parceiro Portal',
        email: partnerEmail,
        phone: '11933332222',
      }),
    );
    const partnerBody = (await partnerResponse.json()) as Envelope<{
      id: string;
    }>;
    partnerId = partnerBody.data.id;

    // Consulta futura do paciente principal
    const appointmentResponse = await appointmentsRoute.POST(
      staffRequest('/api/appointments', 'POST', {
        patientId,
        startsAt: '2027-03-01T12:00:00.000Z',
        endsAt: '2027-03-01T13:00:00.000Z',
        procedure: 'Avaliação de ferida',
        priceCents: 15000,
      }),
    );
    const appointmentBody = (await appointmentResponse.json()) as Envelope<{
      id: string;
    }>;
    appointmentId = appointmentBody.data.id;

    // Condição clínica ativa para o paciente principal (para testes de foto e allowlist do portal, #69)
    const conditionResponse = await conditionsRoute.POST(
      staffRequest(`/api/patients/${patientId}/conditions`, 'POST', {
        kind: 'wound',
        title: 'Ferida abdominal',
        notes: INTERNAL_NOTE,
      }),
      context(patientId),
    );
    const conditionBody = (await conditionResponse.json()) as Envelope<{
      id: string;
    }>;
    conditionId = conditionBody.data.id;

    // Avaliação com nota interna, para o mesmo teste de allowlist do portal (#69)
    await assessmentsRoute.POST(
      staffRequest(`/api/conditions/${conditionId}/assessments`, 'POST', {
        notes: INTERNAL_NOTE,
      }),
      context(conditionId),
    );

    // Paciente indicado pelo parceiro, com condição contendo nota interna (allowlist #69, portal do parceiro)
    const referredPatientResponse = await patientsRoute.POST(
      staffRequest('/api/patients', 'POST', {
        fullName: 'Referida Portal',
        email: 'portal.indicado@example.com',
        phone: '11922221111',
        referredByPartnerId: partnerId,
      }),
    );
    const referredPatientBody =
      (await referredPatientResponse.json()) as Envelope<{
        id: string;
      }>;
    referredPatientId = referredPatientBody.data.id;

    await conditionsRoute.POST(
      staffRequest(`/api/patients/${referredPatientId}/conditions`, 'POST', {
        kind: 'wound',
        title: 'Ferida indicada',
        notes: INTERNAL_NOTE,
      }),
      context(referredPatientId),
    );
    // Com consentimento ativo (#292): sem ele o parceiro nem recebe condições.
    const { partnerShareConsents } = await getRepositories(
      clinicScope(LEGACY_CLINIC_ID),
    );
    await partnerShareConsents.save(
      PartnerShareConsent.accept({
        patientId: referredPatientId,
        partnerId,
        consentText: PARTNER_SHARE_CONSENT_TEXT,
        textVersion: PARTNER_SHARE_CONSENT_TEXT_VERSION,
      }),
    );

    // Contas de portal vinculadas aos cadastros (#196).
    await linkPortalAccount({
      role: 'patient',
      email: patientEmail,
      recordId: patientId,
    });
    await linkPortalAccount({
      role: 'patient',
      email: otherPatientEmail,
      recordId: otherPatientId,
    });
    await linkPortalAccount({
      role: 'partner',
      email: partnerEmail,
      recordId: partnerId,
    });

    const expiresAtMs = Date.now() + 3_600_000;
    patientCookieToken = createSessionToken(
      process.env.AUTH_SECRET as string,
      expiresAtMs,
      patientEmail,
      'patient',
    );
    otherPatientCookieToken = createSessionToken(
      process.env.AUTH_SECRET as string,
      expiresAtMs,
      otherPatientEmail,
      'patient',
    );
    partnerCookieToken = createSessionToken(
      process.env.AUTH_SECRET as string,
      expiresAtMs,
      partnerEmail,
      'partner',
    );
  });

  afterAll(() => {
    unpinClock();
  });

  const cookieHeader = (token: string) => ({
    cookie: `vitta_session=${token}`,
  });

  describe('GET /api/portal/me', () => {
    it('Dado sem sessão, Quando GET me, Então retorna 401', async () => {
      const response = await meRoute.GET(jsonRequest('/api/portal/me', 'GET'));

      expect(response.status).toBe(401);
    });

    it('Dado sessão de paciente válida, Quando GET me, Então retorna subject e role', async () => {
      const response = await meRoute.GET(
        jsonRequest(
          '/api/portal/me',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        subject: string;
        role: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.subject).toBe(patientEmail);
      expect(body.data.role).toBe('patient');
    });

    it('Dado sessão de parceiro válida, Quando GET me, Então retorna role partner', async () => {
      const response = await meRoute.GET(
        jsonRequest(
          '/api/portal/me',
          'GET',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        subject: string;
        role: string;
      }>;

      expect(body.data.role).toBe('partner');
    });
  });

  describe('GET /api/portal/patient', () => {
    it('Dado sem sessão, Quando GET portal do paciente, Então retorna 401', async () => {
      const response = await patientPortalRoute.GET(
        jsonRequest('/api/portal/patient', 'GET'),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sessão de parceiro, Quando GET portal do paciente, Então retorna 403', async () => {
      const response = await patientPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient',
          'GET',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dado sessão de paciente válida, Quando GET portal do paciente, Então retorna dados do próprio paciente', async () => {
      const response = await patientPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        patient: { id: string; email: string };
        appointments: Array<{ id: string }>;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.patient.id).toBe(patientId);
      expect(body.data.patient.email).toBe(patientEmail);
      expect(body.data.appointments.some((a) => a.id === appointmentId)).toBe(
        true,
      );
    });

    it('Dado condição e avaliação com nota interna preenchida, Quando GET portal do paciente, Então resposta não contém a nota interna (#69)', async () => {
      const response = await patientPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        conditions: Array<{ condition: Record<string, unknown> }>;
      }>;

      expect(response.status).toBe(200);
      expect(JSON.stringify(body)).not.toContain(INTERNAL_NOTE);
      const conditionDto = body.data.conditions.find(
        (entry) => entry.condition.id === conditionId,
      )?.condition;
      expect(conditionDto).not.toHaveProperty('notes');
    });
  });

  describe('GET /api/portal/partner', () => {
    it('Dado sem sessão, Quando GET portal do parceiro, Então retorna 401', async () => {
      const response = await partnerPortalRoute.GET(
        jsonRequest('/api/portal/partner', 'GET'),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sessão de paciente, Quando GET portal do parceiro, Então retorna 403', async () => {
      const response = await partnerPortalRoute.GET(
        jsonRequest(
          '/api/portal/partner',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dado sessão de parceiro válida, Quando GET portal do parceiro, Então retorna dados do próprio parceiro', async () => {
      const response = await partnerPortalRoute.GET(
        jsonRequest(
          '/api/portal/partner',
          'GET',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        partner: { id: string };
      }>;

      expect(response.status).toBe(200);
      expect(body.data.partner.id).toBe(partnerId);
    });

    it('Dado paciente indicado com condição contendo nota interna, Quando GET portal do parceiro, Então resposta não contém a nota interna (#69)', async () => {
      const response = await partnerPortalRoute.GET(
        jsonRequest(
          '/api/portal/partner',
          'GET',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        referredPatients: Array<{
          patient: { id: string };
          conditions: Array<{ condition: Record<string, unknown> }>;
        }>;
      }>;

      expect(response.status).toBe(200);
      expect(JSON.stringify(body)).not.toContain(INTERNAL_NOTE);
      const referred = body.data.referredPatients.find(
        (entry) => entry.patient.id === referredPatientId,
      );
      expect(referred).toBeDefined();
      expect(referred?.conditions[0]?.condition).not.toHaveProperty('notes');
    });
  });

  describe('POST /api/portal/patient/appointments/:id/confirm', () => {
    it('Dado sem sessão, Quando POST confirm, Então retorna 401', async () => {
      const response = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentId}/confirm`,
          'POST',
        ),
        context(appointmentId),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sessão de parceiro (role errado), Quando POST confirm, Então retorna 403', async () => {
      const response = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentId}/confirm`,
          'POST',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
        context(appointmentId),
      );

      expect(response.status).toBe(403);
    });

    it('Dado consulta de outro paciente, Quando POST confirm, Então retorna 404 (sem vazar existência)', async () => {
      const response = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentId}/confirm`,
          'POST',
          undefined,
          cookieHeader(otherPatientCookieToken),
        ),
        context(appointmentId),
      );

      expect(response.status).toBe(404);
    });

    it('Dado consulta do próprio paciente, Quando POST confirm, Então confirma presença', async () => {
      const response = await confirmRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${appointmentId}/confirm`,
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
        context(appointmentId),
      );
      const body = (await response.json()) as Envelope<{ status: string }>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('confirmed');
    });
  });

  describe('GET/POST /api/portal/patient/consent', () => {
    it('Dado sem sessão, Quando GET consent, Então retorna 401', async () => {
      const response = await consentRoute.GET(
        jsonRequest('/api/portal/patient/consent', 'GET'),
      );

      expect(response.status).toBe(401);
    });

    it('Dado paciente sem aceite prévio, Quando GET consent, Então accepted é false', async () => {
      const response = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(otherPatientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{ accepted: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.accepted).toBe(false);
    });

    it('Dado aceite via POST, Quando GET consent em seguida, Então accepted é true e IP capturado', async () => {
      const postResponse = await consentRoute.POST(
        jsonRequest('/api/portal/patient/consent', 'POST', undefined, {
          ...cookieHeader(patientCookieToken),
          'x-forwarded-for': '203.0.113.5',
        }),
      );
      const postBody = (await postResponse.json()) as Envelope<{
        accepted: boolean;
      }>;

      expect(postResponse.status).toBe(200);
      expect(postBody.data.accepted).toBe(true);

      const getResponse = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const getBody = (await getResponse.json()) as Envelope<{
        accepted: boolean;
      }>;

      expect(getBody.data.accepted).toBe(true);
    });

    it('Dado aceite já registrado, Quando POST consent novamente, Então retorna o aceite existente (idempotente)', async () => {
      const response = await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{ accepted: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.accepted).toBe(true);
    });

    it('Dado paciente sem nenhum aceite, Quando GET consent, Então retorna revoked false (distinto de revogado)', async () => {
      const response = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(otherPatientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        accepted: boolean;
        revoked: boolean;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.accepted).toBe(false);
      expect(body.data.revoked).toBe(false);
    });

    it('Dado sem sessão, Quando POST revoke, Então retorna 401', async () => {
      const response = await consentRevokeRoute.POST(
        jsonRequest('/api/portal/patient/consent/revoke', 'POST'),
      );

      expect(response.status).toBe(401);
    });

    it('Dado aceite vigente, Quando revogar, Então GET consent passa a refletir revoked true e accepted false', async () => {
      const revokeResponse = await consentRevokeRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent/revoke',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const revokeBody = (await revokeResponse.json()) as Envelope<{
        accepted: boolean;
        revoked: boolean;
      }>;

      expect(revokeResponse.status).toBe(200);
      expect(revokeBody.data.accepted).toBe(false);
      expect(revokeBody.data.revoked).toBe(true);

      const getResponse = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const getBody = (await getResponse.json()) as Envelope<{
        accepted: boolean;
        revoked: boolean;
      }>;

      expect(getBody.data.accepted).toBe(false);
      expect(getBody.data.revoked).toBe(true);
    });

    it('Dado aceite vigente, Quando revogar, Então GET consent preserva data/versão do último ACEITE (não a data da revogação) e expõe revokedAt separado', async () => {
      const consentGetBefore = (await (
        await consentRoute.GET(
          jsonRequest(
            '/api/portal/patient/consent',
            'GET',
            undefined,
            cookieHeader(patientCookieToken),
          ),
        )
      ).json()) as Envelope<{ acceptedAt: string; textVersion: string }>;
      const originalAcceptedAt = consentGetBefore.data.acceptedAt;
      const originalTextVersion = consentGetBefore.data.textVersion;
      expect(originalAcceptedAt).not.toBeNull();

      const revokeResponse = await consentRevokeRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent/revoke',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const revokeBody = (await revokeResponse.json()) as Envelope<{
        revokedAt: string;
      }>;
      expect(revokeResponse.status).toBe(200);
      expect(revokeBody.data.revokedAt).not.toBeNull();

      const getResponse = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const getBody = (await getResponse.json()) as Envelope<{
        acceptedAt: string;
        textVersion: string;
        revokedAt: string;
      }>;

      // acceptedAt/textVersion continuam do último ACEITE real — a revogação
      // não "vira" um aceite com data trocada.
      expect(getBody.data.acceptedAt).toBe(originalAcceptedAt);
      expect(getBody.data.textVersion).toBe(originalTextVersion);
      // revokedAt é a data da revogação, exposta em campo próprio.
      expect(getBody.data.revokedAt).toBe(revokeBody.data.revokedAt);
    });

    it('Dado aceite vigente, Quando revogar duas vezes em sequência, Então idempotente — status final continua revogado sem erro na segunda chamada', async () => {
      const first = await consentRevokeRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent/revoke',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const second = await consentRevokeRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent/revoke',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const secondBody = (await second.json()) as Envelope<{
        accepted: boolean;
        revoked: boolean;
      }>;

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(secondBody.data.accepted).toBe(false);
      expect(secondBody.data.revoked).toBe(true);

      const getResponse = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const getBody = (await getResponse.json()) as Envelope<{
        accepted: boolean;
        revoked: boolean;
      }>;
      expect(getBody.data.accepted).toBe(false);
      expect(getBody.data.revoked).toBe(true);
    });

    it('Dado revogação recente, Quando aceitar de novo, Então GET consent volta a accepted true (revogação não é terminal)', async () => {
      const postResponse = await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const postBody = (await postResponse.json()) as Envelope<{
        accepted: boolean;
      }>;

      expect(postResponse.status).toBe(200);
      expect(postBody.data.accepted).toBe(true);

      const getResponse = await consentRoute.GET(
        jsonRequest(
          '/api/portal/patient/consent',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const getBody = (await getResponse.json()) as Envelope<{
        accepted: boolean;
        revoked: boolean;
      }>;

      expect(getBody.data.accepted).toBe(true);
      expect(getBody.data.revoked).toBe(false);
    });
  });

  describe('POST /api/portal/patient/photos e /api/portal/patient/photos/:id', () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);

    // O envio de foto exige o termo de imagem aceito (#216, ADR-030), à parte do TCLE.
    beforeAll(async () => {
      const accepted = await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent?purpose=image',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      expect(accepted.status).toBe(200);
    });

    const multipartRequest = (
      url: string,
      fields: { file?: File; conditionId?: string; note?: string },
      headers?: Record<string, string>,
    ): NextRequest => {
      const form = new FormData();
      if (fields.file) form.set('file', fields.file);
      if (fields.conditionId !== undefined)
        form.set('conditionId', fields.conditionId);
      if (fields.note !== undefined) form.set('note', fields.note);
      return new NextRequest(`http://localhost${url}`, {
        method: 'POST',
        body: form,
        headers,
      });
    };

    it('Dado sem sessão, Quando POST photos, Então retorna 401', async () => {
      const response = await photosRoute.POST(
        multipartRequest('/api/portal/patient/photos', {}),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sessão de parceiro, Quando POST photos, Então retorna 403', async () => {
      const response = await photosRoute.POST(
        multipartRequest(
          '/api/portal/patient/photos',
          {},
          cookieHeader(partnerCookieToken),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dado sem arquivo, Quando POST photos, Então retorna 400', async () => {
      const response = await photosRoute.POST(
        multipartRequest(
          '/api/portal/patient/photos',
          { conditionId },
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(400);
    });

    it('Dado condição de outro paciente, Quando POST photos, Então retorna 404', async () => {
      const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
      const response = await photosRoute.POST(
        multipartRequest(
          '/api/portal/patient/photos',
          { file, conditionId },
          cookieHeader(otherPatientCookieToken),
        ),
      );

      expect(response.status).toBe(404);
    });

    let uploadedPhotoId: string;

    it('Dado arquivo PNG válido e condição própria ativa, Quando POST photos, Então cria foto pendente de triagem', async () => {
      const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
      const response = await photosRoute.POST(
        multipartRequest(
          '/api/portal/patient/photos',
          { file, conditionId, note: 'está inflamado' },
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        triageStatus: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.triageStatus).toBe('pending');
      uploadedPhotoId = body.data.id;
    });

    it('Dado foto do próprio paciente, Quando GET photos/:id, Então retorna o binário', async () => {
      const response = await photoByIdRoute.GET(
        jsonRequest(
          `/api/portal/patient/photos/${uploadedPhotoId}`,
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
        context(uploadedPhotoId),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
    });

    it('Dado foto do próprio paciente, Quando GET photos/:id, Então responde no-store e audita a leitura (#209)', async () => {
      // Conta de paciente sempre tem empresa (ADR-007): a sessão real carrega
      // `clinicId`, e é nessa empresa que a leitura fica registrada.
      const { createSessionToken } = await import('@/lib/auth/session');
      const clinicPatientToken = createSessionToken(
        process.env.AUTH_SECRET as string,
        Date.now() + 3_600_000,
        patientEmail,
        'patient',
        LEGACY_CLINIC_ID,
      );
      const response = await photoByIdRoute.GET(
        jsonRequest(
          `/api/portal/patient/photos/${uploadedPhotoId}`,
          'GET',
          undefined,
          cookieHeader(clinicPatientToken),
        ),
        context(uploadedPhotoId),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');

      // `after()` roda fire-and-forget (mock global): espera o microtask.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const { auditEvents } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      const reads = (
        await auditEvents.findAll({
          resourceType: 'photo',
          resourceId: uploadedPhotoId,
        })
      ).filter((event) => event.action === 'read');
      expect(reads.length).toBeGreaterThan(0);
      expect(reads[0]?.actorRole).toBe('patient');
      expect(reads[0]?.patientId).toBe(patientId);
    });

    it('Dado foto de outro paciente, Quando GET photos/:id, Então retorna 404', async () => {
      const response = await photoByIdRoute.GET(
        jsonRequest(
          `/api/portal/patient/photos/${uploadedPhotoId}`,
          'GET',
          undefined,
          cookieHeader(otherPatientCookieToken),
        ),
        context(uploadedPhotoId),
      );

      expect(response.status).toBe(404);
    });

    it('Dado id inexistente, Quando GET photos/:id, Então retorna 404', async () => {
      const response = await photoByIdRoute.GET(
        jsonRequest(
          '/api/portal/patient/photos/ghost',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado consentimento revogado (mesmo com aceite antigo do mesmo texto no histórico), Quando POST photos, Então bloqueia com ConsentRequiredError', async () => {
      const revokeResponse = await consentRevokeRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent/revoke?purpose=image',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      expect(revokeResponse.status).toBe(200);

      const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
      const response = await photosRoute.POST(
        multipartRequest(
          '/api/portal/patient/photos',
          { file, conditionId, note: 'pós-revogação' },
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<null> & {
        error: string;
      };

      expect(response.status).toBe(403);
      expect(body.error).toMatch(/[Cc]onsentimento/);
    });

    it('Dado aceite vigente após novo aceite pós-revogação, Quando POST photos, Então volta a subir normalmente', async () => {
      const acceptResponse = await consentRoute.POST(
        jsonRequest(
          '/api/portal/patient/consent?purpose=image',
          'POST',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      expect(acceptResponse.status).toBe(200);

      const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
      const response = await photosRoute.POST(
        multipartRequest(
          '/api/portal/patient/photos',
          { file, conditionId, note: 'pós-reaceite' },
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        triageStatus: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.triageStatus).toBe('pending');
    });

    it('Dado a cota diária de fotos esgotada, Quando POST photos, Então 400 com mensagem clara e nada é gravado (#213)', async () => {
      const { conditionPhotos } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      const before = (await conditionPhotos.findByConditionId(conditionId))
        .length;
      const seeded: string[] = [];
      for (let i = 0; i < PATIENT_MAX_PHOTOS_PER_DAY; i++) {
        const photo = ConditionPhoto.create({
          conditionId,
          contentType: 'image/png',
          sizeBytes: 100,
          origin: 'patient',
        });
        await conditionPhotos.save(photo);
        seeded.push(photo.id);
      }

      try {
        const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
        const response = await photosRoute.POST(
          multipartRequest(
            '/api/portal/patient/photos',
            { file, conditionId },
            cookieHeader(patientCookieToken),
          ),
        );
        const body = (await response.json()) as Envelope<null> & {
          error: string;
        };

        expect(response.status).toBe(400);
        expect(body.error).toMatch(/já enviou 10 fotos nas últimas 24 horas/);
        expect(
          (await conditionPhotos.findByConditionId(conditionId)).length,
        ).toBe(before + PATIENT_MAX_PHOTOS_PER_DAY);
      } finally {
        for (const id of seeded) await conditionPhotos.delete(id);
      }
    });
  });

  describe('GET /api/portal/patient/procedures e /slots', () => {
    let procedureId: string;

    beforeAll(async () => {
      const response = await proceduresRoute.POST(
        staffRequest('/api/procedures', 'POST', {
          name: 'Curativo do portal',
          priceCents: 15000,
          durationMinutes: 60,
        }),
      );
      procedureId = ((await response.json()) as Envelope<{ id: string }>).data
        .id;
    });

    it('Dado sem sessão, Quando GET procedures do portal, Então retorna 401', async () => {
      const response = await portalProceduresRoute.GET(
        jsonRequest('/api/portal/patient/procedures', 'GET'),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sem sessão, Quando GET slots, Então retorna 401', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          `/api/portal/patient/slots?procedureId=${procedureId}&date=2027-03-15`,
          'GET',
        ),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sessão de parceiro, Quando GET procedures do portal, Então retorna 403', async () => {
      const response = await portalProceduresRoute.GET(
        jsonRequest(
          '/api/portal/patient/procedures',
          'GET',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dado sessão de parceiro, Quando GET slots, Então retorna 403', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          `/api/portal/patient/slots?procedureId=${procedureId}&date=2026-07-20`,
          'GET',
          undefined,
          cookieHeader(partnerCookieToken),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dado sessão de paciente, Quando GET procedures do portal, Então lista o catálogo ativo', async () => {
      const response = await portalProceduresRoute.GET(
        jsonRequest(
          '/api/portal/patient/procedures',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<
        Array<{
          id: string;
          name: string;
          durationMinutes: number;
          active: boolean;
        }>
      >;

      expect(response.status).toBe(200);
      const entry = body.data.find((item) => item.id === procedureId);
      expect(entry?.name).toBe('Curativo do portal');
      expect(entry?.durationMinutes).toBe(60);
      expect(body.data.every((item) => item.active)).toBe(true);
    });

    it('Dado dia útil, Quando GET slots, Então retorna horários livres do dia (PORT4-01)', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          `/api/portal/patient/slots?procedureId=${procedureId}&date=2027-03-15`,
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<
        Array<{ startsAt: string; endsAt: string }>
      >;

      expect(response.status).toBe(200);
      expect(body.data[0]).toEqual({
        startsAt: '2027-03-15T08:00:00.000Z',
        endsAt: '2027-03-15T09:00:00.000Z',
      });
      expect(body.data).toHaveLength(10);
    });

    it('Dado sábado, Quando GET slots, Então lista vazia (PORT4-02)', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          `/api/portal/patient/slots?procedureId=${procedureId}&date=2027-03-13`,
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('Dado parâmetros ausentes, Quando GET slots, Então retorna 400', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          '/api/portal/patient/slots',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(400);
    });

    it('Dado procedimento inexistente, Quando GET slots, Então retorna 404 (PORT4-03)', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          '/api/portal/patient/slots?procedureId=fantasma&date=2027-03-15',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/portal/patient/appointments', () => {
    let procedureId: string;

    beforeAll(async () => {
      const response = await proceduresRoute.POST(
        staffRequest('/api/procedures', 'POST', {
          name: 'Retorno pelo portal',
          priceCents: 18000,
          durationMinutes: 60,
        }),
      );
      procedureId = ((await response.json()) as Envelope<{ id: string }>).data
        .id;
    });

    // O teto de 2 consultas futuras (#213) vale entre testes: cada cenário
    // começa só com a consulta do beforeAll geral.
    beforeEach(async () => {
      const { appointments } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      for (const extra of await appointments.findByPatientId(patientId)) {
        if (extra.id !== appointmentId && extra.isActive) {
          await appointments.save(extra.cancel());
        }
      }
    });

    it('Dado 2 consultas futuras, Quando POST da terceira, Então 400 com mensagem clara e nada é criado (#213)', async () => {
      // A consulta do cenário (staff) já conta como a primeira.
      const book = (startsAt: string) =>
        portalAppointmentsRoute.POST(
          jsonRequest(
            '/api/portal/patient/appointments',
            'POST',
            { procedureId, startsAt },
            cookieHeader(patientCookieToken),
          ),
        );

      expect((await book('2027-04-13T12:00:00.000Z')).status).toBe(200);
      const response = await book('2027-04-14T12:00:00.000Z');
      const body = (await response.json()) as Envelope<null> & {
        error: string;
      };

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/já tem 2 consultas futuras/);
    });

    it('Dado horário além de 60 dias, Quando POST, Então 400 com mensagem clara (#213)', async () => {
      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-05-03T12:00:00.000Z' },
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<null> & {
        error: string;
      };

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/em até 60 dias/);
    });

    it('Dado dia além de 60 dias, Quando GET slots, Então 400 com mensagem clara (#213)', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          `/api/portal/patient/slots?procedureId=${procedureId}&date=2027-05-04`,
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(400);
    });

    it('Dado sem sessão, Quando POST, Então retorna 401', async () => {
      const response = await portalAppointmentsRoute.POST(
        jsonRequest('/api/portal/patient/appointments', 'POST', {
          procedureId,
          startsAt: '2027-04-05T12:00:00.000Z',
        }),
      );

      expect(response.status).toBe(401);
    });

    it('Dado sessão de parceiro, Quando POST, Então retorna 403', async () => {
      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-04-05T12:00:00.000Z' },
          cookieHeader(partnerCookieToken),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dado slot livre, Quando POST, Então cria a consulta do próprio paciente (PORT4-04)', async () => {
      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-04-05T12:00:00.000Z' },
          cookieHeader(patientCookieToken),
        ),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        procedure: string;
        startsAt: string;
        endsAt: string;
        status: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.procedure).toBe('Retorno pelo portal');
      expect(body.data.startsAt).toBe('2027-04-05T12:00:00.000Z');
      expect(body.data.endsAt).toBe('2027-04-05T13:00:00.000Z');
      expect(body.data.status).toBe('scheduled');

      // A consulta aparece no portal do próprio paciente.
      const portalResponse = await patientPortalRoute.GET(
        jsonRequest(
          '/api/portal/patient',
          'GET',
          undefined,
          cookieHeader(patientCookieToken),
        ),
      );
      const portalBody = (await portalResponse.json()) as Envelope<{
        appointments: Array<{ id: string }>;
      }>;
      expect(
        portalBody.data.appointments.some((a) => a.id === body.data.id),
      ).toBe(true);
    });

    it('Dado agendamento pelo portal, Quando POST, Então registra auditoria com o paciente como ator (PORT4-08)', async () => {
      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-04-08T12:00:00.000Z' },
          cookieHeader(patientCookieToken),
        ),
      );
      const created = (await response.json()) as Envelope<{ id: string }>;

      // `after()` roda fire-and-forget: espera o evento aparecer em vez de
      // apostar num sleep fixo (que ora atrasa a suíte, ora falha em máquina lenta).
      type AuditEventDto = {
        action: string;
        resourceType: string;
        resourceId: string;
        actorRole: string;
        actorId: string;
        detail: string | null;
      };
      const findAuditEvent = async (): Promise<AuditEventDto | undefined> => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const auditResponse = await auditRoute.GET(
            staffRequest(`/api/audit?patientId=${patientId}`, 'GET'),
          );
          const auditBody = (await auditResponse.json()) as Envelope<
            AuditEventDto[]
          >;
          const match = auditBody.data.find(
            (item) => item.resourceId === created.data.id,
          );
          if (match) {
            return match;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return undefined;
      };
      const event = await findAuditEvent();

      expect(event).toBeDefined();
      expect(event?.action).toBe('create');
      expect(event?.resourceType).toBe('appointment');
      expect(event?.actorRole).toBe('patient');
      expect(event?.actorId).toBe(patientEmail);
      expect(event?.detail).toBe('agendado pelo portal do paciente');
    });

    it('Dado horário já ocupado, Quando POST, Então retorna 409 (PORT4-05)', async () => {
      // Cria o próprio bloqueio (de outro paciente, para não esbarrar no teto
      // de consultas futuras, #213): depender da consulta de outro teste
      // quebraria com reordenação, `.only` ou isolamento por teste.
      const blocking = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-04-12T12:00:00.000Z' },
          cookieHeader(otherPatientCookieToken),
        ),
      );
      expect(blocking.status).toBe(200);

      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-04-12T12:30:00.000Z' },
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(409);
    });

    it('Dado followUpId próprio, Quando POST, Então o retorno sai da pendência (PORT4-06)', async () => {
      const followUpResponse = await followUpsRoute.POST(
        staffRequest('/api/follow-ups', 'POST', {
          patientId,
          dueDate: '2027-03-01T10:00:00.000Z',
          reason: 'Revisão pelo portal',
        }),
      );
      const followUpId = (
        (await followUpResponse.json()) as Envelope<{ id: string }>
      ).data.id;

      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '2027-04-06T12:00:00.000Z', followUpId },
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(200);
      const listResponse = await followUpsRoute.GET(
        staffRequest('/api/follow-ups?status=scheduled', 'GET'),
      );
      const listBody = (await listResponse.json()) as Envelope<
        Array<{ id: string }>
      >;
      expect(listBody.data.some((item) => item.id === followUpId)).toBe(true);
    });

    it('Dado followUpId de outro paciente, Quando POST, Então retorna 404 (PORT4-07)', async () => {
      const followUpResponse = await followUpsRoute.POST(
        staffRequest('/api/follow-ups', 'POST', {
          patientId: otherPatientId,
          dueDate: '2027-03-01T10:00:00.000Z',
          reason: 'Retorno de outro paciente',
        }),
      );
      const alheioId = (
        (await followUpResponse.json()) as Envelope<{ id: string }>
      ).data.id;

      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          {
            procedureId,
            startsAt: '2027-04-07T12:00:00.000Z',
            followUpId: alheioId,
          },
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(404);
    });

    it('Dado corpo inválido, Quando POST, Então retorna 400', async () => {
      const response = await portalAppointmentsRoute.POST(
        jsonRequest(
          '/api/portal/patient/appointments',
          'POST',
          { procedureId, startsAt: '05/04/2027' },
          cookieHeader(patientCookieToken),
        ),
      );

      expect(response.status).toBe(400);
    });
  });
});
