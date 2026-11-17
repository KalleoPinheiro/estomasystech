/**
 * Programa que o teste `bundle-minificado.integracao.ts` empacota e minifica como o build de produção faz.
 * Abre uma transação com nível de isolamento pelo db com escopo de clínica (a listagem de pacientes, #918) e
 * imprime, em JSON, a clínica vista dentro dela e o nome (já minificado) da classe do pool com escopo.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { scopeDbToClinic } from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.HARNESS_DATABASE_URL,
    max: 1,
  });
  try {
    const raw = drizzle(pool, { schema }) as unknown as AppDb;
    const scoped = await scopeDbToClinic(raw, 'clinica-a');
    const visto = await scoped.transaction(
      async (tx) => {
        const result = await tx.execute(
          sql`select current_setting('app.clinic_id', true) as v`,
        );
        return (result as unknown as { rows: { v: string }[] }).rows[0]?.v;
      },
      { isolationLevel: 'repeatable read' },
    );
    const cliente = (scoped as unknown as { $client: object }).$client;
    console.log(
      JSON.stringify({
        clinica: visto,
        nomeDaClasse: Object.getPrototypeOf(cliente).constructor.name,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
