import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClinicChannel } from '@/domain/clinic/clinic-channel';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicChannelRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-channel-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { DataCipher } from '@/lib/data-cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const cipher = new DataCipher({ current: 'k'.repeat(64) });

const emailChannel = (clinicId: string, apiKey: string) =>
  ClinicChannel.configure({
    clinicId,
    channel: 'email',
    provider: 'resend',
    sender: `Clínica <contato@${clinicId}.test>`,
    apiKey,
    by: 'admin@clinica.test',
  });

/** C1 (#264): canal de e-mail por clínica, com a chave cifrada (ADR-006). */
describe('Feature: Canal de comunicação da clínica (Drizzle)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = db as unknown as AppDb;
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_by, created_at)
          VALUES ('ch-a', 'A', 'test', now()), ('ch-b', 'B', 'test', now())`,
    );
  });

  beforeEach(async () => {
    await db.delete(schema.clinicChannels);
  });

  it('cifra a chave: grava cifrada com os 4 últimos em claro e devolve a original na leitura', async () => {
    const repo = new DrizzleClinicChannelRepository(appDb, 'ch-a', cipher);

    await repo.save(emailChannel('ch-a', 're_abc123XYZ9'));

    const [row] = await db.select().from(schema.clinicChannels);
    expect(row.encryptedSecret).not.toBe('re_abc123XYZ9');
    expect(row.encryptedSecret).not.toContain('re_abc123XYZ9');
    expect(row.secretLast4).toBe('XYZ9');
    const found = await repo.find('email');
    expect(found?.apiKey).toBe('re_abc123XYZ9');
    expect(found?.sender).toBe('Clínica <contato@ch-a.test>');
  });

  it('cifra a chave: salvar de novo substitui a linha da mesma clínica e canal', async () => {
    const repo = new DrizzleClinicChannelRepository(appDb, 'ch-a', cipher);

    await repo.save(emailChannel('ch-a', 're_primeira0001'));
    await repo.save(emailChannel('ch-a', 're_segunda0002'));

    const rows = await db.select().from(schema.clinicChannels);
    expect(rows).toHaveLength(1);
    expect((await repo.find('email'))?.apiKey).toBe('re_segunda0002');
  });

  it('isolamento: no escopo da clínica A, o canal de B não aparece', async () => {
    await new DrizzleClinicChannelRepository(appDb, 'ch-b', cipher).save(
      emailChannel('ch-b', 're_da_clinica_b'),
    );

    const fromA = new DrizzleClinicChannelRepository(appDb, 'ch-a', cipher);

    expect(await fromA.find('email')).toBeNull();
  });

  it('isolamento: o escopo de sistema não lê nem grava canal', async () => {
    await new DrizzleClinicChannelRepository(appDb, 'ch-b', cipher).save(
      emailChannel('ch-b', 're_da_clinica_b'),
    );
    const system = new DrizzleClinicChannelRepository(appDb, null, cipher);

    await expect(system.find('email')).rejects.toThrow(
      'Canal de comunicação exige escopo de clínica',
    );
    await expect(
      system.save(emailChannel('ch-b', 're_outra_chave')),
    ).rejects.toThrow('Canal de comunicação exige escopo de clínica');
  });

  it('isolamento: o escopo de A recusa gravar o canal de B', async () => {
    const fromA = new DrizzleClinicChannelRepository(appDb, 'ch-a', cipher);

    await expect(
      fromA.save(emailChannel('ch-b', 're_da_clinica_b')),
    ).rejects.toThrow('Canal de outra clínica fora do escopo');
  });

  it('remove: apaga só o canal da clínica do escopo, devolve o id e não precisa decifrar a chave', async () => {
    const channelA = emailChannel('ch-a', 're_da_clinica_a');
    await new DrizzleClinicChannelRepository(appDb, 'ch-a', cipher).save(
      channelA,
    );
    await new DrizzleClinicChannelRepository(appDb, 'ch-b', cipher).save(
      emailChannel('ch-b', 're_da_clinica_b'),
    );
    // Chave de dados trocada sem a anterior: a chave de A não decifra mais.
    const rotated = new DataCipher({ current: 'z'.repeat(64) });
    const fromA = new DrizzleClinicChannelRepository(appDb, 'ch-a', rotated);

    expect(await fromA.remove('email')).toBe(channelA.id);
    expect(await fromA.remove('email')).toBeNull();
    const rows = await db.select().from(schema.clinicChannels);
    expect(rows.map((row) => row.clinicId)).toEqual(['ch-b']);
    await expect(
      new DrizzleClinicChannelRepository(appDb, null, cipher).remove('email'),
    ).rejects.toThrow('Canal de comunicação exige escopo de clínica');
  });
});
