#!/usr/bin/env bash
# Deploy pela API do Coolify 4.6.0 (ADR-095, plano A, #751). O recurso da `main` tem git_commit_sha=HEAD:
# o deploy implanta o HEAD da `main`. O script dispara, espera `finished` e CONFERE que o commit implantado
# é o ESPERADO_SHA (o SHA que a staging validou); divergência ou estado diferente de `finished` sai com 1.
# Nunca deploya sem confirmar; nunca faz rollback sozinho (migração sem `down`, ADR-039).
#
# Obrigatórias (env do passo): COOLIFY_URL (https://host), COOLIFY_TOKEN (habilidades read + deploy),
#   COOLIFY_APP_UUID, ESPERADO_SHA (7 a 40 hex)
# Opcionais: COOLIFY_ESPERA (minutos, padrão 20), COOLIFY_INTERVALO (segundos, padrão 10),
#   COOLIFY_CURL (cliente; só para teste)
# O token segue ao curl por stdin (--config -), nunca em argumento; a saída é filtrada (código HTTP e SHA).
set -uo pipefail

: "${COOLIFY_URL:?defina COOLIFY_URL}" "${COOLIFY_TOKEN:?defina COOLIFY_TOKEN}"
: "${COOLIFY_APP_UUID:?defina COOLIFY_APP_UUID}" "${ESPERADO_SHA:?defina ESPERADO_SHA}"
command -v jq > /dev/null || { echo "instale jq"; exit 2; }
base="${COOLIFY_URL%/}"
[[ "$base" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo "COOLIFY_URL precisa ser https://host"; exit 2; }
[[ "$COOLIFY_APP_UUID" =~ ^[A-Za-z0-9]+$ ]] || { echo "COOLIFY_APP_UUID inválido"; exit 2; }
[[ "$ESPERADO_SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "ESPERADO_SHA inválido"; exit 2; }
espera="${COOLIFY_ESPERA:-20}"
intervalo="${COOLIFY_INTERVALO:-10}"
[[ "$espera" =~ ^[0-9]+$ && "$intervalo" =~ ^[0-9]+$ ]] || { echo "COOLIFY_ESPERA/INTERVALO inválido"; exit 2; }
curl_bin="${COOLIFY_CURL:-curl}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# api CAMINHO [MÉTODO]: grava o corpo em $tmp e imprime só o código HTTP (000 em falha de rede).
api() {
  local metodo="${2:-GET}" codigo
  codigo="$({
    printf 'header = "Authorization: Bearer %s"\n' "$COOLIFY_TOKEN"
    printf 'request = "%s"\n' "$metodo"
  } | "$curl_bin" -sS -m 30 --config - -H 'Accept: application/json' -o "$tmp" -w '%{http_code}' "$base$1" 2> /dev/null || true)"
  echo "${codigo:-000}"
}

# No 4.6.0 o GET /deploy responde 405: o disparo é POST, com uuid e force na query.
code="$(api "/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false" POST)"
echo "POST /deploy -> HTTP $code"
dep="$(jq -r '.deployments[0].deployment_uuid // empty' "$tmp" 2> /dev/null)"
if [ "$code" != 200 ] || [[ ! "$dep" =~ ^[A-Za-z0-9]+$ ]]; then
  echo "::error title=Deploy não disparado::o Coolify não devolveu um deployment (HTTP $code)."
  exit 1
fi
echo "deployment $dep disparado; esperando até $espera min"

fim=$((SECONDS + espera * 60))
estado=""
sha=""
while [ "$SECONDS" -lt "$fim" ]; do
  code="$(api "/api/v1/deployments/$dep")"
  estado="$(jq -r '.status // empty' "$tmp" 2> /dev/null)"
  sha="$(jq -r '.commit // .git_commit_sha // empty' "$tmp" 2> /dev/null)"
  echo "HTTP $code status=${estado:-?}"
  if [ "$code" = 401 ] || [ "$code" = 403 ]; then
    echo "::error title=Token sem leitura::GET /deployments exige a habilidade read; confira no painel do Coolify."
    exit 1
  fi
  case "$estado" in
    finished) break ;;
    failed | cancelled*)
      echo "::error title=Deploy falhou::estado $estado. A produção NÃO foi revertida; veja o painel do Coolify (rollback é decisão humana, ADR-039)."
      exit 1
      ;;
  esac
  sleep "$intervalo"
done

if [ "$estado" != finished ]; then
  echo "::error title=Deploy não terminou::passaram $espera min sem 'finished' (último estado: ${estado:-?})."
  exit 1
fi
if [ -n "$sha" ] && [[ "$ESPERADO_SHA" == "$sha"* || "$sha" == "$ESPERADO_SHA"* ]]; then
  echo "Deploy ok: commit implantado ${sha:0:12} = SHA validado pela staging."
  exit 0
fi
echo "::error title=SHA divergente::implantado ${sha:-vazio}, esperado $ESPERADO_SHA. A main avançou durante o deploy? A produção ficou nesse commit; decida no painel."
exit 1
