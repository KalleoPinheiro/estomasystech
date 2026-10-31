#!/usr/bin/env bash
# Gate completo numa thread da nuvem (container Linux, sem Docker, sem WSL).
#
# Uso (na raiz, árvore limpa, em background porque passa de 30 min):
#   nohup scripts/gate-cloud.sh > /tmp/gate-cloud.log 2>&1 &
#   scripts/gate-cloud.sh setup      # só prepara o ambiente
#   scripts/gate-cloud.sh integracao # só a suíte contra Postgres real
#   scripts/gate-cloud.sh gate       # só o gate:local (perfil pr, sem Docker)
#
# O que faz:
#   1. setup: npm ci, Postgres nativo (cluster do apt) em 127.0.0.1:5432 só da máquina, banco
#      descartável, links do Chromium que o Playwright pede.
#   2. integracao: vitest contra o Postgres real, com PG_POOL_MAX=1 (igual ao ambiente:local).
#   3. gate: `gate:local` com GATE_PERFIL=pr (o perfil release exige Docker). Roda typecheck, lint,
#      sv, docs, integridade, cobertura, build, E2E prod e dev, e a mutação nos arquivos de regra
#      alterados contra a base. Imprime a linha E2E-GATE; sem Docker o recibo registra
#      docker/backup como pulados.
#
# Limites: a ferramenta de shell mata comando em primeiro plano aos 10 min; use sempre background.
# Não toca banco de produção: o assertLocalEnvironment recusa host que não seja da máquina.
set -euo pipefail
cd "$(dirname "$0")/.."

PGPORT="${GATE_CLOUD_PGPORT:-5432}"
PGDB="${GATE_CLOUD_PGDB:-estomas_integ}"
PGPASS="${GATE_CLOUD_PGPASS:-gate}"
export INTEGRATION_DATABASE_URL="postgres://postgres:${PGPASS}@127.0.0.1:${PGPORT}/${PGDB}"

stamp() { date +%s; }
step() { # step <nome> <comando...>
  local name="$1"; shift
  local t0; t0=$(stamp)
  echo "▶ ${name}"
  if "$@"; then rc=0; else rc=$?; fi
  echo "■ ${name} rc=${rc} $(( $(stamp) - t0 ))s"
  return "$rc"
}

setup_postgres() {
  local ver
  ver=$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1 || true)
  if [ -z "$ver" ]; then
    echo "Postgres não instalado; instalando via apt (precisa de rede para o repositório)"
    apt-get install -y --no-install-recommends postgresql
    ver=$(ls /usr/lib/postgresql | sort -n | tail -1)
  fi
  pg_lsclusters | grep -q online || pg_ctlcluster "$ver" main start
  su postgres -c "psql -qc \"alter user postgres password '${PGPASS}'\""
  su postgres -c "psql -tAc \"select 1 from pg_database where datname='${PGDB}'\"" | grep -q 1 \
    || su postgres -c "createdb ${PGDB}"
}

setup_playwright() {
  # Playwright 1.62 procura chromium-1234; a imagem traz outra revisão em /opt/pw-browsers.
  local root="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" want have
  want=$(node -e "console.log(require('playwright').chromium.executablePath())" | sed -E 's#.*/(chromium-[0-9]+)/.*#\1#')
  have=$(ls "$root" | grep -E '^chromium-[0-9]+$' | grep -v "^${want}$" | sort | tail -1 || true)
  if [ ! -e "$root/$want" ] && [ -n "$have" ]; then
    ln -sfn "$have" "$root/$want"
    ln -sfn "chromium_headless_shell-${have#chromium-}" "$root/chromium_headless_shell-${want#chromium-}"
  fi
  node -e "require('playwright').chromium.launch().then(b=>b.close())"
}

setup() {
  step npm-ci npm ci
  step postgres setup_postgres
  step playwright setup_playwright
}

integracao() {
  step integracao env PG_POOL_MAX=1 TZ=UTC CI=1 NODE_OPTIONS=--max-old-space-size=8192 \
    npx vitest run -c vitest.integracao.config.mts
}

gate() {
  step gate-local env GATE_PERFIL=pr npm run gate:local
}

case "${1:-all}" in
  setup) setup ;;
  integracao) integracao ;;
  gate) gate ;;
  all) setup; integracao; gate ;;
  *) echo "uso: $0 [setup|integracao|gate|all]" >&2; exit 2 ;;
esac
