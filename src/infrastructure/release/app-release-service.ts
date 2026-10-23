import { CurrentVersionReader } from '@/application/release/current-version';
import { RecordRelease } from '@/application/release/record-release';
import { buildAppVersion } from '@/lib/app-version';
import { logError } from '@/lib/log-error';
import { resolveAppEnv } from '@/lib/runtime-env';
import { getDb } from '../persistence/drizzle/db';
import { DrizzleAppReleaseRepository } from '../persistence/drizzle/drizzle-app-release-repository';

/**
 * SHA do build: o embutido na homologação, o `SOURCE_COMMIT` que o Coolify expõe ou o da Vercel.
 * Ausente é aceitável: a coluna `git_sha` é opcional.
 */
const buildSha = (): string | undefined =>
  process.env.NEXT_PUBLIC_APP_COMMIT ||
  process.env.SOURCE_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA;

/** SHA só em homologação (ADR-043/066); `APP_ENV` inválido nunca o expõe. */
function exposesSha(): boolean {
  try {
    const appEnv = resolveAppEnv();
    return appEnv === 'staging' || appEnv === 'preview';
  } catch {
    return false;
  }
}

const releases = {
  latest: async () => new DrizzleAppReleaseRepository(await getDb()).latest(),
};

let reader: CurrentVersionReader | undefined;

/** Leitor da versão atual, com cache por processo (ADR-066). */
export function currentVersionReader(): CurrentVersionReader {
  reader ??= new CurrentVersionReader(
    releases,
    { version: buildAppVersion(), sha: buildSha() },
    exposesSha(),
  );
  return reader;
}

/**
 * Grava a release deste build no boot (ADR-066). Falha não derruba nem bloqueia o deploy: vai para
 * o log e o rodapé cai para a versão do build.
 */
export async function recordCurrentRelease(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const db = await getDb();
    await new RecordRelease(new DrizzleAppReleaseRepository(db)).execute({
      version: buildAppVersion(),
      sha: buildSha(),
    });
  } catch (error) {
    logError('release.record_failed', error);
  }
}
