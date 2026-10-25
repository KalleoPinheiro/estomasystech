import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { ActionResult } from '@/lib/action-result';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient } from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { sessionToken } from '../../support/session';

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
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  forbidden: vi.fn(),
}));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string | null = CLINIC_A_ID,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
  );
};

const patientsOf = async (clinicId: string) => {
  const { patients } = await getRepositories(clinicScope(clinicId));
  return patients.findAll();
};

const load = async () => {
  const { defineAction } = await import('@/lib/server/define-action');
  const handler = vi.fn(async ({ input, tx }) => {
    await tx.patients.save(buildPatient({ fullName: input.name }));
    return { saved: input.name };
  });
  const action = defineAction({
    access: { kind: 'staff', roles: ['company_admin', 'atendente'] },
    input: z.object({ name: z.string().min(3) }),
    handler,
    audit: ({ input }) => ({
      action: 'create',
      resourceType: 'patient',
      resourceId: input.name,
    }),
  });
  return { action, handler };
};

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: Server Action com guarda, zod, escopo e auditoria (ADR-069 § 2)', () => {
  it('Dado que não há sessão, Quando a ação é chamada, Então responde Não autenticado e não grava nada', async () => {
    const { action, handler } = await load();
    const before = (await patientsOf(CLINIC_A_ID)).length;

    const result = await action({ name: 'Sem Sessão' });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Não autenticado',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(refreshed).not.toHaveBeenCalled();
    expect(await patientsOf(CLINIC_A_ID)).toHaveLength(before);
  });

  it('Dado o papel profissional (fora da lista da ação), Quando chama, Então é recusado e nada é gravado', async () => {
    signIn('profissional');
    const { action, handler } = await load();
    const before = (await patientsOf(CLINIC_A_ID)).length;

    const result = await action({ name: 'Papel Errado' });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Seu papel não tem acesso a este recurso',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(await patientsOf(CLINIC_A_ID)).toHaveLength(before);
  });

  it.each(['patient', 'partner', 'super_admin'] as const)(
    'Dado o papel %s numa ação da equipe, Quando chama, Então é recusado como fora da equipe',
    async (role) => {
      signIn(role, role === 'super_admin' ? null : CLINIC_A_ID);
      const { action, handler } = await load();

      const result = await action({ name: 'Outra Familia' });

      expect(result.error).toBe('Acesso restrito à equipe da clínica');
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('Dado entrada inválida, Quando chama, Então responde os campos errados e o handler não roda', async () => {
    signIn('company_admin');
    const { action, handler } = await load();

    const result = await action({ name: 'ab' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Dados inválidos: name:/);
    expect(handler).not.toHaveBeenCalled();
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado admin da clínica A, Quando a ação grava, Então o dado fica só na clínica A, a auditoria também, e a tela é atualizada', async () => {
    signIn('company_admin', CLINIC_A_ID);
    const { action } = await load();

    const result = await action({ name: 'Paciente Da Clinica A' });

    expect(result).toEqual({
      success: true,
      data: { saved: 'Paciente Da Clinica A' },
      error: null,
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
    const names = (id: string) =>
      patientsOf(id).then((list) => list.map((p) => p.fullName));
    expect(await names(CLINIC_A_ID)).toContain('Paciente Da Clinica A');
    expect(await names(CLINIC_B_ID)).not.toContain('Paciente Da Clinica A');

    await vi.waitFor(async () => {
      const inA = await (
        await getRepositories(clinicScope(CLINIC_A_ID))
      ).auditEvents.findAll();
      const inB = await (
        await getRepositories(clinicScope(CLINIC_B_ID))
      ).auditEvents.findAll();
      expect(inA.map((e) => e.resourceId)).toContain('Paciente Da Clinica A');
      expect(inB.map((e) => e.resourceId)).not.toContain(
        'Paciente Da Clinica A',
      );
    });
  });

  it('Dado admin da clínica B, Quando a ação lê, Então não enxerga o paciente da clínica A', async () => {
    signIn('company_admin', CLINIC_A_ID);
    const { action } = await load();
    await action({ name: 'Segredo Da Clinica A' });

    signIn('company_admin', CLINIC_B_ID);
    const { defineAction } = await import('@/lib/server/define-action');
    const read = defineAction({
      access: { kind: 'staff' },
      input: z.object({}),
      handler: async ({ scope }) => {
        const { patients } = await getRepositories(scope);
        return (await patients.findAll()).map((p) => p.fullName);
      },
      audit: false,
    });

    const result = await read({});

    expect(result.success).toBe(true);
    expect((result as { data: string[] }).data).not.toContain(
      'Segredo Da Clinica A',
    );
  });

  it('Dado erro de domínio no handler, Quando chama, Então responde a mensagem e não atualiza a tela', async () => {
    signIn('company_admin');
    const { defineAction } = await import('@/lib/server/define-action');
    const failing = defineAction({
      access: { kind: 'staff' },
      input: z.object({}),
      handler: async () => {
        throw new ValidationError('Nome já cadastrado');
      },
      audit: false,
    });

    const result: ActionResult<never> = await failing({});

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Nome já cadastrado',
    });
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado erro inesperado no handler, Quando chama, Então responde mensagem genérica, sem vazar o erro', async () => {
    signIn('company_admin');
    const { defineAction } = await import('@/lib/server/define-action');
    const failing = defineAction({
      access: { kind: 'staff' },
      input: z.object({}),
      handler: async () => {
        throw new Error('select * from patients where cpf = 123.456.789-00');
      },
      audit: false,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await failing({});

    expect(result.error).toBe('Erro interno do servidor');
  });

  it('Dado ação do portal e da plataforma, Quando chamadas pelo papel certo e pelo errado, Então só o certo executa', async () => {
    const { defineAction } = await import('@/lib/server/define-action');
    const portal = defineAction({
      access: { kind: 'portal', roles: ['partner'] },
      input: z.object({}),
      handler: async ({ session }) => session.role,
      audit: false,
    });
    const platform = defineAction({
      access: { kind: 'platform' },
      input: z.object({}),
      handler: async ({ session }) => session.role,
      audit: false,
    });

    signIn('partner');
    expect(await portal({})).toMatchObject({ success: true, data: 'partner' });
    expect((await platform({})).error).toBe(
      'Acesso restrito à equipe da clínica',
    );

    signIn('patient');
    expect((await portal({})).error).toBe(
      'Seu papel não tem acesso a este recurso',
    );

    signIn('atendente');
    expect((await portal({})).error).toBe(
      'Acesso restrito à equipe da clínica',
    );

    signIn('super_admin', null);
    expect(await platform({})).toMatchObject({
      success: true,
      data: 'super_admin',
    });
  });

  it('Dado que a auditoria falha, Quando a ação grava, Então nada fica gravado e a ação responde erro (ADR-075)', async () => {
    signIn('company_admin', CLINIC_A_ID);
    const { defineAction } = await import('@/lib/server/define-action');
    const action = defineAction({
      access: { kind: 'staff' },
      input: z.object({ name: z.string() }),
      handler: async ({ input, tx }) => {
        await tx.patients.save(buildPatient({ fullName: input.name }));
        return input.name;
      },
      audit: () => {
        throw new Error('trilha indisponível');
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await action({ name: 'Sem Trilha Nao Grava' });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Erro interno do servidor',
    });
    expect(refreshed).not.toHaveBeenCalled();
    const names = (await patientsOf(CLINIC_A_ID)).map((p) => p.fullName);
    expect(names).not.toContain('Sem Trilha Nao Grava');
  });

  it('Dado que o handler falha depois de gravar, Quando a ação roda, Então a gravação é desfeita e nenhuma auditoria fica', async () => {
    signIn('company_admin', CLINIC_A_ID);
    const { defineAction } = await import('@/lib/server/define-action');
    const action = defineAction({
      access: { kind: 'staff' },
      input: z.object({ name: z.string() }),
      handler: async ({ input, tx }) => {
        await tx.patients.save(buildPatient({ fullName: input.name }));
        throw new ValidationError('Regra violada');
      },
      audit: ({ input }) => ({
        action: 'create',
        resourceType: 'patient',
        resourceId: input.name,
      }),
    });

    const result = await action({ name: 'Desfeito Por Erro' });

    expect(result.error).toBe('Regra violada');
    const names = (await patientsOf(CLINIC_A_ID)).map((p) => p.fullName);
    expect(names).not.toContain('Desfeito Por Erro');
    const events = await (
      await getRepositories(clinicScope(CLINIC_A_ID))
    ).auditEvents.findAll();
    expect(events.map((e) => e.resourceId)).not.toContain('Desfeito Por Erro');
  });
});
