import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

type Db = PgliteDatabase<typeof schema>;

/** Campos do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function pgFieldsOf(error: unknown): { code?: string; constraint?: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  return (cause ?? error) as { code?: string; constraint?: string };
}

const insertChannel = (
  db: Db,
  id: string,
  fields: {
    channel?: string;
    provider?: string;
    lastStatus?: string | null;
  } = {},
) =>
  db.execute(
    sql`INSERT INTO clinic_channels
          (id, clinic_id, channel, provider, sender, encrypted_secret,
           secret_last4, last_status, updated_at, updated_by)
        VALUES (${id}, 'mig-ch', ${fields.channel ?? 'email'},
                ${fields.provider ?? 'resend'}, 'a@b.test', 'cifrado', 'abcd',
                ${fields.lastStatus ?? null}, now(), 'test')`,
  );

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (caught: unknown) => caught,
  );

describe('Feature: Canal da clínica no banco (C1, migração 0047)', () => {
  let db: Db;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_by, created_at)
          VALUES ('mig-ch', 'A', 'test', now())`,
    );
  });

  it('Dada uma clínica com canal de e-mail, Quando gravar outro de e-mail, Então recusa com uq_clinic_channels_clinic_channel', async () => {
    await insertChannel(db, 'ch-1');

    expect(pgFieldsOf(await errorOf(insertChannel(db, 'ch-2')))).toMatchObject({
      code: '23505',
      constraint: 'uq_clinic_channels_clinic_channel',
    });
  });

  it('Quando gravar channel fora de (email), Então recusa com clinic_channels_channel_check', async () => {
    expect(
      pgFieldsOf(await errorOf(insertChannel(db, 'ch-3', { channel: 'sms' }))),
    ).toMatchObject({
      code: '23514',
      constraint: 'clinic_channels_channel_check',
    });
  });

  it('Quando gravar provider fora de (resend), Então recusa com clinic_channels_provider_check', async () => {
    expect(
      pgFieldsOf(
        await errorOf(
          insertChannel(db, 'ch-4', { channel: 'email', provider: 'smtp' }),
        ),
      ),
    ).toMatchObject({
      code: '23514',
      constraint: 'clinic_channels_provider_check',
    });
  });

  it('Quando gravar last_status fora de (ok, failed), Então recusa com clinic_channels_last_status_check', async () => {
    await db.execute(sql`DELETE FROM clinic_channels`);

    expect(
      pgFieldsOf(
        await errorOf(insertChannel(db, 'ch-5', { lastStatus: 'pending' })),
      ),
    ).toMatchObject({
      code: '23514',
      constraint: 'clinic_channels_last_status_check',
    });
  });
});
