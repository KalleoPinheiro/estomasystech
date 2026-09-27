import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #191: o `docker-compose.yml` e o `Dockerfile` do repositório são o
 * caminho de execução documentado e precisam ser seguros por padrão. Sem
 * Docker na suíte, a verificação é textual sobre os dois arquivos; o CI
 * constrói a imagem e faz o smoke de verdade (#203).
 */
const root = path.resolve(import.meta.dirname, '../..');
const compose = readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

/** Bloco de um serviço do compose (até o próximo serviço de 2 espaços ou raiz). */
function serviceBlock(name: string): string {
  const lines = compose.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

describe('Feature: compose e Dockerfile seguros para produção (#191)', () => {
  it('C4 compose publica o Postgres só no loopback', () => {
    const db = serviceBlock('db');
    const ports = db.match(/^ {6}- "(.+:5432)"$/gm) ?? [];

    expect(ports).toHaveLength(1);
    expect(ports[0]).toMatch(
      /- "127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432"$/,
    );
  });

  it('C5 senha do Postgres é obrigatória e entra no DATABASE_URL', () => {
    const db = serviceBlock('db');
    const app = serviceBlock('app');

    expect(db).toMatch(/POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?/);
    expect(db).not.toMatch(/POSTGRES_PASSWORD: vitta\b/);
    expect(app).toMatch(
      /DATABASE_URL: postgres:\/\/vitta:\$\{POSTGRES_PASSWORD:\?[^}]*\}@db:5432\/vitta/,
    );
  });

  it('C6 app monta volume nomeado em /app/uploads', () => {
    const app = serviceBlock('app');

    expect(app).toMatch(/^ {6}- uploads:\/app\/uploads$/m);
    expect(compose).toMatch(/^volumes:\n(?: {2}\S+:\n)*? {2}uploads:$/m);
  });

  it('C7 Dockerfile cria /app/uploads do nextjs antes do USER', () => {
    const runner = dockerfile.slice(dockerfile.indexOf('AS runner'));
    const mkdir = runner.indexOf(
      'RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads',
    );
    const user = runner.indexOf('USER nextjs');

    expect(mkdir).toBeGreaterThan(-1);
    expect(user).toBeGreaterThan(mkdir);
  });

  it('C8 Dockerfile define TZ e APP_TIMEZONE', () => {
    const runner = dockerfile.slice(dockerfile.indexOf('AS runner'));

    expect(runner).toMatch(/^ENV TZ=America\/Sao_Paulo$/m);
    expect(runner).toMatch(/^ENV APP_TIMEZONE=America\/Sao_Paulo$/m);
  });

  it('C9 compose repassa as variáveis opcionais', () => {
    const app = serviceBlock('app');
    const names = [
      'CRON_SECRET',
      'TRUSTED_PROXY_HOPS',
      'UPLOADS_DIR',
      'API_RATE_LIMIT_MAX',
      'PG_POOL_MAX',
      'PG_CONNECT_TIMEOUT_MS',
      'PG_IDLE_TIMEOUT_MS',
      'PG_STATEMENT_TIMEOUT_MS',
    ];

    for (const name of names) {
      expect(app, name).toMatch(
        new RegExp(`^ {6}${name}: \\$\\{${name}:-`, 'm'),
      );
    }
  });

  it('C10 app tem healthcheck em /api/auth/providers', () => {
    const app = serviceBlock('app');
    const healthcheck = app.slice(app.indexOf('    healthcheck:'));

    expect(app).toContain('    healthcheck:');
    expect(healthcheck).toContain(
      "fetch('http://127.0.0.1:3000/api/auth/providers')",
    );
  });
});

const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** #195/#206: preparação para Vercel + Supabase e para VPS + compose. */
describe('Feature: configuração de deploy dos P1 de produção (#195, #206)', () => {
  it('vercel cron: vercel.json agenda GET /api/reminders/run uma vez por dia', () => {
    const config = JSON.parse(read('vercel.json')) as {
      crons: { path: string; schedule: string }[];
    };

    expect(config.crons).toEqual([
      {
        path: '/api/reminders/run',
        schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      },
    ]);
  });

  it('data key in compose and ci: produção não sobe sem DATA_ENCRYPTION_KEY em nenhuma montagem', () => {
    const app = serviceBlock('app');
    expect(app).toMatch(
      /^ {6}DATA_ENCRYPTION_KEY: \$\{DATA_ENCRYPTION_KEY:\?/m,
    );
    expect(app).toMatch(
      /^ {6}DATA_ENCRYPTION_KEY_PREVIOUS: \$\{DATA_ENCRYPTION_KEY_PREVIOUS:-\}/m,
    );
    expect(app).toMatch(/^ {6}S3_SSE: \$\{S3_SSE:-\}/m);

    expect(read('.github/workflows/ci.yml')).toMatch(
      /^ {10}DATA_ENCRYPTION_KEY: build-only$/m,
    );
    expect(read('scripts/docker-smoke.sh')).toContain(
      'export DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"',
    );
    expect(read('playwright.prod.config.ts')).toContain(
      'DATA_ENCRYPTION_KEY: E2E_DATA_ENCRYPTION_KEY',
    );
    expect(read('.env.example')).toMatch(/^DATA_ENCRYPTION_KEY=$/m);
  });

  it('runbook sections: producao.md cobre as duas topologias e a operação, e está linkado', () => {
    const runbook = read('docs/engineering/producao.md');
    for (const section of [
      '## 1. Perguntas abertas',
      '### Vercel + Supabase (alvo)',
      '### VPS + docker compose (alternativa pronta)',
      '## 3. TLS e URL pública',
      '## 4. Migrações',
      '## 5. Backup e restore',
      '## 6. Segredos e rotação',
      '## 7. Cron de lembretes',
      '## 8. Primeiro acesso',
    ]) {
      expect(runbook, section).toContain(section);
    }
    expect(runbook).toContain('npm run data:reencrypt');
    expect(runbook).toContain('npm run db:portal-orphans');
    expect(read('docs/README.md')).toContain('(engineering/producao.md)');
    expect(read('AGENTS.md')).toContain('(docs/engineering/producao.md)');

    const scripts = (
      JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    ).scripts;
    expect(scripts['data:reencrypt']).toBe(
      'tsx scripts/reencrypt-clinical-data.ts',
    );
    expect(scripts['db:portal-orphans']).toBe(
      'tsx scripts/report-portal-orphans.ts',
    );
  });
});
