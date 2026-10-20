import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { TestProject } from 'vitest/node';
import { adminQuery, quoteIdent, withDatabase } from './postgres-integration';

declare module 'vitest' {
  export interface ProvidedContext {
    integrationDatabaseUrl: string;
    integrationTemplate: string;
  }
}

/**
 * Migra o Postgres real 1x (todo o processo) num banco-modelo; os arquivos de teste o clonam.
 * Recusa banco que não seja o informado em `INTEGRATION_DATABASE_URL` e produção (ADR-041).
 */
export default async function setup(project: TestProject) {
  const baseUrl = process.env.INTEGRATION_DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      'INTEGRATION_DATABASE_URL ausente: rode `npm run test:integracao` (sobe o Postgres do compose).',
    );
  }
  const template = `it_template_${process.pid}_${Date.now()}`;
  await adminQuery(baseUrl, `CREATE DATABASE ${quoteIdent(template)}`);

  const pool = new Pool({
    connectionString: withDatabase(baseUrl, template),
    max: 1,
  });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(process.cwd(), 'drizzle'),
    });
  } finally {
    // Um banco só serve de modelo sem conexões abertas.
    await pool.end();
  }

  project.provide('integrationDatabaseUrl', baseUrl);
  project.provide('integrationTemplate', template);

  return async () => {
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(template)} WITH (FORCE)`,
    );
  };
}
