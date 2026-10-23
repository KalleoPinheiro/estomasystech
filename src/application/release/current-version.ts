import type { AppReleaseRepository } from '@/application/ports/app-release-repository';
import { isSemver, parseGitSha } from '@/domain/release/release-version';

export interface CurrentVersion {
  version: string;
  /** `null` quando a versão veio do build (banco vazio ou fora do ar). */
  releasedAt: Date | null;
  /** Só em homologação; em produção a versão é tudo que a clínica vê (ADR-043). */
  sha?: string;
}

export interface BuildVersion {
  version: string | undefined;
  sha?: string;
}

const SUCCESS_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 30_000;

/**
 * Versão do sistema para o rodapé e para `GET /api/version` (ADR-066). A release gravada mais
 * recentemente prevalece; sem banco ou sem linha, vale a versão do build. A resposta fica em cache
 * no processo por 5 minutos (30 s quando o banco falhou), então a segunda chamada não vai ao banco.
 * `null` quando nem o build tem versão válida.
 */
export class CurrentVersionReader {
  private cached: { value: CurrentVersion | null; expiresAt: number } | null =
    null;

  constructor(
    private readonly releases: Pick<AppReleaseRepository, 'latest'>,
    private readonly build: BuildVersion,
    private readonly exposeSha: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  async read(): Promise<CurrentVersion | null> {
    const at = this.now();
    if (this.cached && at < this.cached.expiresAt) return this.cached.value;
    try {
      const latest = await this.releases.latest();
      const value = latest
        ? this.shape(latest.version, latest.releasedAt, latest.gitSha)
        : this.fromBuild();
      this.cached = { value, expiresAt: at + SUCCESS_TTL_MS };
    } catch {
      this.cached = { value: this.fromBuild(), expiresAt: at + FAILURE_TTL_MS };
    }
    return this.cached.value;
  }

  private fromBuild(): CurrentVersion | null {
    const version = this.build.version?.trim() ?? '';
    return isSemver(version)
      ? this.shape(version, null, parseGitSha(this.build.sha))
      : null;
  }

  private shape(
    version: string,
    releasedAt: Date | null,
    sha: string | null,
  ): CurrentVersion {
    return {
      version,
      releasedAt,
      ...(this.exposeSha && sha ? { sha } : {}),
    };
  }
}
