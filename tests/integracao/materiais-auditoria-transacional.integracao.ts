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

const actions = () => import('@/app/(staff)/materiais/supply-actions');
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

const seedSupply = async () => {
  const { createSupply } = await actions();
  const created = await createSupply({
    name: 'Bolsa integração',
    unit: 'un',
    minQty: 1,
    priceCents: 2500,
  });
  refreshed.mockClear();
  return (created.data as NonNullable<typeof created.data>).id;
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

describe('Feature: ações de Materiais gravam e auditam na mesma transação (ADR-083, Postgres real)', () => {
  it('Dado um insumo, Quando o Admin registra a entrada com lote, Então saldo, movimento, lote e trilha ficam gravados e a tela é atualizada', async () => {
    const supplyId = await seedSupply();
    const { registerStockMovement } = await actions();

    const result = await registerStockMovement({
      supplyId,
      type: 'in',
      quantity: 10,
      reason: 'Compra',
      batchLabel: 'L-INT',
    });

    expect(result.success).toBe(true);
    const { supplies, stockMovements, supplyBatches, auditEvents } =
      await repos();
    expect((await supplies.findById(supplyId))?.stockQty).toBe(10);
    expect(await stockMovements.findBySupplyId(supplyId)).toHaveLength(1);
    expect(await supplyBatches.findActiveBySupplyId(supplyId)).toHaveLength(1);
    expect(
      (await auditEvents.findAll()).filter(
        (e) => e.resourceId === supplyId && e.detail === 'entrada de 10',
      ),
    ).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando o Admin registra a entrada, Então a transação desfaz saldo, movimento e lote, e a tela não é atualizada', async () => {
    const supplyId = await seedSupply();
    await breakAudit();
    const { registerStockMovement } = await actions();

    try {
      const result = await registerStockMovement({
        supplyId,
        type: 'in',
        quantity: 10,
        reason: 'Compra',
        batchLabel: 'L-ROLLBACK',
      });

      expect(result.success).toBe(false);
      const { supplies, stockMovements, supplyBatches } = await repos();
      expect((await supplies.findById(supplyId))?.stockQty).toBe(0);
      expect(await stockMovements.findBySupplyId(supplyId)).toHaveLength(0);
      expect(await supplyBatches.findActiveBySupplyId(supplyId)).toHaveLength(
        0,
      );
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }
  });

  it('Dado saldo 5, Quando duas baixas de 4 chegam juntas, Então só uma passa e o saldo nunca fica negativo', async () => {
    const supplyId = await seedSupply();
    const { registerStockMovement } = await actions();
    await registerStockMovement({
      supplyId,
      type: 'in',
      quantity: 5,
      reason: 'Compra',
    });
    const out = { supplyId, type: 'out' as const, quantity: 4, reason: 'Uso' };

    const results = await Promise.all([
      registerStockMovement(out),
      registerStockMovement(out),
    ]);

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await (await repos()).supplies.findById(supplyId))?.stockQty).toBe(
      1,
    );
  });
});
