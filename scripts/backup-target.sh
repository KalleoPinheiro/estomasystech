# shellcheck shell=bash
# Alvo do backup e do restore (#206, ADR-040), lido por scripts/backup.sh e scripts/restore.sh.
#
# Produção no Coolify: BACKUP_DB_CONTAINER (nome do container do Postgres gerenciado) e
# BACKUP_UPLOADS_VOLUME (volume montado em /app/uploads no app). Sem eles, o alvo é o
# projeto docker compose do repositório (serviço `db` e volume `uploads`), como no CI.
# BACKUP_DB_NAME troca o banco (padrão: POSTGRES_DB do container do banco).
#
# Espera uma função `fail <saída> <mensagem>` definida por quem carrega este arquivo.

resolve_target() {
  db_container="${BACKUP_DB_CONTAINER:-}"
  uploads_volume="${BACKUP_UPLOADS_VOLUME:-}"
  db_name="${BACKUP_DB_NAME:-}"
  command -v docker > /dev/null || fail 2 "docker não encontrado"

  if [ -z "$db_container" ]; then
    db_container="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && docker compose ps -q db 2> /dev/null || true)"
    [ -n "$db_container" ] || fail 2 "defina BACKUP_DB_CONTAINER (ou suba o compose do repositório)"
  fi
  [ "$(docker inspect -f '{{.State.Running}}' "$db_container" 2> /dev/null)" = true ] \
    || fail 2 "o container do banco não está rodando: $db_container"

  if [ -z "$uploads_volume" ]; then
    uploads_volume="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$db_container")_uploads"
  fi
  docker volume inspect "$uploads_volume" > /dev/null 2>&1 \
    || fail 2 "volume de fotos não encontrado: $uploads_volume"

  # A imagem do próprio banco já está no host: o leitor do volume não baixa nada.
  helper_image="$(docker inspect -f '{{.Config.Image}}' "$db_container")"
}

# Roda um trecho sh no container do banco, com "$db" = banco do app. Pela conexão local
# do container: nenhuma senha passa pelo host.
in_db() {
  docker exec -i -e "DB_NAME=$db_name" "$db_container" sh -c \
    'db="${DB_NAME:-${POSTGRES_DB:-$POSTGRES_USER}}"; '"$1"
}

# Roda um trecho sh com o volume de fotos em /data (modo ro ou rw), sem rede e sem log:
# o tar passa pelo stdout e não pode parar em claro no json-file do Docker.
in_uploads() {
  docker run --rm -i --network none --log-driver none -v "$uploads_volume:/data:$1" \
    --entrypoint sh "$helper_image" -c "$2"
}
