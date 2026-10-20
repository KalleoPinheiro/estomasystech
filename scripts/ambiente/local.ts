/**
 * Ambiente local completo (issue #404):
 *   npm run ambiente:local        sobe Postgres 18 + app (compose), migra, semeia e imprime URL/contas
 *   npm run ambiente:local:down   derruba e apaga o volume e os segredos descartáveis
 *   npm run test:integracao       suíte de integração contra o Postgres do compose (não PGlite)
 * Exige o daemon Docker (exceto `test:integracao` com INTEGRATION_DATABASE_URL local).
 */
import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertLocalEnvironment,
  composeArgs,
  composeEnv,
  DEFAULT_APP_PORT,
  DEFAULT_DB_PORT,
  type LocalPorts,
  type LocalSecrets,
  localDatabaseUrl,
  newSecrets,
  parsePort,
  seedEnv,
  STATE_DIR,
  summary,
} from './config';

const SECRETS_FILE = path.join(STATE_DIR, 'segredos.json');

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function run(cmd: string, args: string[], env: Record<string, string> = {}, options: SpawnSyncOptions = {}): void {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, ...options });
  if (result.status !== 0) {
    fail(`falhou: ${cmd} ${args.join(' ')}`);
  }
}

function requireDocker(): void {
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    fail('daemon Docker indisponível. Ligue o Docker (no WSL: Docker Desktop ou dockerd) e rode de novo.');
  }
}

/** Segredos descartáveis persistem entre execuções: o volume do banco guarda a senha antiga. */
function loadSecrets(): LocalSecrets {
  if (existsSync(SECRETS_FILE)) {
    return JSON.parse(readFileSync(SECRETS_FILE, 'utf8')) as LocalSecrets;
  }
  const secrets = newSecrets();
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SECRETS_FILE, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  return secrets;
}

function loadPorts(): LocalPorts {
  return {
    app: parsePort(process.env.APP_PORT, DEFAULT_APP_PORT),
    db: parsePort(process.env.POSTGRES_PORT, DEFAULT_DB_PORT),
  };
}

function up(): void {
  assertLocalEnvironment();
  requireDocker();
  const secrets = loadSecrets();
  const ports = loadPorts();
  // O app migra no boot (advisory lock); `--wait` espera o healthcheck do banco e do app.
  run('docker', composeArgs('up', '-d', '--build', '--wait'), composeEnv(secrets, ports));
  run('npx', ['tsx', 'scripts/seed/run.ts'], seedEnv(secrets, ports));
  console.log(summary(secrets, ports));
}

function down(): void {
  requireDocker();
  const secrets = loadSecrets();
  run('docker', composeArgs('down', '-v', '--remove-orphans'), composeEnv(secrets, loadPorts()));
  rmSync(STATE_DIR, { recursive: true, force: true });
  console.log('Ambiente local derrubado; volumes e segredos descartáveis apagados.');
}

/** URL do Postgres da suíte: a informada (local) ou o `db` do compose, subindo-o se preciso. */
function integrationDatabaseUrl(): string {
  assertLocalEnvironment();
  const given = process.env.INTEGRATION_DATABASE_URL;
  if (given) {
    assertLocalEnvironment({ ...process.env, DATABASE_URL: given });
    return given;
  }
  requireDocker();
  const secrets = loadSecrets();
  const ports = loadPorts();
  run('docker', composeArgs('up', '-d', '--wait', 'db'), composeEnv(secrets, ports));
  return localDatabaseUrl(secrets, ports.db);
}

function integracao(extra: string[]): void {
  const url = integrationDatabaseUrl();
  run('npx', ['vitest', 'run', '-c', 'vitest.integracao.config.mts', ...extra], {
    INTEGRATION_DATABASE_URL: url,
    // Uma conexão por arquivo, como o PGlite: os testes antigos leem logo após o `after()` sem esperar
    // (auditoria, por exemplo) e contam com a fila única. Concorrência real: tests/integracao.
    PG_POOL_MAX: '1',
  });
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, () => void> = {
  up,
  down,
  integracao: () => integracao(rest),
};
const handler = command ? commands[command] : undefined;
if (!handler) {
  fail(`uso: tsx scripts/ambiente/local.ts <${Object.keys(commands).join('|')}>`);
}
try {
  handler();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
