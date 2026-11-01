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

const profActions = () =>
  import('@/app/(staff)/profissionais/professional-actions');
const partnerActions = () => import('@/app/(staff)/parceiros/partner-actions');
const repos = (clinicId: string = CLINIC_A_ID) =>
  getRepositories(clinicScope(clinicId));

const auditOf = async (resourceId: string, clinicId: string = CLINIC_A_ID) =>
  (await (await repos(clinicId)).auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );

let counter = 0;
const unique = () => `${Date.now()}-${counter++}`;

const seedProfessional = async (clinicId: string = CLINIC_A_ID) => {
  signIn('company_admin', clinicId);
  const { createProfessional } = await profActions();
  const created = await createProfessional({
    fullName: `Dra. Ana ${unique()}`,
    registry: 'COREN-SP 123',
    commissionType: 'percentage',
    commissionPct: 20,
  });
  if (!created.success) throw new Error(created.error);
  refreshed.mockClear();
  return created.data;
};

const newPartner = () => ({
  fullName: `Dr. João ${unique()}`,
  email: `parceiro-${unique()}@parceiro.com`,
  phone: '11999999999',
  crm: 'CRM-SP 123',
  specialty: 'Vascular',
});

const seedPartner = async (clinicId: string = CLINIC_A_ID) => {
  signIn('company_admin', clinicId);
  const { createPartner } = await partnerActions();
  const created = await createPartner(newPartner());
  if (!created.success) throw new Error(created.error);
  refreshed.mockClear();
  return created.data;
};

