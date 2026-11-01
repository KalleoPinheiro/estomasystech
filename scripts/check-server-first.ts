import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Gate "server first" (#544, ADR-069 § 1): páginas de `src/app` são Server
 * Components por padrão. As que ainda começam com `'use client'` estão numa
 * allowlist que SÓ ENCOLHE: página nova não entra nela, e página migrada tem de
 * sair dela. Sai com 1 quando algo foge disso.
 */
export const ALLOWLIST_PATH = 'scripts/server-first-allowlist.json';

const PAGE_FILE = /^page\.tsx$/;
// Primeira instrução do arquivo, depois de comentários e linhas em branco.
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/;

export function listPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listPages(path);
    return PAGE_FILE.test(entry.name) ? [path] : [];
  });
}

export const isClientPage = (source: string): boolean =>
  USE_CLIENT.test(source);

export interface ServerFirstReport {
  /** Página `'use client'` fora da allowlist: nova, ou migrada para cliente. */
  unlisted: string[];
  /** Entrada da allowlist que já não é `'use client'` (ou não existe): tem de sair. */
  stale: string[];
}

export function checkServerFirst(
  clientPages: readonly string[],
  allowlist: readonly string[],
): ServerFirstReport {
  const listed = new Set(allowlist);
  const current = new Set(clientPages);
  return {
    unlisted: clientPages.filter((page) => !listed.has(page)).sort(),
    stale: allowlist.filter((page) => !current.has(page)).sort(),
  };
}

export function run(root: string = process.cwd()): number {
  const appDir = join(root, 'src/app');
  const clientPages = listPages(appDir)
    .filter((page) => isClientPage(readFileSync(page, 'utf8')))
    .map((page) => relative(root, page).split('\\').join('/'));
  const allowlist = JSON.parse(
    readFileSync(join(root, ALLOWLIST_PATH), 'utf8'),
  ) as string[];
  const { unlisted, stale } = checkServerFirst(clientPages, allowlist);

  for (const page of unlisted) {
    console.error(
      `${page}: página 'use client' fora da allowlist — escreva-a como Server Component (ADR-069)`,
    );
  }
  for (const page of stale) {
    console.error(
      `${page}: já é Server Component (ou não existe) — remova da ${ALLOWLIST_PATH}`,
    );
  }
  console.log(
    `server-first: ${clientPages.length} páginas 'use client' restantes (allowlist: ${allowlist.length})`,
  );
  return unlisted.length + stale.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith('check-server-first.ts')) {
  process.exit(run());
}
