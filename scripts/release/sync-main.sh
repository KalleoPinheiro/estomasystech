#!/usr/bin/env bash
# Mergeia a `main` na release aberta (ADR-052). Merge, nunca rebase: a release é compartilhada
# com as `feat/*` e o recibo do gate depende dos SHAs.
#
# Uso: scripts/release/sync-main.sh [--push]
#   sem --push: deixa o merge só local (na branch da release; volta à branch de origem).
# Sem release aberta, ou já em dia: sai com 0 sem fazer nada.
# Conflito: aborta, não publica e sai com 1 (o workflow falha e avisa; resolva à mão na release).
set -euo pipefail

push=false
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "Argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

if [ -n "$(git status --porcelain)" ]; then
  echo "Árvore de trabalho suja; commit ou stash antes." >&2
  exit 2
fi

git fetch origin --prune --quiet
mapfile -t open < <(git for-each-ref --format='%(refname:short)' --no-merged origin/main 'refs/remotes/origin/release/v*')
if [ "${#open[@]}" -eq 0 ]; then
  echo "Nenhuma release aberta; nada a sincronizar."
  exit 0
fi
if [ "${#open[@]}" -gt 1 ]; then
  echo "Mais de uma release aberta (${open[*]}); só uma por vez (ADR-052)." >&2
  exit 1
fi
release="${open[0]#origin/}"

if git merge-base --is-ancestor origin/main "origin/${release}"; then
  echo "${release} já tem a main; nada a fazer."
  exit 0
fi

origin_ref="$(git rev-parse --abbrev-ref HEAD)"
if [ "${origin_ref}" = "HEAD" ]; then origin_ref="$(git rev-parse HEAD)"; fi
git switch -C "${release}" "origin/${release}" --quiet
if ! git merge --no-ff --no-edit -m "chore: merge main em ${release}" origin/main >/dev/null 2>&1; then
  git merge --abort || true
  git checkout "${origin_ref}" --quiet || true
  echo "Conflito ao mergear a main em ${release}. Resolva à mão na release (merge, não rebase)." >&2
  exit 1
fi
echo "${release} <- main"

if [ "$push" = true ]; then
  git push origin "${release}"
else
  echo "Pronto localmente. Publique com: git push origin ${release}"
fi
git checkout "${origin_ref}" --quiet
