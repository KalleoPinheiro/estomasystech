/**
 * Versão da release em andamento (ADR-066). O `package.json` só sobe no `release:prepare`
 * (ADR-052), depois da homologação; até lá a staging mostraria a versão da release anterior
 * (`0.1.0`). Esta conta repete o que o `changeset version` fará: aplica o maior nível entre os
 * changesets pendentes sobre a versão atual, e é isso que o `prepare` confere contra o nome da
 * branch `release/vX.Y.Z`.
 */
export type BumpLevel = 'major' | 'minor' | 'patch';

const LEVELS: readonly BumpLevel[] = ['patch', 'minor', 'major'];
const PLAIN_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const BUMP_LINE = /^\s*['"]?[^'":\s]+['"]?\s*:\s*(major|minor|patch)\s*$/gm;

/** Maior nível declarado no frontmatter de um changeset; `null` se não houver nenhum. */
export function changesetBump(content: string): BumpLevel | null {
  const frontmatter = FRONTMATTER.exec(content)?.[1] ?? '';
  const found = [...frontmatter.matchAll(BUMP_LINE)].map(
    (match) => match[1] as BumpLevel,
  );
  return found.reduce<BumpLevel | null>(
    (highest, level) =>
      highest === null || LEVELS.indexOf(level) > LEVELS.indexOf(highest)
        ? level
        : highest,
    null,
  );
}

/** Versão resultante dos changesets pendentes; sem eles (ou com prerelease), a própria atual. */
export function nextReleaseVersion(
  current: string,
  changesets: readonly string[],
): string {
  const parts = PLAIN_SEMVER.exec(current);
  const bumps = changesets
    .map(changesetBump)
    .filter((level): level is BumpLevel => level !== null);
  if (!parts || bumps.length === 0) return current;
  const highest = bumps.reduce((a, b) =>
    LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a,
  );
  const [major, minor, patch] = [parts[1], parts[2], parts[3]].map(Number);
  if (highest === 'major') return `${major + 1}.0.0`;
  if (highest === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
