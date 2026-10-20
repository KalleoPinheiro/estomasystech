#!/usr/bin/env bash
# Recria a branch `staging` (descartável) a partir da base + as branches informadas.
# A base é a origin/main (ADR-041) ou, com --release, a release aberta (ADR-052).
#
# Uso: scripts/staging/rebuild.sh [--release] [--push] [<branch> ...]
#   sem branches: staging = a base.
#   --release: base = `origin/release/vX.Y.Z` aberta (não mergeada na main); sem release
#              aberta, a base é a main (staging volta a ser = main depois do merge da release).
#   --push: publica com --force-with-lease.
# Conflito: aborta, não publica e sai com 1 apontando a branch.
set -euo pipefail

push=false
use_release=false
branches=()
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    --release) use_release=true ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) branches+=("$arg") ;;
  esac
done

if [ -n "$(git status --porcelain)" ]; then
  echo "Árvore de trabalho suja; commit ou stash antes." >&2
  exit 2
fi

git fetch origin --prune --quiet
base=origin/main
if [ "$use_release" = true ]; then
  mapfile -t open < <(git for-each-ref --format='%(refname:short)' --no-merged origin/main 'refs/remotes/origin/release/v*')
  if [ "${#open[@]}" -gt 1 ]; then
    echo "Mais de uma release aberta (${open[*]}); só uma por vez (ADR-052)." >&2
    exit 1
  fi
  if [ "${#open[@]}" -eq 1 ]; then base="${open[0]}"; fi
fi
echo "staging <- ${base}"
for branch in "${branches[@]}"; do
  git rev-parse --verify --quiet "origin/${branch}" >/dev/null || { echo "Branch inexistente: ${branch}" >&2; exit 1; }
done
git switch -C staging "${base}" --quiet

for branch in "${branches[@]}"; do
  if ! git merge --no-ff --no-edit "origin/${branch}" >/dev/null 2>&1; then
    git merge --abort || true
    git switch - --quiet || true
    echo "Conflito ao mergear '${branch}' na staging. Reconstrua sem ela ou resolva na branch (rebase na main)." >&2
    exit 1
  fi
  echo "staging <- ${branch}"
done

if [ "$push" = true ]; then
  git push --force-with-lease origin staging
else
  echo "Pronto localmente. Publique com: git push --force-with-lease origin staging"
fi
