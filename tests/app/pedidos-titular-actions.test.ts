import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEmailGateway } from '@/application/ports/email-gateway';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { type EmailSpy, spyOnSentEmails } from '../support/email';
import { linkPortalAccount, seedPortalRecord } from '../support/portal-account';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const actions = () =>
  import('@/app/(staff)/pedidos-titular/data-request-actions');
const repos = (clinicId = CLINIC_A_ID) =>
  getRepositories(clinicScope(clinicId));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string = CLINIC_A_ID,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
  );
};

/** Pedido pendente de correção de um paciente da clínica, com ou sem conta no portal. */
const seedRequest = async (clinicId = CLINIC_A_ID, withPortal = false) => {
  const patientId = await seedPortalRecord('patient', clinicId);
  if (withPortal) {
    await linkPortalAccount({
      role: 'patient',
      email: `titular-${Math.random()}@x.com`,
      recordId: patientId,
      clinicId,
    });
  }
  const created = DataSubjectRequest.create({
    patientId,
    kind: 'correction',
    details: 'Telefone novo',
  });
  await (await repos(clinicId)).dataSubjectRequests.save(created);
  return created;
};

const auditOf = async (id: string) =>
  (await (await repos()).auditEvents.findAll()).filter(
    (event) => event.resourceId === id,
  );

let spy: EmailSpy;

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
  spy?.restore();
  spy = spyOnSentEmails();
});

describe('Feature: decisão sobre pedido do titular como Server Action (#555)', () => {
  describe('Cenário: quem pode decidir', () => {
    it('Dado que não há sessão, Quando decide, Então responde Não autenticado e o pedido segue pendente', async () => {
      const request = await seedRequest();
      const { resolveDataRequest } = await actions();

      const result = await resolveDataRequest({
        id: request.id,
        decision: 'accept',
        justification: 'ok',
      });

      expect(result.error).toBe('Não autenticado');
      const saved = await (await repos()).dataSubjectRequests.findById(
        request.id,
      );
      expect(saved?.status).toBe('pending');
    });

    it.each(['atendente', 'profissional'] as const)(
      'Dado o papel %s, Quando tenta decidir, Então é recusado, nada é gravado nem auditado',
      async (role) => {
        const request = await seedRequest();
        signIn(role);
        const { resolveDataRequest } = await actions();

        const result = await resolveDataRequest({
          id: request.id,
          decision: 'reject',
          justification: 'não',
        });

        expect(result.success).toBe(false);
        const saved = await (await repos()).dataSubjectRequests.findById(
          request.id,
        );
        expect(saved?.status).toBe('pending');
        expect(await auditOf(request.id)).toHaveLength(0);
        expect(refreshed).not.toHaveBeenCalled();
      },
    );

    it('Dado o Admin da clínica B, Quando decide pedido da clínica A, Então 404 e o pedido segue pendente', async () => {
      const request = await seedRequest(CLINIC_A_ID);
      signIn('company_admin', CLINIC_B_ID);
      const { resolveDataRequest } = await actions();

      const result = await resolveDataRequest({
        id: request.id,
        decision: 'accept',
        justification: 'ok',
      });

      expect(result.success).toBe(false);
      const saved = await (
        await repos(CLINIC_A_ID)
      ).dataSubjectRequests.findById(request.id);
      expect(saved?.status).toBe('pending');
    });
  });

  describe('Cenário: decisão', () => {
    it('Dado justificativa vazia, Quando decide, Então rejeita a entrada e não grava', async () => {
      const request = await seedRequest();
      signIn('company_admin');
      const { resolveDataRequest } = await actions();

      const result = await resolveDataRequest({
        id: request.id,
        decision: 'accept',
        justification: '   ',
      });

      expect(result.success).toBe(false);
      expect(await auditOf(request.id)).toHaveLength(0);
    });

    it('Dado paciente com conta no portal, Quando o Admin aceita, Então grava a decisão, audita na mesma transação, atualiza a tela e avisa por e-mail depois', async () => {
      const request = await seedRequest(CLINIC_A_ID, true);
      signIn('company_admin');
      vi.spyOn(NullEmailGateway.prototype, 'isEnabled').mockResolvedValue(true);
      const { resolveDataRequest } = await actions();

      const result = await resolveDataRequest({
        id: request.id,
        decision: 'accept',
        justification: '  Telefone atualizado ',
      });

      expect(result).toEqual({
        success: true,
        data: { notified: true },
        error: null,
      });
      const saved = await (await repos()).dataSubjectRequests.findById(
        request.id,
      );
      expect(saved?.status).toBe('accepted');
      expect(saved?.resolution).toBe('Telefone atualizado');
      const trail = await auditOf(request.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({
        action: 'update',
        resourceType: 'data_request',
        patientId: request.patientId,
        detail: 'correction: accepted',
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
      expect(spy.bodies).toHaveLength(1);
    });

    it('Dado paciente sem conta no portal, Quando o Admin recusa, Então a decisão fica gravada e notified é false (a resposta fica no portal)', async () => {
      const request = await seedRequest();
      signIn('company_admin');
      const { resolveDataRequest } = await actions();

      const result = await resolveDataRequest({
        id: request.id,
        decision: 'reject',
        justification: 'Não procede',
      });

      expect(result.data).toEqual({ notified: false });
      const saved = await (await repos()).dataSubjectRequests.findById(
        request.id,
      );
      expect(saved?.status).toBe('rejected');
      expect(spy.bodies).toHaveLength(0);
    });

    it('Dado pedido já decidido, Quando decide de novo, Então responde que já foi analisado e não audita outra vez nem avisa', async () => {
      const request = await seedRequest(CLINIC_A_ID, true);
      signIn('company_admin');
      const { resolveDataRequest } = await actions();
      await resolveDataRequest({
        id: request.id,
        decision: 'accept',
        justification: 'ok',
      });

      const again = await resolveDataRequest({
        id: request.id,
        decision: 'reject',
        justification: 'tarde demais',
      });

      expect(again.error).toBe('Este pedido já foi analisado');
      expect(await auditOf(request.id)).toHaveLength(1);
      expect(spy.bodies).toHaveLength(1);
    });
  });
});