/** Faz a gravação da trilha falhar dentro da transação, como uma falha de banco no meio da ação. */
const breakAudit = async () =>
  (await getDb()).execute(
    sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada_equipe CHECK (false) NOT VALID`,
  );
const repairAudit = async () =>
  (await getDb()).execute(
    sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada_equipe`,
  );

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: ações de Profissionais (#550)', () => {
  describe('Cenário: quem pode agir (comissão é dado financeiro)', () => {
    it('Dado que não há sessão, Quando cadastra, Então responde Não autenticado e nada é gravado', async () => {
      const { createProfessional } = await profActions();
      const before = (await (await repos()).professionals.findAll()).length;

      const result = await createProfessional({ fullName: 'Sem sessão' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/autenticad/i);
      expect((await (await repos()).professionals.findAll()).length).toBe(
        before,
      );
      expect(refreshed).not.toHaveBeenCalled();
    });

    it.each(['atendente', 'profissional', 'patient'] as const)(
      'Dado a sessão de %s, Quando tenta cadastrar com comissão, Então a ação recusa e nada é gravado',
      async (role) => {
        signIn(role);
        const { createProfessional } = await profActions();
        const before = (await (await repos()).professionals.findAll()).length;

        const result = await createProfessional({
          fullName: `Recusado ${unique()}`,
          commissionPct: 90,
        });

        expect(result.success).toBe(false);
        expect((await (await repos()).professionals.findAll()).length).toBe(
          before,
        );
      },
    );

    it.each(['atendente', 'profissional'] as const)(
      'Dado a sessão de %s, Quando tenta editar a comissão de um profissional, Então a ação recusa e a comissão não muda',
      async (role) => {
        const professional = await seedProfessional();
        signIn(role);
        const { updateProfessional } = await profActions();

        const result = await updateProfessional({
          id: professional.id,
          commissionPct: 0,
        });

        expect(result.success).toBe(false);
        expect(
          (await (await repos()).professionals.findById(professional.id))
            ?.commissionPct,
        ).toBe(20);
      },
    );

    it.each(['atendente', 'profissional'] as const)(
      'Dado a sessão de %s, Quando tenta salvar o horário, Então a ação recusa e nada é gravado',
      async (role) => {
        const professional = await seedProfessional();
        signIn(role);
        const { saveAvailability } = await profActions();

        const result = await saveAvailability({
          professionalId: professional.id,
          windows: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
        });

        expect(result.success).toBe(false);
        expect(
          await (await repos()).scheduleAvailability.getProfessionalHours(
            professional.id,
          ),
        ).toEqual([]);
      },
    );
  });

  describe('Cenário: cadastrar, editar e desativar', () => {
    it('Dado o Admin, Quando cadastra, Então grava com a comissão, audita e atualiza a tela', async () => {
      signIn('company_admin');
      const { createProfessional } = await profActions();

      const result = await createProfessional({
        fullName: `Dr. Caio ${unique()}`,
        commissionType: 'fixed',
        commissionFixedCents: 5000,
      });

      const created = result.data as NonNullable<typeof result.data>;
      expect(created).toMatchObject({
        commissionType: 'fixed',
        commissionFixedCents: 5000,
        active: true,
      });
      const trail = await auditOf(created.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({
        action: 'create',
        resourceType: 'professional',
        detail: 'cadastrado',
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado repasse acima de 100%, Quando cadastra, Então a entrada é recusada', async () => {
      signIn('company_admin');
      const { createProfessional } = await profActions();

      const result = await createProfessional({
        fullName: 'Excesso',
        commissionPct: 101,
      });

      expect(result.success).toBe(false);
    });

    it('Dado profissional, Quando o Admin edita o registro, Então grava a edição e audita como editado', async () => {
      const professional = await seedProfessional();
      const { updateProfessional } = await profActions();

      const result = await updateProfessional({
        id: professional.id,
        registry: 'COREN-SP 456',
      });

      expect(result.data).toMatchObject({
        registry: 'COREN-SP 456',
        commissionPct: 20,
      });
      expect((await auditOf(professional.id)).map((e) => e.detail)).toContain(
        'editado',
      );
    });

    it('Dado profissional ativo, Quando o Admin o desativa e reativa, Então a situação muda e a trilha diz desativado e reativado', async () => {
      const professional = await seedProfessional();
      const { updateProfessional } = await profActions();

      const off = await updateProfessional({
        id: professional.id,
        active: false,
      });
      const on = await updateProfessional({
        id: professional.id,
        active: true,
      });

      expect(off.data).toMatchObject({ active: false });
      expect(on.data).toMatchObject({ active: true });
      expect((await auditOf(professional.id)).map((e) => e.detail)).toEqual(
        expect.arrayContaining(['desativado', 'reativado']),
      );
    });

    it('Dado profissional de outra clínica, Quando o Admin o edita, Então responde não encontrado e nada é gravado nem auditado', async () => {
      const other = await seedProfessional(CLINIC_B_ID);
      signIn('company_admin');
      const { updateProfessional } = await profActions();

      const result = await updateProfessional({
        id: other.id,
        fullName: 'Invasor',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('não encontrado');
      expect(
        (await (await repos(CLINIC_B_ID)).professionals.findById(other.id))
          ?.fullName,
      ).toBe(other.fullName);
      expect(
        (await auditOf(other.id, CLINIC_B_ID)).map((e) => e.detail),
      ).toEqual(['cadastrado']);
    });

    it('Dado a trilha que falha, Quando o Admin cadastra, Então a transação desfaz o cadastro', async () => {
      signIn('company_admin');
      const { createProfessional } = await profActions();
      const before = (await (await repos()).professionals.findAll()).length;
      await breakAudit();
      try {
        const result = await createProfessional({ fullName: 'Sem trilha' });

        expect(result.success).toBe(false);
      } finally {
        await repairAudit();
      }
      expect((await (await repos()).professionals.findAll()).length).toBe(
        before,
      );
    });
  });

  describe('Cenário: horário semanal', () => {
    it('Dado o Admin, Quando salva a segunda e depois esvazia, Então grava, audita e volta a seguir a clínica', async () => {
      const professional = await seedProfessional();
      const { saveAvailability } = await profActions();
      const monday = { weekday: 1, startMinute: 480, endMinute: 720 };

      const saved = await saveAvailability({
        professionalId: professional.id,
        windows: [monday],
      });

      expect(saved.data?.windows).toEqual([monday]);
      expect(
        await (await repos()).scheduleAvailability.getProfessionalHours(
          professional.id,
        ),
      ).toEqual([monday]);
      const trail = await auditOf(professional.id);
      expect(trail.map((e) => e.resourceType)).toContain(
        'professional-availability',
      );

      await saveAvailability({ professionalId: professional.id, windows: [] });
      expect(
        await (await repos()).scheduleAvailability.getProfessionalHours(
          professional.id,
        ),
      ).toEqual([]);
    });

    it('Dado janelas que se sobrepõem, Quando salva, Então a ação recusa e o horário anterior fica', async () => {
      const professional = await seedProfessional();
      const { saveAvailability } = await profActions();
      const monday = { weekday: 1, startMinute: 480, endMinute: 720 };
      await saveAvailability({
        professionalId: professional.id,
        windows: [monday],
      });

      const result = await saveAvailability({
        professionalId: professional.id,
        windows: [
          { weekday: 2, startMinute: 480, endMinute: 720 },
          { weekday: 2, startMinute: 600, endMinute: 900 },
        ],
      });

      expect(result.success).toBe(false);
      expect(
        await (await repos()).scheduleAvailability.getProfessionalHours(
          professional.id,
        ),
      ).toEqual([monday]);
    });

    it('Dado profissional de outra clínica, Quando salva o horário, Então responde não encontrado e não há trilha', async () => {
      const other = await seedProfessional(CLINIC_B_ID);
      signIn('company_admin');
      const { saveAvailability } = await profActions();

      const result = await saveAvailability({
        professionalId: other.id,
        windows: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('não encontrado');
      expect(
        (await auditOf(other.id, CLINIC_B_ID)).map((e) => e.resourceType),
      ).not.toContain('professional-availability');
    });

    it('Dado a trilha que falha, Quando o Admin salva o horário, Então a transação desfaz o horário', async () => {
      const professional = await seedProfessional();
      const { saveAvailability } = await profActions();
      await breakAudit();
      try {
        const result = await saveAvailability({
          professionalId: professional.id,
          windows: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
        });

        expect(result.success).toBe(false);
      } finally {
        await repairAudit();
      }
      expect(
        await (await repos()).scheduleAvailability.getProfessionalHours(
          professional.id,
        ),
      ).toEqual([]);
    });
  });
});

describe('Feature: ações de Parceiros (#550)', () => {
  describe('Cenário: quem pode agir', () => {
    it('Dado que não há sessão, Quando cadastra, Então responde Não autenticado e nada é gravado', async () => {
      const { createPartner } = await partnerActions();
      const before = (await (await repos()).partners.findAll()).length;

      const result = await createPartner(newPartner());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/autenticad/i);
      expect((await (await repos()).partners.findAll()).length).toBe(before);
    });

    it('Dado a sessão do paciente, Quando tenta cadastrar, Então a ação recusa e nada é gravado', async () => {
      signIn('patient');
      const { createPartner } = await partnerActions();
      const before = (await (await repos()).partners.findAll()).length;

      const result = await createPartner(newPartner());

      expect(result.success).toBe(false);
      expect((await (await repos()).partners.findAll()).length).toBe(before);
    });

    it.each(['atendente', 'profissional'] as const)(
      'Dado a sessão de %s, Quando cadastra, Então a ação grava (parceiro é cadastro operacional)',
      async (role) => {
        signIn(role);
        const { createPartner } = await partnerActions();

        const result = await createPartner(newPartner());

        expect(result.success).toBe(true);
      },
    );
  });

  describe('Cenário: cadastrar, editar e desativar', () => {
    it('Dado o Admin, Quando cadastra, Então grava, audita e atualiza a tela', async () => {
      signIn('company_admin');
      const { createPartner } = await partnerActions();
      const input = newPartner();

      const result = await createPartner(input);

      const created = result.data as NonNullable<typeof result.data>;
      expect(created).toMatchObject({ ...input, active: true });
      const trail = await auditOf(created.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({
        action: 'create',
        resourceType: 'partner',
        detail: 'cadastrado',
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado e-mail já usado na empresa, Quando cadastra de novo, Então a ação recusa e nada é gravado', async () => {
      const first = await seedPartner();
      const { createPartner } = await partnerActions();
      const before = (await (await repos()).partners.findAll()).length;

      const result = await createPartner({
        ...newPartner(),
        email: first.email,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Já existe parceiro');
      expect((await (await repos()).partners.findAll()).length).toBe(before);
    });

    it('Dado e-mail inválido, Quando cadastra, Então a entrada é recusada com a mensagem', async () => {
      signIn('company_admin');
      const { createPartner } = await partnerActions();

      const result = await createPartner({
        ...newPartner(),
        email: 'nao-e-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email inválido');
    });

    it('Dado parceiro, Quando o Admin edita CRM e especialidade, Então grava a edição e audita como editado', async () => {
      const partner = await seedPartner();
      const { updatePartner } = await partnerActions();

      const result = await updatePartner({
        id: partner.id,
        crm: 'CRM-RJ 999',
        specialty: 'Dermatologia',
      });

      expect(result.data).toMatchObject({
        crm: 'CRM-RJ 999',
        specialty: 'Dermatologia',
        email: partner.email,
      });
      expect((await auditOf(partner.id)).map((e) => e.detail)).toContain(
        'editado',
      );
    });

    it('Dado parceiro, Quando o Admin limpa o CRM, Então o CRM fica vazio', async () => {
      const partner = await seedPartner();
      const { updatePartner } = await partnerActions();

      const result = await updatePartner({ id: partner.id, crm: null });

      expect(result.data).toMatchObject({ crm: null });
    });

    it('Dado e-mail de outro parceiro, Quando o Admin edita, Então a ação recusa e o e-mail não muda', async () => {
      const first = await seedPartner();
      const second = await seedPartner();
      const { updatePartner } = await partnerActions();

      const result = await updatePartner({ id: second.id, email: first.email });

      expect(result.success).toBe(false);
      expect((await (await repos()).partners.findById(second.id))?.email).toBe(
        second.email,
      );
    });

    it('Dado parceiro ativo, Quando o Admin o desativa e reativa, Então a situação muda e a trilha diz desativado e reativado', async () => {
      const partner = await seedPartner();
      const { updatePartner } = await partnerActions();

      const off = await updatePartner({ id: partner.id, active: false });
      const on = await updatePartner({ id: partner.id, active: true });

      expect(off.data).toMatchObject({ active: false });
      expect(on.data).toMatchObject({ active: true });
      expect((await auditOf(partner.id)).map((e) => e.detail)).toEqual(
        expect.arrayContaining(['desativado', 'reativado']),
      );
    });

    it('Dado parceiro de outra clínica, Quando o Admin o edita, Então responde não encontrado e nada é gravado', async () => {
      const other = await seedPartner(CLINIC_B_ID);
      signIn('company_admin');
      const { updatePartner } = await partnerActions();

      const result = await updatePartner({ id: other.id, active: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('não encontrado');
      expect(
        (await (await repos(CLINIC_B_ID)).partners.findById(other.id))
          ?.isActive,
      ).toBe(true);
    });

    it('Dado a trilha que falha, Quando o Admin desativa o parceiro, Então a transação desfaz a desativação', async () => {
      const partner = await seedPartner();
      const { updatePartner } = await partnerActions();
      await breakAudit();
      try {
        const result = await updatePartner({ id: partner.id, active: false });

        expect(result.success).toBe(false);
      } finally {
        await repairAudit();
      }
      expect(
        (await (await repos()).partners.findById(partner.id))?.isActive,
      ).toBe(true);
    });
  });
});
