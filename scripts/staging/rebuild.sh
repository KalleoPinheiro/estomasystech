#!/usr/bin/env bash
# Recria a branch `staging` = origin/main + as branches informadas (ADR-041).
#
# Uso: scripts/staging/rebuild.sh [--push] <branch> [<branch> ...]
#   sem branches: staging volta a ser a main.
#   --push: publica com --force-with-lease (staging é descartável).
# Conflito: aborta, não publica e sai com 1 apontando a branch.
set -euo pipefail

push=false
branches=()
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) branches+=("$arg") ;;
  esac
done

if [ -n "$(git status --porcelain)" ]; then
  echo "Árvore de trabalho suja; commit ou stash antes." >&2
  exit 2
fi

git fetch origin main "${branches[@]}" --quiet
git switch -C staging origin/main --quiet

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
