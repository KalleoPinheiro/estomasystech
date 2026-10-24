import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  disposableSecrets,
  dockerEnv,
  freePort,
  GATE_COMPOSE_PROJECT,
  GATE_POSTGRES_PORT,
  gateEnv,
  gatePostgresPort,
  isPortBusy,
  LEFTOVERS,
} from '../../scripts/gate/ambiente';

const busy = (ports: number[]) => async (port: number) => ports.includes(port);

describe('Feature: gate independente do ambiente do operador (#571, ADR-071)', () => {
  it('Dado um Postgres local na 5432, Quando o gate escolhe a porta, Então usa 55432', async () => {
    expect(GATE_POSTGRES_PORT).toBe(55432);
    expect(
      await gatePostgresPort({ POSTGRES_PORT: '5432' }, busy([5432])),
    ).toBe(55432);
  });

  it('Dado a 55432 ocupada, Quando o gate escolhe a porta, Então pega a próxima livre', async () => {
    expect(await gatePostgresPort({}, busy([55432, 55433]))).toBe(55434);
  });

  it('Dado GATE_POSTGRES_PORT definido, Então essa porta vence', async () => {
    expect(
      await gatePostgresPort({ GATE_POSTGRES_PORT: '61000' }, busy([])),
    ).toBe(61000);
  });

  it('Dado todas as portas ocupadas, Então falha com mensagem clara', async () => {
    await expect(freePort(100, async () => true, 3)).rejects.toThrow(
      'nenhuma porta livre entre 100 e 102',
    );
  });

  it('Dado uma porta em uso no loopback, Então isPortBusy a reconhece', async () => {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    expect(await isPortBusy(port)).toBe(true);
    await new Promise<void>((r) => server.close(() => r()));
    expect(await isPortBusy(port)).toBe(false);
  });

  it('Dado o shell em São Paulo e NODE_OPTIONS próprio, Quando monta o ambiente, Então fixa UTC, memória, porta e projeto', () => {
    const env = gateEnv(
      {
        TZ: 'America/Sao_Paulo',
        NODE_OPTIONS: '--max-old-space-size=2048 --trace-warnings',
        PATH: '/bin',
      },
      55433,
    );
    expect(env).toMatchObject({
      CI: '1',
      TZ: 'UTC',
      POSTGRES_PORT: '55433',
      COMPOSE_PROJECT_NAME: GATE_COMPOSE_PROJECT,
      PATH: '/bin',
      NODE_OPTIONS: '--trace-warnings --max-old-space-size=8192',
    });
    expect(gateEnv({}, 55432).NODE_OPTIONS).toBe('--max-old-space-size=8192');
  });

  it('Dado segredos reais no .env, Quando monta o ambiente Docker, Então usa só segredos descartáveis e o fuso do compose', () => {
    const secrets = disposableSecrets();
    const env = dockerEnv(
      { TZ: 'UTC', AUTH_SECRET: 'segredo-real', POSTGRES_PORT: '55432' },
      secrets,
    );
    expect(env.AUTH_SECRET).toBe(secrets.AUTH_SECRET);
    expect(env.AUTH_SECRET).not.toBe('segredo-real');
    expect(env.TZ).toBeUndefined();
    expect(env.POSTGRES_PORT).toBe('55432');
    expect(env.RESEND_API_KEY).toBe('re_smoke_invalid_key');
    expect(secrets.AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(secrets.POSTGRES_PASSWORD).toMatch(/^[0-9a-f]{32}$/);
    expect(disposableSecrets().AUTH_SECRET).not.toBe(secrets.AUTH_SECRET);
  });

  it('Então apaga as sobras da mutação e dos relatórios antes de rodar', () => {
    expect(LEFTOVERS).toEqual(['.stryker-tmp', 'reports']);
  });
});
