import { eq } from 'drizzle-orm';
import type {
  JobName,
  JobRunRepository,
} from '@/application/ports/job-run-repository';
import type { AppDb } from './db';
import { jobRuns } from './schema';

/** Tabela de plataforma (#212): sem `clinic_id`, independe do escopo. */
export class DrizzleJobRunRepository implements JobRunRepository {
  constructor(private readonly db: AppDb) {}

  async recordRun(job: JobName, at: Date): Promise<void> {
    await this.db
      .insert(jobRuns)
      .values({ job, lastRunAt: at })
      .onConflictDoUpdate({ target: jobRuns.job, set: { lastRunAt: at } });
  }

  async lastRun(job: JobName): Promise<Date | null> {
    const [row] = await this.db
      .select({ lastRunAt: jobRuns.lastRunAt })
      .from(jobRuns)
      .where(eq(jobRuns.job, job));
    return row?.lastRunAt ?? null;
  }
}
