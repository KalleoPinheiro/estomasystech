import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

/**
 * Classe de defeito da #918: código que funciona em desenvolvimento e quebra só no build de produção porque o
 * minificador apaga nomes (a listagem de pacientes respondia 500 com `25001` na staging, e nenhum teste sobre
 * o código-fonte via isso). Aqui o código roda EMPACOTADO E MINIFICADO, contra o Postgres real, no gate do PR,
 * antes da staging (ADR-113). Se o drizzle voltar a depender do nome da classe do pool, este teste quebra.
 */
const raiz = path.resolve(import.meta.dirname, '../..');

describe('Feature: o bundle minificado se comporta como o código-fonte (#918, ADR-113)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_bundle_${process.pid}_${Date.now()}`;
  const pasta = path.join(raiz, 'node_modules', '.cache');
  let saida: string;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    mkdirSync(pasta, { recursive: true });
    saida = mkdtempSync(path.join(pasta, 'bundle-minificado-'));
    await build({
      entryPoints: [path.join(raiz, 'tests/support/bundle-pool-harness.ts')],
      outfile: path.join(saida, 'harness.cjs'),
      bundle: true,
      minify: true,
      keepNames: false,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      // Os pacotes ficam de fora (como no `standalone`): o que se prova é o NOSSO código minificado.
      external: ['pg', 'drizzle-orm', 'drizzle-orm/*'],
      tsconfig: path.join(raiz, 'tsconfig.json'),
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    rmSync(saida, { recursive: true, force: true });
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    ).catch(() => undefined);
  });

  it('Dado o db com escopo de clínica minificado, Quando abre db.transaction com nível de isolamento, Então vê a clínica e não dá 25001', () => {
    const stdout = execFileSync(
      process.execPath,
      [path.join(saida, 'harness.cjs')],
      {
        env: {
          PATH: process.env.PATH,
          HARNESS_DATABASE_URL: withDatabase(baseUrl, databaseName),
        } as unknown as NodeJS.ProcessEnv,
        encoding: 'utf8',
      },
    );

    const resultado = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
      clinica?: string;
      nomeDaClasse?: string;
    };
    expect(resultado.clinica).toBe('clinica-a');
    // Garante que o teste não é vazio: o minificador de fato apagou o nome que o drizzle usava como pista.
    expect(resultado.nomeDaClasse).not.toMatch(/Pool/);
  });
});
