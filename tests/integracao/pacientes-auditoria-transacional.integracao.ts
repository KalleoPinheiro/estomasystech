import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildProfessional } from '../support/builders';
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

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  professionalId: string | null = null,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    CLINIC_A_ID,
    professionalId,
  );
};

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
});

describe('Feature: cadastro de paciente grava, vincula e audita na mesma transação (ADR-075, Postgres real)', () => {
  it('Dado a atendente, Quando cadastra, Então o paciente e o evento de auditoria ficam gravados e a tela é atualizada', async () => {
    signIn('atendente');
    const { createPatient } = await import('@/app/(staff)/pacientes/actions');

    const result = await createPatient({
      fullName: 'Integração Atendente',
      phone: '+5511977776666',
    });

    expect(result.success).toBe(true);
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(
      await repos.patients.findById(result.data?.id as string),
    ).not.toBeNull();
    const events = await repos.auditEvents.findAll();
    expect(
      events.filter(
        (e) => e.resourceId === result.data?.id && e.action === 'create',
      ),
    ).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando o profissional cadastra, Então a transação desfaz tudo: sem paciente, sem vínculo e sem atualizar a tela', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    signIn('profissional', professional.id);
    await (await getDb()).execute(
      sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada_pac CHECK (false) NOT VALID`,
    );
    const { createPatient } = await import('@/app/(staff)/pacientes/actions');

    try {
      const result = await createPatient({
        fullName: 'Integração Desfeita',
        phone: '+5511977776666',
      });

      expect(result.success).toBe(false);
      expect(await repos.patients.findAll('Integração Desfeita')).toHaveLength(
        0,
      );
      expect(
        await repos.professionalPatientLinks.findLinkedPatientIds(
          professional.id,
        ),
      ).toEqual([]);
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await (await getDb()).execute(
        sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada_pac`,
      );
    }
  });
});
