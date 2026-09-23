import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Estrutura da documentação em progressive disclosure
 * (`.specs/features/docs-progressive-disclosure/checks.md`, C1–C30).
 * Cada teste afirma um check sobre a árvore real do repositório.
 */
const ROOT = process.cwd();

const DOMAINS = [
  'acesso',
  'pacientes-prontuario',
  'agenda',
  'financeiro',
  'estoque',
  'portal',
  'equipe-parceiros',
  'comunicacao',
  'relatorios',
];

const INTEGRATIONS = [
  'resend.md',
  'google-calendar.md',
  'whatsapp-meta.md',
  's3-storage.md',
  'cron.md',
];

const ROADMAP_STATUS = [
  'backlog',
  'especificado',
  'em-andamento',
  'entregue',
  'descartado',
];

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function lineCount(text: string): number {
  return text.replace(/\n$/, '').split('\n').length;
}

/** Linhas fora de blocos de código cercados (``` ou ~~~). */
function proseLines(text: string): string[] {
  let inFence = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return '';
    }
    return inFence ? '' : line;
  });
}

function headings(text: string, level: number): string[] {
  const prefix = `${'#'.repeat(level)} `;
  return proseLines(text)
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim());
}

/** Texto entre a H2 `name` e a próxima H1/H2 fora de bloco de código. */
function section(text: string, name: string): string {
  const lines = text.split('\n');
  const prose = proseLines(text);
  const start = prose.findIndex((line) => line === `## ${name}`);
  if (start < 0) return '';
  const end = prose.findIndex((line, i) => i > start && /^#{1,2} /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

function tableRows(block: string): string[][] {
  return block
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .filter((line) => !/^\|\s*-{3}/.test(line.trim()))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
}

function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
}

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((entry) => {
    const rel = join(dir, entry);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

function inOrder(actual: string[], expected: string[]): boolean {
  const filtered = actual.filter((h) => expected.includes(h));
  return JSON.stringify(filtered) === JSON.stringify(expected);
}

describe('S1 — AGENTS.md como roteador L0', () => {
  const agents = read('AGENTS.md');

  it('AGENTS.md tem no máximo 150 linhas', () => {
    expect(lineCount(agents)).toBeLessThanOrEqual(150);
  });

  it('AGENTS.md tem as seções na ordem', () => {
    const expected = [
      'Produto',
      'Comandos',
      'Regras invioláveis',
      'Mapa de contexto',
      'Agent skills',
    ];
    const h2 = headings(agents, 2);
    for (const name of expected) expect(h2).toContain(name);
    expect(inOrder(h2, expected)).toBe(true);
  });

  it('mapa de contexto linka os 9 domínios', () => {
    const rows = tableRows(section(agents, 'Mapa de contexto'));
    expect(rows[0]).toEqual([
      'Se vai mexer em',
      'Leia primeiro',
      'Depois, se precisar',
    ]);
    const firstColumnLinks = rows.slice(1).flatMap((r) => linkTargets(r[1]));
    for (const domain of DOMAINS) {
      expect(firstColumnLinks).toContain(`docs/domains/${domain}/README.md`);
    }
  });

  it.each([
    '.github/copilot-instructions.md',
    '.cursor/rules/00-vitta-flow.mdc',
  ])('pontes apontam para AGENTS.md (%s)', (file) => {
    const text = read(file);
    expect(lineCount(text)).toBeLessThanOrEqual(15);
    expect(text).toContain('AGENTS.md');
  });

  it('README enxuto e sem tabela de variáveis', () => {
    const readme = read('README.md');
    expect(lineCount(readme)).toBeLessThanOrEqual(120);
    expect(readme).not.toMatch(/^\|\s*Variável\s*\|/m);
  });
});

describe('S2 — domínios e metadados', () => {
  it.each(DOMAINS)('existem os 9 domínios (%s)', (domain) => {
    expect(existsSync(join(ROOT, 'docs/domains', domain, 'README.md'))).toBe(
      true,
    );
  });

  it.each(DOMAINS)(
    'README de domínio tem as seções na ordem (%s)',
    (domain) => {
      const expected = [
        'Resumo',
        'Regras de negócio',
        'Funcionalidades',
        'Código',
        'Decisões',
      ];
      const h2 = headings(read(`docs/domains/${domain}/README.md`), 2);
      for (const name of expected) expect(h2).toContain(name);
      expect(inOrder(h2, expected)).toBe(true);
    },
  );

  it('índice de docs linka todos os arquivos', () => {
    const index = read('docs/README.md');
    const linked = new Set(
      linkTargets(index)
        .map((t) => t.split('#')[0])
        .filter(Boolean)
        .map((t) => normalize(join('docs', t))),
    );
    const expected = walk('docs')
      .filter((f) => f.endsWith('.md'))
      .filter((f) => f !== join('docs', 'README.md'))
      .filter((f) => !/^docs\/domains\/[^/]+\/features\//.test(f));
    const missing = expected.filter((f) => !linked.has(normalize(f)));
    expect(missing).toEqual([]);
  });

  it('check:docs verde na árvore real', () => {
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
    expect(() =>
      execFileSync(tsx, [join(ROOT, 'scripts', 'check-docs.ts'), ROOT], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});

describe('S3 — templates', () => {
  it.each([
    'feature-spec.md',
    'integration.md',
    'prd.md',
    'adr.md',
    'domain.md',
  ])('existem os 5 templates (%s)', (file) => {
    expect(existsSync(join(ROOT, 'docs/templates', file))).toBe(true);
  });

  it('template de spec tem as seções na ordem', () => {
    const expected = [
      'Resumo',
      'Contexto e valor',
      'Regras de negócio',
      'Casos de uso',
      'Fluxo de valor',
      'Critérios de aceite',
      'Fora de escopo',
      'Rastreabilidade',
    ];
    const h2 = headings(read('docs/templates/feature-spec.md'), 2);
    for (const name of expected) expect(h2).toContain(name);
    expect(inOrder(h2, expected)).toBe(true);
  });

  it('critérios de aceite em gherkin pt', () => {
    const block = section(
      read('docs/templates/feature-spec.md'),
      'Critérios de aceite',
    );
    expect(block).toMatch(/```gherkin\n# language: pt\n/);
  });
});

describe('S4 — onboarding, integrações e troubleshooting', () => {
  it('tabela de variáveis existe só no onboarding', () => {
    const header = /^\|\s*Variável\s*\|/m;
    const candidates = [
      'README.md',
      'AGENTS.md',
      ...walk('docs').filter((f) => f.endsWith('.md')),
    ];
    const withTable = candidates.filter((f) => header.test(read(f)));
    expect(withTable).toEqual(['docs/engineering/onboarding.md']);
    expect(read('README.md')).toContain('docs/engineering/onboarding.md');
    expect(read('AGENTS.md')).toContain('docs/engineering/onboarding.md');
  });

  it.each(INTEGRATIONS)('existem as 5 integrações (%s)', (file) => {
    expect(existsSync(join(ROOT, 'docs/engineering/integrations', file))).toBe(
      true,
    );
  });

  it.each(INTEGRATIONS)('integração tem as seções (%s)', (file) => {
    const h2 = headings(read(`docs/engineering/integrations/${file}`), 2);
    for (const name of [
      'Propósito',
      'Credenciais',
      'Contrato',
      'Modos de falha',
      'Teste local',
    ]) {
      expect(h2).toContain(name);
    }
  });

  it.each([
    /503 em toda rota/,
    /porta 5432\/3000 ocupada/,
    /Ineffective mark-compacts/,
    /bootstrap responde 403/,
    /convite\/reset não chega/,
    /consulta rejeitada com 400/,
    /consulta rejeitada com 409/,
    /E2E falha só ao reaproveitar npm run dev/,
  ])('troubleshooting preserva os 8 sintomas (%s)', (symptom) => {
    const text = read('docs/engineering/troubleshooting.md').replace(/`/g, '');
    expect(text).toMatch(new RegExp(symptom.source, 'i'));
  });
});

describe('S5 — roadmap', () => {
  const roadmap = read('docs/plano-evolucao-faseado.md');

  /** Tabelas sob `### Now|Next|Later|Entregue` da seção `## Roadmap`. */
  function horizon(name: string): string[][] {
    const block = section(roadmap, 'Roadmap');
    const lines = block.split('\n');
    const start = lines.findIndex((l) => l.startsWith(`### ${name}`));
    if (start < 0) return [];
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith('### '));
    return tableRows((end < 0 ? rest : rest.slice(0, end)).join('\n'));
  }

  function allRows(): Record<string, string>[] {
    return ['Now', 'Next', 'Later', 'Entregue'].flatMap((name) => {
      const [header, ...rows] = horizon(name);
      return rows.map((row) =>
        Object.fromEntries(header.map((key, i) => [key, row[i]])),
      );
    });
  }

  it.each(['Now', 'Next', 'Later'])('roadmap now next later (%s)', (name) => {
    const [header, ...rows] = horizon(name);
    expect(header).toEqual(
      expect.arrayContaining(['id', 'status', 'issue', 'spec']),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(row[header.indexOf('id')]).toMatch(/^RM-\d{2}$/);
  });

  it('entregue linka spec existente', () => {
    const delivered = allRows().filter((r) => r.status === 'entregue');
    expect(delivered.length).toBeGreaterThan(0);
    for (const row of delivered) {
      const target = linkTargets(row.spec)[0] ?? '';
      const abs = resolve(ROOT, 'docs', target);
      expect(relative(ROOT, abs)).toMatch(/^\.specs\/features\/[^/]+\/?$/);
      expect(existsSync(abs) && statSync(abs).isDirectory()).toBe(true);
    }
  });

  it('status do roadmap no vocabulário', () => {
    const rows = allRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(ROADMAP_STATUS).toContain(row.status);
  });
});

describe('S6 — docs-as-code', () => {
  it('ci roda check:docs no job de lint', () => {
    const ci = read('.github/workflows/ci.yml');
    const jobs = ci.split(/^ {2}(?=[\w-]+:\s*$)/m);
    const lintJob = jobs.find((job) => job.includes('npm run lint'));
    expect(lintJob).toBeDefined();
    expect(lintJob).toContain('npm run check:docs');
    expect(read('package.json')).toMatch(
      /"check:docs":\s*"tsx scripts\/check-docs\.ts"/,
    );
  });

  it('STATE enxuto: ≤ 250 linhas e nenhuma seção CONCLUÍDA', () => {
    const state = read('.specs/STATE.md');
    expect(lineCount(state)).toBeLessThanOrEqual(250);
    expect(state).not.toMatch(/CONCLUÍD[AO]/);
  });

  it('handoffs arquivados em .specs/archive/', () => {
    const archive = walk('.specs/archive')
      .filter((f) => f.endsWith('.md'))
      .map(read)
      .join('\n');
    const concludedSections = archive.match(/^## .*CONCLUÍDA/gm) ?? [];
    const concludedBullets = archive.match(/^- \*\*.*CONCLUÍD[AO]/gm) ?? [];
    expect(concludedSections.length).toBe(16);
    expect(concludedBullets.length).toBeGreaterThanOrEqual(30);
    expect(read('.specs/STATE.md')).toContain('.specs/archive/');
  });
});
