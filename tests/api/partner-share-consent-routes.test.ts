import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_B_ID, ensureTestClinics } from '../support/clinics';
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
  acceptedSource: 'portal' | 'paper' | null;
  acceptedBy: string | null;
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
  let staffPaperRoute: typeof import('@/app/api/patients/[id]/partner-consent/paper/route');
  let partnerPortalRoute: typeof import('@/app/api/portal/partner/route');

  let partnerId: string;
  let referredId: string;
  let loneId: string;
  let paperId: string;
  const referredEmail = 'consent292.indicado@example.com';
  const paperEmail = 'consent310.papel@example.com';
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

  const partnerView = async (patientId: string = referredId) => {
    const response = await partnerPortalRoute.GET(
      portalRequest('/api/portal/partner', 'GET', asPartner()),
    );
    expect(response.status).toBe(200);
    const data = await json<PartnerPortalDto>(response);
    const entry = data.referredPatients.find((e) => e.patient.id === patientId);
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
    staffPaperRoute = await import(
      '@/app/api/patients/[id]/partner-consent/paper/route'
    );
    partnerPortalRoute = await import('@/app/api/portal/partner/route');
    await ensureTestClinics();

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
    paperId = await createPatient(paperEmail, partnerId);

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

    it('Dado Atendente, Quando ler o status na ficha, Então 200 (recepção, #310)', async () => {
      const response = await staffConsentRoute.GET(
        staffRequest(
          `/api/patients/${referredId}/partner-consent`,
          'GET',
          undefined,
          cookieHeaderFor('atendente'),
        ),
        context(referredId),
      );
      expect(response.status).toBe(200);
    });
  });
  describe('Cenário: consentimento dado em papel (#310)', () => {
    const paperRequest = (id: string, headers?: Record<string, string>) =>
      staffRequest(
        `/api/patients/${id}/partner-consent/paper`,
        'POST',
        undefined,
        headers,
      );

    const staffStatus = async (id: string) =>
      json<ConsentDto>(
        await staffConsentRoute.GET(
          staffRequest(`/api/patients/${id}/partner-consent`, 'GET'),
          context(id),
        ),
      );

    it('Dado Profissional, Quando registrar em papel, Então 403 e nada é gravado', async () => {
      const response = await staffPaperRoute.POST(
        paperRequest(paperId, cookieHeaderFor('profissional')),
        context(paperId),
      );
      expect(response.status).toBe(403);
      expect((await staffStatus(paperId)).active).toBe(false);
      expect((await partnerView(paperId)).sharing).toBe(false);
    });

    it('Dado sem sessão, Quando registrar em papel, Então 401', async () => {
      const response = await staffPaperRoute.POST(
        portalRequest(`/api/patients/${paperId}/partner-consent/paper`, 'POST'),
        context(paperId),
      );
      expect(response.status).toBe(401);
    });

    it('Dado paciente sem indicação, Quando registrar em papel, Então 404', async () => {
      const response = await staffPaperRoute.POST(
        paperRequest(loneId),
        context(loneId),
      );
      expect(response.status).toBe(404);
    });

    it('Dado outra empresa, Quando registrar em papel, Então 404 (isolamento por empresa)', async () => {
      const response = await staffPaperRoute.POST(
        paperRequest(
          paperId,
          cookieHeaderFor('company_admin', 'admin@b.com', CLINIC_B_ID),
        ),
        context(paperId),
      );
      expect(response.status).toBe(404);
      expect((await staffStatus(paperId)).active).toBe(false);
    });

    it('Dado Atendente, Quando registrar em papel, Então libera o parceiro, mostra a origem e audita', async () => {
      const response = await staffPaperRoute.POST(
        paperRequest(
          paperId,
          cookieHeaderFor('atendente', 'recepcao.310@clinica.com'),
        ),
        context(paperId),
      );
      expect(response.status).toBe(200);
      expect(await json<ConsentDto>(response)).toMatchObject({
        active: true,
        acceptedSource: 'paper',
        acceptedBy: 'recepcao.310@clinica.com',
      });

      const entry = await partnerView(paperId);
      expect(entry).toMatchObject({ sharing: true });
      expect(entry.conditions).toEqual([]);

      const { auditEvents } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      const events = await auditEvents.findAll({
        resourceType: 'partner-consent',
      });
      const paperEvents = events.filter((e) => e.detail?.includes('em papel'));
      expect(paperEvents).toHaveLength(1);
      expect(paperEvents[0]).toMatchObject({
        actorId: 'recepcao.310@clinica.com',
        actorRole: 'atendente',
        action: 'create',
        patientId: paperId,
      });
    });

    it('Dado consentimento em papel ativo, Quando registrar de novo, Então idempotente (sem novo evento)', async () => {
      const response = await staffPaperRoute.POST(
        paperRequest(paperId),
        context(paperId),
      );
      expect(response.status).toBe(200);
      expect((await json<ConsentDto>(response)).acceptedBy).toBe(
        'recepcao.310@clinica.com',
      );
      const { auditEvents } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      const events = await auditEvents.findAll({
        resourceType: 'partner-consent',
      });
      expect(events.filter((e) => e.detail?.includes('em papel'))).toHaveLength(
        1,
      );
    });

    it('Dado o portal do paciente, Quando ler o status, Então vê a origem papel sem o nome de quem lançou', async () => {
      await linkPortalAccount({
        role: 'patient',
        email: paperEmail,
        recordId: paperId,
      });
      const status = await json<ConsentDto>(
        await portalConsentRoute.GET(
          portalRequest(
            '/api/portal/patient/partner-consent',
            'GET',
            asPatient(paperEmail),
          ),
        ),
      );
      expect(status).toMatchObject({
        active: true,
        acceptedSource: 'paper',
        acceptedBy: null,
      });
    });

    it('Dado Atendente, Quando revogar na ficha, Então revoga (pedido no balcão) e o parceiro perde o acesso', async () => {
      const response = await staffRevokeRoute.POST(
        staffRequest(
          `/api/patients/${paperId}/partner-consent/revoke`,
          'POST',
          undefined,
          cookieHeaderFor('atendente', 'recepcao.310@clinica.com'),
        ),
        context(paperId),
      );
      expect(response.status).toBe(200);
      expect(await staffStatus(paperId)).toMatchObject({
        active: false,
        revoked: true,
        revokedBy: 'staff',
      });
      expect((await partnerView(paperId)).sharing).toBe(false);
    });
  });
});
