import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleRetentionRepository } from '@/infrastructure/persistence/drizzle/drizzle-retention-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const NOW = new Date('2026-10-11T12:00:00Z');
const CUTOFF = new Date('2024-10-11T12:00:00Z');

let db: PgliteDatabase<typeof schema>;
let clinics: DrizzleClinicRepository;
let accounts: DrizzleUserAccountRepository;

beforeAll(async () => {
  db = drizzle(await createPgliteFromTemplate(), { schema });
  clinics = new DrizzleClinicRepository(db as unknown as AppDb);
  accounts = new DrizzleUserAccountRepository(db as unknown as AppDb, CLINIC);
});

describe('Feature: Persistência de logo e avatar (#427)', () => {
  it('Dada uma clínica, Quando gravar a chave da logo, Então ela volta na leitura e só ela muda', async () => {
    const clinic = (await clinics.findById(CLINIC)) as Clinic;

    await clinics.saveLogoKey(clinic.withLogoKey('logo-1-webp'));

    const reloaded = (await clinics.findById(CLINIC)) as Clinic;
    expect(reloaded.logoKey).toBe('logo-1-webp');
    expect(reloaded.name).toBe(clinic.name);
  });

  it('Dada uma logo, Quando o cadastro da clínica for atualizado, Então a logo não é regravada nem apagada', async () => {
    const clinic = (await clinics.findById(CLINIC)) as Clinic;

    await clinics.update(
      clinic.withLogoKey(null).updateInfo({ city: 'Recife' }),
    );

    expect(((await clinics.findById(CLINIC)) as Clinic).logoKey).toBe(
      'logo-1-webp',
    );
  });

  it('Dada uma conta, Quando gravar o avatar e salvar a conta de novo, Então o save não desfaz o avatar', async () => {
    const account = UserAccount.create({
      email: 'avatar@persist.test',
      passwordHash: 'scrypt$x',
      role: 'atendente',
      clinicId: CLINIC,
    });
    await accounts.save(account);

    await accounts.saveAvatarKey(account.id, 'avatar-1-webp');
    await accounts.save(account);

    expect((await accounts.findById(account.id))?.avatarKey).toBe(
      'avatar-1-webp',
    );
    await accounts.saveAvatarKey(account.id, null);
    expect((await accounts.findById(account.id))?.avatarKey).toBeNull();
  });

  it('Dada conta de outra clínica, Quando gravar o avatar pelo repositório escopado, Então nada muda', async () => {
    await clinics.create(
      Clinic.restore({
        id: 'avatar-b',
        name: 'B',
        createdBy: 't',
        createdAt: new Date(),
      }),
    );
    const other = UserAccount.create({
      email: 'b@persist.test',
      passwordHash: 'scrypt$x',
      role: 'atendente',
      clinicId: 'avatar-b',
    });
    await new DrizzleUserAccountRepository(
      db as unknown as AppDb,
      'avatar-b',
    ).save(other);

    await accounts.saveAvatarKey(other.id, 'avatar-invasor-webp');

    const [row] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, other.id));
    expect(row.avatarKey).toBeNull();
  });

  it('Dada conta inativa com avatar, Quando a retenção anonimizar, Então a chave do avatar é limpa (foto de rosto é dado pessoal)', async () => {
    await db.insert(schema.userAccounts).values({
      id: 'acc-ret-avatar',
      clinicId: CLINIC,
      email: 'ret-avatar@x.com',
      passwordHash: 'scrypt$1$salt$hash',
      role: 'atendente',
      active: false,
      deactivatedAt: new Date(CUTOFF.getTime() - 1),
      avatarKey: 'avatar-ret-webp',
      createdAt: new Date('2000-01-01T12:00:00Z'),
    });

    await new DrizzleRetentionRepository(
      db as unknown as AppDb,
      CLINIC,
    ).anonymizeInactiveAccounts(CUTOFF, NOW);

    const [row] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, 'acc-ret-avatar'));
    expect(row.avatarKey).toBeNull();
    expect(row.anonymizedAt).toEqual(NOW);
  });
});
