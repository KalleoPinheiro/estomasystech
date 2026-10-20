import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Procedure } from '@/domain/catalog/procedure';
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_SCHEDULE_CONFIG,
} from '@/domain/scheduling/schedule-config';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleProcedureRepository,
  DrizzleScheduleConfigRepository,
  DrizzleUserAccountRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

describe('Feature: Fundação em Postgres tolera dados legados e nega escrita ao papel de sistema', () => {
  let appDb: AppDb;
  let pg: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    pg = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = pg as unknown as AppDb;
  });

  it('Dado horário salvo sem política de cancelamento, Quando ler a grade, Então volta com a política padrão', async () => {
    const repo = new DrizzleScheduleConfigRepository(appDb, CLINIC);
    await repo.save({
      ...DEFAULT_SCHEDULE_CONFIG,
      cancellationPolicy: undefined,
    });

    const config = await repo.get();

    expect(config?.cancellationPolicy).toEqual(DEFAULT_CANCELLATION_POLICY);
  });

  it('Dado conta gravada com papel desconhecido, Quando ler a conta, Então falha explicitamente em vez de assumir um papel', async () => {
    await pg.execute(
      sql.raw(
        `INSERT INTO user_accounts (id, email, password_hash, role, clinic_id, active, created_at)
         VALUES ('acc-papel-estranho', 'estranho@clinica.com', 'scrypt$1$s$h', 'xpto', '${CLINIC}', true, now())`,
      ),
    );

    await expect(
      new DrizzleUserAccountRepository(appDb, CLINIC).findById(
        'acc-papel-estranho',
      ),
    ).rejects.toThrow('Papel de conta inválido persistido: "xpto"');
  });

  it('Dado papel de sistema, Quando salvar procedimento ou horário, Então recusa', async () => {
    const procedure = Procedure.create({
      name: 'Curativo',
      priceCents: 10000,
      durationMinutes: 30,
    });

    await expect(
      new DrizzleProcedureRepository(appDb, null).save(procedure),
    ).rejects.toThrow('Papel de sistema não pode salvar procedimento');
    await expect(
      new DrizzleScheduleConfigRepository(appDb, null).save(
        DEFAULT_SCHEDULE_CONFIG,
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar configuração');
  });
});
