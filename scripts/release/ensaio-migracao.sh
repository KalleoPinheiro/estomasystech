#!/usr/bin/env bash
# Ensaio da migração de produção no Actions, sem segredo e sem tocar produção (ADR-113). Roda no job `validar`
# do Release deploy (dry_run ou não) contra um Postgres 18 descartável e exercita o CAMINHO REAL: o mesmo
# `migrar-producao.sh`, o mesmo `deploy/migrate/ci-migrate.sh` e o mesmo plano, trocando só o transporte
# (ssh -> chamada local; `docker exec` -> psql direto no serviço).
#   1. monta o banco "da versão anterior" (pasta drizzle/ da tag anterior, migrador do drizzle-orm);
#   2. `simular`: detecta as pendências e roda o SQL com ROLLBACK; o banco não pode mudar;
#   3. `migrar`: aplica; a função do readiness tem de cobrir o journal inteiro;
#   4. de novo `migrar`: nada pendente (idempotência);
#   5. compara (hash, created_at) com um banco migrado do zero pelo drizzle-orm: têm de ser idênticos, ou um
#      `db:migrate` futuro discordaria do que o plano gravou.
# Obrigatórias: PGHOST, PGPORT, PGUSER (estomasystech), PGPASSWORD, PGDATABASE (estomasystech), VERSION (X.Y.Z)
set -uo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}" "${VERSION:?}"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
erro() { echo "::error title=Ensaio da migração::$1"; exit 1; }

# Tag anterior: a maior vX.Y.Z menor que a versão publicada. Sem tag anterior (primeira release) não há o que ensaiar.
tags="$(git -C "$raiz" tag --list 'v[0-9]*.[0-9]*.[0-9]*')" || erro "não consegui listar as tags do repositório"
anterior="$({ printf '%s\n' "$tags" | sed 's/^v//' | { grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' || true; }; echo "$VERSION"; } \
  | sort -V -u | awk -v v="$VERSION" '$0 == v {exit} {last=$0} END {printf "%s", last}')"
if [ -z "$anterior" ]; then
  echo "Sem tag anterior a $VERSION: nada a ensaiar."
  exit 0
fi
echo "Ensaio: banco da v$anterior -> esquema da v$VERSION."
mkdir -p "$tmp/anterior"
git -C "$raiz" archive "v$anterior" drizzle | tar -x -C "$tmp/anterior" || erro "não foi possível ler drizzle/ da tag v$anterior"

url() { echo "postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$1"; }
psql_admin() { psql -X -q -At -v ON_ERROR_STOP=1 -d postgres "$@"; }
psql_banco() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
tsx_bin="$raiz/node_modules/.bin/tsx"

psql_admin -c "DROP DATABASE IF EXISTS ensaio_ref WITH (FORCE)" -c "CREATE DATABASE ensaio_ref"
DATABASE_URL="$(url "$PGDATABASE")" "$tsx_bin" "$raiz/scripts/release/ensaio-migrar.ts" "$tmp/anterior/drizzle" || erro "o banco da v$anterior não migrou"

# Transporte local: o "ssh" entrega o comando como SSH_ORIGINAL_COMMAND ao ci-migrate.sh; o "docker exec" vira psql direto.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/ssh" <<'SSH'
#!/usr/bin/env bash
for ultimo; do :; done
SSH_ORIGINAL_COMMAND="$ultimo" exec bash "$ENSAIO_CI_MIGRATE"
SSH
cat > "$tmp/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
# docker exec -i <container> psql ...: ignora o container e fala com o Postgres do serviço.
shift 3
exec "$@"
DOCKER
chmod +x "$tmp/bin/ssh" "$tmp/bin/docker"
printf 'CI_MIGRATE_DB_CONTAINER=ensaio\nCI_MIGRATE_DB_USER=%s\nCI_MIGRATE_DB_NAME=%s\n' "$PGUSER" "$PGDATABASE" > "$tmp/migrate.env"

export ENSAIO_CI_MIGRATE="$raiz/deploy/migrate/ci-migrate.sh"
export CI_MIGRATE_ENV_FILE="$tmp/migrate.env" CI_MIGRATE_DOCKER="$tmp/bin/docker"
export MIGRAR_SSH="$tmp/bin/ssh" MIGRAR_PASTA="$raiz/drizzle" MIGRAR_TSX="$tsx_bin"
export VPS_MIGRATE_SSH_KEY=ensaio VPS_KNOWN_HOSTS=ensaio VPS_HOST=ensaio.invalid
migrar() { bash "$raiz/scripts/release/migrar-producao.sh" "$1"; }
contar() { psql_banco -c "select count(*) from drizzle.__drizzle_migrations"; }

antes="$(contar)"
GITHUB_OUTPUT="$tmp/saida" migrar simular || erro "a simulação falhou"
[ "$(contar)" = "$antes" ] || erro "a simulação gravou no banco (deveria dar ROLLBACK)"
pendentes="$(sed -n 's/^pendentes=//p' "$tmp/saida")"
echo "Pendências detectadas: ${pendentes:-?}."

migrar migrar || erro "a migração do ensaio falhou"
migrar migrar | tee "$tmp/segunda" || erro "a segunda passada falhou"
grep -q 'Nenhuma migração pendente' "$tmp/segunda" || erro "a segunda passada ainda achou migração pendente"

DATABASE_URL="$(url ensaio_ref)" "$tsx_bin" "$raiz/scripts/release/ensaio-migrar.ts" "$raiz/drizzle" || erro "o banco de referência não migrou"
consulta="select hash || ' ' || created_at from drizzle.__drizzle_migrations order by created_at"
psql_banco -c "$consulta" > "$tmp/plano.txt" || erro "não consegui ler as migrações do banco do plano"
psql_banco -d ensaio_ref -c "$consulta" > "$tmp/referencia.txt" || erro "não consegui ler as migrações do banco de referência"
[ -s "$tmp/plano.txt" ] || erro "nenhuma migração gravada para comparar"
diff -q "$tmp/plano.txt" "$tmp/referencia.txt" > /dev/null || erro "hash ou carimbo gravado pelo plano difere do migrador do drizzle-orm"
psql_admin -c "DROP DATABASE IF EXISTS ensaio_ref WITH (FORCE)"
echo "Ensaio ok: simulação sem gravar, migração, segunda passada sem pendência e hashes iguais aos do drizzle-orm."
