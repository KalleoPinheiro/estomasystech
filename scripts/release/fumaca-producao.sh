#!/usr/bin/env bash
# Fumaça pós-deploy SOMENTE LEITURA da produção (ADR-095, ticket 3; producao.md § 9.6).
# Sem login, sem dado de paciente, sem escrita. Imprime uma linha por item (`OK <item>` ou
# `FALHOU <item>: <motivo>`) e nunca corpo de resposta, cabeçalho com valor ou segredo.
# Sai 0 se tudo passou, 1 se algo falhou, 2 se a configuração é inválida.
#
# Variáveis:
#   FUMACA_URL           obrigatória: https://dominio, sem barra no fim
#   FUMACA_VERSAO        versão esperada (X.Y.Z), conferida em /api/health/version
#   FUMACA_SHA_ESPERADO  SHA da tag; só conferido junto de FUMACA_SHA_IMPLANTADO
#   FUMACA_SHA_IMPLANTADO SHA do deployment lido no Coolify (≥ 7 caracteres, prefixo vale)
#   FUMACA_PESADA        1 liga o passo opcional `fumaca_pesada`: 9 logins falhos (salto do proxy)
#                        e rajada de 300 requisições (rate limit). Dispara limite por IP: fora do automático
#   FUMACA_CURL          executável do curl (teste injeta um falso); padrão `curl`
#   FUMACA_PAUSA         pausa entre os logins falhos, em segundos (padrão 0.5)
set -uo pipefail

curl_bin="${FUMACA_CURL:-curl}"
base="${FUMACA_URL:-}"
base="${base%/}"
versao="${FUMACA_VERSAO:-}"
sha_esperado="${FUMACA_SHA_ESPERADO:-}"
sha_implantado="${FUMACA_SHA_IMPLANTADO:-}"
pausa="${FUMACA_PAUSA:-0.5}"

