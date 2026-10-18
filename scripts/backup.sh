#!/usr/bin/env bash
# Backup diário cifrado da produção (#206, ADR-040): Postgres e volume de fotos do Coolify
# ou, sem BACKUP_DB_CONTAINER, do docker compose do repositório (scripts/backup-target.sh).
#
# Gera em $BACKUP_DIR/<UTC>/ dois arquivos cifrados com age (chave pública):
#   db.dump.age      — pg_dump -Fc do banco do app, rodado dentro do container do Postgres
#   uploads.tar.age  — tar do volume de fotos (montado em /app/uploads no app)
#   SHA256SUMS       — soma dos arquivos cifrados (integridade na cópia)
# O dado em claro nunca toca o disco: cada dump sai do container direto para o age.
# Depois copia para fora do servidor com $BACKUP_OFFSITE_CMD e apaga as cópias
# locais com mais de $BACKUP_KEEP_DAYS dias. Roteiro: docs/engineering/producao.md § 5.
# Não depende de um checkout: basta este arquivo e scripts/backup-target.sh lado a lado.
#
# Variáveis (além das de scripts/backup-target.sh):
#   BACKUP_AGE_RECIPIENTS_FILE  obrigatória: arquivo com a(s) chave(s) pública(s) age
#                               (a chave privada fica FORA do servidor)
#   BACKUP_RCLONE_DEST          destino rclone fora do servidor (ex.: r2:bucket/estomasystech);
#                               o backup novo vai para <destino>/<UTC>/ com `rclone copy`
#   BACKUP_OFFSITE_CMD          ou um comando (sh) que leva o backup para fora do servidor;
#                               recebe BACKUP_PATH (backup novo) e BACKUP_DIR. Um dos dois
#                               é obrigatório
#   BACKUP_DIR                  padrão /var/backups/estomasystech
#   BACKUP_KEEP_DAYS            padrão 30
#
# Saída: 0 ok; 2 configuração (nada foi gerado); 3 backup local feito, mas a cópia
# fora do servidor falhou ou não está configurada; 1 falha inesperada.
# Os trechos em aspas simples expandem dentro do container (in_db/in_uploads), não aqui.
# shellcheck disable=SC2016
set -euo pipefail
umask 077

# shellcheck source=scripts/backup-target.sh
. "$(dirname "$0")/backup-target.sh"

fail() {
  echo "backup: $2" >&2
  exit "$1"
}

recipients="${BACKUP_AGE_RECIPIENTS_FILE:-}"
backup_dir="${BACKUP_DIR:-/var/backups/estomasystech}"
keep_days="${BACKUP_KEEP_DAYS:-30}"
offsite_cmd="${BACKUP_OFFSITE_CMD:-}"
rclone_dest="${BACKUP_RCLONE_DEST:-}"
if [ -z "$offsite_cmd" ] && [ -n "$rclone_dest" ]; then
  # --s3-no-check-bucket: o token do bucket só lê e grava objetos (runbook § 5).
  offsite_cmd='rclone copy --s3-no-check-bucket "$BACKUP_PATH" "$BACKUP_RCLONE_DEST/${BACKUP_PATH##*/}"'
fi

[ -n "$recipients" ] || fail 2 "defina BACKUP_AGE_RECIPIENTS_FILE (chave pública age)"
[ -s "$recipients" ] || fail 2 "BACKUP_AGE_RECIPIENTS_FILE vazio ou inexistente: $recipients"
[[ "$keep_days" =~ ^[0-9]+$ ]] || fail 2 "BACKUP_KEEP_DAYS precisa ser um número de dias"
command -v age > /dev/null || fail 2 "age não instalado (apt install age)"
command -v flock > /dev/null || fail 2 "flock não instalado (util-linux)"
[ -z "$rclone_dest" ] || command -v rclone > /dev/null || fail 2 "rclone não instalado (apt install rclone)"
resolve_target

mkdir -p "$backup_dir"
exec 9> "$backup_dir/.lock"
flock -n 9 || fail 2 "outro backup em andamento ($backup_dir/.lock)"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$backup_dir/.$stamp.partial"
target="$backup_dir/$stamp"
trap 'rm -rf "$partial"' EXIT
mkdir "$partial"

in_db 'exec pg_dump -U "$POSTGRES_USER" -d "$db" -Fc' < /dev/null \
  | age -R "$recipients" -o "$partial/db.dump.age"

# Lê o volume mesmo com o app parado. A retenção LGPD apaga fotos: não agende os dois
# juntos (runbook § 5), ou o tar falha com uma foto sumindo no meio da leitura.
in_uploads ro 'exec tar -C /data -cf - .' < /dev/null \
  | age -R "$recipients" -o "$partial/uploads.tar.age"

(cd "$partial" && sha256sum db.dump.age uploads.tar.age > SHA256SUMS)
mv "$partial" "$target"
echo "backup: $target ($(du -sh "$target" | cut -f1))"

[ -n "$offsite_cmd" ] || fail 3 "BACKUP_OFFSITE_CMD não definido (nem BACKUP_RCLONE_DEST): o backup ficou só no servidor"
BACKUP_PATH="$target" BACKUP_DIR="$backup_dir" BACKUP_RCLONE_DEST="$rclone_dest" sh -c "$offsite_cmd" \
  || fail 3 "cópia para fora do servidor falhou; o backup local foi mantido"
echo "backup: cópia fora do servidor ok"

find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime +"$keep_days" \
  -exec rm -rf {} +
