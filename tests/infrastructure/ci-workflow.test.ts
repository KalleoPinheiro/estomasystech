import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #203: o artefato de produção (build do Next e imagem Docker) nunca era
 * verificado antes do deploy, e o E2E só rodava contra `next dev` (CSP
 * relaxada). Checagem textual do workflow — a execução em si é o próprio CI.
 */
const root = path.resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
);

/** Bloco de um job (até o próximo job de 2 espaços). */
function job(name: string): string {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

describe('CI de produção (#203)', () => {
  it('C43 CI roda npm run build', () => {
    const block = job('build-e2e-prod');

    expect(block).toMatch(/^ {8}run: npm run build$/m);
    // Bloqueante: nada de continue-on-error no job ou no passo.
    expect(block).not.toMatch(/continue-on-error:\s*true/);
  });

  it('C44 CI constrói a imagem e faz smoke', () => {
    const block = job('docker');
    const smoke = readFileSync(
      path.join(root, 'scripts/docker-smoke.sh'),
      'utf8',
    );

    expect(block).toMatch(/run: docker compose build/);
    expect(block).not.toMatch(/docker (compose )?push/);
    expect(block).toMatch(/run: bash scripts\/docker-smoke\.sh/);
    expect(smoke).toContain('/api/auth/providers');
    expect(smoke).toContain('/app/uploads/.smoke');
    expect(smoke).toContain('--force-recreate');
  });

  it('C45 CI roda E2E de produção com checagem de CSP', () => {
    const block = job('build-e2e-prod');
    const config = readFileSync(
      path.join(root, 'playwright.prod.config.ts'),
      'utf8',
    );

    expect(block).toMatch(
      /npx playwright test -c playwright\.prod\.config\.ts/,
    );
    expect(block.indexOf('npm run build')).toBeLessThan(
      block.indexOf('playwright.prod.config.ts'),
    );
    expect(config).toContain('command: "npm run start"');
    for (const spec of [
      'csp-producao.spec.ts',
      'auth.spec.ts',
      'agenda.spec.ts',
      'pacientes.spec.ts',
      'portal-paciente.spec.ts',
      // B3 (ADR-009): a sessão real do super_admin também contra o build.
      'plataforma.spec.ts',
    ]) {
      expect(config).toContain(`"${spec}"`);
    }
  });
});
