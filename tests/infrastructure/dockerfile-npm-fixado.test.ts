import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #716 / ADR-091 (emenda): o Docker de produção instala o npm fixado em
 * `packageManager` antes do `npm ci`, para não avisar EBADENGINE.
 */
const root = path.resolve(__dirname, '..', '..');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const pkg = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
) as {
  packageManager: string;
  engines: { npm: string };
};

describe('Feature: npm fixado no Dockerfile (#716)', () => {
  it('Given o estágio deps, When instala dependências, Then instala o npm do packageManager antes do npm ci', () => {
    const deps = dockerfile.slice(0, dockerfile.indexOf('AS builder'));
    const install = deps.indexOf('npm i -g');
    expect(install).toBeGreaterThan(-1);
    expect(deps).toContain("require('./package.json').packageManager");
    expect(install).toBeLessThan(deps.indexOf('&& npm ci'));
  });

  it('Given o package.json, When compara, Then packageManager e engines.npm são a mesma versão', () => {
    expect(pkg.packageManager).toBe(`npm@${pkg.engines.npm}`);
  });

  it('Given o Dockerfile, When lê, Then não repete o número da versão do npm', () => {
    expect(dockerfile).not.toContain(pkg.engines.npm);
  });
});
