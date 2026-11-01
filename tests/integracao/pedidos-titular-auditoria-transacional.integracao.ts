import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { seedPortalRecord } from '../support/portal-account';
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
const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

/** Faz a gravação da trilha falhar dentro da transação, como uma falha de banco no meio da ação. */
const breakAudit = async () =>
  (await getDb()).execute(
    sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada CHECK (false) NOT VALID`,
  );
const repairAudit = async () =>
  (await getDb()).execute(
    sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada`,
  );

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
  cookieStore.value = sessionToken(
    'company_admin',
    'admin@clinica.com',
    undefined,
    CLINIC_A_ID,
  );
});

describe('Feature: decisão do pedido do titular grava e audita na mesma transação (ADR-075, Postgres real)', () => {
  it('Dado que a gravação da auditoria falha, Quando o Admin aceita o pedido, Então o pedido segue pendente e a tela não é atualizada', async () => {
    const patientId = await seedPortalRecord('patient', CLINIC_A_ID);
    const request = DataSubjectRequest.create({
      patientId,
      kind: 'correction',
      details: 'Telefone novo',
    });
    await (await repos()).dataSubjectRequests.save(request);
    await breakAudit();
    const { resolveDataRequest } = await actions();

    try {
      const result = await resolveDataRequest({
        id: request.id,
        decision: 'accept',
        justification: 'Atualizado na ficha',
      });

      expect(result.success).toBe(false);
      const saved = await (await repos()).dataSubjectRequests.findById(
        request.id,
      );
      expect(saved?.status).toBe('pending');
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }

    const retry = await resolveDataRequest({
      id: request.id,
      decision: 'accept',
      justification: 'Atualizado na ficha',
    });
    expect(retry.success).toBe(true);
  });
});
