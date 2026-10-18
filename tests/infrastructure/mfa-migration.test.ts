import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
}

const rowsOf = async <T>(statement: string): Promise<T[]> => {
  const db = await getDb();
  return ((await db.execute(sql.raw(statement))) as unknown as { rows: T[] })
    .rows;
};

describe('Feature: Migração 0042 do segundo fator (B2)', () => {
  it('Dado o banco migrado, Quando ler o catálogo, Então cria as tabelas do segundo fator com as colunas do Landing', async () => {
    const columns = await rowsOf<Column>(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name IN ('user_mfa', 'mfa_recovery_codes')
        ORDER BY table_name, ordinal_position`,
    );
    const shape = columns.map(
      (c) => `${c.table_name}.${c.column_name} ${c.data_type} ${c.is_nullable}`,
    );

    expect(shape).toEqual([
      'mfa_recovery_codes.id text NO',
      'mfa_recovery_codes.account_id text NO',
      'mfa_recovery_codes.code_hash text NO',
      'mfa_recovery_codes.used_at timestamp with time zone YES',
      'mfa_recovery_codes.created_at timestamp with time zone NO',
      'user_mfa.account_id text NO',
      'user_mfa.totp_secret text NO',
      'user_mfa.enrolled_at timestamp with time zone NO',
      'user_mfa.last_used_step integer NO',
    ]);

    const foreignKeys = await rowsOf<{ table_name: string; target: string }>(
      `SELECT tc.table_name, ccu.table_name AS target
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN ('user_mfa', 'mfa_recovery_codes')
        ORDER BY tc.table_name`,
    );
    expect(foreignKeys).toEqual([
      { table_name: 'mfa_recovery_codes', target: 'user_accounts' },
      { table_name: 'user_mfa', target: 'user_accounts' },
    ]);

    const [primaryKey] = await rowsOf<{ column_name: string }>(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = 'user_mfa'`,
    );
    expect(primaryKey.column_name).toBe('account_id');
  });
});
