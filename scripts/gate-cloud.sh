#!/usr/bin/env bash
# Gate numa thread da nuvem (container Linux, sem Docker, sem WSL). ADR-084.
#
# Uso (sempre em segundo plano: a ferramenta de shell mata comando em primeiro plano aos 10 min):
#   scripts/gate-cloud.sh bg pr        # gate incremental do PR, em segundo plano, log em .gate/cloud.log
#   scripts/gate-cloud.sh bg release   # gate completo (release/*), idem
#   scripts/gate-cloud.sh status       # resumo das etapas já terminadas
#   scripts/gate-cloud.sh setup|integracao|pr|release   # em primeiro plano (CI, WSL, depuração)
#
# Perfis (ADR-084):
#   pr       typecheck, lint, sv, docs, integridade e a suíte unitária COMPLETA com cobertura e limiares
#            atuais; integração (vitest --changed, grafo de imports), mutação (arquivos alterados de
#            domain/application) e E2E (specs alcançados, scripts/gate-cloud/impacto.ts) só no que o diff
#            altera ou alcança. Na dúvida, inclui: arquivo transversal ou sem mapa roda tudo.
#   release  setup + integração completa + `gate:local` (GATE_PERFIL=pr: o perfil release do gate exige
#            Docker). Docker e backup seguem no WSL antes do `release:cut`.
#
# Recibo: ao fim de `pr`/`release` o script imprime (e grava em .gate/cloud-recibo.md) o tempo total e o de
# cada etapa, para colar no PR. Motivo do TESTE-ALTERADO (mesma checagem do check:testes, nada mais frouxo):
# GATE_PR_BODY_FILE=<corpo do PR>, GATE_MOTIVO_TESTE="<texto>" ou o .gate/motivo-teste.txt local.
#
# Base do diff: GATE_BASE, senão a release aberta (scripts/gate/base.ts). Não toca banco de produção:
# o assertLocalEnvironment recusa host que não seja da máquina.
set -euo pipefail
cd "$(dirname "$0")/.."

PGPORT="${GATE_CLOUD_PGPORT:-5432}"
PGDB="${GATE_CLOUD_PGDB:-estomas_integ}"
PGPASS="${GATE_CLOUD_PGPASS:-gate}"
LOG=.gate/cloud.log
TIMES=.gate/cloud-times.txt
export INTEGRATION_DATABASE_URL="postgres://postgres:${PGPASS}@127.0.0.1:${PGPORT}/${PGDB}"
export CI=1 TZ=UTC NODE_OPTIONS="--max-old-space-size=8192"

RECIBO=.gate/cloud-recibo.md
T_INICIO=$(date +%s)

stamp() { date +%s; }

# recibo <perfil> <rc>: tempo total e por etapa, no formato que o PR cola.
recibo() {
  local rc="$2" total=$(( $(stamp) - T_INICIO )) sha
  sha=$(git rev-parse --short HEAD)
  mkdir -p .gate
  {
    echo "GATE-NUVEM: ${sha} perfil=$1 rc=${rc} total=${total}s ($(( total / 60 ))m$(( total % 60 ))s)"
    echo
    echo "| etapa | rc | duração |"
    echo "| --- | --- | --- |"
    sed -nE 's/^([^ ]+) rc=([0-9]+) ([0-9]+s)$/| \1 | \2 | \3 |/p' "$TIMES" 2>/dev/null
    grep -E '^pulado:' "$TIMES" 2>/dev/null | sed -E 's/^pulado: (.*)$/- pulado: \1/'
  } | tee "$RECIBO"
}

# Roda o perfil e sempre imprime o recibo, inclusive na falha.
com_recibo() {
  local rc=0; mkdir -p .gate; : > "$TIMES"
  "$2" || rc=$?
  recibo "$1" "$rc"
  return "$rc"
}

