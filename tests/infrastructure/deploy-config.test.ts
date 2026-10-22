import { existsSync, readFileSync } from 'node:fs';
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
    expect(db).not.toMatch(/POSTGRES_PASSWORD: estomasystech\b/);
    expect(app).toMatch(
      /DATABASE_URL: postgres:\/\/estomasystech:\$\{POSTGRES_PASSWORD:\?[^}]*\}@db:5432\/estomasystech/,
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

  it('C10 app tem healthcheck na liveness /api/health (#212, OBS-03)', () => {
    const app = serviceBlock('app');
    const healthcheck = app.slice(app.indexOf('    healthcheck:'));

    expect(app).toContain('    healthcheck:');
    expect(healthcheck).toContain("fetch('http://127.0.0.1:3000/api/health')");
  });

  it('C10b Dockerfile usa a liveness, que não depende do banco (#212, OBS-03)', () => {
    const healthcheck = dockerfile.slice(dockerfile.indexOf('HEALTHCHECK'));

    expect(healthcheck).toContain("fetch('http://127.0.0.1:3000/api/health')");
    expect(healthcheck).not.toContain('/api/health/ready');
  });

  it('C10c GlitchTip fica em arquivo próprio, sem porta pública e sem cadastro aberto (#212)', () => {
    const glitchtip = readFileSync(
      path.join(root, 'docker-compose.glitchtip.yml'),
      'utf8',
    );
    const prod = readFileSync(
      path.join(root, 'docker-compose.prod.yml'),
      'utf8',
    );

    expect(glitchtip).toContain('image: glitchtip/glitchtip:v6');
    expect(glitchtip).toContain('- "127.0.0.1:8000:8000"');
    expect(glitchtip).toContain('ENABLE_USER_REGISTRATION: "false"');
    expect(glitchtip).toMatch(/SECRET_KEY: \$\{GLITCHTIP_SECRET_KEY:\?/);
    expect(prod).not.toContain('glitchtip');
    expect(compose).toMatch(/^ {6}GLITCHTIP_DSN: \$\{GLITCHTIP_DSN:-\}$/m);
  });
});

const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** #195/#206: preparação para Vercel + Supabase e para VPS + compose. */
describe('Feature: configuração de deploy dos P1 de produção (#195, #206)', () => {
  it('vercel: só a branch staging gera deploy (ADR-061), as demais ficam desligadas', () => {
    const config = JSON.parse(read('vercel.json')) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    expect(config.git?.deploymentEnabled).toEqual({
      '**': false,
      staging: true,
    });
  });

  it('vercel cron: vercel.json agenda GET dos lembretes e da retenção (#294) uma vez por dia', () => {
    const config = JSON.parse(read('vercel.json')) as {
      crons: { path: string; schedule: string }[];
    };

    expect(config.crons).toEqual([
      {
        path: '/api/reminders/run',
        schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      },
      {
        path: '/api/retention/run',
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

    expect(read('.github/workflows/docker.yml')).toMatch(
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

  it('runbook sections: producao.md cobre a VPS decidida e a operação, e está linkado', () => {
    const runbook = read('docs/engineering/producao.md');
    for (const section of [
      '## 1. Decisões',
      '## 2. Topologia e provisionamento',
      '### Homologação na Vercel (não é produção)',
      '## 3. TLS, URL pública e proxy',
      '## 4. Migrações',
      '## 5. Backup e restore',
      '## 6. Segredos e rotação',
      '## 7. Cron (lembretes, backup, retenção, alertas)',
      '## 8. Primeiro acesso',
      '## 9. Monitoramento e alertas',
    ]) {
      expect(runbook, section).toContain(section);
    }
    for (const issue of ['issues/212', 'issues/216', 'issues/294']) {
      expect(runbook, issue).toContain(issue);
    }
    expect(runbook).toContain('TRUSTED_PROXY_HOPS=1');
    expect(runbook).toContain('/api/retention/run');
    expect(runbook).toContain(
      'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml',
    );
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

  it('admin:recover: package.json roda o script de recuperação do super_admin (B3)', () => {
    const scripts = (
      JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    ).scripts;
    expect(scripts['admin:recover']).toBe('tsx scripts/recover-super-admin.ts');
    expect(read('docs/engineering/producao.md')).toContain(
      'npm run admin:recover',
    );
  });
});

describe('Feature: VPS com Traefik do Coolify e backup cifrado (#206)', () => {
  it('prod compose: o Traefik do Coolify é o único proxy e nada é publicado no host', () => {
    const prod = read('docker-compose.prod.yml');
    expect(prod).toMatch(/^ {2}app:\n(?: {4}#.*\n)* {4}ports: !reset \[\]$/m);
    expect(prod).toMatch(/^ {2}db:\n(?: {4}#.*\n)* {4}ports: !reset \[\]$/m);
    expect(prod).toContain('SERVICE_FQDN_APP_3000');
    expect(prod).toContain('rate-limit-app@file');
    expect(prod).not.toMatch(/caddy/i);
    expect(existsSync(path.join(root, 'deploy/Caddyfile'))).toBe(false);
  });

  it('backup: cifra com age por chave pública e exige cópia fora do servidor', () => {
    const backup = read('scripts/backup.sh');
    expect(backup).toContain('set -euo pipefail');
    expect(backup).toContain('age -R "$recipients" -o "$partial/db.dump.age"');
    expect(backup).toContain(
      'age -R "$recipients" -o "$partial/uploads.tar.age"',
    );
    expect(backup).toContain('fail 3 "BACKUP_OFFSITE_CMD não definido');
    expect(backup).toContain('BACKUP_KEEP_DAYS:-30');

    // O tar das fotos sai pelo stdout: sem log, ele não para em claro no json-file.
    // Alvo do Coolify (container + volume) ou do compose, sem serviço extra (ADR-040).
    const target = read('scripts/backup-target.sh');
    expect(target).toContain('BACKUP_DB_CONTAINER');
    expect(target).toContain('BACKUP_UPLOADS_VOLUME');
    expect(target).toContain('--network none --log-driver none');
    expect(backup).toContain('. "$(dirname "$0")/backup-target.sh"');
    expect(backup).toContain('BACKUP_RCLONE_DEST');
    expect(read('docker-compose.yml')).not.toContain('uploads-backup');

    const service = read('deploy/backup/estomasystech-backup.service');
    expect(service).toContain('OnFailure=estomasystech-backup-alert.service');
    expect(service).toContain('EnvironmentFile=/etc/estomasystech/backup.env');
    expect(read('deploy/backup/estomasystech-backup.timer')).toContain(
      'OnCalendar=*-*-* 02:00:00 America/Sao_Paulo',
    );

    const restore = read('scripts/restore.sh');
    expect(restore).toContain('--confirmar) confirm=true');
    expect(restore).toContain('sha256sum --quiet -c SHA256SUMS');
    // Com o app conectado ao banco, o --confirmar recusa antes de apagar qualquer coisa.
    expect(restore).toContain('pare o app antes');

    const ci = read('.github/workflows/docker.yml');
    expect(ci).toContain('run: bash scripts/backup-smoke.sh');
    expect(ci).toContain('apt-get install -y -qq age');
  });
});
