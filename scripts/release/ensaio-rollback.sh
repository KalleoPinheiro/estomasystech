#!/usr/bin/env bash
# Ensaio do rollback automático do Release deploy, sem segredo e sem tocar produção (ADR-113, #925).
# Roda no job `validar` (dry_run ou não) e na máquina do dev. Exercita o CAMINHO REAL, com a fumaça reprovando de
# propósito: os mesmos `rollback-coolify.sh`, `deploy-coolify.sh`, `fumaca-producao.sh` e `migrar-producao.sh`, e o
# TEXTO EXATO do passo "Rollback automático da imagem" lido de `release-deploy.yml` (não uma cópia), contra um
# simulador local do Coolify e do site (`ensaio-coolify.ts`, HTTPS com certificado descartável).
#
# Cenário A (o caminho feliz do rollback):
#   a. a produção "da versão anterior" passa na fumaça;
#   b. preflight do Coolify, deploy da versão NOVA e conferência do commit implantado;
#   c. a fumaça com a versão nova REPROVA (a nova sobe quebrada: readiness 503);
#   d. o passo de rollback roda: termina vermelho, o commit implantado volta ao da tag anterior, o recurso volta a
#      HEAD, `desfazer-versao` é chamado e a fumaça pós-rollback passa.
# Cenário B: o Coolify falha ao reimplantar o commit anterior; o recurso NUNCA fica preso no SHA antigo.
# Cenário C: sem alvo de rollback (re-disparo na mesma versão): o passo não escreve nada no Coolify e avisa.
#
# Limite honesto: o Coolify é simulado (contrato da API que os scripts usam); a imagem real e o proxy não entram.
# Obrigatórias no ambiente: bash, curl, jq, openssl, node com tsx em node_modules.
set -uo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
sim_pid=""
cleanup() {
  [ -z "$sim_pid" ] || kill "$sim_pid" 2> /dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT
erro() { echo "::error title=Ensaio do rollback::$1"; exit 1; }
# Mostra a saída de um passo ensaiado SEM virar anotação do run: os `::error` do ensaio (versões falsas 0.0.x)
# apareciam no resumo do Release deploy real como se a produção tivesse sofrido rollback (20/11, v0.10.0).
mostrar() {
  local marca="ensaio-$RANDOM$RANDOM"
  echo "::stop-commands::$marca"
  cat "$1"
  echo "::$marca::"
}
for b in curl jq openssl; do command -v "$b" > /dev/null || erro "falta $b"; done
tsx_bin="$raiz/node_modules/.bin/tsx"
[ -x "$tsx_bin" ] || erro "falta node_modules/.bin/tsx (rode npm ci)"

SHA_ANTERIOR="$(printf 'a%.0s' $(seq 1 40))"
SHA_NOVO="$(printf 'b%.0s' $(seq 1 40))"
VERSAO_ANTERIOR=0.0.1
VERSAO_NOVA=0.0.2

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2> /dev/null \
  || erro "não consegui gerar o certificado descartável"

ENSAIO_CERT="$tmp/cert.pem" ENSAIO_KEY="$tmp/key.pem" ENSAIO_PORTA_ARQUIVO="$tmp/porta" \
  ENSAIO_UUID=ensaio123 ENSAIO_TOKEN=ensaio-token ENSAIO_SHA_ANTERIOR="$SHA_ANTERIOR" ENSAIO_SHA_NOVO="$SHA_NOVO" \
  ENSAIO_VERSAO_ANTERIOR="$VERSAO_ANTERIOR" ENSAIO_VERSAO_NOVA="$VERSAO_NOVA" \
  "$tsx_bin" "$raiz/scripts/release/ensaio-coolify.ts" &
sim_pid=$!
for _ in $(seq 1 100); do [ -s "$tmp/porta" ] && break; sleep 0.1; done
[ -s "$tmp/porta" ] || erro "o simulador do Coolify não subiu"
porta="$(cat "$tmp/porta")"

export CURL_CA_BUNDLE="$tmp/cert.pem" NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1
export COOLIFY_URL="https://localhost:$porta" COOLIFY_TOKEN=ensaio-token COOLIFY_APP_UUID=ensaio123
export COOLIFY_INTERVALO=1 COOLIFY_ESPERA=1
export FUMACA_URL="$COOLIFY_URL"
base="$COOLIFY_URL"

estado() { curl -fsS "$base/__estado" | jq -r "$1"; }
afirmar() { # afirmar "descrição" valor_obtido valor_esperado
  [ "$2" = "$3" ] || erro "$1: obtido '$2', esperado '$3'"
  echo "ok: $1"
}

# O passo real do workflow, com o corpo do `run: |` (sem o recuo do YAML).
passo_rollback() {
  awk '
    achou == 0 && index($0, "name: Rollback automático da imagem") { achou = 1; next }
    achou == 1 && $0 ~ /^ *run: \|$/ { achou = 2; next }
    achou == 2 {
      if ($0 ~ /^ *$/) { print ""; next }
      match($0, /^ */)
      if (recuo == 0) recuo = RLENGTH
      if (RLENGTH < recuo) exit
      print substr($0, recuo + 1)
    }' "$raiz/.github/workflows/release-deploy.yml"
}
passo_rollback > "$tmp/passo.sh"
[ -s "$tmp/passo.sh" ] || erro "não achei o passo 'Rollback automático da imagem' em release-deploy.yml"
grep -q 'rollback-coolify.sh rollback' "$tmp/passo.sh" || erro "o passo extraído não chama rollback-coolify.sh"

# "ssh" do desfazer-versao: registra o comando e devolve a marca que o migrar-producao.sh espera.
cat > "$tmp/ssh" <<'SSH'
#!/usr/bin/env bash
for ultimo; do :; done
echo "$ultimo" >> "$ENSAIO_SSH_LOG"
case "$ultimo" in desfazer-versao\ *) echo "VERSAO_DESFEITA ${ultimo#desfazer-versao }" ;; esac
SSH
chmod +x "$tmp/ssh"
export ENSAIO_SSH_LOG="$tmp/ssh.log"

