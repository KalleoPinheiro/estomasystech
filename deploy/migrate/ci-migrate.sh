#!/usr/bin/env bash
# Migração de produção disparada pelo Release deploy (ADR-113). É o ÚNICO comando da chave SSH de migração
# (authorized_keys com `restrict,command="sudo /opt/estomasystech-migrate/ci-migrate.sh"`; o sudoers repassa só
# SSH_ORIGINAL_COMMAND). Roda `psql` DENTRO do container do Postgres como o dono do banco, pelo socket local e
# sem senha: o canal que funcionou na v0.9.1 (a senha do dono não autentica numa URL por túnel).
#
# Comandos aceitos (SSH_ORIGINAL_COMMAND), nada além disso:
#   estado                  lista o que o banco já tem (tabela do Drizzle e função do readiness)
#   simular                 lê SQL do stdin, roda numa transação e dá ROLLBACK (nada é gravado)
#   aplicar                 lê SQL do stdin e roda numa transação com COMMIT; qualquer erro desfaz tudo.
#                           O SQL tem de terminar na linha `-- ESTOMASYSTECH-FIM`; sem ela a entrada é recusada
#   desfazer-versao X.Y.Z   apaga a linha de app_releases da versão revertida (rollback automático)
# Resposta: linhas de dados e UMA linha final, sem segredo:
#   ESTADO_OK | SIMULACAO_OK | MIGRACAO_OK | VERSAO_DESFEITA X.Y.Z  (saída 0)
#   MIGRACAO_FALHOU <motivo curto>                                  (saída 1)
#
# Configuração (/etc/estomasystech/migrate.env, CHAVE=valor, modo 0600, dono root):
#   CI_MIGRATE_DB_CONTAINER  obrigatória: nome do container do Postgres (listar com `sudo docker ps`)
#   CI_MIGRATE_DB_USER       padrão estomasystech (dono das tabelas)
#   CI_MIGRATE_DB_NAME       padrão estomasystech
# Só para teste: CI_MIGRATE_ENV_FILE, CI_MIGRATE_DOCKER, CI_MIGRATE_MAX_BYTES.
set -uo pipefail
umask 077

env_file="${CI_MIGRATE_ENV_FILE:-/etc/estomasystech/migrate.env}"
docker_bin="${CI_MIGRATE_DOCKER:-docker}"
max_bytes="${CI_MIGRATE_MAX_BYTES:-8388608}"

fail() {
  echo "MIGRACAO_FALHOU $1"
  exit 1
}

[ "$#" -eq 0 ] || fail "argumentos não são aceitos"
[ -r "$env_file" ] || fail "configuração da migração ilegível"
set -a
# shellcheck disable=SC1090
. "$env_file" > /dev/null 2>&1 || fail "configuração da migração inválida"
set +a
container="${CI_MIGRATE_DB_CONTAINER:-}"
usuario="${CI_MIGRATE_DB_USER:-estomasystech}"
banco="${CI_MIGRATE_DB_NAME:-estomasystech}"
[[ "$container" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || fail "CI_MIGRATE_DB_CONTAINER ausente ou inválido"
[[ "$usuario" =~ ^[a-z_][a-z0-9_]*$ && "$banco" =~ ^[a-z_][a-z0-9_]*$ ]] || fail "usuário ou banco inválido"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# psql_dono [args do psql]: sempre o dono, sem senha, parando no primeiro erro.
psql_dono() {
  "$docker_bin" exec -i "$container" psql -X -q -U "$usuario" -d "$banco" -v ON_ERROR_STOP=1 "$@"
}

# consulta SQL: uma linha de resultado sem alinhamento, ou falha.
consulta() {
  psql_dono -At -c "$1" 2> "$tmp/erro"
}

# Marca de fim de entrada: sem ela o SSH pode ter cortado o fluxo no meio e um COMMIT gravaria só parte da migração.
fim_do_sql="-- ESTOMASYSTECH-FIM"

ler_sql() {
  head -c "$((max_bytes + 1))" > "$tmp/entrada.sql" || fail "falha ao receber o SQL"
  [ -s "$tmp/entrada.sql" ] || fail "SQL vazio no stdin"
  [ "$(wc -c < "$tmp/entrada.sql")" -le "$max_bytes" ] || fail "SQL maior que $max_bytes bytes"
  [ "$(tail -n 1 "$tmp/entrada.sql" | tr -d '\r')" = "$fim_do_sql" ] || fail "SQL sem a marca de fim (entrada cortada)"
}

# executar_transacao FINAL TIMEOUT: BEGIN, lock_timeout, o SQL do stdin e FINAL (COMMIT ou ROLLBACK).
# Sem COMMIT o psql sai no primeiro erro (ON_ERROR_STOP) e o Postgres desfaz a transação ao fechar a conexão.
executar_transacao() {
  local final="$1" espera="$2"
  {
    echo "BEGIN;"
    echo "SET LOCAL lock_timeout = '${espera}';"
    cat "$tmp/entrada.sql"
    echo
    echo "${final};"
  } | psql_dono -f - > "$tmp/saida" 2> "$tmp/erro"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    # Só o motivo do Postgres (DDL, sem dado de paciente): ajuda a achar a migração que falhou.
    fail "psql saiu $rc: $(grep -E 'ERROR|FATAL|LINE' "$tmp/erro" | head -n 3 | tr '\n' ' ' | tr -d '\r' | cut -c1-240)"
  fi
}

case "${SSH_ORIGINAL_COMMAND:-}" in
  estado)
    existe="$(consulta "select to_regclass('drizzle.__drizzle_migrations') is not null")" || fail "banco inacessível"
    if [ "$existe" = t ]; then
      consulta "select 'D ' || created_at from drizzle.__drizzle_migrations order by created_at" || fail "tabela do Drizzle ilegível"
    else
      echo "TABELA_AUSENTE"
    fi
    existe="$(consulta "select to_regprocedure('public.app__drizzle_migrations()') is not null")" || fail "banco inacessível"
    if [ "$existe" = t ]; then
      consulta "select 'F ' || t.created_at from public.app__drizzle_migrations() as t(created_at) order by 1" || fail "função do readiness ilegível"
    else
      echo "FUNCAO_AUSENTE"
    fi
    echo "ESTADO_OK"
    ;;
  simular)
    ler_sql
    executar_transacao ROLLBACK 10s
    echo "SIMULACAO_OK"
    ;;
  aplicar)
    ler_sql
    executar_transacao COMMIT 60s
    echo "MIGRACAO_OK"
    ;;
  desfazer-versao\ *)
    versao="${SSH_ORIGINAL_COMMAND#desfazer-versao }"
    [[ "$versao" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "versão inválida"
    consulta "delete from app_releases where version = '$versao'" > /dev/null || fail "app_releases inacessível"
    echo "VERSAO_DESFEITA $versao"
    ;;
  *)
    fail "comando não aceito"
    ;;
esac
