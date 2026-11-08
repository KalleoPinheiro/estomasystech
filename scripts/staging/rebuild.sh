#!/usr/bin/env bash
# Recria a branch `staging` (descartável) a partir da base + as branches informadas.
# A base é a origin/main (ADR-041) ou, com --release, a release aberta (ADR-052).
#
# Uso: scripts/staging/rebuild.sh [--release[=release/vX.Y.Z]] [--push] [<branch> ...]
#   sem branches: staging = a base.
#   --release: base = `origin/release/vX.Y.Z` aberta (não mergeada na main); sem release
#              aberta, a base é a main (staging volta a ser = main depois do merge da release).
#   --release=release/vX.Y.Z: base = essa release, mesmo com mais de uma aberta (o Actions passa a
#              release a homologar; sem o valor, vale a regra de uma só aberta).
#   --push: publica com --force-with-lease, sempre em `origin HEAD:staging` (nunca no upstream que
#           a branch local herdasse, p. ex. a release) e deixa o upstream da staging em origin/staging.
#   --deploy: se algum ref remoto já aponta para o SHA final, acrescenta um commit vazio. A Vercel
#           não cria deploy de Production para um SHA que já construiu (ex.: como prévia da release).
# Conflito: aborta, não publica e sai com 1 apontando a branch.
set -euo pipefail

push=false
use_release=false
release_branch=""
deploy=false
branches=()
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    --release) use_release=true ;;
    --release=release/v*) use_release=true; release_branch="${arg#--release=}" ;;
    --release=*) echo "Release inválida: ${arg#--release=} (esperado release/vX.Y.Z)." >&2; exit 2 ;;
    --deploy) deploy=true ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) branches+=("$arg") ;;
  esac
done

if [ -n "$(git status --porcelain)" ]; then
  echo "Árvore de trabalho suja; commit ou stash antes." >&2
  exit 2
fi

git fetch origin --prune --quiet
base=origin/main
if [ -n "$release_branch" ]; then
  git rev-parse --verify --quiet "origin/${release_branch}" >/dev/null || { echo "Release inexistente: ${release_branch}" >&2; exit 1; }
  if git merge-base --is-ancestor "origin/${release_branch}" origin/main; then
    echo "${release_branch} já está na main; não há o que homologar." >&2
    exit 1
  fi
  base="origin/${release_branch}"
elif [ "$use_release" = true ]; then
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
git switch -C staging --no-track "${base}" --quiet

for branch in "${branches[@]}"; do
  if ! git merge --no-ff --no-edit "origin/${branch}" >/dev/null 2>&1; then
    git merge --abort || true
    git switch - --quiet || true
    echo "Conflito ao mergear '${branch}' na staging. Reconstrua sem ela ou resolva na branch (rebase na main)." >&2
    exit 1
  fi
  echo "staging <- ${branch}"
done

if [ "$deploy" = true ] && [ -n "$(git for-each-ref --points-at HEAD refs/remotes)" ]; then
  git commit --allow-empty --quiet -m "chore(staging): dispara deploy de homologação"
  echo "staging <- commit vazio (o SHA já existia no remoto; a Vercel só constrói SHA novo)"
fi

if [ "$push" = true ]; then
  git push --force-with-lease --set-upstream origin HEAD:staging
else
  echo "Pronto localmente. Publique com: git push --force-with-lease --set-upstream origin HEAD:staging"
fi
