#!/usr/bin/env bash
# Teste de compatibilidade da migração nova com o código anterior (issue #760, Postgres real).
#
#   compat-migracao.sh precisa <base-ref>   imprime `precisa=true|false`: o diff base...HEAD toca drizzle/*.sql?
#   compat-migracao.sh rodar   <base-ref>   monta a base (código antigo) em worktree, troca o `drizzle/` pelo
#                                           do HEAD (esquema novo) e roda a suíte de integração antiga.
#
# Se o código anterior passa sobre o esquema novo, a migração permite deploy e rollback sem humano
# (producao.md § 3.1 e § 4). Exige INTEGRATION_DATABASE_URL (Postgres 18 descartável; ver docs/engineering/migracoes-aditivas.md).
set -euo pipefail

modo="${1:-}"
base="${2:-}"
if [ -z "$modo" ] || [ -z "$base" ]; then
  echo "uso: compat-migracao.sh precisa|rodar <base-ref>" >&2
  exit 2
fi

raiz="$(git rev-parse --show-toplevel)"

case "$modo" in
  precisa)
    # Falha fechada: o diff vai para uma variável antes do teste; erro do git (base inexistente, histórico raso)
    # sai com 1 em vez de virar `precisa=false` e pular o portão.
    if ! arquivos=$(git diff --name-only "$base...HEAD" -- 'drizzle/*.sql'); then
      echo "erro: git diff contra $base falhou; rode \`git fetch origin\`" >&2
      exit 1
    fi
    if [ -n "$arquivos" ]; then
      echo "precisa=true"
    else
      echo "precisa=false"
    fi
    ;;
  rodar)
    : "${INTEGRATION_DATABASE_URL:?INTEGRATION_DATABASE_URL ausente (Postgres descartável)}"
    trabalho="$(mktemp -d)"
    trap 'git -C "$raiz" worktree remove --force "$trabalho/base" >/dev/null 2>&1 || true; rm -rf "$trabalho"' EXIT
    git -C "$raiz" worktree add --detach "$trabalho/base" "$base" >/dev/null
    # O esquema novo vem do HEAD; o código e os testes são os da base.
    rm -rf "$trabalho/base/drizzle"
    cp -R "$raiz/drizzle" "$trabalho/base/drizzle"
    cd "$trabalho/base"
    echo "código: $(git rev-parse --short HEAD) (base); esquema: $(git -C "$raiz" rev-parse --short HEAD) (HEAD)"
    npm ci --ignore-scripts
    npx vitest run -c vitest.integracao.config.mts
    ;;
  *)
    echo "modo desconhecido: $modo" >&2
    exit 2
    ;;
esac
