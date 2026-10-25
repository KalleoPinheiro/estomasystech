import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = { value: undefined as string | undefined };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'e2e-fault' && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));

import { failIfInjected } from '@/lib/server/test-faults';

describe('Feature: gancho de falha de leitura para o E2E (#551)', () => {
  beforeEach(() => {
    cookieStore.value = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Dado o gancho desligado (produção), Quando o cookie pede a falha, Então a leitura segue normal', async () => {
    cookieStore.value = 'consultas';

    await expect(failIfInjected('consultas')).resolves.toBeUndefined();
  });

  it('Dado o gancho ligado e o cookie pedindo a leitura, Quando ela roda, Então falha', async () => {
    vi.stubEnv('ESTOMASYSTECH_E2E_FAULTS', '1');
    cookieStore.value = 'contagem,consultas';

    await expect(failIfInjected('consultas')).rejects.toThrow(
      'Falha simulada pelo teste E2E (consultas)',
    );
  });

  it('Dado o gancho ligado, Quando o cookie pede outra leitura ou não existe, Então a leitura segue normal', async () => {
    vi.stubEnv('ESTOMASYSTECH_E2E_FAULTS', '1');
    cookieStore.value = 'contagem';
    await expect(failIfInjected('consultas')).resolves.toBeUndefined();

    cookieStore.value = undefined;
    await expect(failIfInjected('consultas')).resolves.toBeUndefined();
  });
});
