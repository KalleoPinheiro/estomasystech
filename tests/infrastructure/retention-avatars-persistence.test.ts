import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleRetentionRepository } from '@/infrastructure/persistence/drizzle/drizzle-retention-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const OTHER = 'avatar-sweep-b';
const CUTOFF = new Date('2024-10-11T12:00:00Z');
const OLD = new Date(CUTOFF.getTime() - 1);
const RECENT = new Date(CUTOFF.getTime() + 1);

let db: PgliteDatabase<typeof schema>;
let repo: DrizzleRetentionRepository;

const account = (
  id: string,
  extra: Partial<typeof schema.userAccounts.$inferInsert>,
) =>
  db.insert(schema.userAccounts).values({
    id,
    clinicId: CLINIC,
    email: `${id}@sweep.test`,
    passwordHash: 'scrypt$1$salt$hash',
    role: 'atendente',
    active: false,
    deactivatedAt: OLD,
    avatarKey: `avatar-${id}-webp`,
    createdAt: new Date('2000-01-01T12:00:00Z'),
    ...extra,
  });

beforeAll(async () => {
  db = drizzle(await createPgliteFromTemplate(), { schema });
  repo = new DrizzleRetentionRepository(db as unknown as AppDb, CLINIC);
  await new DrizzleClinicRepository(db as unknown as AppDb).create(
    Clinic.restore({
      id: OTHER,
      name: 'B',
      createdBy: 't',
      createdAt: new Date(),
    }),
  );
  await account('vencida', {});
  await account('recente', { deactivatedAt: RECENT });
  await account('ativa', { active: true, deactivatedAt: null });
  await account('sem-foto', { avatarKey: null });
  await account('ja-anonimizada', { anonymizedAt: new Date() });
  await account('outra-clinica', { clinicId: OTHER });
});

describe('Feature: Avatares a apagar na retenção (#427, LGPD)', () => {
  it('Dadas contas variadas, Quando buscar, Então só a inativa vencida, com foto e da própria clínica entra', async () => {
    expect(await repo.findInactiveAvatarKeys(CUTOFF)).toEqual([
      'avatar-vencida-webp',
    ]);
  });

  it('Dada a busca feita antes, Quando a retenção anonimizar as contas, Então a mesma conta já não tem chave a apagar', async () => {
    await repo.anonymizeInactiveAccounts(CUTOFF, new Date());

    expect(await repo.findInactiveAvatarKeys(CUTOFF)).toEqual([]);
  });
});
