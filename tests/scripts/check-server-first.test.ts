import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWLIST_PATH,
  checkServerFirst,
  isClientPage,
  listPages,
  run,
} from '../../scripts/check-server-first';

const roots: string[] = [];

/** Repositório mínimo: páginas em `src/app` e a allowlist. */
function fixture(pages: Record<string, string>, allowlist: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'server-first-'));
  roots.push(root);
  for (const [path, source] of Object.entries(pages)) {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, source);
  }
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, ALLOWLIST_PATH), JSON.stringify(allowlist));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  vi.restoreAllMocks();
});

describe('Feature: gate server-first das páginas (ADR-069 § 1)', () => {
  it.each([
    ["'use client';\nexport default function P() {}", true],
    ['"use client"\nexport default function P() {}', true],
    ["// comentário\n\n'use client';\n", true],
    ["/* bloco */\n'use client';\n", true],
    ['export default async function P() {}', false],
    ["import x from 'y';\n'use client';", false],
  ])('Dado o arquivo %j, Então é página de cliente=%s', (source, expected) => {
    expect(isClientPage(source)).toBe(expected);
  });

  it('Dado a árvore de src/app, Quando lista, Então acha só os page.tsx, em qualquer profundidade', () => {
    const root = fixture(
      {
        'src/app/page.tsx': '',
        'src/app/a/b/page.tsx': '',
        'src/app/a/layout.tsx': '',
        'src/app/a/componente.tsx': '',
      },
      [],
    );

    expect(
      listPages(join(root, 'src/app')).map((p) => p.slice(root.length + 1)),
    ).toEqual(
      expect.arrayContaining(['src/app/page.tsx', 'src/app/a/b/page.tsx']),
    );
    expect(listPages(join(root, 'src/app'))).toHaveLength(2);
  });

  it('Dada uma página de cliente nova fora da allowlist, Então o relatório a acusa', () => {
    expect(
      checkServerFirst(
        ['src/app/a/page.tsx', 'src/app/nova/page.tsx'],
        ['src/app/a/page.tsx'],
      ),
    ).toEqual({ unlisted: ['src/app/nova/page.tsx'], stale: [] });
  });

  it('Dada uma página migrada que continua na allowlist, Então o relatório pede para removê-la (a lista só encolhe)', () => {
    expect(
      checkServerFirst(
        ['src/app/a/page.tsx'],
        ['src/app/a/page.tsx', 'src/app/migrada/page.tsx'],
      ),
    ).toEqual({ unlisted: [], stale: ['src/app/migrada/page.tsx'] });
  });

  it('Dado o repositório em ordem, Quando roda, Então sai 0 e conta as páginas restantes', () => {
    const root = fixture(
      {
        'src/app/a/page.tsx': "'use client';\n",
        'src/app/b/page.tsx': 'export default async function B() {}',
      },
      ['src/app/a/page.tsx'],
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(run(root)).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "server-first: 1 páginas 'use client' restantes (allowlist: 1)",
    );
  });

  it('Dada uma página de cliente nova, Quando roda, Então sai 1 e aponta o arquivo', () => {
    const root = fixture({ 'src/app/nova/page.tsx': "'use client';\n" }, []);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(run(root)).toBe(1);
    expect(error.mock.calls[0][0]).toContain('src/app/nova/page.tsx');
  });

  it('Dada uma entrada que já é Server Component, Quando roda, Então sai 1 pedindo para removê-la da allowlist', () => {
    const root = fixture(
      { 'src/app/a/page.tsx': 'export default async function A() {}' },
      ['src/app/a/page.tsx'],
    );
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(run(root)).toBe(1);
    expect(error.mock.calls[0][0]).toContain('remova da');
  });

  it('Dado o repositório real, Quando roda, Então está em ordem e /mais não está na allowlist', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(run()).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(readFileSync(ALLOWLIST_PATH, 'utf8')).not.toContain('/mais/');
  });
});
