import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #203: o artefato de produção (build do Next e imagem Docker) nunca era
 * verificado antes do deploy, e o E2E só rodava contra `next dev` (CSP
 * relaxada). Checagem textual do workflow — a execução em si é o próprio CI.
 * ADR-042: o E2E saiu do Actions e virou `gate:local` (recibo no PR); o build
 * continua no job `ci` e o Docker no `docker.yml`.
 */
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string =>
  readFileSync(path.join(root, file), 'utf8');
const workflow = read('.github/workflows/ci.yml');
const dockerWorkflow = read('.github/workflows/docker.yml');
const packageScripts = JSON.parse(read('package.json')).scripts as Record<
  string,
  string
>;

/** Bloco de um job (até o próximo job de 2 espaços). */
function job(name: string, source = workflow): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

describe('CI de produção (#203)', () => {
  it('C43 CI roda npm run build', () => {
    const block = job('ci');

    expect(block).toMatch(/^ {8}run: npm run build$/m);
    // Bloqueante: nada de continue-on-error no job ou no passo.
    expect(block).not.toMatch(/continue-on-error:\s*true/);
  });

  it('C44 CI constrói a imagem e faz smoke', () => {
    const block = job('docker', dockerWorkflow);
    const smoke = readFileSync(
      path.join(root, 'scripts/docker-smoke.sh'),
      'utf8',
    );

    expect(block).toMatch(/run: docker compose build/);
    expect(block).not.toMatch(/docker (compose )?push/);
    expect(block).toMatch(/run: bash scripts\/docker-smoke\.sh/);
    expect(smoke).toContain('/api/auth/providers');
    expect(smoke).toContain('/api/health/ready');
    expect(smoke).toContain('x-request-id: smoke-req-0001');
    expect(smoke).toContain('/app/uploads/.smoke');
    expect(smoke).toContain('--force-recreate');
  });

  it('C45 o gate local roda o E2E principal contra o build de produção, com checagem de CSP', () => {
    const gate = read('scripts/gate/local.ts');
    const config = readFileSync(
      path.join(root, 'playwright.prod.config.ts'),
      'utf8',
    );

    expect(packageScripts['test:e2e:prod']).toBe(
      'playwright test -c playwright.prod.config.ts',
    );
    expect(gate.indexOf("name: 'build'")).toBeLessThan(
      gate.indexOf("name: 'e2e-producao'"),
    );
    expect(gate).toContain("args: ['run', 'test:e2e:prod']");
    expect(config).toContain('command: "npm run start"');
    // #308: a suíte principal roda contra o build; o `next dev` fica só com os
    // specs que precisam do convite no log (contas por papel) e o login.
    expect(config).toContain('testIgnore: [...ROLE_ACCOUNT_SPECS]');
    expect(config).not.toMatch(/testMatch: \[/);
    expect(config).not.toContain('modo aberto');
  });
});

describe('E2E: next dev só para o que depende dele (#308)', () => {
  it('C46 o gate local roda os specs de papéis e de login contra o next dev', () => {
    const gate = read('scripts/gate/local.ts');
    const dev = readFileSync(path.join(root, 'playwright.config.ts'), 'utf8');
    const constants = readFileSync(
      path.join(root, 'e2e/support/constants.ts'),
      'utf8',
    );

    expect(packageScripts['test:e2e:dev']).toBe('playwright test');
    expect(gate).toContain("args: ['run', 'test:e2e:dev']");
    expect(dev).toContain('testMatch: [...ROLE_ACCOUNT_SPECS, "auth.spec.ts"]');
    for (const spec of [
      'papeis-atendente.spec.ts',
      'papeis-profissional.spec.ts',
      'papeis-smoke.spec.ts',
      'sessao-expirada.spec.ts',
      'feriados-ausencias-profissional.spec.ts',
    ]) {
      expect(constants).toContain(`"${spec}"`);
    }
  });
});

describe('E2E fora do Actions (ADR-042)', () => {
  it('C47 o Actions não roda Playwright: quem confere o E2E é o recibo do gate local', () => {
    for (const file of [
      '.github/workflows/ci.yml',
      '.github/workflows/docker.yml',
      '.github/workflows/recibo-gate.yml',
    ]) {
      expect(read(file), file).not.toMatch(/playwright/i);
    }
    expect(read('.github/workflows/recibo-gate.yml')).toContain(
      'scripts/gate/verify-receipt.ts',
    );
  });

  it('C48 a staging não dispara o CI completo', () => {
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
  });
});
