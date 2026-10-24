import { desc, sql } from 'drizzle-orm';
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
      .onConflictDoUpdate({
        target: appReleases.version,
        // Novo deploy da mesma versão (homologação reconstrói a 0.2.0 a cada commit): só o SHA
        // acompanha o código no ar; a data da primeira implantação e as notas ficam (ADR-068).
        set: { gitSha: sql`coalesce(excluded.git_sha, ${appReleases.gitSha})` },
      });
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
