import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
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

const actions = () => import('@/app/(staff)/materiais/supply-actions');
const repos = (clinicId: string = CLINIC_A_ID) =>
  getRepositories(clinicScope(clinicId));

const auditOf = async (resourceId: string) => {
  const { auditEvents } = await repos();
  return (await auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );
};

const NEW_SUPPLY = {
  name: 'Bolsa de colostomia',
  unit: 'un',
  minQty: 5,
  priceCents: 3000,
};

const seedSupply = async () => {
  signIn('company_admin');
  const { createSupply } = await actions();
  const created = await createSupply(NEW_SUPPLY);
  if (!created.success) throw new Error(created.error);
  refreshed.mockClear();
  return created.data;
};

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
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: ações de Materiais (#556)', () => {
  describe('Cenário: quem pode agir', () => {
    it('Dado que não há sessão, Quando cadastra um insumo, Então responde Não autenticado e nada é gravado', async () => {
      const { createSupply } = await actions();
      const before = (await (await repos()).supplies.findAll()).length;

      const result = await createSupply(NEW_SUPPLY);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/autenticad/i);
      expect((await (await repos()).supplies.findAll()).length).toBe(before);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado a sessão do paciente, Quando tenta movimentar o estoque, Então a ação recusa e o saldo não muda', async () => {
      const supply = await seedSupply();
      signIn('patient');
      const { registerStockMovement } = await actions();

      const result = await registerStockMovement({
        supplyId: supply.id,
        type: 'in',
        quantity: 10,
        reason: 'Compra',
      });

      expect(result.success).toBe(false);
      expect(
        (await (await repos()).supplies.findById(supply.id))?.stockQty,
      ).toBe(0);
    });
  });

  describe('Cenário: cadastrar e editar insumo', () => {
    it('Dado o Admin, Quando cadastra, Então grava, audita e atualiza a tela', async () => {
      signIn('company_admin');
      const { createSupply } = await actions();

      const result = await createSupply(NEW_SUPPLY);

      expect(result.success).toBe(true);
      const created = result.data as NonNullable<typeof result.data>;
      expect(created).toMatchObject({
        ...NEW_SUPPLY,
        stockQty: 0,
        active: true,
      });
      const trail = await auditOf(created.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({
        action: 'create',
        resourceType: 'supply',
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado preço negativo, Quando cadastra, Então a entrada é recusada e nada é gravado', async () => {
      signIn('company_admin');
      const { createSupply } = await actions();
      const before = (await (await repos()).supplies.findAll()).length;

      const result = await createSupply({ ...NEW_SUPPLY, priceCents: -1 });

      expect(result.success).toBe(false);
      expect((await (await repos()).supplies.findAll()).length).toBe(before);
    });

    it('Dado insumo cadastrado, Quando o Admin o desativa, Então fica inativo e a trilha registra a edição', async () => {
      const supply = await seedSupply();
      const { updateSupply } = await actions();

      const result = await updateSupply({ id: supply.id, active: false });

      expect(result.data).toMatchObject({ id: supply.id, active: false });
      expect((await auditOf(supply.id)).map((event) => event.action)).toContain(
        'update',
      );
    });

    it('Dado insumo de outra clínica, Quando o Admin o edita, Então responde não encontrado e nada é gravado nem auditado', async () => {
      signIn('company_admin', CLINIC_B_ID);
      const { createSupply, updateSupply } = await actions();
      const other = await createSupply(NEW_SUPPLY);
      const otherId = (other.data as NonNullable<typeof other.data>).id;
      const trailOf = async () =>
        (await (await repos(CLINIC_B_ID)).auditEvents.findAll()).filter(
          (event) => event.resourceId === otherId,
        );
      const trailBefore = (await trailOf()).length;
      signIn('company_admin', CLINIC_A_ID);

      const result = await updateSupply({ id: otherId, name: 'Invasão' });

      expect(result.success).toBe(false);
      expect(
        (await (await repos(CLINIC_B_ID)).supplies.findById(otherId))?.name,
      ).toBe(NEW_SUPPLY.name);
      expect(await trailOf()).toHaveLength(trailBefore);
    });
  });

  describe('Cenário: movimentar o estoque', () => {
    it('Dado insumo zerado, Quando entra 10 com lote e validade, Então saldo, movimento, lote e trilha gravam juntos', async () => {
      const supply = await seedSupply();
      const { registerStockMovement } = await actions();

      const result = await registerStockMovement({
        supplyId: supply.id,
        type: 'in',
        quantity: 10,
        reason: 'Compra fornecedor X',
        batchLabel: 'L2026-091',
        expiresAt: '2030-12-31T00:00:00.000Z',
      });

      expect(result.data).toMatchObject({ id: supply.id, stockQty: 10 });
      const { stockMovements, supplyBatches } = await repos();
      expect(await stockMovements.findBySupplyId(supply.id)).toHaveLength(1);
      const batches = await supplyBatches.findActiveBySupplyId(supply.id);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({ label: 'L2026-091', remaining: 10 });
      const trail = await auditOf(supply.id);
      expect(trail.map((event) => event.detail)).toContain('entrada de 10');
      expect(trail.map((event) => event.detail).join()).not.toContain(
        'Compra fornecedor X',
      );
    });

    it('Dado saldo 10, Quando sai 4, Então o saldo é 6 e a baixa consome o lote', async () => {
      const supply = await seedSupply();
      const { registerStockMovement } = await actions();
      await registerStockMovement({
        supplyId: supply.id,
        type: 'in',
        quantity: 10,
        reason: 'Compra',
        batchLabel: 'L1',
      });

      const result = await registerStockMovement({
        supplyId: supply.id,
        type: 'out',
        quantity: 4,
        reason: 'Uso em atendimento',
      });

      expect(result.data).toMatchObject({ stockQty: 6 });
      const batches = await (await repos()).supplyBatches.findActiveBySupplyId(
        supply.id,
      );
      expect(batches[0].remaining).toBe(6);
      expect((await auditOf(supply.id)).map((e) => e.detail)).toContain(
        'baixa de 4',
      );
    });

    it('Dado saldo 2, Quando tenta sair 5, Então a ação recusa, o saldo continua 2 e não há movimento nem trilha da baixa', async () => {
      const supply = await seedSupply();
      const { registerStockMovement } = await actions();
      await registerStockMovement({
        supplyId: supply.id,
        type: 'in',
        quantity: 2,
        reason: 'Compra',
      });
      const trailBefore = (await auditOf(supply.id)).length;

      const result = await registerStockMovement({
        supplyId: supply.id,
        type: 'out',
        quantity: 5,
        reason: 'Uso',
      });

      expect(result.success).toBe(false);
      const { supplies, stockMovements } = await repos();
      expect((await supplies.findById(supply.id))?.stockQty).toBe(2);
      expect(await stockMovements.findBySupplyId(supply.id)).toHaveLength(1);
      expect(await auditOf(supply.id)).toHaveLength(trailBefore);
    });

    it('Dado consulta inexistente, Quando a baixa a vincula, Então responde não encontrada e o saldo não muda', async () => {
      const supply = await seedSupply();
      const { registerStockMovement } = await actions();
      await registerStockMovement({
        supplyId: supply.id,
        type: 'in',
        quantity: 3,
        reason: 'Compra',
      });

      const result = await registerStockMovement({
        supplyId: supply.id,
        type: 'out',
        quantity: 1,
        reason: 'Uso',
        appointmentId: 'nao-existe',
      });

      expect(result.success).toBe(false);
      expect(
        (await (await repos()).supplies.findById(supply.id))?.stockQty,
      ).toBe(3);
    });

    it('Dado a trilha que falha, Quando registra a entrada, Então a transação desfaz saldo, movimento e lote', async () => {
      const supply = await seedSupply();
      const { registerStockMovement } = await actions();
      await breakAudit();
      try {
        const result = await registerStockMovement({
          supplyId: supply.id,
          type: 'in',
          quantity: 7,
          reason: 'Compra',
          batchLabel: 'L-ROLLBACK',
        });

        expect(result.success).toBe(false);
      } finally {
        await repairAudit();
      }
      const { supplies, stockMovements, supplyBatches } = await repos();
      expect((await supplies.findById(supply.id))?.stockQty).toBe(0);
      expect(await stockMovements.findBySupplyId(supply.id)).toHaveLength(0);
      expect(await supplyBatches.findActiveBySupplyId(supply.id)).toHaveLength(
        0,
      );
    });
  });
});
