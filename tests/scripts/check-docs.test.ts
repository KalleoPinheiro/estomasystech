import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `npm run check:docs` é o que impede um link quebrado ou um doc sem metadados
 * de entrar em `docs/`. Como o `check:sv`, um gate sem teste pode ficar cego em
 * silêncio — cada caso abaixo planta a violação num fixture e exige que o gate
 * a encontre, e os casos limpos exigem saída 0.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'check-docs.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');

interface GateResult {
  status: number;
  output: string;
}

function runGate(root: string): GateResult {
  try {
    const output = execFileSync(TSX, [SCRIPT, root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return {
      status: err.status,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

const TODAY = new Date().toISOString().slice(0, 10);

function frontmatter(overrides: Record<string, string | null> = {}): string {
  const fields: Record<string, string | null> = {
    title: '"Doc"',
    status: 'living',
    audience: '[dev]',
    owner: '"@alguem"',
    last_reviewed: TODAY,
    ...overrides,
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

let root: string;

function write(relativePath: string, content: string): void {
  const full = join(root, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  write('AGENTS.md', '# Agents\n\n[docs](docs/README.md)\n');
  write('CONTEXT.md', '# Context\n');
  write('README.md', '# Readme\n');
  write('docs/README.md', `${frontmatter()}\n# Índice\n\n[a](a.md)\n`);
  write('docs/a.md', `${frontmatter()}\n# A\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check:docs — frontmatter', () => {
  it('passa numa árvore limpa', () => {
    expect(runGate(root)).toMatchObject({ status: 0 });
  });

  it('frontmatter ausente faz sair 1 nomeando o arquivo', () => {
    write('docs/sem-meta.md', '# Sem metadados\n');
    const result = runGate(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain('docs/sem-meta.md');
    expect(result.output).toContain('frontmatter');
  });

  it.each(['title', 'status', 'audience', 'owner', 'last_reviewed'])(
    'chave de frontmatter ausente (%s) faz sair 1 nomeando a chave',
    (key) => {
      write('docs/incompleto.md', `${frontmatter({ [key]: null })}\n# X\n`);
      const result = runGate(root);
      expect(result.status).toBe(1);
      expect(result.output).toContain('docs/incompleto.md');
      expect(result.output).toContain(key);
    },
  );

  it('status inválido faz sair 1', () => {
    write('docs/x.md', `${frontmatter({ status: 'published' })}\n# X\n`);
    const result = runGate(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain('docs/x.md');
    expect(result.output).toContain('published');
  });

  it.each(['living', 'frozen', 'draft', 'superseded'])(
    'aceita os quatro status (%s)',
    (status) => {
      write('docs/x.md', `${frontmatter({ status })}\n# X\n`);
      expect(runGate(root)).toMatchObject({ status: 0 });
    },
  );

  it.each(['23/09/2026', '2026-9-1', 'ontem'])(
    'data inválida em last_reviewed (%s) faz sair 1',
    (date) => {
      write('docs/x.md', `${frontmatter({ last_reviewed: date })}\n# X\n`);
      const result = runGate(root);
      expect(result.status).toBe(1);
      expect(result.output).toContain('last_reviewed');
    },
  );

  it('doc vivo vencido avisa e sai 0', () => {
    write(
      'docs/velho.md',
      `${frontmatter({ last_reviewed: '2000-01-01' })}\n# X\n`,
    );
    const result = runGate(root);
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/aviso.*docs\/velho\.md/i);
  });

  it.each(['frozen', 'draft', 'superseded'])(
    'doc vivo vencido: só living avisa — %s antigo não avisa',
    (status) => {
      write(
        'docs/antigo.md',
        `${frontmatter({ status, last_reviewed: '2000-01-01' })}\n# X\n`,
      );
      const result = runGate(root);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('docs/antigo.md');
    },
  );
});

describe('check:docs — links', () => {
  it('link quebrado em docs/ faz sair 1 e imprime file:line -> target', () => {
    write('docs/b.md', `${frontmatter()}\n# B\n\nver [c](c.md)\n`);
    const result = runGate(root);
    expect(result.status).toBe(1);
    expect(result.output).toContain('docs/b.md:11 -> c.md');
  });

  it.each(['AGENTS.md', 'CONTEXT.md', 'README.md'])(
    'link quebrado nos arquivos da raiz (%s) também é pego',
    (file) => {
      write(file, '# Raiz\n\n[sumiu](docs/nao-existe.md)\n');
      const result = runGate(root);
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${file}:3 -> docs/nao-existe.md`);
    },
  );

  it('resolve link para diretório e com âncora', () => {
    write('docs/b.md', `${frontmatter()}\n[dir](./)\n[sec](a.md#secao)\n`);
    expect(runGate(root)).toMatchObject({ status: 0 });
  });

  it('resolve caminho com parênteses, como grupos de rota do App Router', () => {
    write('src/app/(staff)/page.tsx', 'export {};\n');
    write('docs/b.md', `${frontmatter()}\n[p](../src/app/(staff)/page.tsx)\n`);
    expect(runGate(root)).toMatchObject({ status: 0 });
    write('docs/c.md', `${frontmatter()}\n[p](../src/app/(staff)/nao.tsx)\n`);
    expect(runGate(root).output).toContain(
      'docs/c.md:9 -> ../src/app/(staff)/nao.tsx',
    );
  });

  it('ignora templates: links relativos em docs/templates não são checados', () => {
    write(
      'docs/templates/t.md',
      `${frontmatter({ status: 'draft' })}\n[x](features/<slug>.md)\n[y](../../adr/NNN.md)\n`,
    );
    expect(runGate(root)).toMatchObject({ status: 0 });
  });

  it('ignora externos, âncoras e código', () => {
    write(
      'docs/b.md',
      [
        frontmatter(),
        '[site](https://example.com/x.md)',
        '[mail](mailto:a@b.c)',
        '[topo](#topo)',
        'inline `[a](nao-existe.md)` em código',
        '```markdown',
        '[bloco](tambem-nao-existe.md)',
        '```',
        '',
      ].join('\n'),
    );
    expect(runGate(root)).toMatchObject({ status: 0 });
  });
});
