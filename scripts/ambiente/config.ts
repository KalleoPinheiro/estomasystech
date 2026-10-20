/**
 * Regras puras do ambiente local completo (issue #404): guarda de banco, segredos
 * descartáveis, argumentos do compose e o resumo impresso. Sem I/O, para testar sem Docker.
 * O fluxo que usa isto é `scripts/ambiente/local.ts`.
 */
import { randomBytes } from 'node:crypto';
import { assertNotProductionDatabase, resolveAppEnv } from '../../src/lib/runtime-env';

/** Projeto do compose: volumes próprios, sem colidir com `docker compose up` do dia a dia. */
export const PROJECT = 'estomasystech-local';
export const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.local.yml'] as const;
export const STATE_DIR = '.ambiente-local';
export const DEFAULT_APP_PORT = 3000;
export const DEFAULT_DB_PORT = 55_432;

/** Únicos hosts aceitos: o banco do ambiente local nunca é remoto. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'db']);

/** Contas fictícias do seed (docs/engineering/homologacao.md § 4). */
export const FICTIONAL_ACCOUNTS = [
  ['super@homologacao.invalid', 'super_admin', 'plataforma'],
  ['admin@homologacao.invalid', 'company_admin', 'clínica principal'],
  ['atendente@homologacao.invalid', 'atendente', 'sem dado clínico'],
  ['profissional@homologacao.invalid', 'profissional', 'evolução e prontuário'],
  ['admin-suspensa@homologacao.invalid', 'company_admin', 'erro: clínica suspensa, login negado'],
] as const;

export interface LocalSecrets {
  postgresPassword: string;
  authSecret: string;
  dataEncryptionKey: string;
  seedPassword: string;
}

export interface LocalPorts {
  app: number;
  db: number;
}

type Env = Readonly<Record<string, string | undefined>>;

export function newSecrets(random: (bytes: number) => string = (n) => randomBytes(n).toString('hex')): LocalSecrets {
  return {
    postgresPassword: random(16),
    authSecret: random(32),
    dataEncryptionKey: random(32),
    seedPassword: `local-${random(6)}`,
  };
}

export function localDatabaseUrl(secrets: LocalSecrets, port: number): string {
  return `postgres://estomasystech:${secrets.postgresPassword}@127.0.0.1:${port}/estomasystech`;
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    throw new Error('DATABASE_URL inválida.');
  }
}

/**
 * Guarda do ADR-041 aplicada ao ambiente local: recusa produção (`APP_ENV`,
 * `NODE_ENV=production`), host listado em `PRODUCTION_DB_HOSTS` e qualquer banco que não
 * seja da própria máquina. Dado real nunca entra aqui (LGPD).
 */
export function assertLocalEnvironment(env: Env = process.env): void {
  if (resolveAppEnv(env) === 'production') {
    throw new Error('Ambiente local recusado em produção (APP_ENV=production ou NODE_ENV=production).');
  }
  const url = env.DATABASE_URL;
  if (!url) {
    return;
  }
  assertNotProductionDatabase(url, env);
  if (!LOCAL_HOSTS.has(hostOf(url))) {
    throw new Error(
      `Ambiente local só usa banco da própria máquina; DATABASE_URL aponta para "${hostOf(url)}". Remova a variável.`,
    );
  }
}

/** Variáveis lidas pelo compose (`docker-compose.yml` + `docker-compose.local.yml`). */
export function composeEnv(secrets: LocalSecrets, ports: LocalPorts): Record<string, string> {
  return {
    POSTGRES_PASSWORD: secrets.postgresPassword,
    POSTGRES_PORT: String(ports.db),
    APP_PORT: String(ports.app),
    AUTH_SECRET: secrets.authSecret,
    DATA_ENCRYPTION_KEY: secrets.dataEncryptionKey,
    APP_URL: `http://localhost:${ports.app}`,
  };
}

/** Ambiente do seed rodado no host contra o Postgres do compose (porta só no loopback). */
export function seedEnv(secrets: LocalSecrets, ports: LocalPorts): Record<string, string> {
  return {
    APP_ENV: 'development',
    DATABASE_URL: localDatabaseUrl(secrets, ports.db),
    DATA_ENCRYPTION_KEY: secrets.dataEncryptionKey,
    AUTH_SECRET: secrets.authSecret,
    STAGING_SEED_PASSWORD: secrets.seedPassword,
  };
}

export function composeArgs(...rest: string[]): string[] {
  return ['compose', '-p', PROJECT, ...COMPOSE_FILES.flatMap((file) => ['-f', file]), ...rest];
}

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`Porta inválida: "${value}" (use 1024 a 65535).`);
  }
  return port;
}

export function summary(secrets: LocalSecrets, ports: LocalPorts): string {
  const rows = FICTIONAL_ACCOUNTS.map(([email, role, scenario]) => `  ${email.padEnd(36)} ${role.padEnd(14)} ${scenario}`);
  return [
    '',
    'Ambiente local pronto (Postgres 18 + app + massa fictícia).',
    `  App:    http://localhost:${ports.app}`,
    `  Banco:  ${localDatabaseUrl({ ...secrets, postgresPassword: '***' }, ports.db)}`,
    `  Senha das contas: ${secrets.seedPassword}  (segundo fator: QR no primeiro login)`,
    '',
    ...rows,
    '',
    'Suíte contra este Postgres: npm run test:integracao',
    'Derrubar e apagar o volume:  npm run ambiente:local:down',
    '',
  ].join('\n');
}
