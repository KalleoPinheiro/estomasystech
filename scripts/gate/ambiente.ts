/**
 * Ambiente do gate (#571, ADR-071): o gate não depende do shell de quem o roda. Fuso, memória do
 * Node, porta do Postgres do compose, projeto do compose e segredos da etapa Docker são fixados
 * aqui, e as sobras de rodadas anteriores são apagadas antes da primeira etapa.
 *
 * Na v0.2.0 o gate repetiu quatro vezes por ambiente sujo: `.stryker-tmp` no lint, fuso do shell
 * nos testes e Postgres local ocupando a 5432 na etapa `backup`, que não recebia a porta da `docker`.
 */
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

/** Primeira porta tentada para o Postgres do compose; a 5432 fica livre para o banco do operador. */
export const GATE_POSTGRES_PORT = 55432;
/** Projeto do compose do gate: `down -v` nunca derruba a pilha do `ambiente:local` do operador. */
export const GATE_COMPOSE_PROJECT = 'estomasystech-gate';
/** Memória do Node no gate (build + cobertura); a 4096 do `npm run build` não basta para a suíte. */
export const GATE_NODE_MEMORY = '--max-old-space-size=8192';
/** Sobras de rodadas anteriores (mutação, relatórios) que não podem cair no lint nem no recibo. */
export const LEFTOVERS = ['.stryker-tmp', 'reports'] as const;

/** Variáveis de ambiente (sem o `NODE_ENV` obrigatório do `NodeJS.ProcessEnv`). */
export type Env = Record<string, string | undefined>;

export type PortCheck = (port: number) => Promise<boolean>;

/** Primeira porta livre a partir de `start`, olhando no máximo `tries` portas. */
export async function freePort(start: number, isBusy: PortCheck, tries = 50): Promise<number> {
  for (let port = start; port < start + tries; port++) {
    if (!(await isBusy(port))) return port;
  }
  throw new Error(`nenhuma porta livre entre ${start} e ${start + tries - 1}`);
}

/** Porta ocupada no loopback, onde o compose publica o Postgres. */
export const isPortBusy: PortCheck = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(false)));
  });

/**
 * Porta do Postgres do gate. Só `GATE_POSTGRES_PORT` força outra; o `POSTGRES_PORT` do shell é
 * ignorado de propósito (costuma ser 5432, copiado do `.env`).
 */
export async function gatePostgresPort(env: Env, isBusy: PortCheck = isPortBusy): Promise<number> {
  const forced = Number(env.GATE_POSTGRES_PORT);
  if (Number.isInteger(forced) && forced > 0) return forced;
  return freePort(GATE_POSTGRES_PORT, isBusy);
}

function withNodeMemory(current: string | undefined): string {
  const rest = (current ?? '').replace(/--max-old-space-size=\d+/g, '').trim();
  return [rest, GATE_NODE_MEMORY].filter(Boolean).join(' ');
}

/**
 * Ambiente de toda etapa do gate: `TZ=UTC` (o mesmo do Actions e do vitest), memória do Node,
 * `CI=1`, a porta e o projeto do compose.
 */
export function gateEnv(base: Env, postgresPort: number): Env {
  return {
    ...base,
    CI: '1',
    TZ: 'UTC',
    NODE_OPTIONS: withNodeMemory(base.NODE_OPTIONS),
    POSTGRES_PORT: String(postgresPort),
    COMPOSE_PROJECT_NAME: GATE_COMPOSE_PROJECT,
  };
}

export interface DisposableSecrets {
  POSTGRES_PASSWORD: string;
  AUTH_SECRET: string;
  DATA_ENCRYPTION_KEY: string;
}

export const disposableSecrets = (random: (bytes: number) => string = (n) => randomBytes(n).toString('hex')): DisposableSecrets => ({
  POSTGRES_PASSWORD: random(16),
  AUTH_SECRET: random(32),
  DATA_ENCRYPTION_KEY: random(32),
});

/**
 * Ambiente das etapas Docker: segredos descartáveis sempre (nunca os do `.env` do operador) e sem
 * `TZ`, para o container usar o fuso de produção que o compose define (`America/Sao_Paulo`).
 */
export function dockerEnv(env: Env, secrets: DisposableSecrets): Env {
  const { TZ: _tz, ...rest } = env;
  return {
    ...rest,
    ...secrets,
    RESEND_API_KEY: 're_smoke_invalid_key',
    EMAIL_FROM: 'EstomaSysTech Smoke <smoke@estomasystech.test>',
  };
}