if [[ ! "$base" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "FUMACA_URL precisa ser https://dominio, sem caminho" >&2
  exit 2
fi
if [ -n "$versao" ] && [[ ! "$versao" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "FUMACA_VERSAO precisa ser X.Y.Z" >&2
  exit 2
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falhas=0

ok() { echo "OK $1"; }
falhou() {
  echo "FALHOU $1: $2"
  falhas=$((falhas + 1))
}

# req METODO URL [cabeçalho extra]: grava $tmp/h (cabeçalhos em minúsculas, sem CR) e $tmp/b
# (corpo); devolve o código HTTP em $codigo (000 se a conexão falhou).
req() {
  local metodo="$1" url="$2" extra="${3:-}"
  local args=(-sS -m 15 -X "$metodo" -D "$tmp/h.raw" -o "$tmp/b" -w '%{http_code}')
  [ -z "$extra" ] || args+=(-H "$extra")
  codigo="$("$curl_bin" "${args[@]}" "$url" 2> /dev/null)" || codigo="000"
  [ -f "$tmp/h.raw" ] && tr -d '\r' < "$tmp/h.raw" | tr 'A-Z' 'a-z' > "$tmp/h" || : > "$tmp/h"
  [ -f "$tmp/b" ] || : > "$tmp/b"
  rm -f "$tmp/h.raw"
}
tem_cab() { grep -c "^$1:" "$tmp/h"; }

# liveness
req GET "$base/api/health"
[ "$codigo" = 200 ] && ok liveness || falhou liveness "HTTP $codigo"

# readiness: 200, banco e migrações ok
req GET "$base/api/health/ready"
if [ "$codigo" = 200 ] && grep -Eq '"database" *: *"ok"' "$tmp/b" && grep -Eq '"migrations" *: *"ok"' "$tmp/b"; then
  ok readiness
else
  falhou readiness "HTTP $codigo ou database/migrations não ok"
fi

# TLS e HSTS na página de login
req GET "$base/login"
[ "$codigo" = 200 ] && ok tls || falhou tls "/login respondeu HTTP $codigo"
[ "$(tem_cab strict-transport-security)" -ge 1 ] && ok hsts || falhou hsts "cabeçalho ausente"

# HTTP puro redireciona para HTTPS
req GET "http://${base#https://}/login"
if [[ "$codigo" =~ ^30[1278]$ ]] && grep -q '^location: https://' "$tmp/h"; then
  ok redirecionamento-https
else
  falhou redirecionamento-https "HTTP $codigo sem Location https"
fi

# CSP única com nonce, e os demais cabeçalhos (usa a resposta de /login de novo)
req GET "$base/login"
n_csp="$(tem_cab content-security-policy)"
if [ "$n_csp" = 1 ] && grep -q '^content-security-policy:.*nonce-' "$tmp/h"; then
  ok csp-com-nonce
else
  falhou csp-com-nonce "$n_csp cabeçalho(s) CSP ou sem nonce"
fi
faltam=""
for c in x-frame-options x-content-type-options referrer-policy cross-origin-opener-policy cross-origin-resource-policy; do
  [ "$(tem_cab "$c")" -ge 1 ] || faltam="$faltam $c"
done
[ -z "$faltam" ] && ok cabecalhos || falhou cabecalhos "ausentes:$faltam"

# rotas de job fechadas sem segredo: 401 (503 = CRON_SECRET ausente; 200 seria falha grave)
for rota in /api/alerts/run /api/reminders/run /api/retention/run; do
  req POST "$base$rota"
  [ "$codigo" = 401 ] && ok "job-fechado $rota" || falhou "job-fechado $rota" "HTTP $codigo (esperado 401)"
done

# versão pública (sem SHA) e SHA do deployment
req GET "$base/api/health/version"
if [ -n "$versao" ]; then
  if [ "$codigo" = 200 ] && grep -Eq "\"version\" *: *\"$versao\"" "$tmp/b"; then
    ok "versao $versao"
  else
    falhou versao "HTTP $codigo ou versão diferente da esperada $versao"
  fi
fi
if grep -Eqi '"(sha|commit)"' "$tmp/b"; then
  falhou versao-publica "o endpoint público expõe SHA"
else
  ok versao-publica-sem-sha
fi
if [ -n "$sha_esperado" ] && [ -n "$sha_implantado" ]; then
  if [ "${#sha_implantado}" -ge 7 ] && [[ "$sha_esperado" == "$sha_implantado"* || "$sha_implantado" == "$sha_esperado"* ]]; then
    ok sha-implantado
  else
    falhou sha-implantado "SHA do deployment diferente do da tag"
  fi
fi

# fumaça pesada (opcional): dispara limite por IP no runner
if [ "${FUMACA_PESADA:-}" = 1 ]; then
  c401=0
  c429=0
  for i in 1 2 3 4 5 6 7 8 9; do
    req POST "$base/api/auth/login" "x-forwarded-for: 203.0.113.$i"
    [ "$codigo" = 401 ] && c401=$((c401 + 1))
    [ "$codigo" = 429 ] && c429=$((c429 + 1))
    sleep "$pausa"
  done
  if [ "$c401" = 5 ] && [ "$c429" = 4 ]; then
    ok salto-do-proxy
  else
    falhou salto-do-proxy "$c401 × 401 e $c429 × 429 (esperado 5 e 4)"
  fi
  limitadas="$(seq 1 300 | xargs -P 60 -I{} "$curl_bin" -s -o /dev/null -m 15 -w '%{http_code}\n' "$base/login" 2> /dev/null | grep -c '^429$' || true)"
  if [ "${limitadas:-0}" -ge 10 ]; then
    ok "rate-limit ($limitadas × 429)"
  else
    falhou rate-limit "${limitadas:-0} × 429 em 300 requisições (esperado dezenas)"
  fi
fi

if [ "$falhas" -gt 0 ]; then
  echo "FUMACA_FALHOU $falhas"
  exit 1
fi
echo "FUMACA_OK"
