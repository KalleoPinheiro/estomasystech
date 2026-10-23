/**
 * Versão da aplicação mostrada às clínicas (ADR-043). `NEXT_PUBLIC_APP_VERSION` vem do
 * `package.json` e é embutida no build por `next.config.ts`; `NEXT_PUBLIC_APP_COMMIT` só é
 * definido em homologação e preview, onde o SHA ajuda a diagnosticar.
 */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHORT_SHA = /^[0-9a-f]{7,40}$/i;

/** `v1.2.3` ou `v1.2.3 (abc1234)`; `null` quando a versão não existe ou não é semver. */
export function formatAppVersion(
  version: string | undefined,
  commit?: string,
): string | null {
  const v = version?.trim();
  if (!v || !SEMVER.test(v)) return null;
  const sha = commit?.trim();
  return sha && SHORT_SHA.test(sha) ? `v${v} (${sha.slice(0, 7)})` : `v${v}`;
}

/**
 * Versão do build. `NEXT_PUBLIC_RELEASE_VERSION` é a release em andamento (o `package.json` só
 * sobe no `release:prepare`, ADR-066) e vale antes de `NEXT_PUBLIC_APP_VERSION`.
 */
export function buildAppVersion(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_RELEASE_VERSION ||
    process.env.NEXT_PUBLIC_APP_VERSION
  );
}

export function currentAppVersion(): string | null {
  return formatAppVersion(
    buildAppVersion(),
    process.env.NEXT_PUBLIC_APP_COMMIT,
  );
}
