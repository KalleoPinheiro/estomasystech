#!/usr/bin/env bash
# Backup diário cifrado da produção em VPS + docker compose (#206).
#
# Gera em $BACKUP_DIR/<UTC>/ dois arquivos cifrados com age (chave pública):
#   db.dump.age      — pg_dump -Fc do Postgres do serviço `db`
#   uploads.tar.age  — tar do volume de fotos (`uploads`, montado no serviço `app`)
#   SHA256SUMS       — soma dos arquivos cifrados (integridade na cópia)
# O dado em claro nunca toca o disco: cada dump sai do container direto para o age.
# Depois copia para fora do servidor com $BACKUP_OFFSITE_CMD e apaga as cópias
# locais com mais de $BACKUP_KEEP_DAYS dias. Roteiro: docs/engineering/producao.md § 5.
#
# Variáveis:
#   BACKUP_AGE_RECIPIENTS_FILE  obrigatória: arquivo com a(s) chave(s) pública(s) age
#                               (a chave privada fica FORA do servidor)
#   BACKUP_OFFSITE_CMD          obrigatória: comando (sh) que leva o backup para fora do
#                               servidor; recebe BACKUP_PATH (backup novo) e BACKUP_DIR
#   BACKUP_DIR                  padrão /var/backups/vitta
#   BACKUP_KEEP_DAYS            padrão 30
#
# Saída: 0 ok; 2 configuração (nada foi gerado); 3 backup local feito, mas a cópia
# fora do servidor falhou ou não está configurada; 1 falha inesperada.
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

fail() {
  echo "backup: $2" >&2
  exit "$1"
}

recipients="${BACKUP_AGE_RECIPIENTS_FILE:-}"
backup_dir="${BACKUP_DIR:-/var/backups/vitta}"
keep_days="${BACKUP_KEEP_DAYS:-30}"
offsite_cmd="${BACKUP_OFFSITE_CMD:-}"

[ -n "$recipients" ] || fail 2 "defina BACKUP_AGE_RECIPIENTS_FILE (chave pública age)"
[ -s "$recipients" ] || fail 2 "BACKUP_AGE_RECIPIENTS_FILE vazio ou inexistente: $recipients"
[[ "$keep_days" =~ ^[0-9]+$ ]] || fail 2 "BACKUP_KEEP_DAYS precisa ser um número de dias"
command -v age > /dev/null || fail 2 "age não instalado (apt install age)"
command -v flock > /dev/null || fail 2 "flock não instalado (util-linux)"

mkdir -p "$backup_dir"
exec 9> "$backup_dir/.lock"
flock -n 9 || fail 2 "outro backup em andamento ($backup_dir/.lock)"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$backup_dir/.$stamp.partial"
target="$backup_dir/$stamp"
trap 'rm -rf "$partial"' EXIT
mkdir "$partial"

docker compose exec -T db pg_dump -U vitta -d vitta -Fc \
  | age -R "$recipients" -o "$partial/db.dump.age"

# Serviço sem log (docker-compose.yml): o stdout do `run` não vai para o json-file.
# Monta o volume mesmo com o app parado.
docker compose run --rm --no-deps -T --entrypoint tar uploads-backup -C /app/uploads -cf - . \
  | age -R "$recipients" -o "$partial/uploads.tar.age"

(cd "$partial" && sha256sum db.dump.age uploads.tar.age > SHA256SUMS)
mv "$partial" "$target"
echo "backup: $target ($(du -sh "$target" | cut -f1))"

[ -n "$offsite_cmd" ] || fail 3 "BACKUP_OFFSITE_CMD não definido: o backup ficou só no servidor"
BACKUP_PATH="$target" BACKUP_DIR="$backup_dir" sh -c "$offsite_cmd" \
  || fail 3 "cópia para fora do servidor falhou; o backup local foi mantido"
echo "backup: cópia fora do servidor ok"

find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime +"$keep_days" \
  -exec rm -rf {} +
