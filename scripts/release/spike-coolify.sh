#!/usr/bin/env bash
# Spike do Coolify 4.6.0 (ADR-095, ticket 1): prova, com um token de escopo mínimo, o que a API deixa fazer
# para o deploy da tag exata. Roda NO PC DO OPERADOR (a nuvem do agente não alcança o Coolify). O token nunca
# vai para argumento, arquivo, log ou chat: entra por variável de ambiente e segue ao curl por stdin.
# A saída é filtrada (`jq`): só código HTTP e os campos listados abaixo, nunca o corpo inteiro.
#
# Obrigatórias: COOLIFY_URL (https://painel...), COOLIFY_TOKEN, COOLIFY_APP_UUID (recurso da `main`)
# Opcionais:
#   SPIKE_TAG_SHA   SHA do commit da tag a comparar com o do deployment (git rev-list -n1 vX.Y.Z)
#   SPIKE_DEPLOY=1  dispara o deploy do HEAD da `main` (REIMPLANTA A PRODUÇÃO com o HEAD atual da main:
#                   só rode com a main igual ao que está no ar, ou aponte COOLIFY_APP_UUID para um recurso de teste)
#   SPIKE_ESPERA    minutos esperando o deployment terminar (padrão 15)
# Cole a saída inteira no comentário da #746; ela não contém segredo.
set -uo pipefail

: "${COOLIFY_URL:?defina COOLIFY_URL}" "${COOLIFY_TOKEN:?defina COOLIFY_TOKEN}" "${COOLIFY_APP_UUID:?defina COOLIFY_APP_UUID}"
command -v jq > /dev/null || { echo "instale jq"; exit 2; }
base="${COOLIFY_URL%/}"
[[ "$base" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo "COOLIFY_URL precisa ser https://host"; exit 2; }
[[ "$COOLIFY_APP_UUID" =~ ^[A-Za-z0-9]+$ ]] || { echo "COOLIFY_APP_UUID inválido"; exit 2; }
espera="${SPIKE_ESPERA:-15}"
[[ "$espera" =~ ^[0-9]+$ ]] || { echo "SPIKE_ESPERA inválido"; exit 2; }
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# api CAMINHO: grava o corpo em $tmp e imprime só o código HTTP. O cabeçalho do token vai por stdin (--config -).
api() {
  printf 'header = "Authorization: Bearer %s"\n' "$COOLIFY_TOKEN" \
    | curl -sS -m 30 --config - -H 'Accept: application/json' -o "$tmp" -w '%{http_code}' "$base$1" 2> /dev/null || echo 000
}

echo "== 1. versão do Coolify"
code="$(api /api/v1/version)"; echo "HTTP $code  corpo=$(head -c 40 "$tmp" | tr -cd '0-9a-zA-Z.\n')"

echo "== 2. leitura do recurso da main (precisa de habilidade de leitura)"
code="$(api "/api/v1/applications/$COOLIFY_APP_UUID")"; echo "HTTP $code"
if [ "$code" = 200 ]; then
  jq '{status, git_branch, git_commit_sha, build_pack, fqdn}' "$tmp" 2> /dev/null || echo "(corpo não é JSON)"
else
  echo "(sem leitura do recurso com este token: o SHA do deployment terá de vir do passo 4)"
fi

if [ "${SPIKE_DEPLOY:-}" != 1 ]; then
  echo "== 3. deploy NÃO disparado (modo leitura). Para disparar: SPIKE_DEPLOY=1"
  exit 0
fi

echo "== 3. deploy do HEAD da main (habilidade deploy)"
code="$(api "/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false")"; echo "HTTP $code"
dep="$(jq -r '.deployments[0].deployment_uuid // empty' "$tmp" 2> /dev/null)"
[ -n "$dep" ] || { echo "sem deployment_uuid na resposta (campos: $(jq -c 'keys' "$tmp" 2> /dev/null))"; exit 1; }
[[ "$dep" =~ ^[A-Za-z0-9]+$ ]] || { echo "deployment_uuid inesperado"; exit 1; }
echo "deployment_uuid=$dep"

echo "== 4. estado e SHA do deployment (até $espera min)"
fim=$((SECONDS + espera * 60))
while [ "$SECONDS" -lt "$fim" ]; do
  code="$(api "/api/v1/deployments/$dep")"
  estado="$(jq -r '.status // empty' "$tmp" 2> /dev/null)"
  echo "HTTP $code status=${estado:-?}"
  case "$estado" in finished | failed | cancelled*) break ;; esac
  sleep 10
done
jq '{status, commit, git_commit_sha, application_name, created_at, finished_at}' "$tmp" 2> /dev/null || true
sha="$(jq -r '.commit // .git_commit_sha // empty' "$tmp" 2> /dev/null)"

echo "== 5. SHA do deployment x SHA da tag"
if [ -z "${SPIKE_TAG_SHA:-}" ]; then
  echo "SPIKE_TAG_SHA não informado: compare à mão."
elif [ -n "$sha" ] && [[ "$SPIKE_TAG_SHA" == "$sha"* || "$sha" == "$SPIKE_TAG_SHA"* ]]; then
  echo "IGUAL: o HEAD da main implantado é o commit da tag (plano A)."
else
  echo "DIFERENTE ou ilegível: sha=${sha:-vazio}. O deploy da tag exata precisaria fixar o commit (plano B)."
fi
