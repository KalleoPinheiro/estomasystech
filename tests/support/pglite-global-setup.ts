import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteTemplatePath: string;
  }
}

/**
 * Migra o PGlite 1x pra todo o processo de teste (não 1x por arquivo — #111,
 * maior custo de tempo/máquina da suíte) e guarda o resultado num arquivo de
 * dump. Cada arquivo que precisa de um PGlite (getDb() com
 * ESTOMASYSTECH_DB_DRIVER=pglite via tests/setup.ts, + os arquivos de
 * tests/infrastructure que montam PGlite direto) carrega esse dump via
 * `loadDataDir` — pula o `migrate()` (parsing+execução de todo o SQL de
 * schema), mas cada arquivo ainda recebe sua própria instância PGlite
 * independente: zero estado compartilhado, mesma garantia de isolamento por
 * arquivo que existia antes (uma instância nova), só que restaurada de um
 * snapshot binário em vez de remontada do zero via SQL.
 */
export default async function setup(project: TestProject) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { btree_gist } = await import(
    '@electric-sql/pglite/contrib/btree_gist'
  );
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const client = new PGlite({ extensions: { pg_trgm, btree_gist } });
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'drizzle'),
  });

  const dump = await client.dumpDataDir('none');
  await client.close();

  const templatePath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'estomasystech-pglite-template-')),
    'template.tar',
  );
  await fs.writeFile(templatePath, Buffer.from(await dump.arrayBuffer()));

  project.provide('pgliteTemplatePath', templatePath);

  return async () => {
    await fs.rm(path.dirname(templatePath), {
      recursive: true,
      force: true,
    });
  };
}
