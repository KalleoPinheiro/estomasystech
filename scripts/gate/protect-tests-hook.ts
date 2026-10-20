/**
 * Hook PreToolUse do Claude Code (Edit|Write|MultiEdit), regra 8 / ADR-042.
 * Lê o JSON do hook em stdin e sai 2 (bloqueia) quando a escrita enfraquece um
 * teste ou mexe no próprio gate. O dono libera a própria sessão com `GATE_OWNER_EDIT=1`
 * no ambiente do Claude Code; quem checa isso é o `protect-tests.sh`, antes do tsx.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { analyzeEdit, type Finding } from './test-integrity';

interface ToolInput {
  file_path?: string;
  old_string?: string;
  new_string?: string;
  content?: string;
  edits?: { old_string?: string; new_string?: string }[];
}

export function findingsFor(tool: string, input: ToolInput, root: string): Finding[] {
  if (!input.file_path) return [];
  const abs = resolve(root, input.file_path);
  const filePath = relative(root, abs).split('\\').join('/');
  const exists = existsSync(abs);
  if (tool === 'Write') return analyzeEdit({ filePath, exists, content: input.content ?? '' });
  const parts = tool === 'MultiEdit' ? (input.edits ?? []) : [input];
  return parts.flatMap((p) =>
    analyzeEdit({ filePath, exists, oldString: p.old_string, newString: p.new_string }),
  );
}

function main(): void {
  const payload = JSON.parse(readFileSync(0, 'utf8')) as { tool_name?: string; tool_input?: ToolInput };
  const findings = findingsFor(payload.tool_name ?? '', payload.tool_input ?? {}, process.cwd());
  if (findings.length === 0) return;
  for (const f of findings) console.error(`BLOQUEADO (regra 8) ${f.rule}: ${f.file}: ${f.line}`);
  console.error(
    'Teste não se edita para resolver problema de desenvolvimento: corrija o código. ' +
      'Se o requisito de negócio mudou, peça ao dono (docs/adr/042).',
  );
  process.exit(2);
}

if (process.argv[1]?.endsWith('protect-tests-hook.ts')) main();
