import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Gate de imports dinâmicos (#646): `import()` com template literal que tem
 * `${}` faz o Vite avisar (`vite:dynamic-import-vars`) e esconde os avisos reais
 * do log da suíte. O jeito certo é um mapa estático
 * `{ '/rota': () => import('@/app/api/rota/route') } as const` ou um caminho
 * literal. Lê a AST, então comentário e string que citam `import(\`${x}\`)` não
 * contam. Sai com 1 quando acha uma violação em `src/`, `tests/`, `e2e/` ou
 * `scripts/`.
 */
export const ROOTS = ['src', 'tests', 'e2e', 'scripts'] as const;

const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const SKIPPED_DIRS = new Set(['node_modules', '.next']);

export interface Violation {
  file: string;
  line: number;
}

export function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : listSources(path);
    }
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

const isTemplateImport = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  node.expression.kind === ts.SyntaxKind.ImportKeyword &&
  node.arguments[0] !== undefined &&
  ts.isTemplateExpression(node.arguments[0]);

/** Linhas (1-based) dos `import(\`...${x}...\`)` do arquivo. */
export function findTemplateImports(file: string, source: string): number[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (isTemplateImport(node)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      lines.push(line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lines;
}

export function findViolations(root: string): Violation[] {
  return ROOTS.flatMap((name) => {
    const dir = join(root, name);
    try {
      return listSources(dir);
    } catch {
      return []; // pasta ausente (ex.: `e2e/` num fixture)
    }
  }).flatMap((path) =>
    findTemplateImports(path, readFileSync(path, 'utf8')).map((line) => ({
      file: relative(root, path).split('\\').join('/'),
      line,
    })),
  );
}

export function run(root: string = process.cwd()): number {
  const violations = findViolations(root);
  for (const { file, line } of violations) {
    console.error(
      `${file}:${line}: import() com template literal — use um mapa estático \`{ '/x': () => import('...') } as const\` (AGENTS.md, convenção de imports dinâmicos)`,
    );
  }
  console.log(
    `dynamic-import: ${violations.length} import() com template literal`,
  );
  return violations.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith('check-dynamic-import.ts')) {
  process.exit(run());
}
