#!/usr/bin/env bash
# Smoke do backup/restore (#206), rodado pelo CI depois de `docker compose build`:
# sobe Postgres + app, grava uma linha e uma foto, faz o backup cifrado com uma
# chave age descartável, apaga tudo (down -v), confere que o restore sem
# --confirmar não altera nada e restaura com --confirmar a partir da cópia
# "fora do servidor" (com o app parado, como no Coolify). Termina com o app healthy e o
# dado de volta. Usa o alvo padrão do compose (scripts/backup-target.sh).
set -euo pipefail

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -hex 32)}"
export DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
export BLIND_INDEX_PEPPER="${BLIND_INDEX_PEPPER:-$(openssl rand -hex 32)}"
export COMPOSE_FILE=docker-compose.yml

cd "$(dirname "$0")/.."
work="$(mktemp -d)"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose logs app || true
  fi
  docker compose down -v || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

# O HEALTHCHECK é o liveness `/api/health` (#212), que não depende do banco:
# `up --wait` pode voltar antes de o app terminar a migração do boot. O
# readiness só dá 200 com o banco no ar e todas as migrações aplicadas.
wait_ready() {
  for _ in $(seq 1 60); do
    if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
      return 0
    fi
    sleep 2
  done
  echo "app não ficou pronto (banco/migrações)" >&2
  return 1
}

sql() {
  docker compose exec -T db psql -U estomasystech -d estomasystech -tAq -v ON_ERROR_STOP=1 -c "$1"
}

age-keygen -o "$work/key.txt" 2> /dev/null
age-keygen -y "$work/key.txt" > "$work/recipients.txt"
mkdir "$work/offsite"

docker compose up -d --no-build --wait
wait_ready
sql "CREATE TABLE backup_smoke (v text); INSERT INTO backup_smoke VALUES ('prontuario');"
docker compose exec -T app sh -c 'mkdir -p /app/uploads/c1 && echo foto > /app/uploads/c1/p.jpg'
migrations="$(sql 'SELECT count(*) FROM drizzle.__drizzle_migrations')"

BACKUP_AGE_RECIPIENTS_FILE="$work/recipients.txt" \
  BACKUP_DIR="$work/local" \
  BACKUP_OFFSITE_CMD='cp -R "$BACKUP_PATH" "$OFFSITE/"' \
  OFFSITE="$work/offsite" \
  bash scripts/backup.sh
backup="$(find "$work/offsite" -mindepth 1 -maxdepth 1 -type d)"
test -n "$backup"
for file in db.dump.age uploads.tar.age; do
  test "$(head -c 21 "$backup/$file")" = "age-encryption.org/v1"
done
if age -d -i "$work/key.txt" "$backup/db.dump.age" \
  | docker compose exec -T db pg_restore -f - | grep "prontuario" > /dev/null; then
  echo "✓ dump decifrado contém o dado"
else
  echo "dump decifrado não contém o dado" >&2
  exit 1
fi
echo "✓ backup cifrado com age e copiado para fora do servidor"

docker compose down -v
docker compose up -d --no-build --wait
wait_ready
BACKUP_AGE_IDENTITY_FILE="$work/key.txt" bash scripts/restore.sh "$backup"
test -z "$(sql "SELECT to_regclass('backup_smoke')")"
echo "✓ restore sem --confirmar não altera nada"

docker compose stop app
BACKUP_AGE_IDENTITY_FILE="$work/key.txt" bash scripts/restore.sh "$backup" --confirmar
docker compose up -d --no-build --wait app
wait_ready
test "$(sql 'SELECT v FROM backup_smoke')" = "prontuario"
test "$(sql 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = "$migrations"
test "$(docker compose exec -T app cat /app/uploads/c1/p.jpg)" = "foto"
echo "✓ banco e fotos restaurados; app healthy"
