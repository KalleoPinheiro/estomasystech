import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
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

const actions = () => import('@/app/(staff)/procedimentos/procedure-actions');
const supplyActions = () => import('@/app/(staff)/materiais/supply-actions');
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

const seed = async () => {
  const { createProcedure, setProcedureKit } = await actions();
  const { createSupply } = await supplyActions();
  const procedure = await createProcedure({
    name: `Procedimento integração ${Math.random()}`,
    priceCents: 9000,
    durationMinutes: 30,
  });
  const supply = await createSupply({
    name: `Insumo integração ${Math.random()}`,
    unit: 'un',
    minQty: 1,
    priceCents: 200,
  });
  refreshed.mockClear();
  return {
    procedureId: (procedure.data as NonNullable<typeof procedure.data>).id,
    supplyId: (supply.data as NonNullable<typeof supply.data>).id,
    setProcedureKit,
  };
};

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

describe('Feature: ações de Procedimentos gravam e auditam na mesma transação (ADR-083, Postgres real)', () => {
  it('Dado procedimento e insumo, Quando o Admin define o kit, Então kit e trilha ficam gravados e a tela é atualizada', async () => {
    const { procedureId, supplyId, setProcedureKit } = await seed();

    const result = await setProcedureKit({
      procedureId,
      items: [{ supplyId, quantity: 2 }],
    });

    expect(result.success).toBe(true);
    const { procedureKits, auditEvents } = await repos();
    expect(await procedureKits.getKit(procedureId)).toEqual([
      { supplyId, quantity: 2 },
    ]);
    expect(
      (await auditEvents.findAll()).filter(
        (e) => e.resourceId === procedureId && e.detail === 'kit com 1 item',
      ),
    ).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando o Admin define o kit, Então a transação desfaz o kit e a tela não é atualizada', async () => {
    const { procedureId, supplyId, setProcedureKit } = await seed();
    await breakAudit();

    try {
      const result = await setProcedureKit({
        procedureId,
        items: [{ supplyId, quantity: 2 }],
      });

      expect(result.success).toBe(false);
      expect(await (await repos()).procedureKits.getKit(procedureId)).toEqual(
        [],
      );
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }
  });

  it('Dado que a gravação da auditoria falha, Quando o Admin cadastra um procedimento, Então nada é gravado', async () => {
    const { createProcedure } = await actions();
    const name = `Procedimento rollback ${Math.random()}`;
    await breakAudit();

    try {
      const result = await createProcedure({
        name,
        priceCents: 100,
        durationMinutes: 30,
      });

      expect(result.success).toBe(false);
      expect(await (await repos()).procedures.findByName(name)).toBeNull();
    } finally {
      await repairAudit();
    }
  });
});
