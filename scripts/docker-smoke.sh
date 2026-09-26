#!/usr/bin/env bash
# Smoke do container de produção (issue #203), rodado pelo CI depois de
# `docker compose build`: sobe Postgres + app pelo docker-compose.yml do repo,
# espera o healthcheck, confere /api/auth/providers e que o usuário do app
# (nextjs) grava no volume de fotos e o arquivo sobrevive à recriação do
# container (#191). Segredos são descartáveis, gerados a cada execução.
set -euo pipefail

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -hex 32)}"
export RESEND_API_KEY="${RESEND_API_KEY:-re_smoke_invalid_key}"
export EMAIL_FROM="${EMAIL_FROM:-VittaFlow Smoke <smoke@vitta.test>}"
APP_URL_LOCAL="http://localhost:${APP_PORT:-3000}"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose logs app || true
  fi
  docker compose down -v || true
  exit "$status"
}
trap cleanup EXIT

wait_healthy() {
  local container
  container="$(docker compose ps -q app)"
  for _ in $(seq 1 60); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = "healthy" ]; then
      return 0
    fi
    sleep 2
  done
  echo "app não ficou healthy em 120s" >&2
  return 1
}

docker compose up -d --no-build
wait_healthy
curl -fsS "$APP_URL_LOCAL/api/auth/providers" > /dev/null
echo "✓ /api/auth/providers 200"

docker compose exec -T app sh -c 'id -un | grep -qx nextjs && echo smoke > /app/uploads/.smoke'
echo "✓ nextjs grava em /app/uploads"

docker compose up -d --no-build --force-recreate --no-deps app
wait_healthy
test "$(docker compose exec -T app cat /app/uploads/.smoke)" = "smoke"
echo "✓ arquivo de foto sobrevive à recriação do container (volume uploads)"