# Roda o passo como o Actions roda (`bash -e -o pipefail`), com o env que o workflow entrega a ele.
rodar_passo() { # rodar_passo ROLLBACK_SHA > saída em $tmp/passo.out; devolve o código
  (
    cd "$raiz" || exit 99
    ROLLBACK_SHA="$1" VERSAO_ANTERIOR="$VERSAO_ANTERIOR" VERSION="$VERSAO_NOVA" NAO_ADITIVAS=nenhuma \
      VPS_MIGRATE_SSH_KEY=ensaio VPS_KNOWN_HOSTS=ensaio VPS_HOST=ensaio.invalid MIGRAR_SSH="$tmp/ssh" \
      bash -e -o pipefail "$tmp/passo.sh"
  ) > "$tmp/passo.out" 2>&1
}
fumaca() { (cd "$raiz" && bash scripts/release/fumaca-producao.sh) > "$tmp/fumaca.out" 2>&1; }
publicar_novo() {
  bash "$raiz/scripts/release/deploy-coolify.sh" > "$tmp/deploy.out" 2>&1 || { mostrar "$tmp/deploy.out"; erro "o deploy da versão nova falhou"; }
}

echo "== Cenário A: fumaça reprovada de propósito, rollback da imagem =="
FUMACA_VERSAO="$VERSAO_ANTERIOR" fumaca || { mostrar "$tmp/fumaca.out"; erro "a produção anterior deveria passar na fumaça"; }
echo "ok: a versão anterior passa na fumaça"
bash "$raiz/scripts/release/rollback-coolify.sh" preflight > "$tmp/pre.out" 2>&1 || { mostrar "$tmp/pre.out"; erro "preflight reprovou"; }
ESPERADO_SHA="$SHA_NOVO" publicar_novo
afirmar "o deploy implantou a versão nova" "$(estado .implantado)" "$SHA_NOVO"
FUMACA_VERSAO="$VERSAO_NOVA" fumaca && { mostrar "$tmp/fumaca.out"; erro "a fumaça da versão nova deveria reprovar (é a falha de propósito)"; }
echo "ok: a fumaça reprovou, como planejado ($(grep -c '^FALHOU' "$tmp/fumaca.out") item(ns))"

rodar_passo "$SHA_ANTERIOR"
codigo=$?
mostrar "$tmp/passo.out"
afirmar "o passo termina vermelho (voltar a imagem não é sucesso)" "$codigo" 1
grep -q 'ROLLBACK AUTOMÁTICO EXECUTADO' "$tmp/passo.out" || erro "faltou a anotação ROLLBACK AUTOMÁTICO EXECUTADO"
grep -q 'ainda reprova' "$tmp/passo.out" && erro "a fumaça pós-rollback reprovou"
afirmar "o commit implantado voltou ao da tag anterior" "$(estado .implantado)" "$SHA_ANTERIOR"
afirmar "o recurso do Coolify voltou a HEAD" "$(estado .gitCommitSha)" HEAD
afirmar "sequência de PATCH (preflight, fixar anterior, devolver HEAD)" "$(estado '.patches | join(" ")')" "HEAD $SHA_ANTERIOR HEAD"
afirmar "o site público serve a versão anterior" "$(curl -fsS "$base/api/health/version" | jq -r .data.version)" "$VERSAO_ANTERIOR"
afirmar "desfazer-versao chamado com a versão revertida" "$(grep -c "^desfazer-versao $VERSAO_NOVA\$" "$ENSAIO_SSH_LOG")" 1
FUMACA_VERSAO="$VERSAO_ANTERIOR" fumaca || { mostrar "$tmp/fumaca.out"; erro "a fumaça depois do rollback reprova"; }
echo "ok: a fumaça depois do rollback passa na versão anterior"

echo "== Cenário B: o Coolify falha ao reimplantar o commit anterior =="
ESPERADO_SHA="$SHA_NOVO" publicar_novo
curl -fsS -X POST "$base/__modo/rollback-falha" > /dev/null || erro "não consegui mudar o modo do simulador"
rodar_passo "$SHA_ANTERIOR"
codigo=$?
afirmar "o passo termina vermelho" "$codigo" 1
grep -q 'Rollback falhou' "$tmp/passo.out" || { mostrar "$tmp/passo.out"; erro "faltou a anotação Rollback falhou"; }
afirmar "mesmo com a falha o recurso NÃO fica preso no SHA antigo" "$(estado .gitCommitSha)" HEAD
curl -fsS -X POST "$base/__modo/normal" > /dev/null

echo "== Cenário C: sem alvo de rollback =="
antes="$(estado '.patches | length')"
rodar_passo ""
codigo=$?
afirmar "o passo termina vermelho" "$codigo" 1
grep -q 'Sem alvo de rollback' "$tmp/passo.out" || erro "faltou a anotação Sem alvo de rollback"
afirmar "nada foi escrito no Coolify" "$(estado '.patches | length')" "$antes"

echo "Ensaio do rollback ok: fumaça reprovada de propósito, imagem revertida, recurso devolvido a HEAD em todos os cenários."