# check:testes com o motivo do PR (corpo ou texto), sem relaxar a regra 8.
integridade() {
  local args=()
  [ -z "${GATE_PR_BODY_FILE:-}" ] || args+=(--body-file "$GATE_PR_BODY_FILE")
  [ -z "${GATE_MOTIVO_TESTE:-}" ] || args+=(--motivo "$GATE_MOTIVO_TESTE")
  npm run check:testes -- ${args[@]+"${args[@]}"}
}
step() { # step <nome> <comando...>: mede, registra e para na primeira falha
  local name="$1"; shift
  local t0 rc=0; t0=$(stamp)
  echo "▶ ${name}"
  "$@" || rc=$?
  mkdir -p .gate
  echo "${name} rc=${rc} $(( $(stamp) - t0 ))s" | tee -a "$TIMES"
  return "$rc"
}

skip() { # skip <etapa> <motivo>: o que não rodou também entra no resumo
  mkdir -p .gate
  echo "pulado: $1 ($2)" | tee -a "$TIMES"
}

base_ref() { npx tsx scripts/gate/base.ts; }

setup_postgres() {
  local ver
  ver=$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1 || true)
  if [ -z "$ver" ]; then
    apt-get install -y --no-install-recommends postgresql
    ver=$(ls /usr/lib/postgresql | sort -n | tail -1)
  fi
  pg_lsclusters | grep -q online || pg_ctlcluster "$ver" main start
  su postgres -c "psql -qc \"alter user postgres password '${PGPASS}'\""
  su postgres -c "psql -tAc \"select 1 from pg_database where datname='${PGDB}'\"" | grep -q 1 \
    || su postgres -c "createdb ${PGDB}"
}

setup_playwright() {
  # Playwright pede uma revisão do Chromium; a imagem pode trazer outra em /opt/pw-browsers.
  local root="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" want have
  want=$(node -e "console.log(require('playwright').chromium.executablePath())" | sed -E 's#.*/(chromium-[0-9]+)/.*#\1#')
  have=$(ls "$root" | grep -E '^chromium-[0-9]+$' | grep -v "^${want}$" | sort | tail -1 || true)
  if [ ! -e "$root/$want" ] && [ -n "$have" ]; then
    ln -sfn "$have" "$root/$want"
    ln -sfn "chromium_headless_shell-${have#chromium-}" "$root/chromium_headless_shell-${want#chromium-}"
  fi
  node -e "require('playwright').chromium.launch().then(b=>b.close())"
}

