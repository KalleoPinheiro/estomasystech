import { desc } from 'drizzle-orm';
import type {
  AppRelease,
  AppReleaseRepository,
  NewAppRelease,
} from '@/application/ports/app-release-repository';
import type { AppDb } from './db';
import { appReleases } from './schema';

/** Tabela de plataforma (ADR-066): sem `clinic_id`, independe do escopo. */
export class DrizzleAppReleaseRepository implements AppReleaseRepository {
  constructor(private readonly db: AppDb) {}

  async record(release: NewAppRelease): Promise<void> {
    await this.db
      .insert(appReleases)
      .values({
        id: crypto.randomUUID(),
        version: release.version,
        gitSha: release.gitSha,
        releasedAt: release.at,
        notes: release.notes,
      })
      .onConflictDoNothing({ target: appReleases.version });
  }

  async latest(): Promise<AppRelease | null> {
    const [row] = await this.db
      .select({
        version: appReleases.version,
        gitSha: appReleases.gitSha,
        releasedAt: appReleases.releasedAt,
        notes: appReleases.notes,
      })
      .from(appReleases)
      .orderBy(desc(appReleases.releasedAt))
      .limit(1);
    return row ?? null;
  }
}
