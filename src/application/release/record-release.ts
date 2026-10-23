import type { AppReleaseRepository } from '@/application/ports/app-release-repository';
import {
  parseGitSha,
  parseReleaseNotes,
  parseReleaseVersion,
} from '@/domain/release/release-version';

export interface ReleaseBuild {
  version: string | undefined;
  sha?: string;
  notes?: string;
}

/**
 * Grava a release implantada (ADR-066). Idempotente por versão: cada boot repete a chamada e a
 * data da primeira implantação é a que vale. Versão inválida é recusada, nunca gravada.
 */
export class RecordRelease {
  constructor(
    private readonly releases: AppReleaseRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(build: ReleaseBuild): Promise<void> {
    await this.releases.record({
      version: parseReleaseVersion(build.version),
      gitSha: parseGitSha(build.sha),
      notes: parseReleaseNotes(build.notes),
      at: this.now(),
    });
  }
}
