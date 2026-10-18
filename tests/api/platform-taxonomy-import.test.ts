import { existsSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  STOMATHERAPY_DIAGNOSES,
  STOMATHERAPY_INTERVENTIONS,
  STOMATHERAPY_LINKAGES,
  STOMATHERAPY_OUTCOMES,
} from '@/infrastructure/persistence/taxonomy-seed/stomatherapy-seed';
import { CLINIC_A_ID } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface ImportCounts {
  diagnoses: number;
  outcomes: number;
  interventions: number;
  linkages: number;
}

const importAs = async (headers: Record<string, string>) => {
  const route = await import('@/app/api/platform/taxonomy/import/route');
  const response = await route.POST(
    jsonRequest('/api/platform/taxonomy/import', 'POST', {}, headers),
  );
  return {
    response,
    json: (await response.json()) as Envelope<ImportCounts>,
  };
};

/** Linhas do catálogo global, direto no banco. */
const catalogSize = async (): Promise<ImportCounts> => {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  const db = await getDb();
  const count = async (table: string) => {
    const result = (await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM ${table}`),
    )) as unknown as { rows: { n: number }[] };
    return result.rows[0]?.n ?? 0;
  };
  return {
    diagnoses: await count('nursing_diagnoses'),
    outcomes: await count('nursing_outcomes'),
    interventions: await count('nursing_interventions'),
    linkages: await count('taxonomy_linkages'),
  };
};

const SUPER_ADMIN = cookieHeaderFor(
  'super_admin',
  'dono@estomasystech.app',
  null,
);

describe('Feature: Importação do catálogo de taxonomias é ato de plataforma (B1)', () => {
  it('Dado company_admin, Quando importar, Então company_admin recebe 403 e o catálogo não muda', async () => {
    const before = await catalogSize();

    const { response, json } = await importAs(
      cookieHeaderFor('company_admin', 'admin@a.com', CLINIC_A_ID),
    );

    expect(response.status).toBe(403);
    expect(json.error).toBe('Seu papel não tem acesso a este recurso');
    expect(await catalogSize()).toEqual(before);
  });

  it('Dado super_admin, Quando importar duas vezes, Então importa e é idempotente', async () => {
    const first = await importAs(SUPER_ADMIN);

    expect(first.response.status).toBe(200);
    expect(first.json.data).toEqual({
      diagnoses: STOMATHERAPY_DIAGNOSES.length,
      outcomes: STOMATHERAPY_OUTCOMES.length,
      interventions: STOMATHERAPY_INTERVENTIONS.length,
      linkages: STOMATHERAPY_LINKAGES.length,
    });
    const afterFirst = await catalogSize();

    const second = await importAs(SUPER_ADMIN);

    expect(second.response.status).toBe(200);
    expect(second.json.data).toEqual({
      diagnoses: 0,
      outcomes: 0,
      interventions: 0,
      linkages: 0,
    });
    expect(await catalogSize()).toEqual(afterFirst);
  });

  it('Dado o diretório de rotas, Quando procurar a importação antiga, Então rota antiga não existe', () => {
    // Sem arquivo de rota o Next responde 404; o E2E confere a resposta HTTP.
    const legacy = path.join(
      process.cwd(),
      'src/app/api/admin/taxonomy/import/route.ts',
    );
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(path.join(process.cwd(), 'src/app/api/admin'))).toBe(
      false,
    );
  });
});
