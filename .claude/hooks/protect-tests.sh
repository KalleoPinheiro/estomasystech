#!/bin/bash
# PreToolUse (Edit|Write|MultiEdit): regra 8 do AGENTS.md (ADR-042). Só chama o
# analisador quando o caminho é de teste, de config de teste ou do próprio gate,
# para não pagar o tsx em toda edição.
# O dono libera a própria sessão (variável do ambiente do Claude Code; o agente não a define).
[ "$GATE_OWNER_EDIT" = "1" ] && exit 0
INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path","") or "")' 2>/dev/null)
case "$FILE" in
  */tests/*|*/e2e/*|*vitest.config.mts|*playwright*.config.ts|*/scripts/gate/*|*/.claude/hooks/*|*/.claude/settings.json|*/.husky/*) ;;
  *) exit 0 ;;
esac
echo "$INPUT" | "${ROOT_DIR:-.}/node_modules/.bin/tsx" "${ROOT_DIR:-.}/scripts/gate/protect-tests-hook.ts"
