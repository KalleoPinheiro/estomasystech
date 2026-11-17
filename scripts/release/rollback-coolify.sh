#!/usr/bin/env bash
# Rollback da IMAGEM pela API do Coolify (ADR-113). O recurso da `main` tem git_commit_sha=HEAD; para voltar ao
# commit da versão anterior o script fixa o SHA dela, faz o deploy forçado, espera `finished`, CONFERE o commit
# implantado e, aconteça o que acontecer, devolve o recurso ao valor original (HEAD). O banco não é tocado: as
# migrações são aditivas (expand/contract) e o código antigo ignora o que foi acrescentado.
#
# Uso: rollback-coolify.sh preflight | rollback
#   preflight: prova que o token ESCREVE no recurso (PATCH com o próprio valor atual: não muda nada). Roda ANTES
#              do deploy; sem poder reverter, o Release deploy nem começa a trocar o container.
#   rollback : precisa de ROLLBACK_SHA (7 a 40 hex, o commit da tag anterior).
# Obrigatórias (env do passo): COOLIFY_URL (https://host), COOLIFY_TOKEN (read, write e deploy), COOLIFY_APP_UUID
# Opcionais: COOLIFY_ESPERA (min, padrão 20), COOLIFY_INTERVALO (s, padrão 10), COOLIFY_CURL (só teste)
# O token segue ao curl por stdin (--config -), nunca em argumento; a saída é filtrada (código HTTP e SHA).
set -uo pipefail

modo="${1:-}"
[ "$modo" = preflight ] || [ "$modo" = rollback ] || { echo "uso: rollback-coolify.sh preflight|rollback"; exit 2; }
: "${COOLIFY_URL:?defina COOLIFY_URL}" "${COOLIFY_TOKEN:?defina COOLIFY_TOKEN}" "${COOLIFY_APP_UUID:?defina COOLIFY_APP_UUID}"
command -v jq > /dev/null || { echo "instale jq"; exit 2; }
base="${COOLIFY_URL%/}"
[[ "$base" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo "COOLIFY_URL precisa ser https://host"; exit 2; }
[[ "$COOLIFY_APP_UUID" =~ ^[A-Za-z0-9]+$ ]] || { echo "COOLIFY_APP_UUID inválido"; exit 2; }
espera="${COOLIFY_ESPERA:-20}"
intervalo="${COOLIFY_INTERVALO:-10}"
[[ "$espera" =~ ^[0-9]+$ && "$intervalo" =~ ^[0-9]+$ ]] || { echo "COOLIFY_ESPERA/INTERVALO inválido"; exit 2; }
curl_bin="${COOLIFY_CURL:-curl}"
tmp="$(mktemp)"

# api CAMINHO [MÉTODO] [CORPO JSON]: grava o corpo da resposta em $tmp e imprime só o código HTTP (000 em falha de rede).
api() {
  local metodo="${2:-GET}" corpo="${3:-}" codigo
  codigo="$({
    printf 'header = "Authorization: Bearer %s"\n' "$COOLIFY_TOKEN"
    printf 'request = "%s"\n' "$metodo"
    if [ -n "$corpo" ]; then
      printf 'header = "Content-Type: application/json"\n'
      printf 'data = "%s"\n' "${corpo//\"/\\\"}"
    fi
  } | "$curl_bin" -sS -m 30 --config - -H 'Accept: application/json' -o "$tmp" -w '%{http_code}' "$base$1" 2> /dev/null || true)"
  echo "${codigo:-000}"
}

original=""
restaurar() {
  # O recurso NUNCA pode ficar preso num SHA antigo: o próximo deploy da main voltaria a implantar o código velho.
  if [ -n "$original" ] && [ "$modo" = rollback ]; then
    local c
    c="$(api "/api/v1/applications/$COOLIFY_APP_UUID" PATCH "{\"git_commit_sha\":\"$original\"}")"
    if [ "$c" = 200 ]; then
      echo "git_commit_sha do recurso devolvido a $original."
    else
      echo "::error title=Recurso preso no SHA antigo::não consegui devolver git_commit_sha a $original (HTTP $c). Corrija no painel do Coolify antes do próximo deploy."
    fi
  fi
  rm -f "$tmp"
}
trap restaurar EXIT

code="$(api "/api/v1/applications/$COOLIFY_APP_UUID")"
echo "GET /applications -> HTTP $code"
original="$(jq -r '.git_commit_sha // empty' "$tmp" 2> /dev/null)"
if [ "$code" != 200 ] || [ -z "$original" ]; then
  echo "::error title=Coolify sem leitura do recurso::HTTP $code ou git_commit_sha ausente; o token precisa da habilidade read."
  original=""
  exit 1
fi
[[ "$original" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "git_commit_sha do recurso com formato inesperado"; original=""; exit 1; }

if [ "$modo" = preflight ]; then
  code="$(api "/api/v1/applications/$COOLIFY_APP_UUID" PATCH "{\"git_commit_sha\":\"$original\"}")"
  echo "PATCH /applications (mesmo valor) -> HTTP $code"
  if [ "$code" != 200 ]; then
    echo "::error title=Sem como reverter::o token do Coolify não escreve no recurso (HTTP $code). Dê a habilidade write ao COOLIFY_TOKEN antes de publicar: sem ela o rollback automático não funciona."
    original=""
    exit 1
  fi
  echo "Rollback possível: o token escreve no recurso (git_commit_sha atual: $original)."
  original=""
  exit 0
fi

: "${ROLLBACK_SHA:?defina ROLLBACK_SHA}"
[[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "ROLLBACK_SHA inválido"; original=""; exit 2; }

code="$(api "/api/v1/applications/$COOLIFY_APP_UUID" PATCH "{\"git_commit_sha\":\"$ROLLBACK_SHA\"}")"
echo "PATCH git_commit_sha=${ROLLBACK_SHA:0:12} -> HTTP $code"
if [ "$code" != 200 ]; then
  echo "::error title=Rollback não iniciado::o Coolify recusou fixar o commit anterior (HTTP $code)."
  original=""
  exit 1
fi

code="$(api "/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=true" POST)"
echo "POST /deploy -> HTTP $code"
dep="$(jq -r '.deployments[0].deployment_uuid // empty' "$tmp" 2> /dev/null)"
if [ "$code" != 200 ] || [[ ! "$dep" =~ ^[A-Za-z0-9]+$ ]]; then
  echo "::error title=Rollback não disparado::o Coolify não devolveu um deployment (HTTP $code)."
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
  case "$estado" in
    finished) break ;;
    failed | cancelled*)
      echo "::error title=Rollback falhou::estado $estado. Decida no painel do Coolify (Redeploy do commit anterior)."
      exit 1
      ;;
  esac
  sleep "$intervalo"
done

if [ "$estado" != finished ]; then
  echo "::error title=Rollback não terminou::passaram $espera min sem 'finished' (último estado: ${estado:-?})."
  exit 1
fi
if [ -n "$sha" ] && [[ "$ROLLBACK_SHA" == "$sha"* || "$sha" == "$ROLLBACK_SHA"* ]]; then
  echo "Rollback ok: commit implantado ${sha:0:12} = versão anterior."
  exit 0
fi
echo "::error title=Rollback no commit errado::implantado ${sha:-vazio}, esperado $ROLLBACK_SHA."
exit 1
