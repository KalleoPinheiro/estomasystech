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

const actions = () => import('@/app/(staff)/procedimentos/procedure-actions');
const supplyActions = () => import('@/app/(staff)/materiais/supply-actions');
const repos = (clinicId: string = CLINIC_A_ID) =>
  getRepositories(clinicScope(clinicId));

const auditOf = async (resourceId: string, clinicId: string = CLINIC_A_ID) =>
  (await (await repos(clinicId)).auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );

let counter = 0;
const newProcedure = () => ({
  name: `Troca de curativo ${Date.now()}-${counter++}`,
  priceCents: 12_000,
  durationMinutes: 45,
});

const seedProcedure = async (clinicId: string = CLINIC_A_ID) => {
  signIn('company_admin', clinicId);
  const { createProcedure } = await actions();
  const created = await createProcedure(newProcedure());
  if (!created.success) throw new Error(created.error);
  refreshed.mockClear();
  return created.data;
};

const seedSupply = async (clinicId: string = CLINIC_A_ID) => {
  signIn('company_admin', clinicId);
  const { createSupply } = await supplyActions();
  const created = await createSupply({
    name: `Gaze ${Date.now()}-${counter++}`,
    unit: 'un',
    minQty: 1,
    priceCents: 500,
  });
  if (!created.success) throw new Error(created.error);
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

describe('Feature: ações de Procedimentos (#556)', () => {
  describe('Cenário: quem pode agir', () => {
    it('Dado que não há sessão, Quando cadastra um procedimento, Então responde Não autenticado e nada é gravado', async () => {
      const { createProcedure } = await actions();
      const before = (await (await repos()).procedures.findAll()).length;

      const result = await createProcedure(newProcedure());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/autenticad/i);
      expect((await (await repos()).procedures.findAll()).length).toBe(before);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado a sessão do paciente, Quando tenta cadastrar, Então a ação recusa e nada é gravado', async () => {
      signIn('patient');
      const { createProcedure } = await actions();
      const before = (await (await repos()).procedures.findAll()).length;

      const result = await createProcedure(newProcedure());

      expect(result.success).toBe(false);
      expect((await (await repos()).procedures.findAll()).length).toBe(before);
    });
  });

  describe('Cenário: cadastrar, editar e desativar', () => {
    it('Dado o Admin, Quando cadastra, Então grava, audita e atualiza a tela', async () => {
      signIn('company_admin');
      const { createProcedure } = await actions();
      const input = newProcedure();

      const result = await createProcedure(input);

      const created = result.data as NonNullable<typeof result.data>;
      expect(created).toMatchObject({ ...input, active: true });
      const trail = await auditOf(created.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({
        action: 'create',
        resourceType: 'procedure',
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado nome já usado na empresa, Quando cadastra de novo, Então a ação recusa e nada é gravado', async () => {
      const first = await seedProcedure();
      const { createProcedure } = await actions();
      const before = (await (await repos()).procedures.findAll()).length;

      const result = await createProcedure({
        name: first.name,
        priceCents: 100,
        durationMinutes: 30,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Já existe procedimento');
      expect((await (await repos()).procedures.findAll()).length).toBe(before);
    });

    it('Dado duração zero, Quando cadastra, Então a entrada é recusada', async () => {
      signIn('company_admin');
      const { createProcedure } = await actions();

      const result = await createProcedure({
        ...newProcedure(),
        durationMinutes: 0,
      });

      expect(result.success).toBe(false);
    });

    it('Dado procedimento ativo, Quando o Admin o desativa e reativa, Então a situação muda e a trilha diz desativado e reativado', async () => {
      const procedure = await seedProcedure();
      const { updateProcedure } = await actions();

      const off = await updateProcedure({ id: procedure.id, active: false });
      const on = await updateProcedure({ id: procedure.id, active: true });

      expect(off.data).toMatchObject({ active: false });
      expect(on.data).toMatchObject({ active: true });
      expect((await auditOf(procedure.id)).map((e) => e.detail)).toEqual(
        expect.arrayContaining(['desativado', 'reativado']),
      );
    });

    it('Dado procedimento, Quando o Admin muda o preço, Então grava a edição e audita como editado', async () => {
      const procedure = await seedProcedure();
      const { updateProcedure } = await actions();

      const result = await updateProcedure({
        id: procedure.id,
        priceCents: 15_000,
      });

      expect(result.data).toMatchObject({ priceCents: 15_000 });
      expect((await auditOf(procedure.id)).map((e) => e.detail)).toContain(
        'editado',
      );
    });

    it('Dado nome de outro procedimento, Quando o Admin renomeia, Então a ação recusa e o nome não muda', async () => {
      const first = await seedProcedure();
      const second = await seedProcedure();
      const { updateProcedure } = await actions();

      const result = await updateProcedure({ id: second.id, name: first.name });

      expect(result.success).toBe(false);
      expect((await (await repos()).procedures.findById(second.id))?.name).toBe(
        second.name,
      );
    });

    it('Dado procedimento de outra clínica, Quando o Admin o edita, Então responde não encontrado e nada é gravado nem auditado', async () => {
      const other = await seedProcedure(CLINIC_B_ID);
      const trailBefore = (await auditOf(other.id, CLINIC_B_ID)).length;
      signIn('company_admin', CLINIC_A_ID);
      const { updateProcedure } = await actions();

      const result = await updateProcedure({ id: other.id, name: 'Invasão' });

      expect(result.success).toBe(false);
      expect(
        (await (await repos(CLINIC_B_ID)).procedures.findById(other.id))?.name,
      ).toBe(other.name);
      expect(await auditOf(other.id, CLINIC_B_ID)).toHaveLength(trailBefore);
    });
  });

  describe('Cenário: kit de insumos', () => {
    it('Dado procedimento e insumo, Quando o Admin define o kit, Então o kit grava, a contagem aparece e a trilha registra o kit', async () => {
      const procedure = await seedProcedure();
      const supply = await seedSupply();
      const { setProcedureKit } = await actions();

      const result = await setProcedureKit({
        procedureId: procedure.id,
        items: [{ supplyId: supply.id, quantity: 2 }],
      });

      expect(result.success).toBe(true);
      const { procedureKits } = await repos();
      expect(await procedureKits.getKit(procedure.id)).toEqual([
        { supplyId: supply.id, quantity: 2 },
      ]);
      expect((await auditOf(procedure.id)).map((e) => e.detail)).toContain(
        'kit com 1 item',
      );
    });

    it('Dado kit existente, Quando o Admin o esvazia, Então o kit fica vazio', async () => {
      const procedure = await seedProcedure();
      const supply = await seedSupply();
      const { setProcedureKit } = await actions();
      await setProcedureKit({
        procedureId: procedure.id,
        items: [{ supplyId: supply.id, quantity: 1 }],
      });

      await setProcedureKit({ procedureId: procedure.id, items: [] });

      expect(await (await repos()).procedureKits.getKit(procedure.id)).toEqual(
        [],
      );
    });

    it('Dado insumo de outra clínica, Quando entra no kit, Então responde não encontrado e o kit não muda', async () => {
      const procedure = await seedProcedure();
      const foreign = await seedSupply(CLINIC_B_ID);
      signIn('company_admin', CLINIC_A_ID);
      const { setProcedureKit } = await actions();

      const result = await setProcedureKit({
        procedureId: procedure.id,
        items: [{ supplyId: foreign.id, quantity: 1 }],
      });

      expect(result.success).toBe(false);
      expect(await (await repos()).procedureKits.getKit(procedure.id)).toEqual(
        [],
      );
    });

    it('Dado procedimento inexistente, Quando define o kit, Então responde não encontrado e não há trilha', async () => {
      signIn('company_admin');
      const { setProcedureKit } = await actions();

      const result = await setProcedureKit({
        procedureId: 'nao-existe',
        items: [],
      });

      expect(result.success).toBe(false);
      expect(await auditOf('nao-existe')).toHaveLength(0);
    });

    it('Dado a trilha que falha, Quando o Admin define o kit, Então a transação desfaz o kit', async () => {
      const procedure = await seedProcedure();
      const supply = await seedSupply();
      const { setProcedureKit } = await actions();
      await breakAudit();
      try {
        const result = await setProcedureKit({
          procedureId: procedure.id,
          items: [{ supplyId: supply.id, quantity: 4 }],
        });

        expect(result.success).toBe(false);
      } finally {
        await repairAudit();
      }
      expect(await (await repos()).procedureKits.getKit(procedure.id)).toEqual(
        [],
      );
    });
  });
});
