import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NullEmailGateway } from '@/application/ports/email-gateway';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { type EmailSpy, spyOnSentEmails } from '../support/email';
import { linkPortalAccount, seedPortalRecord } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface RequestDto {
  id: string;
  patientId: string;
  patientName?: string;
  kind: string;
  details: string | null;
  status: string;
  resolution: string | null;
  notified?: boolean;
}

interface Titular {
  patientId: string;
  email: string;
  loginEmail: string;
  clinicId: string;
  cookie: Record<string, string>;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedTitular(clinicId: string, tag: string): Promise<Titular> {
  const patientId = await seedPortalRecord('patient', clinicId);
  const { patients } = await getRepositories(clinicScope(clinicId));
  const patient = await patients.findById(patientId);
  const loginEmail = `titular-${tag}-${Date.now()}@x.com`;
  await linkPortalAccount({
    role: 'patient',
    email: loginEmail,
    recordId: patientId,
    clinicId,
  });
  return {
    patientId,
    email: patient?.email ?? '',
    loginEmail,
    clinicId,
    cookie: cookieHeaderFor('patient', loginEmail, clinicId),
  };
}

async function auditOf(clinicId: string, patientId: string) {
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  return auditEvents.findAll({ patientId }, { limit: 100 });
}

describe('Feature: Direitos do titular no portal (#293)', () => {
  let exportRoute: typeof import('@/app/api/portal/patient/export/route');
  let requestsRoute: typeof import('@/app/api/portal/patient/data-requests/route');
  let queueRoute: typeof import('@/app/api/data-requests/route');
  let resolveRoute: typeof import('@/app/api/data-requests/[id]/route');
  let titularA: Titular;
  let titularA2: Titular;
  let titularB: Titular;
  let spy: EmailSpy | null = null;

  const open = async (titular: Titular, body: unknown) =>
    requestsRoute.POST(
      jsonRequest(
        '/api/portal/patient/data-requests',
        'POST',
        body,
        titular.cookie,
      ),
    );

  const resolve = async (
    id: string,
    body: unknown,
    headers = adminCookieHeader(CLINIC_A_ID),
  ) =>
    resolveRoute.PATCH(
      jsonRequest(`/api/data-requests/${id}`, 'PATCH', body, headers),
      context(id),
    );

  const queue = async (
    status: string,
    headers = adminCookieHeader(CLINIC_A_ID),
  ) =>
    queueRoute.GET(
      jsonRequest(
        `/api/data-requests?status=${status}`,
        'GET',
        undefined,
        headers,
      ),
    );

  beforeAll(async () => {
    await ensureTestClinics();
    exportRoute = await import('@/app/api/portal/patient/export/route');
    requestsRoute = await import(
      '@/app/api/portal/patient/data-requests/route'
    );
    queueRoute = await import('@/app/api/data-requests/route');
    resolveRoute = await import('@/app/api/data-requests/[id]/route');
    titularA = await seedTitular(CLINIC_A_ID, 'a');
    titularA2 = await seedTitular(CLINIC_A_ID, 'a2');
    titularB = await seedTitular(CLINIC_B_ID, 'b');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    spy?.restore();
    spy = null;
  });

  describe('Cópia dos próprios dados', () => {
    it('Dado paciente logado, Quando baixa a cópia, Então recebe só os próprios dados, como anexo e sem cache', async () => {
      const response = await exportRoute.GET(
        jsonRequest(
          '/api/portal/patient/export',
          'GET',
          undefined,
          titularA.cookie,
        ),
      );
      const body = (await response.json()) as Envelope<{
        patient: { id: string };
        evolutions: unknown[];
        invoices: unknown[];
        consents: unknown[];
      }>;

      expect(response.status).toBe(200);
      expect(body.data.patient.id).toBe(titularA.patientId);
      expect(body.data.evolutions).toEqual([]);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Disposition')).toContain(
        'meus-dados.json',
      );
    });

    it('Dado paciente que baixou a cópia, Então a trilha registra read/export com o titular', async () => {
      await exportRoute.GET(
        jsonRequest(
          '/api/portal/patient/export',
          'GET',
          undefined,
          titularA2.cookie,
        ),
      );
      const events = await auditOf(CLINIC_A_ID, titularA2.patientId);

      expect(
        events.some(
          (event) =>
            event.action === 'read' &&
            event.resourceType === 'export' &&
            event.actorRole === 'patient' &&
            event.resourceId === titularA2.patientId,
        ),
      ).toBe(true);
    });

    it('Dada sessão sem conta vinculada, Quando baixa a cópia, Então 404 sem anexo', async () => {
      const response = await exportRoute.GET(
        jsonRequest(
          '/api/portal/patient/export',
          'GET',
          undefined,
          cookieHeaderFor('patient', 'sem-conta@x.com', CLINIC_A_ID),
        ),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Disposition')).toBeNull();
    });

    it('Dada sessão de equipe, Quando chama a rota do portal, Então 403', async () => {
      const response = await exportRoute.GET(
        jsonRequest('/api/portal/patient/export', 'GET'),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Aviso ao Admin de pedido novo (#312)', () => {
    const adminEmail = 'admin-aviso@clinica-a.com';

    beforeAll(async () => {
      const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
      await userAccounts.save(
        UserAccount.create({
          email: adminEmail,
          passwordHash: UNSET_PASSWORD_HASH,
          role: 'company_admin',
          clinicId: CLINIC_A_ID,
        }),
      );
    });

    it('Quando o paciente abre um pedido, Então o Admin é avisado com o link da fila e sem o texto do pedido', async () => {
      vi.stubEnv('APP_URL', 'https://clinica.exemplo.com.br');
      spy = spyOnSentEmails();
      const titular = await seedTitular(CLINIC_A_ID, 'aviso');

      const response = await open(titular, {
        kind: 'correction',
        details: 'Segredo clínico do pedido',
      });

      expect(response.status).toBe(200);
      const toAdmin = spy.bodies.filter((body) =>
        body.startsWith(`${adminEmail} —`),
      );
      expect(toAdmin).toHaveLength(1);
      expect(toAdmin[0]).toContain('Há um pedido novo de titular de dados');
      expect(toAdmin[0]).toContain(
        'https://clinica.exemplo.com.br/pedidos-titular',
      );
      expect(toAdmin[0]).not.toContain('Segredo clínico');
      expect(toAdmin[0]).not.toContain(titular.email);
      expect(toAdmin[0]).not.toContain(titular.loginEmail);
    });

    it('Dada falha no envio, Quando o paciente abre um pedido, Então o pedido é criado mesmo assim', async () => {
      const send = vi
        .spyOn(NullEmailGateway.prototype, 'send')
        .mockRejectedValue(new Error('provedor fora'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const titular = await seedTitular(CLINIC_A_ID, 'aviso-falha');
      try {
        const response = await open(titular, { kind: 'erasure' });
        const created = ((await response.json()) as Envelope<RequestDto>).data;
        const { dataSubjectRequests } = await getRepositories(
          clinicScope(CLINIC_A_ID),
        );

        expect(response.status).toBe(200);
        expect(send).toHaveBeenCalled();
        expect(await dataSubjectRequests.findById(created.id)).not.toBeNull();
      } finally {
        send.mockRestore();
        vi.restoreAllMocks();
      }
    });

    it('Quando o Admin lista a fila, Então cada pedido pendente traz o prazo de 15 dias', async () => {
      const listed = (
        (await (await queue('pending')).json()) as Envelope<
          (RequestDto & { deadlineDate: string; daysLeft: number | null })[]
        >
      ).data;

      expect(listed.length).toBeGreaterThan(0);
      for (const item of listed) {
        expect(item.deadlineDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(item.daysLeft).toBe(15);
      }
    });
  });

  describe('Pedidos de correção e eliminação', () => {
    it('Quando o paciente pede correção sem dizer o quê, Então 400', async () => {
      const response = await open(titularA, { kind: 'correction' });

      expect(response.status).toBe(400);
    });

    it('Quando o paciente pede correção, Então o pedido fica pendente, auditado, e um segundo igual é 409', async () => {
      const first = await open(titularA, {
        kind: 'correction',
        details: 'Meu telefone mudou para 11 98888-7777',
      });
      const created = ((await first.json()) as Envelope<RequestDto>).data;
      const second = await open(titularA, {
        kind: 'correction',
        details: 'De novo',
      });
      const events = await auditOf(CLINIC_A_ID, titularA.patientId);

      expect(first.status).toBe(200);
      expect(created).toMatchObject({
        patientId: titularA.patientId,
        kind: 'correction',
        status: 'pending',
        resolution: null,
      });
      expect(second.status).toBe(409);
      expect(
        events.some(
          (event) =>
            event.action === 'create' &&
            event.resourceType === 'data_request' &&
            event.resourceId === created.id,
        ),
      ).toBe(true);
    });

    it('Dado pedido de outro titular da mesma clínica, Então ele não aparece na lista do paciente', async () => {
      await open(titularA2, { kind: 'erasure' });
      const response = await requestsRoute.GET(
        jsonRequest(
          '/api/portal/patient/data-requests',
          'GET',
          undefined,
          titularA.cookie,
        ),
      );
      const list = ((await response.json()) as Envelope<RequestDto[]>).data;

      expect(list.length).toBeGreaterThan(0);
      expect(list.every((item) => item.patientId === titularA.patientId)).toBe(
        true,
      );
    });

    it('Dado pedido na clínica B, Então a fila da clínica A não o mostra e o Admin de A recebe 404 ao decidir', async () => {
      const createdB = (
        (await (
          await open(titularB, { kind: 'erasure', details: 'Quero sair' })
        ).json()) as Envelope<RequestDto>
      ).data;
      const listA = (
        (await (await queue('pending')).json()) as Envelope<RequestDto[]>
      ).data;
      const response = await resolve(createdB.id, {
        decision: 'accept',
        justification: 'Tentativa de outra empresa',
      });
      const listB = (
        (await (
          await queue('pending', adminCookieHeader(CLINIC_B_ID))
        ).json()) as Envelope<RequestDto[]>
      ).data;

      expect(listA.some((item) => item.id === createdB.id)).toBe(false);
      expect(response.status).toBe(404);
      expect(listB.map((item) => item.id)).toContain(createdB.id);
    });

    it.each(['profissional', 'atendente'] as const)(
      'Dada sessão de %s, Quando abre a fila ou decide, Então 403',
      async (role) => {
        const headers = cookieHeaderFor(role, 'equipe@x.com', CLINIC_A_ID);

        expect((await queue('pending', headers)).status).toBe(403);
        expect(
          (
            await resolve(
              'qualquer',
              { decision: 'accept', justification: 'x' },
              headers,
            )
          ).status,
        ).toBe(403);
      },
    );

    it('Quando o Admin decide sem justificativa, Então 400 e o pedido segue pendente', async () => {
      const pending = (
        (await (await queue('pending')).json()) as Envelope<RequestDto[]>
      ).data.find((item) => item.patientId === titularA.patientId);
      const response = await resolve(pending?.id ?? '', {
        decision: 'reject',
        justification: '   ',
      });

      expect(response.status).toBe(400);
    });

    it('Quando o Admin aceita, Então o paciente é avisado no e-mail de login do portal, vê a resposta no portal e a decisão é auditada', async () => {
      spy = spyOnSentEmails();
      const pending = (
        (await (await queue('pending')).json()) as Envelope<RequestDto[]>
      ).data.find((item) => item.patientId === titularA.patientId);
      expect(pending?.patientName).toMatch(/Cadastro Portal/);

      const response = await resolve(pending?.id ?? '', {
        decision: 'accept',
        justification: 'Telefone atualizado na ficha',
      });
      const resolved = ((await response.json()) as Envelope<RequestDto>).data;
      const again = await resolve(pending?.id ?? '', {
        decision: 'reject',
        justification: 'Mudei de ideia',
      });
      const portal = (
        (await (
          await requestsRoute.GET(
            jsonRequest(
              '/api/portal/patient/data-requests',
              'GET',
              undefined,
              titularA.cookie,
            ),
          )
        ).json()) as Envelope<RequestDto[]>
      ).data;
      const accepted = (
        (await (await queue('accepted')).json()) as Envelope<RequestDto[]>
      ).data;
      const events = await auditOf(CLINIC_A_ID, titularA.patientId);

      expect(response.status).toBe(200);
      expect(resolved).toMatchObject({
        status: 'accepted',
        resolution: 'Telefone atualizado na ficha',
        notified: false,
      });
      expect(spy.bodies).toHaveLength(1);
      // Cadastro e login diferentes: o aviso vai para a conta do portal (#312).
      expect(titularA.loginEmail).not.toBe(titularA.email.toLowerCase());
      expect(spy.bodies[0]).toContain(`${titularA.loginEmail} —`);
      expect(spy.bodies[0]).not.toContain(titularA.email);
      expect(spy.bodies[0]).not.toContain('Telefone atualizado');
      expect(again.status).toBe(409);
      expect(portal.find((item) => item.id === resolved.id)).toMatchObject({
        status: 'accepted',
        resolution: 'Telefone atualizado na ficha',
      });
      expect(accepted.map((item) => item.id)).toContain(resolved.id);
      expect(
        events.some(
          (event) =>
            event.action === 'update' &&
            event.resourceType === 'data_request' &&
            event.detail === 'correction: accepted',
        ),
      ).toBe(true);
    });

    it('Dada falha na auditoria, Quando o paciente abre ou o Admin decide, Então nada é gravado nem enviado (write-ahead)', async () => {
      const titular = await seedTitular(CLINIC_A_ID, 'audit');
      const opened = (
        (await (
          await open(titular, { kind: 'erasure' })
        ).json()) as Envelope<RequestDto>
      ).data;
      spy = spyOnSentEmails();
      const auditSave = vi
        .spyOn(DrizzleAuditEventRepository.prototype, 'save')
        .mockRejectedValue(new Error('auditoria fora'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const correction = await open(titular, {
          kind: 'correction',
          details: 'Sem trilha',
        });
        const decision = await resolve(opened.id, {
          decision: 'accept',
          justification: 'Sem trilha',
        });

        expect(correction.status).toBe(500);
        expect(decision.status).toBe(500);
      } finally {
        auditSave.mockRestore();
      }
      const { dataSubjectRequests } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      const stored = await dataSubjectRequests.findByPatient(titular.patientId);

      expect(stored.map((item) => [item.kind, item.status])).toEqual([
        ['erasure', 'pending'],
      ]);
      expect(spy.bodies).toHaveLength(0);
    });

    it('Quando o Admin recusa, Então o pedido sai da fila como recusado', async () => {
      const pending = (
        (await (await queue('pending')).json()) as Envelope<RequestDto[]>
      ).data.find((item) => item.patientId === titularA2.patientId);
      const response = await resolve(pending?.id ?? '', {
        decision: 'reject',
        justification: 'Prontuário sob guarda legal de 20 anos',
      });
      const rejected = (
        (await (await queue('rejected')).json()) as Envelope<RequestDto[]>
      ).data;

      expect(response.status).toBe(200);
      expect(rejected.map((item) => item.id)).toContain(pending?.id);
    });
  });
});
