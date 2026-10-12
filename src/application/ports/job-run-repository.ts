/** Job agendado com execução registrada (#212). */
export type JobName = 'reminders';

/** Última execução de cada job de plataforma (sem empresa). */
export interface JobRunRepository {
  recordRun(job: JobName, at: Date): Promise<void>;
  lastRun(job: JobName): Promise<Date | null>;
}
