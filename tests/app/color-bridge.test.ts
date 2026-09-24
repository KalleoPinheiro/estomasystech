import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layout mobile-first (AC 13): a mudança de layout não pode alterar nenhuma cor.
 * Todo utilitário `text-*`/`bg-*`/`border-*` do app resolve pela ponte `@theme`
 * de `globals.css` (AD-006), então travar a ponte trava as cores. Valores
 * copiados de `main` @ 46026ba.
 */
const BASELINE: Record<string, string> = {
  '--color-accent': 'var(--sv-accent)',
  '--color-accent-ink': 'var(--sv-accent-ink)',
  '--color-bg': 'var(--sv-bg)',
  '--color-surface': 'var(--sv-surface)',
  '--color-ink': 'var(--sv-text)',
  '--color-ink-2': 'var(--sv-text-2)',
  '--color-ink-3': 'var(--sv-text-3)',
  '--color-border': 'var(--sv-border)',
  '--color-border-strong': 'var(--sv-border-strong)',
  '--color-surface-2': 'var(--sv-surface-2)',
  '--color-bg-elev': 'var(--sv-bg-elev)',
  '--color-accent-soft':
    'color-mix(in oklab, var(--sv-accent) 14%, var(--sv-bg))',
  '--color-accent-strong':
    'color-mix(in oklab, var(--sv-accent-ink) 88%, black)',
  '--color-danger': 'var(--sv-danger-ink)',
  '--color-success': 'var(--sv-success-ink)',
  '--color-warning': 'var(--sv-warning-ink)',
  '--color-info': 'var(--sv-info-ink)',
  '--color-danger-soft':
    'color-mix(in oklab, var(--sv-danger) 12%, var(--sv-bg))',
  '--color-success-soft':
    'color-mix( in oklab, var(--sv-success) 12%, var(--sv-bg) )',
  '--color-warning-soft':
    'color-mix( in oklab, var(--sv-warning) 14%, var(--sv-bg) )',
  '--color-info-soft': 'color-mix(in oklab, var(--sv-info) 12%, var(--sv-bg))',
};

function colorBridge(): Record<string, string> {
  const css = readFileSync(
    resolve(process.cwd(), 'src/app/globals.css'),
    'utf-8',
  );
  const start = css.indexOf('@theme');
  const block = css.slice(start, css.indexOf('}', start));
  const entries = [...block.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)].map(
    ([, name, value]) => [
      name as string,
      (value as string).split(/\s+/).join(' ').trim(),
    ],
  );
  return Object.fromEntries(entries);
}

describe('Feature: cores preservadas no layout mobile-first', () => {
  it('ponte de cor inalterada', () => {
    expect(colorBridge()).toEqual(BASELINE);
  });
});

/** Todo `.tsx` de `src/`. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const COLOR_PREFIXES =
  '(?:text|bg|border|border-[trblxy]|ring|outline|divide|decoration|fill|stroke|placeholder|caret|accent)';
/** Nomes da ponte `@theme` mais os neutros literais que AD-006 permite. */
const ALLOWED = new Set([
  ...Object.keys(BASELINE).map((name) => name.replace('--color-', '')),
  'white',
  'black',
  'transparent',
  'current',
  'inherit',
]);
/** Sufixos que não são cor (tamanho, alinhamento, largura, estilo). */
const NOT_COLOR =
  /^(?:xs|sm|base|lg|xl|\d?xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|none|solid|dashed|dotted|double|collapse|separate|\d+|x|y|t|b|l|r|[trblxy]-\d+|offset-\d+|inset|opacity-\d+)$/;

describe('Feature: utilitários de cor resolvem pela ponte', () => {
  it('todo utilitário de cor do app usa um nome da ponte @theme', () => {
    const re = new RegExp(
      `(?:^|[\\s"'\`{:])${COLOR_PREFIXES}-([a-z][a-z0-9-]*)(?:/\\d+)?(?=[\\s"'\`}])`,
      'g',
    );
    const unknown = new Set<string>();
    for (const file of tsxFiles(resolve(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf-8');
      for (const [, suffix] of source.matchAll(re)) {
        const name = suffix as string;
        // `sv-*`: token do próprio pacote (`@still-void/ui/tailwind.css`), também var(--sv-*).
        if (NOT_COLOR.test(name) || ALLOWED.has(name) || name.startsWith('sv-'))
          continue;
        unknown.add(`${name} (${file.split('/src/')[1]})`);
      }
    }
    expect([...unknown]).toEqual([]);
  });
});
