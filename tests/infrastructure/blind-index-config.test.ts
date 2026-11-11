import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeEnv,
  localBlindIndexPepper,
  newSecrets,
} from '../../scripts/ambiente/config';
import { disposableSecrets } from '../../scripts/gate/ambiente';

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Feature: BLIND_INDEX_PEPPER em todas as montagens de produção (#734)', () => {
  it('Dado o compose e o CI, Então produção não sobe sem o pepper e o build não o exige de verdade', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toMatch(
      /^ {6}BLIND_INDEX_PEPPER: \$\{BLIND_INDEX_PEPPER:\?/m,
    );
    expect(compose).toMatch(
      /^ {6}BLIND_INDEX_PEPPER_PREVIOUS: \$\{BLIND_INDEX_PEPPER_PREVIOUS:-\}/m,
    );
    expect(read('.github/workflows/docker.yml')).toMatch(
      /^ {10}BLIND_INDEX_PEPPER: build-only$/m,
    );
    // O Dockerfile não leva o pepper: ele só existe em runtime.
    expect(read('Dockerfile')).not.toContain('BLIND_INDEX_PEPPER');
  });

  it('Dado os scripts de smoke e o E2E de produção, Então todos geram ou injetam um pepper', () => {
    const line = `export BLIND_INDEX_PEPPER="\${BLIND_INDEX_PEPPER:-$(openssl rand -hex 32)}"`;
    for (const script of [
      'scripts/docker-smoke.sh',
      'scripts/backup-smoke.sh',
      'scripts/gate/docker-step.sh',
    ]) {
      expect(read(script)).toContain(line);
    }
    expect(read('playwright.prod.config.ts')).toContain(
      'BLIND_INDEX_PEPPER: E2E_BLIND_INDEX_PEPPER',
    );
    expect(read('e2e/support/constants.ts')).toContain(
      'E2E_BLIND_INDEX_PEPPER = secretFromEnv',
    );
    expect(read('.env.example')).toMatch(/^BLIND_INDEX_PEPPER=$/m);
  });

  it('Dado o gate local e o ambiente local, Então ambos entregam um pepper com 32+ caracteres ao compose', () => {
    expect(disposableSecrets().BLIND_INDEX_PEPPER).toMatch(/^[0-9a-f]{64}$/);
    const secrets = newSecrets();
    const env = composeEnv(secrets, { app: 3100, db: 55_432 });
    expect(env.BLIND_INDEX_PEPPER).toBe(localBlindIndexPepper(secrets));
    expect(env.BLIND_INDEX_PEPPER).toMatch(/^[0-9a-f]{64}$/);
    expect(env.BLIND_INDEX_PEPPER).not.toBe(env.DATA_ENCRYPTION_KEY);
  });
});
