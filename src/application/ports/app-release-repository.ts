/** Release implantada (ADR-066): dado de plataforma, sem empresa e sem dado de paciente. */
export interface AppRelease {
  version: string;
  gitSha: string | null;
  releasedAt: Date;
  notes: string | null;
}

export type NewAppRelease = Omit<AppRelease, 'releasedAt'> & { at: Date };

export interface AppReleaseRepository {
  /** Idempotente por `version`: repetir não duplica nem muda a data da release; só atualiza o SHA, quando vier um novo (ADR-068). */
  record(release: NewAppRelease): Promise<void>;
  /** A release gravada mais recentemente, ou `null` sem nenhuma. */
  latest(): Promise<AppRelease | null>;
}
