import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppReleaseRepository } from '@/infrastructure/persistence/drizzle/drizzle-app-release-repository';
import { appReleases } from '@/infrastructure/persistence/drizzle/schema';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const release = (
  version: string,
  at: string,
  gitSha: string | null = null,
) => ({
  version,
  gitSha,
  notes: null,
  at: new Date(at),
});

describe('Feature: Releases implantadas no banco (ADR-066)', () => {
  let repo: DrizzleAppReleaseRepository;

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(appReleases);
    repo = new DrizzleAppReleaseRepository(db);
  });

  it('Dado nenhuma release, Quando lê a mais recente, Então nulo', async () => {
    expect(await repo.latest()).toBeNull();
  });

  it('Dadas duas releases, Quando lê a mais recente, Então devolve a de data maior', async () => {
    await repo.record(release('0.2.0', '2026-10-23T12:00:00Z', 'abcdef1'));
    await repo.record(release('0.1.0', '2026-09-01T12:00:00Z'));

    expect(await repo.latest()).toEqual({
      version: '0.2.0',
      gitSha: 'abcdef1',
      releasedAt: new Date('2026-10-23T12:00:00Z'),
      notes: null,
    });
  });

  it('Dada a mesma versão gravada duas vezes, Quando repete, Então fica uma linha e a data da primeira', async () => {
    await repo.record(release('0.2.0', '2026-10-23T12:00:00Z'));
    await repo.record(release('0.2.0', '2026-10-24T12:00:00Z', 'ffffff1'));

    const db = await getDb();
    expect(await db.select().from(appReleases)).toHaveLength(1);
    expect((await repo.latest())?.releasedAt).toEqual(
      new Date('2026-10-23T12:00:00Z'),
    );
  });
});
