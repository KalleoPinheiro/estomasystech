/**
 * `tsx scripts/release/ensaio-migrar.ts <pasta-drizzle>` com `DATABASE_URL`: aplica a pasta pelo migrador do
 * drizzle-orm (o mesmo que o app e o `db:migrate` usam). Só para o ensaio do Release deploy (ADR-113): monta o
 * "banco da versão anterior" e o banco de referência contra o qual os hashes do plano são comparados.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const [pasta] = process.argv.slice(2);
if (!pasta || !process.env.DATABASE_URL) {
  console.error('uso: DATABASE_URL=... tsx scripts/release/ensaio-migrar.ts <pasta-drizzle>');
  process.exit(2);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
migrate(drizzle(pool), { migrationsFolder: pasta })
  .finally(() => pool.end())
  .catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
  });
