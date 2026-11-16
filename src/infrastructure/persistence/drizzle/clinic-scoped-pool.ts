import type { Pool, PoolClient, QueryResult } from 'pg';
import type { AppDb } from './db';
import * as schema from './schema';

/**
 * Nome da configuração de transação lida pelas políticas de RLS (ADR-110).
 * Etapa 2: o valor já é gravado em toda unidade de trabalho; ainda não há política que o leia.
 */
export const CLINIC_SETTING = 'app.clinic_id';

type QueryArg = string | { text?: string; [option: string]: unknown };
type QueryValues = unknown[] | undefined;
type QueryFn = (config: QueryArg, values?: QueryValues) => Promise<QueryResult>;

function queryText(config: QueryArg): string {
  return typeof config === 'string' ? config : (config.text ?? '');
}

/**
 * Cliente de uma transação aberta por `db.transaction`: logo depois do `begin` grava a clínica
 * (`set_config(..., true)` vale só até o fim da transação, então não vaza para a requisição seguinte
 * nem atravessa o PgBouncer em modo transação).
 *
 * O drizzle abre o `begin` fora do seu `try/finally`: se gravar a clínica falhar, este cliente desfaz
 * e se descarta sozinho (uma vez só). O `error` do socket é tratado durante todo o empréstimo, porque
 * o pool tira o ouvinte de conexão ociosa ao emprestar e um evento sem ouvinte derruba o processo.
 */
class ClinicScopedClient {
  private released = false;
  private broken = false;
  private readonly onError = (): void => {
    this.broken = true;
  };

  constructor(
    private readonly client: PoolClient,
    private readonly clinicId: string,
  ) {
    client.on('error', this.onError);
  }

  async query(config: QueryArg, values?: QueryValues): Promise<QueryResult> {
    const run = this.client.query.bind(this.client) as unknown as QueryFn;
    const result = await run(config, values);
    if (/^\s*begin\b/i.test(queryText(config))) {
      try {
        await run(`select set_config('${CLINIC_SETTING}', $1, true)`, [
          this.clinicId,
        ]);
      } catch (error) {
        await run('rollback').catch(() => {
          this.broken = true;
        });
        this.release(true);
        throw error;
      }
    }
    return result;
  }

  release(discard = false): void {
    if (this.released) return;
    this.released = true;
    this.client.off('error', this.onError);
    this.client.release(discard || this.broken);
  }
}

/**
 * Pool que envolve cada consulta avulsa numa transação curta com `app.clinic_id` gravado
 * (RLS etapa 2, ADR-110): o custo é um `BEGIN` com o `set_config` e um `COMMIT` por consulta.
 * O nome da classe termina em `Pool` de propósito: o drizzle usa isso para decidir se abre
 * conexão própria em `db.transaction`.
 */
export class ClinicScopedPool {
  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly clinicId: string,
  ) {}

  async query(config: QueryArg, values?: QueryValues): Promise<QueryResult> {
    const client = await this.pool.connect();
    let broken = false;
    const onError = (): void => {
      broken = true;
    };
    client.on('error', onError);
    try {
      await client.query(
        `begin; select set_config('${CLINIC_SETTING}', ${client.escapeLiteral(this.clinicId)}, true)`,
      );
      const run = client.query.bind(client) as unknown as QueryFn;
      const result = await run(config, values);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {
        broken = true;
      });
      throw error;
    } finally {
      client.off('error', onError);
      client.release(broken);
    }
  }

  async connect(): Promise<ClinicScopedClient> {
    return new ClinicScopedClient(await this.pool.connect(), this.clinicId);
  }
}

function isNodePostgresPool(client: unknown): client is Pool {
  const candidate = client as { connect?: unknown; totalCount?: unknown };
  return (
    typeof candidate?.connect === 'function' &&
    typeof candidate.totalCount === 'number'
  );
}

/**
 * Banco cujas consultas (e `db.transaction`) rodam com `app.clinic_id` gravado. `clinicId` nulo
 * (escopo de sistema) e PGlite (sem RLS) devolvem o próprio `db`.
 */
export async function scopeDbToClinic(
  db: AppDb,
  clinicId: string | null,
): Promise<AppDb> {
  const client = (db as unknown as { $client?: unknown }).$client;
  if (clinicId === null || !isNodePostgresPool(client)) return db;
  const { drizzle } = await import('drizzle-orm/node-postgres');
  return drizzle(new ClinicScopedPool(client, clinicId) as unknown as Pool, {
    schema,
  }) as unknown as AppDb;
}
