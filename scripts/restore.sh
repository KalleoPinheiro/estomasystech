#!/usr/bin/env bash
# Restauração de um backup gerado por scripts/backup.sh (#206, ADR-040).
#
#   scripts/restore.sh <diretório do backup>              confere sem alterar nada
#   scripts/restore.sh <diretório do backup> --confirmar  SUBSTITUI banco e fotos
#
# Conferência: somas SHA256, decifra o dump e lista o conteúdo (pg_restore --list)
# e o tar das fotos. Com --confirmar: recria o banco do app, restaura o dump e troca o
# conteúdo do volume de fotos. O app precisa estar PARADO (Coolify: Stop; compose:
# "docker compose stop app"): com conexão aberta no banco, o script recusa. Depois suba o
# app de novo; as migrações do boot alinham o schema se o backup for de versão anterior.
# Alvo (container do banco e volume de fotos): scripts/backup-target.sh.
#
# Variáveis:
#   BACKUP_AGE_IDENTITY_FILE  obrigatória: chave PRIVADA age (traga do cofre só para
#                             a restauração; não deixe no servidor)
#
# Saída: 0 conferido ou restaurado; 2 uso ou pré-condição (nada foi alterado);
# 1 falha inesperada (com --confirmar, o banco pode ter ficado parcial: rode de novo).
# Os trechos em aspas simples expandem dentro do container (in_db/in_uploads), não aqui.
# shellcheck disable=SC2016
set -euo pipefail
umask 077

# shellcheck source=scripts/backup-target.sh
. "$(dirname "$0")/backup-target.sh"

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
resolve_target

(cd "$source_dir" && sha256sum --quiet -c SHA256SUMS) \
  || fail 2 "SHA256SUMS não confere: backup corrompido ou incompleto"

decrypt() {
  age -d -i "$identity" "$source_dir/$1"
}

for file in db.dump.age uploads.tar.age; do
  decrypt "$file" > /dev/null || fail 2 "não foi possível decifrar $file (chave privada errada?)"
done
tables="$(decrypt db.dump.age | in_db 'exec pg_restore --list' | awk '/ TABLE /{n++} END{print n+0}')"
[ "$tables" -gt 0 ] || fail 2 "o dump não tem nenhuma tabela"
files="$(decrypt uploads.tar.age | tar -tf - | awk '!/\/$/{n++} END{print n+0}')"
echo "restore: conferido — $tables tabelas no dump, $files arquivos de foto"

if [ "$confirm" != true ]; then
  echo "restore: nada foi alterado. Repita com --confirmar para substituir banco e fotos."
  exit 0
fi

# Só o psql desta conferência pode estar conectado: com o app no ar, recusa sem alterar.
connections="$(in_db 'psql -U "$POSTGRES_USER" -d template1 -tAq -v ON_ERROR_STOP=1 -v db="$db"' << 'SQL'
SELECT count(*) FROM pg_stat_activity WHERE datname = :'db';
SQL
)"
[ "$connections" = 0 ] \
  || fail 2 "há $connections conexão(ões) no banco: pare o app antes (Coolify: Stop; compose: docker compose stop app)"

in_db 'psql -U "$POSTGRES_USER" -d template1 -q -v ON_ERROR_STOP=1 -v db="$db" -v owner="$POSTGRES_USER"' << 'SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db" OWNER :"owner";
SQL
decrypt db.dump.age \
  | in_db 'exec pg_restore -U "$POSTGRES_USER" -d "$db" --no-owner --no-acl --exit-on-error'
decrypt uploads.tar.age \
  | in_uploads rw 'find /data -mindepth 1 -delete && tar -C /data -xf -'
echo "restore: banco e fotos restaurados de $source_dir."
echo "restore: suba o app (Coolify: Start; compose: docker compose up -d app) e rode a retenção (POST /api/retention/run)."
