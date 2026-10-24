#!/usr/bin/env bash
# Etapa docker do `gate:local` (#565): o compose valida os segredos já no `build`, então eles
# são gerados (descartáveis) ANTES dele; o Postgres publica numa porta livre para não colidir
# com um Postgres local na 5432; e o que a etapa criou (containers e volumes) é removido ao sair.
set -euo pipefail

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -hex 32)}"
export DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
export RESEND_API_KEY="${RESEND_API_KEY:-re_smoke_invalid_key}"
export EMAIL_FROM="${EMAIL_FROM:-EstomaSysTech Smoke <smoke@estomasystech.test>}"

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

if [ -z "${POSTGRES_PORT:-}" ]; then
  POSTGRES_PORT=55432
  while port_busy "$POSTGRES_PORT"; do
    POSTGRES_PORT=$((POSTGRES_PORT + 1))
  done
fi
export POSTGRES_PORT

trap 'docker compose down -v --remove-orphans || true' EXIT

docker compose build
bash scripts/docker-smoke.sh
