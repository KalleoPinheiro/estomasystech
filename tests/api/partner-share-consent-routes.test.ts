import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { linkPortalAccount } from '../support/portal-account';
import { jsonRequest as staffRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface ConsentDto {
  partnerName: string;
  consentText: string;
  textVersion: string;
  active: boolean;
  revoked: boolean;
  acceptedAt: string | null;
  acceptedVersion: string | null;
  revokedAt: string | null;
  revokedBy: 'patient' | 'staff' | null;
}

interface PartnerPortalDto {
  referredPatients: Array<{
    patient: { id: string };
    sharing: boolean;
    attended: boolean;
    appointments: unknown[];
    conditions: Array<{ assessments: unknown[] }>;
  }>;
}

/** Requisição de portal: sem a sessão de equipe do builder compartilhado. */
const portalRequest = (
  url: string,
  method: string,
  headers: Record<string, string> = {},
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const context = (id: string) => ({ params: Promise.resolve({ id }) });

const json = async <T>(response: Response) =>
  ((await response.json()) as Envelope<T>).data;

describe('Feature: Consentimento do paciente para o parceiro (#292)', () => {
  let portalConsentRoute: typeof import('@/app/api/portal/patient/partner-consent/route');
  let portalRevokeRoute: typeof import('@/app/api/portal/patient/partner-consent/revoke/route');
  let staffConsentRoute: typeof import('@/app/api/patients/[id]/partner-consent/route');
  let staffRevokeRoute: typeof import('@/app/api/patients/[id]/partner-consent/revoke/route');
  let partnerPortalRoute: typeof import('@/app/api/portal/partner/route');

  let partnerId: string;
  let referredId: string;
  let loneId: string;
  const referredEmail = 'consent292.indicado@example.com';
  const loneEmail = 'consent292.sozinho@example.com';
  const partnerEmail = 'consent292.parceiro@example.com';

  const asPatient = (email: string) => cookieHeaderFor('patient', email);
  const asPartner = () => cookieHeaderFor('partner', partnerEmail);

  const createPatient = async (
    email: string,
    referredByPartnerId?: string,
  ): Promise<string> => {
    const { POST } = await import('@/app/api/patients/route');
    const response = await POST(
      staffRequest('/api/patients', 'POST', {
        fullName: `Paciente ${email}`,
        email,
        phone: '11922221111',
        referredByPartnerId,
      }),
    );
    return (await json<{ id: string }>(response)).id;
  };

  const partnerView = async () => {
    const response = await partnerPortalRoute.GET(
      portalRequest('/api/portal/partner', 'GET', asPartner()),
    );
    expect(response.status).toBe(200);
    const data = await json<PartnerPortalDto>(response);
    const entry = data.referredPatients.find(
      (e) => e.patient.id === referredId,
    );
    if (!entry) throw new Error('paciente indicado ausente do portal');
    return entry;
  };

  const portalStatus = async () =>
    json<ConsentDto | null>(
      await portalConsentRoute.GET(
        portalRequest(
          '/api/portal/patient/partner-consent',
          'GET',
          asPatient(referredEmail),
        ),
      ),
    );

  beforeAll(async () => {
    portalConsentRoute = await import(
      '@/app/api/portal/patient/partner-consent/route'
    );
    portalRevokeRoute = await import(
      '@/app/api/portal/patient/partner-consent/revoke/route'
    );
    staffConsentRoute = await import(
      '@/app/api/patients/[id]/partner-consent/route'
    );
    staffRevokeRoute = await import(
      '@/app/api/patients/[id]/partner-consent/revoke/route'
    );
    partnerPortalRoute = await import('@/app/api/portal/partner/route');

    const partners = await import('@/app/api/partners/route');
    partnerId = (
      await json<{ id: string }>(
        await partners.POST(
          staffRequest('/api/partners', 'POST', {
            fullName: 'Dra. Parceira 292',
            email: partnerEmail,
            phone: '11933332222',
          }),
        ),
      )
    ).id;
    referredId = await createPatient(referredEmail, partnerId);
    loneId = await createPatient(loneEmail);

    const conditions = await import('@/app/api/patients/[id]/conditions/route');
    const condition = await json<{ id: string }>(
      await conditions.POST(
        staffRequest(`/api/patients/${referredId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida 292',
        }),
        context(referredId),
      ),
    );
    const assessments = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );
    await assessments.POST(
      staffRequest(`/api/conditions/${condition.id}/assessments`, 'POST', {
        lengthMm: 10,
      }),
      context(condition.id),
    );

    await linkPortalAccount({
      role: 'patient',
      email: referredEmail,
      recordId: referredId,
    });
    await linkPortalAccount({
      role: 'patient',
      email: loneEmail,
      recordId: loneId,
    });
    await linkPortalAccount({
      role: 'partner',
      email: partnerEmail,
      recordId: partnerId,
    });
  });

  describe('Cenário: guarda das rotas do portal', () => {
    it('Dado sem sessão, Quando GET, Então 401', async () => {
      const response = await portalConsentRoute.GET(
        portalRequest('/api/portal/patient/partner-consent', 'GET'),
      );
      expect(response.status).toBe(401);
    });

    it('Dado sessão de parceiro, Quando POST aceite, Então 403', async () => {
      const response = await portalConsentRoute.POST(
        portalRequest(
          '/api/portal/patient/partner-consent',
          'POST',
          asPartner(),
        ),
      );
      expect(response.status).toBe(403);
    });
  });

  describe('Cenário: paciente sem parceiro indicador', () => {
    it('Dado paciente não indicado, Quando GET, Então null (nada a consentir)', async () => {
      const response = await portalConsentRoute.GET(
        portalRequest(
          '/api/portal/patient/partner-consent',
          'GET',
          asPatient(loneEmail),
        ),
      );
      expect(response.status).toBe(200);
      expect(await json(response)).toBeNull();
    });

    it('Dado paciente não indicado, Quando POST aceite, Então 404', async () => {
      const response = await portalConsentRoute.POST(
        portalRequest(
          '/api/portal/patient/partner-consent',
          'POST',
          asPatient(loneEmail),
        ),
      );
      expect(response.status).toBe(404);
    });
  });

  describe('Cenário: ciclo aceite → revogação pelo paciente → revogação pela equipe', () => {
    it('Dado sem consentimento, Quando o parceiro abre o portal, Então vê só o status, sem consultas nem condições', async () => {
      const status = await portalStatus();
      expect(status).toMatchObject({
        partnerName: 'Dra. Parceira 292',
        active: false,
        revoked: false,
        acceptedAt: null,
      });
      expect(status?.consentText).toContain('Texto provisório');

      const entry = await partnerView();
      expect(entry).toMatchObject({
        sharing: false,
        attended: false,
        appointments: [],
        conditions: [],
      });
    });

    it('Dado aceite pelo portal, Quando o parceiro abre o portal, Então vê condição e avaliação', async () => {
      const first = await portalConsentRoute.POST(
        portalRequest('/api/portal/patient/partner-consent', 'POST', {
          ...asPatient(referredEmail),
          'x-forwarded-for': '203.0.113.9',
        }),
      );
      expect(first.status).toBe(200);
      // Idempotente: segundo aceite devolve o mesmo, sem gravar outro.
      const firstBody = await json<{ acceptedAt: string }>(first);
      const second = await json<{ acceptedAt: string }>(
        await portalConsentRoute.POST(
          portalRequest(
            '/api/portal/patient/partner-consent',
            'POST',
            asPatient(referredEmail),
          ),
        ),
      );
      expect(second.acceptedAt).toBe(firstBody.acceptedAt);
      const { partnerShareConsents } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      const records = await partnerShareConsents.findByPatientId(referredId);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        partnerId,
        kind: 'accept',
        actor: 'patient',
        textVersion: 'v0-placeholder',
      });

      expect(await portalStatus()).toMatchObject({
        active: true,
        acceptedVersion: 'v0-placeholder',
      });
      const entry = await partnerView();
      expect(entry.sharing).toBe(true);
      expect(entry.conditions).toHaveLength(1);
      expect(entry.conditions[0].assessments).toHaveLength(1);
    });

    it('Dado revogação pelo paciente, Quando o parceiro abre o portal, Então deixa de ver a evolução', async () => {
      const response = await portalRevokeRoute.POST(
        portalRequest(
          '/api/portal/patient/partner-consent/revoke',
          'POST',
          asPatient(referredEmail),
        ),
      );
      expect(response.status).toBe(200);

      expect(await portalStatus()).toMatchObject({
        active: false,
        revoked: true,
        revokedBy: 'patient',
      });
      const entry = await partnerView();
      expect(entry).toMatchObject({ sharing: false, conditions: [] });
    });

    it('Dado novo aceite e revogação pela equipe na ficha, Então a ficha mostra revogado pela equipe e o parceiro perde o acesso', async () => {
      await portalConsentRoute.POST(
        portalRequest(
          '/api/portal/patient/partner-consent',
          'POST',
          asPatient(referredEmail),
        ),
      );
      expect((await partnerView()).sharing).toBe(true);

      const staffStatus = await json<ConsentDto>(
        await staffConsentRoute.GET(
          staffRequest(`/api/patients/${referredId}/partner-consent`, 'GET'),
          context(referredId),
        ),
      );
      expect(staffStatus.active).toBe(true);

      const revoke = await staffRevokeRoute.POST(
        staffRequest(
          `/api/patients/${referredId}/partner-consent/revoke`,
          'POST',
        ),
        context(referredId),
      );
      expect(revoke.status).toBe(200);

      const after = await json<ConsentDto>(
        await staffConsentRoute.GET(
          staffRequest(`/api/patients/${referredId}/partner-consent`, 'GET'),
          context(referredId),
        ),
      );
      expect(after).toMatchObject({
        active: false,
        revoked: true,
        revokedBy: 'staff',
      });
      expect((await partnerView()).sharing).toBe(false);

      const { auditEvents } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      const events = await auditEvents.findAll({
        resourceType: 'partner-consent',
      });
      expect(events.map((e) => e.detail)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('revogação pela equipe'),
          expect.stringContaining('revogação pelo paciente'),
        ]),
      );
    });
  });

  describe('Cenário: rotas da ficha', () => {
    it('Dado paciente sem indicação, Quando GET na ficha, Então null', async () => {
      const response = await staffConsentRoute.GET(
        staffRequest(`/api/patients/${loneId}/partner-consent`, 'GET'),
        context(loneId),
      );
      expect(response.status).toBe(200);
      expect(await json(response)).toBeNull();
    });

    it('Dado paciente inexistente, Quando GET na ficha, Então 404', async () => {
      const response = await staffConsentRoute.GET(
        staffRequest('/api/patients/nao-existe/partner-consent', 'GET'),
        context('nao-existe'),
      );
      expect(response.status).toBe(404);
    });

    it('Dado paciente sem indicação, Quando a equipe revoga, Então 404', async () => {
      const response = await staffRevokeRoute.POST(
        staffRequest(`/api/patients/${loneId}/partner-consent/revoke`, 'POST'),
        context(loneId),
      );
      expect(response.status).toBe(404);
    });

    it('Dado Atendente, Quando revogar na ficha, Então 403 (rota clínica)', async () => {
      const response = await staffRevokeRoute.POST(
        staffRequest(
          `/api/patients/${referredId}/partner-consent/revoke`,
          'POST',
          undefined,
          cookieHeaderFor('atendente'),
        ),
        context(referredId),
      );
      expect(response.status).toBe(403);
    });
  });
});
