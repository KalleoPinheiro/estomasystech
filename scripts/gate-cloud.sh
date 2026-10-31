#!/usr/bin/env bash
# Gate numa thread da nuvem (container Linux, sem Docker, sem WSL). ADR-084.
#
# Uso (sempre em segundo plano: a ferramenta de shell mata comando em primeiro plano aos 10 min):
#   scripts/gate-cloud.sh bg pr        # gate incremental do PR, em segundo plano, log em .gate/cloud.log
#   scripts/gate-cloud.sh bg release   # gate completo (release/*), idem
#   scripts/gate-cloud.sh status       # resumo das etapas já terminadas
#   scripts/gate-cloud.sh setup|integracao|pr|release   # em primeiro plano (CI, WSL, depuração)
#
# Perfis:
#   pr       typecheck, lint, sv, docs, integridade, test:changed com cobertura 100% nos arquivos de
#            regra tocados (piso 100% das camadas do vitest.config), mutação nos arquivos alterados de
#            domain/application, e integração + build + E2E prod e dev quando o diff toca o que eles
#            exercitam (na dúvida, roda: HEAVY_RE abaixo).
#   release  setup + integração + `gate:local` (GATE_PERFIL=pr: o perfil release do gate exige Docker).
#            Docker e backup seguem no WSL antes do `release:cut`.
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

# Diff que exige integração/build/E2E: tela, servidor, persistência, acesso, infra e config de teste.
HEAVY_RE='^(src/app/|src/lib/|src/infrastructure/|src/proxy\.ts|drizzle/|e2e/|Dockerfile|package(-lock)?\.json|next\.config|playwright)'

stamp() { date +%s; }
step() { # step <nome> <comando...>: mede, registra e para na primeira falha
  local name="$1"; shift
  local t0 rc=0; t0=$(stamp)
  echo "▶ ${name}"
  "$@" || rc=$?
  mkdir -p .gate
  echo "${name} rc=${rc} $(( $(stamp) - t0 ))s" | tee -a "$TIMES"
  return "$rc"
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

# Cobertura dos arquivos de regra tocados: 100% (mesmo piso do vitest.config nas camadas).
changed_coverage() {
  local base="$1" files
  files=$(git diff --name-only --diff-filter=d "${base}...HEAD" | grep -E '^src/(proxy\.ts|domain/|application/|infrastructure/|lib/)' | grep -vE '\.d\.ts$' || true)
  [ -n "$files" ] || { echo "nenhum arquivo de regra alterado: cobertura por arquivo dispensada"; return 0; }
  rm -rf .gate/coverage-pr
  npx vitest run --changed "$base" --coverage --coverage.reportsDirectory=.gate/coverage-pr \
    --coverage.reporter=json-summary --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
    --coverage.thresholds.branches=0 --coverage.thresholds.statements=0 2>&1 | tee .gate/cloud-changed.log
  if grep -Eq '(Tests|Test Files) +.*failed' .gate/cloud-changed.log; then return 1; fi
  FILES="$files" node -e "
    const s=require('./.gate/coverage-pr/coverage-summary.json'); const root=process.cwd()+'/'; let bad=0;
    for (const f of process.env.FILES.split('\n')) {
      const e=s[root+f]; if (!e) continue; // sem teste que o importe: o piso global da release pega
      for (const k of ['lines','functions','branches','statements'])
        if (e[k].pct < 100 && e[k].total > 0) { console.log('✗ '+f+' '+k+' '+e[k].pct+'%'); bad=1; }
    }
    process.exit(bad);"
}

mutation_changed() {
  local base="$1" files
  files=$(git diff --name-only --diff-filter=d "${base}...HEAD" \
    | grep -E '^src/(domain|application)/.+\.ts$' | grep -vE '(\.d\.ts$|(^|/)index\.ts$)' | paste -sd, - || true)
  [ -n "$files" ] || { echo "nenhum arquivo de domain/application alterado: sem mutação"; return 0; }
  npm run test:mutacao -- --mutate "$files"
}

pr_profile() {
  [ -z "$(git status --porcelain)" ] || { echo "árvore suja: o gate vale para o SHA do HEAD" >&2; return 1; }
  local base; base=$(base_ref)
  echo "perfil pr · base ${base} · $(git rev-parse --short HEAD)"
  step typecheck npm run typecheck
  step lint npm run lint
  step sv npm run check:sv
  step docs npm run check:docs
  step integridade-de-testes npm run check:testes
  step cobertura-dos-arquivos-tocados changed_coverage "$base"
  step mutacao mutation_changed "$base"
  if git diff --name-only "${base}...HEAD" | grep -Eq "$HEAVY_RE"; then
    echo "o diff toca tela/servidor/persistência/config: integração, build e E2E rodam"
    setup_postgres; setup_playwright
    integracao
    step build npm run build
    e2e
  else
    echo "diff só de regra/docs/scripts: integração, build e E2E dispensados (HEAVY_RE)"
  fi
}

release_profile() {
  setup
  integracao
  step gate-local env GATE_PERFIL=pr npm run gate:local
}

run_bg() { # run_bg <modo>
  mkdir -p .gate; rm -f "$TIMES" .gate/cloud.done
  (setsid nohup bash -c "$0 $1; echo \"fim rc=\$?\" > .gate/cloud.done" > "$LOG" 2>&1 &)
  echo "rodando em segundo plano: log em $LOG, andamento com '$0 status'"
}

case "${1:-}" in
  bg) run_bg "${2:?uso: $0 bg pr|release}" ;;
  status) cat "$TIMES" 2>/dev/null; cat .gate/cloud.done 2>/dev/null || echo "em andamento" ;;
  setup) setup ;;
  integracao) integracao ;;
  pr) mkdir -p .gate; : > "$TIMES"; pr_profile ;;
  release) mkdir -p .gate; : > "$TIMES"; release_profile ;;
  *) echo "uso: $0 bg pr|release | status | setup | integracao | pr | release" >&2; exit 2 ;;
esac
