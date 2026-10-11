import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #221: `.env.example` e a tabela de `docs/engineering/onboarding.md` § 4 batem
 * com as variáveis que o código lê — nem variável lida sem documentação, nem
 * variável documentada que nenhum código lê.
 */
const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const listFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /\.(ts|tsx|mts|js|mjs)$/.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name));

/** Definidas pela plataforma (Node, Next, Vercel), nunca pelo operador. */
const PLATFORM = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL', 'CI']);

/** Internas das suítes: documentadas no onboarding, fora do `.env.example`. */
const TEST_ONLY = new Set([
  'NEXT_DIST_DIR',
  'VITTA_DB_DRIVER',
  'VITTA_PGLITE_TEMPLATE_PATH',
]);

/** Código que lê variável: app, scripts, suíte E2E e configs. */
const CODE_FILES = [
  ...listFiles('src'),
  ...listFiles('scripts'),
  ...listFiles('e2e'),
  ...[
    'next.config.ts',
    'playwright.config.ts',
    'playwright.prod.config.ts',
  ].map((file) => join(ROOT, file)),
];
const code = CODE_FILES.map((file) => readFileSync(file, 'utf8')).join('\n');
const compose = read('docker-compose.yml');

/**
 * Formas de leitura no código: `process.env.X`, `env.X`, `intFromEnv('X')`,
 * `secretFromEnv("X")` e `X_ENV = 'X'`. No compose: `${X}`.
 */
const CODE_PATTERNS = [
  /\benv\.([A-Z][A-Z0-9_]+)/g,
  /\benv\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
  /FromEnv\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /_ENV = ['"]([A-Z][A-Z0-9_]+)['"]/g,
];
const COMPOSE_PATTERN = /\$\{([A-Z][A-Z0-9_]+)/g;

const namesMatching = (source: string, patterns: RegExp[]): string[] =>
  patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]),
  );

const readByCode = new Set([
  ...namesMatching(code, CODE_PATTERNS),
  ...namesMatching(compose, [COMPOSE_PATTERN]),
]);

/** `NOME=` no início da linha, comentada ou não. */
const envExampleNames = new Set(
  [...read('.env.example').matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(
    (match) => match[1],
  ),
);

const onboardingTable = read('docs/engineering/onboarding.md')
  .split('## 4. Variáveis de ambiente')[1]
  .split('\n## ')[0];
const onboardingNames = new Set(
  [...onboardingTable.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map(
    (match) => match[1],
  ),
);

const consumers = `${code}\n${compose}`;

describe('Feature: Documentação das variáveis de ambiente (#221)', () => {
  it('Dado o código, Quando ler as variáveis, Então cada uma está no .env.example', () => {
    const missing = [...readByCode].filter(
      (name) =>
        !PLATFORM.has(name) &&
        !TEST_ONLY.has(name) &&
        !envExampleNames.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('Dado o código, Quando ler as variáveis, Então cada uma está na tabela do onboarding', () => {
    const missing = [...readByCode].filter(
      (name) => !PLATFORM.has(name) && !onboardingNames.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('Dado o .env.example, Quando listar as variáveis, Então nenhuma é morta e todas estão no onboarding', () => {
    const dead = [...envExampleNames].filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(consumers),
    );
    const undocumented = [...envExampleNames].filter(
      (name) => !onboardingNames.has(name),
    );
    expect(dead).toEqual([]);
    expect(undocumented).toEqual([]);
  });
});