# Servidor de uma rodada interrompida segura a 3000 e derruba o E2E em 3 s.
free_port_3000() {
  local pid
  pid=$(node -e "
    const {execSync}=require('child_process');
    for (const l of execSync('ps -eo pid,args').toString().split('\n'))
      if (/next-server|next start|bin\/next/.test(l) && !/node -e/.test(l)) console.log(l.trim().split(' ')[0]);")
  [ -z "$pid" ] || kill $pid 2>/dev/null || true
  sleep 1
}

setup() {
  step npm-ci npm ci
  step postgres setup_postgres
  step playwright setup_playwright
}

integracao() {
  step integracao env PG_POOL_MAX=1 npx vitest run -c vitest.integracao.config.mts
}

e2e() {
  free_port_3000
  step e2e-producao npm run test:e2e:prod
  free_port_3000
  step e2e-dev npm run test:e2e:dev
}

# Integração só nos testes que o grafo de imports do Vitest liga ao diff; mudança em banco, setup de
# teste ou dependência roda a integração inteira (na dúvida, inclui).
integracao_impactada() {
  local base="$1"
  if git diff --name-only "${base}...HEAD" | grep -Eq '^(drizzle/|tests/support/|vitest[^/]*\.mts|package(-lock)?\.json|src/infrastructure/persistence/)'; then
    echo "diff toca banco/setup/dependência: integração completa"
    integracao
  else
    step integracao-impactada env PG_POOL_MAX=1 npx vitest run -c vitest.integracao.config.mts --changed "$base" --passWithNoTests
  fi
}

# E2E só nos specs que o diff alcança (scripts/gate-cloud/impacto.ts); ALL = todos; NONE = nenhum.
e2e_impactado() {
  local sel="$1"
  free_port_3000
  if [ "$sel" = ALL ]; then
    step e2e-producao npm run test:e2e:prod
    free_port_3000
    step e2e-dev npm run test:e2e:dev
    step console-limpo-dev npx playwright test -c playwright.console.config.ts
  else
    # console limpo (#543/#584) é barato e cobre todas as telas por papel: entra em toda seleção
    sel="$sel e2e/console-limpo.spec.ts"
    # shellcheck disable=SC2086
    step e2e-producao npx playwright test -c playwright.prod.config.ts --pass-with-no-tests $sel
    free_port_3000
    # shellcheck disable=SC2086
    step e2e-dev npx playwright test --pass-with-no-tests $sel
    step console-limpo-dev npx playwright test -c playwright.console.config.ts
  fi
}

mutation_changed() {
  local base="$1" files
  files=$(GATE_BASE="$base" npx tsx scripts/gate-cloud/impacto.ts --mutacao)
  [ -n "$files" ] || { skip mutacao "nenhum arquivo de domain/application/lib/server alterado"; return 0; }
  npm run test:mutacao -- --mutate "$files"
}

pr_profile() {
  [ -z "$(git status --porcelain)" ] || { echo "árvore suja: o gate vale para o SHA do HEAD" >&2; return 1; }
  local base sel; base=$(base_ref)
  echo "perfil pr · base ${base} · $(git rev-parse --short HEAD)"
  step typecheck npm run typecheck
  step lint npm run lint
  step sv npm run check:sv
  step docs npm run check:docs
  step integridade-de-testes integridade
  step cobertura npm run test:coverage
  step mutacao mutation_changed "$base"
  if git diff --name-only "${base}...HEAD" | grep -Eqv '(^docs/|^\.specs/|^\.changeset/|\.md$)'; then
    setup_postgres; setup_playwright
    integracao_impactada "$base"
    sel=$(GATE_BASE="$base" npx tsx scripts/gate-cloud/impacto.ts)
    echo "E2E selecionado: ${sel}"
    if [ "$sel" != NONE ]; then
      step build npm run build
      e2e_impactado "$sel"
    else
      skip e2e "o mapa de impacto não alcança nenhum spec"
    fi
  else
    skip integracao-e-e2e "diff só de documentação"
  fi
}

release_profile() {
  setup
  integracao
  step gate-local env GATE_PERFIL=pr npm run gate:local
  # Etapa que o gate:local ainda não tem (scripts/gate/ é do dono; trecho no PR #584): lado `next dev`.
  free_port_3000
  step console-limpo-dev npx playwright test -c playwright.console.config.ts
  skip docker "sem daemon na nuvem; roda no WSL antes do release:cut"
  skip backup "sem daemon na nuvem; roda no WSL antes do release:cut"
}

run_bg() { # run_bg <modo>
  mkdir -p .gate; rm -f "$TIMES" .gate/cloud.done
  (setsid nohup bash -c "$0 $1; echo \"fim rc=\$?\" > .gate/cloud.done" > "$LOG" 2>&1 &)
  echo "rodando em segundo plano: log em $LOG, andamento com '$0 status'"
}

case "${1:-}" in
  bg) run_bg "${2:?uso: $0 bg pr|release}" ;;
  status)
    cat "$TIMES" 2>/dev/null
    echo "puladas: docker, backup (sem daemon; rodam no WSL antes do release:cut)"
    cat .gate/cloud.done 2>/dev/null || echo "em andamento" ;;
  setup) setup ;;
  integracao) integracao ;;
  pr) com_recibo pr pr_profile ;;
  release) com_recibo release release_profile ;;
  *) echo "uso: $0 bg pr|release | status | setup | integracao | pr | release" >&2; exit 2 ;;
esac
