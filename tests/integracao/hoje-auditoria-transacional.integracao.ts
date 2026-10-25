import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowUp } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient } from '../support/builders';
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

const seedFollowUp = async () => {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const patient = buildPatient();
  await repos.patients.save(patient);
  const followUp = FollowUp.create({
    patientId: patient.id,
    appointmentId: null,
    dueDate: new Date('2026-10-30T12:00:00Z'),
    reason: 'Retorno: avaliação de ferida',
  });
  await repos.followUps.save(followUp);
  return { repos, followUp };
};

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
  cookieStore.value = sessionToken(
    'atendente',
    'atendente@clinica.com',
    undefined,
    CLINIC_A_ID,
  );
});

describe('Feature: ações da tela Hoje gravam e auditam na mesma transação (ADR-075, Postgres real)', () => {
  it('Dado um retorno pendente, Quando a atendente conclui, Então o retorno e o evento de auditoria ficam gravados e a tela é atualizada', async () => {
    const { repos, followUp } = await seedFollowUp();
    const { resolveFollowUp } = await import('@/app/(staff)/hoje-actions');

    const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

    expect(result.success).toBe(true);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe('done');
    const events = await repos.auditEvents.findAll();
    expect(
      events.filter(
        (e) => e.resourceId === followUp.id && e.detail === 'retorno: done',
      ),
    ).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando a atendente conclui o retorno, Então a transação desfaz tudo: o retorno segue pendente e a tela não é atualizada', async () => {
    const { repos, followUp } = await seedFollowUp();
    await (await getDb()).execute(
      sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada CHECK (false) NOT VALID`,
    );
    const { resolveFollowUp } = await import('@/app/(staff)/hoje-actions');

    try {
      const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

      expect(result.success).toBe(false);
      expect((await repos.followUps.findById(followUp.id))?.status).toBe(
        'pending',
      );
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await (await getDb()).execute(
        sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada`,
      );
    }
  });
});
