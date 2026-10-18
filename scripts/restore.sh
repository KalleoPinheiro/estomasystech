#!/usr/bin/env bash
# Restauração de um backup gerado por scripts/backup.sh (#206).
#
#   scripts/restore.sh <diretório do backup>              confere sem alterar nada
#   scripts/restore.sh <diretório do backup> --confirmar  SUBSTITUI banco e fotos
#
# Conferência: somas SHA256, decifra o dump e lista o conteúdo (pg_restore --list)
# e o tar das fotos. Com --confirmar: para o app, recria o banco `estomasystech`, restaura
# o dump, troca o conteúdo do volume de fotos e sobe o app de novo (migrações do
# boot alinham o schema se o backup for de uma versão anterior).
# Roda contra o projeto compose do diretório do repositório; para um teste isolado,
# use outro COMPOSE_PROJECT_NAME (docs/engineering/producao.md § 5).
#
# Variáveis:
#   BACKUP_AGE_IDENTITY_FILE  obrigatória: chave PRIVADA age (traga do cofre só para
#                             a restauração; não deixe no servidor)
#
# Saída: 0 conferido ou restaurado; 2 uso ou pré-condição (nada foi alterado);
# 1 falha inesperada (com --confirmar, o banco pode ter ficado parcial: rode de novo).
set -euo pipefail
umask 077

fail() {
  echo "restore: $2" >&2
  exit "$1"
}

source_dir=""
confirm=false
for arg in "$@"; do
  case "$arg" in
    --confirmar) confirm=true ;;
    -*) fail 2 "opção desconhecida: $arg" ;;
    *)
      [ -z "$source_dir" ] || fail 2 "informe um único diretório de backup"
      source_dir="$arg"
      ;;
  esac
done

[ -n "$source_dir" ] || fail 2 "uso: scripts/restore.sh <diretório do backup> [--confirmar]"
[ -d "$source_dir" ] || fail 2 "diretório não encontrado: $source_dir"
source_dir="$(cd "$source_dir" && pwd)"
identity="${BACKUP_AGE_IDENTITY_FILE:-}"
[ -n "$identity" ] || fail 2 "defina BACKUP_AGE_IDENTITY_FILE (chave privada age)"
[ -s "$identity" ] || fail 2 "BACKUP_AGE_IDENTITY_FILE vazio ou inexistente: $identity"
identity="$(cd "$(dirname "$identity")" && pwd)/$(basename "$identity")"
command -v age > /dev/null || fail 2 "age não instalado (apt install age)"

cd "$(dirname "$0")/.."

(cd "$source_dir" && sha256sum --quiet -c SHA256SUMS) \
  || fail 2 "SHA256SUMS não confere: backup corrompido ou incompleto"

decrypt() {
  age -d -i "$identity" "$source_dir/$1"
}

for file in db.dump.age uploads.tar.age; do
  decrypt "$file" > /dev/null || fail 2 "não foi possível decifrar $file (chave privada errada?)"
done
docker compose up -d --wait db > /dev/null
tables="$(decrypt db.dump.age | docker compose exec -T db pg_restore --list | awk '/ TABLE /{n++} END{print n+0}')"
[ "$tables" -gt 0 ] || fail 2 "o dump não tem nenhuma tabela"
files="$(decrypt uploads.tar.age | tar -tf - | awk '!/\/$/{n++} END{print n+0}')"
echo "restore: conferido — $tables tabelas no dump, $files arquivos de foto"

if [ "$confirm" != true ]; then
  echo "restore: nada foi alterado. Repita com --confirmar para substituir banco e fotos."
  exit 0
fi

docker compose stop app
docker compose exec -T db psql -U estomasystech -d postgres -v ON_ERROR_STOP=1 -q \
  -c 'DROP DATABASE IF EXISTS estomasystech WITH (FORCE);' \
  -c 'CREATE DATABASE estomasystech OWNER estomasystech;'
decrypt db.dump.age \
  | docker compose exec -T db pg_restore -U estomasystech -d estomasystech --no-owner --exit-on-error
decrypt uploads.tar.age \
  | docker compose run --rm --no-deps -T --entrypoint sh app \
    -c 'find /app/uploads -mindepth 1 -delete && tar -C /app/uploads -xf -'
docker compose up -d --wait app
echo "restore: banco e fotos restaurados de $source_dir; app no ar"
