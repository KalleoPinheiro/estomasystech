#!/bin/bash
# PreToolUse (Edit|Write|MultiEdit): regra 8 do AGENTS.md (ADR-042). Só chama o
# analisador quando o caminho é de teste, de config de teste ou do próprio gate,
# para não pagar o tsx em toda edição.
# Falha FECHADO (#830): o Claude Code só bloqueia a ferramenta no exit 2, então qualquer
# falha do próprio hook em caminho protegido (sem tsx, sem analisador, tsx quebrado) sai 2.
# O dono libera a própria sessão (variável do ambiente do Claude Code; o agente não a define).
[ "$GATE_OWNER_EDIT" = "1" ] && exit 0
ROOT="${ROOT_DIR:-${CLAUDE_PROJECT_DIR:-.}}"
INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path","") or "")' 2>/dev/null) \
  || FILE=$(echo "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tool_input?.file_path||""))' 2>/dev/null) \
  || { echo "BLOQUEADO (regra 8): protect-tests.sh não conseguiu ler a entrada (python3 e node falharam)." >&2; exit 2; }
case "$FILE" in
  */tests/*|*/e2e/*|*vitest*.config.mts|*playwright*.config.ts|*/scripts/gate/*|*/.claude/hooks/*|*/.claude/settings.json|*/.husky/*) ;;
  *) exit 0 ;;
esac
TSX="$ROOT/node_modules/.bin/tsx"
ANALISADOR="$ROOT/scripts/gate/protect-tests-hook.ts"
if [ ! -x "$TSX" ] || [ ! -f "$ANALISADOR" ]; then
  echo "BLOQUEADO (regra 8): o analisador de testes não pode rodar (tsx ou protect-tests-hook.ts ausente em '$ROOT'). Rode npm ci ou peça ao dono (GATE_OWNER_EDIT=1)." >&2
  exit 2
fi
cd "$ROOT" || exit 2
echo "$INPUT" | "$TSX" "$ANALISADOR"
STATUS=$?
[ "$STATUS" -eq 0 ] && exit 0
[ "$STATUS" -ne 2 ] && echo "BLOQUEADO (regra 8): o analisador de testes falhou (exit $STATUS); a edição não passa sem ele." >&2
exit 2
