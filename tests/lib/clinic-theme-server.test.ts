import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLINIC_THEME } from '@/domain/clinic/clinic-identity';

const cookieValue = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));
const findById = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (cookieValue.value ? { value: cookieValue.value } : undefined),
  }),
}));
vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => ({ clinics: { findById } }),
}));
vi.mock('@/lib/log-error', () => ({ logError }));

import { loadClinicTheme } from '@/lib/clinic-theme-server';
import { sessionToken } from '../support/session';

beforeEach(() => {
  cookieValue.value = undefined;
  findById.mockReset();
  logError.mockReset();
});

describe('Feature: Tema da clínica no servidor (#426)', () => {
  it('Dado visitante sem sessão (login), Então vale o padrão e o banco não é consultado', async () => {
    expect(await loadClinicTheme()).toEqual(DEFAULT_CLINIC_THEME);
    expect(findById).not.toHaveBeenCalled();
  });

  it('Dada sessão com assinatura inválida, Então vale o padrão', async () => {
    cookieValue.value = 'lixo.assinatura';
    expect(await loadClinicTheme()).toEqual(DEFAULT_CLINIC_THEME);
    expect(findById).not.toHaveBeenCalled();
  });

  it('Dada sessão de plataforma (sem clínica), Então vale o padrão', async () => {
    cookieValue.value = sessionToken(
      'super_admin',
      'p@x.test',
      Date.now() + 1000,
      null,
    );
    expect(await loadClinicTheme()).toEqual(DEFAULT_CLINIC_THEME);
    expect(findById).not.toHaveBeenCalled();
  });

  it('Dada sessão de equipe, Então devolve o tema da clínica dela', async () => {
    cookieValue.value = sessionToken(
      'atendente',
      'a@x.test',
      Date.now() + 1000,
      'c1',
    );
    findById.mockResolvedValue({ theme: { mode: 'dark', accent: 'amber' } });
    expect(await loadClinicTheme()).toEqual({ mode: 'dark', accent: 'amber' });
    expect(findById).toHaveBeenCalledWith('c1');
  });

  it('Dada clínica que não existe mais, Então vale o padrão', async () => {
    cookieValue.value = sessionToken(
      'atendente',
      'a@x.test',
      Date.now() + 1000,
      'c1',
    );
    findById.mockResolvedValue(null);
    expect(await loadClinicTheme()).toEqual(DEFAULT_CLINIC_THEME);
  });

  it('Dada falha no banco, Então vale o padrão, registra o erro e a página não cai', async () => {
    cookieValue.value = sessionToken(
      'atendente',
      'a@x.test',
      Date.now() + 1000,
      'c1',
    );
    const falha = new Error('banco fora');
    findById.mockRejectedValue(falha);

    expect(await loadClinicTheme()).toEqual(DEFAULT_CLINIC_THEME);
    expect(logError).toHaveBeenCalledWith(
      'Tema da clínica: usando o padrão',
      falha,
    );
  });

  it('Dado ambiente sem AUTH_SECRET, Então vale o padrão', async () => {
    const secret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      expect(await loadClinicTheme()).toEqual(DEFAULT_CLINIC_THEME);
    } finally {
      process.env.AUTH_SECRET = secret;
    }
  });
});
