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

const profActions = () =>
  import('@/app/(staff)/profissionais/professional-actions');
const partnerActions = () => import('@/app/(staff)/parceiros/partner-actions');
const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

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
  refreshed.mockClear();
  cookieStore.value = sessionToken(
    'company_admin',
    'admin@clinica.com',
    undefined,
    CLINIC_A_ID,
  );
});

describe('Feature: ações de Profissionais e Parceiros gravam e auditam na mesma transação (#550, Postgres real)', () => {
  it('Dado profissional, Quando o Admin salva o horário, Então horário e trilha ficam gravados e a tela é atualizada', async () => {
    const { createProfessional, saveAvailability } = await profActions();
    const created = await createProfessional({
      fullName: `Profissional integração ${Math.random()}`,
    });
    const professionalId = (created.data as NonNullable<typeof created.data>)
      .id;
    refreshed.mockClear();
    const monday = { weekday: 1, startMinute: 480, endMinute: 720 };

    const result = await saveAvailability({
      professionalId,
      windows: [monday],
    });

    expect(result.success).toBe(true);
    const { scheduleAvailability, auditEvents } = await repos();
    expect(
      await scheduleAvailability.getProfessionalHours(professionalId),
    ).toEqual([monday]);
    expect(
      (await auditEvents.findAll()).filter(
        (e) =>
          e.resourceId === professionalId &&
          e.resourceType === 'professional-availability',
      ),
    ).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando o Admin cadastra um profissional, Então nada é gravado e a tela não é atualizada', async () => {
    const { createProfessional } = await profActions();
    const fullName = `Profissional rollback ${Math.random()}`;
    await breakAudit();

    try {
      const result = await createProfessional({ fullName });

      expect(result.success).toBe(false);
      expect(
        (await (await repos()).professionals.findAll()).map((p) => p.fullName),
      ).not.toContain(fullName);
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }
  });

  it('Dado que a gravação da auditoria falha, Quando o Admin cadastra um parceiro, Então nada é gravado', async () => {
    const { createPartner } = await partnerActions();
    const email = `rollback-${Math.random()}@parceiro.com`;
    await breakAudit();

    try {
      const result = await createPartner({
        fullName: 'Parceiro rollback',
        email,
        phone: '11999999999',
      });

      expect(result.success).toBe(false);
      expect(await (await repos()).partners.findByEmail(email)).toBeNull();
    } finally {
      await repairAudit();
    }
  });
});
