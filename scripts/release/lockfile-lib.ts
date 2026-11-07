/**
 * Proteção do `package-lock.json` no corte (ADR-091). O `release:prepare` regenera o lockfile
 * (`npm install --package-lock-only`) numa máquina de uma só plataforma; um npm diferente do que gerou o
 * lockfile, ou o bug de resolução do npm com `node_modules` de outra plataforma, descarta as dependências
 * **opcionais** das demais plataformas (`@img/sharp-*`, `@next/swc-*`) e o `npm ci` do Docker/Vercel
 * quebra depois. A regra de cada item mora aqui para ser testada; `prepare.ts` e `preflight.ts` só leem o ambiente.
 */
export interface LockfileLike {
  packages?: Record<string, { optional?: boolean } | undefined>;
}

export const NPM_FIXADO = /^npm@(\d+\.\d+\.\d+)$/;

/** Chaves (`node_modules/...`) marcadas `optional` no lockfile. */
export function opcionaisDoLockfile(lock: LockfileLike): string[] {
  return Object.entries(lock.packages ?? {})
    .filter(([, pkg]) => pkg?.optional === true)
    .map(([path]) => path)
    .sort();
}

/** Opcionais que existiam em `antes` e sumiram de `depois`. Vazio = lockfile íntegro. */
export function opcionaisPerdidos(antes: LockfileLike, depois: LockfileLike): string[] {
  const restantes = new Set(Object.keys(depois.packages ?? {}));
  return opcionaisDoLockfile(antes).filter((path) => !restantes.has(path));
}

/** Resumo legível da perda, ou `null` se não houve. */
export function verificarLockfile(antes: string, depois: string): string | null {
  const perdidos = opcionaisPerdidos(JSON.parse(antes) as LockfileLike, JSON.parse(depois) as LockfileLike);
  if (perdidos.length === 0) return null;
  const mostra = perdidos.slice(0, 5).join(', ');
  const resto = perdidos.length > 5 ? ` e mais ${perdidos.length - 5}` : '';
  return (
    `o lockfile perdeu ${perdidos.length} dependência(s) opcional(is) (${mostra}${resto}). ` +
    'Foi o npm errado ou o bug de plataforma: use o npm de `packageManager` e refaça (ADR-091).'
  );
}

/** Versão do npm declarada em `packageManager` (`npm@X.Y.Z`), ou `null` se ausente ou de outro gerenciador. */
export function npmFixado(pkg: { packageManager?: string }): string | null {
  return NPM_FIXADO.exec(pkg.packageManager ?? '')?.[1] ?? null;
}

/** Erro se o npm em uso não é o fixado; `null` se confere. */
export function conferirNpm(pkg: { packageManager?: string }, atual: string): string | null {
  const fixo = npmFixado(pkg);
  if (fixo === null) return '`packageManager` do package.json deve fixar o npm (`npm@X.Y.Z`, ADR-091).';
  if (atual.trim() === fixo) return null;
  return `npm ${atual.trim() || '(desconhecido)'} em uso, mas o package.json fixa ${fixo}: rode \`npm i -g npm@${fixo}\` (ADR-091).`;
}
