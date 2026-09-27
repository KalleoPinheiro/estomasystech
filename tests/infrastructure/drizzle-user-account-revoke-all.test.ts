import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { createPgliteFromTemplate } from '../support/pglite-template';

describe('Feature: Revogar as sessões de uma clínica inteira (B5, #214)', () => {
  let appDb: AppDb;

  beforeAll(async () => {
    const db: PgliteDatabase<typeof schema> = drizzle(
      await createPgliteFromTemplate(),
      { schema },
    );
    appDb = db as unknown as AppDb;
    const clinics = new DrizzleClinicRepository(appDb);
    for (const id of ['rv-a', 'rv-b']) {
      await clinics.create(
        Clinic.restore({
          id,
          name: `Clínica ${id}`,
          createdBy: 'fixture',
          createdAt: new Date(),
        }),
      );
    }
  });

  const seed = async (clinicId: string, email: string) => {
    const repo = new DrizzleUserAccountRepository(appDb, clinicId);
    const account = UserAccount.create({
      email,
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'atendente',
      clinicId,
    });
    await repo.save(account);
    return account;
  };

  const versionOf = async (clinicId: string, id: string) =>
    (await new DrizzleUserAccountRepository(appDb, clinicId).findById(id))
      ?.sessionVersion;

  it('Dadas contas em duas clínicas, Quando revogar todas as sessões da clínica A, Então só as contas de A sobem a versão', async () => {
    const a1 = await seed('rv-a', 'a1@rv.com');
    const a2 = await seed('rv-a', 'a2@rv.com');
    const b1 = await seed('rv-b', 'b1@rv.com');
    await new DrizzleUserAccountRepository(appDb, 'rv-a').revokeSessions(a2.id);

    await new DrizzleUserAccountRepository(appDb, 'rv-a').revokeAllSessions();

    expect(await versionOf('rv-a', a1.id)).toBe(1);
    expect(await versionOf('rv-a', a2.id)).toBe(2);
    expect(await versionOf('rv-b', b1.id)).toBe(0);
  });

  it('Dado repositório sem clínica, Quando revogar todas as sessões da clínica, Então recusa', async () => {
    await expect(
      new DrizzleUserAccountRepository(appDb, null).revokeAllSessions(),
    ).rejects.toThrow('revokeAllSessions exige repositório escopado à clínica');
  });
});
