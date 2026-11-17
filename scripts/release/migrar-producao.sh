#!/usr/bin/env bash
# Migra (ou simula migrar) o banco de produção com o DONO, ANTES de trocar o container (ADR-113).
# Uso: migrar-producao.sh detectar | simular | migrar | desfazer-versao X.Y.Z
#   detectar: só lê o estado do banco e lista o que falta (nenhuma escrita, nem simulada).
#   simular: detecta o que falta e roda o SQL numa transação com ROLLBACK (nada é gravado).
#   migrar : aplica numa transação só; confere que `public.app__drizzle_migrations()` não deixa nada pendente.
#   desfazer-versao: apaga a versão revertida de app_releases (rollback automático; o rodapé volta à anterior).
# Entra pela chave SSH de migração, cujo comando forçado (deploy/migrate/ci-migrate.sh) roda o psql dentro do
# container do Postgres como o dono, sem senha em URL. O hash e o carimbo gravados vêm do `readMigrationFiles`
# do drizzle-orm (migrar-producao.ts): nada de hash calculado à mão. Para na primeira falha: sem migração
# aplicada, o job NÃO segue para o deploy.
#
# Obrigatórias (env do passo, nunca em argumento): VPS_MIGRATE_SSH_KEY, VPS_KNOWN_HOSTS, VPS_HOST
# Opcionais: VPS_USER (padrão estoma-ci), MIGRAR_PASTA (padrão drizzle), MIGRAR_SSH (cliente ssh; teste e ensaio),
#   MIGRAR_TSX (executor do TypeScript; padrão node_modules/.bin/tsx), GITHUB_OUTPUT (pendentes, tags, nao_aditivas).
# Sem `set -x`. A chave e o known_hosts vão para uma pasta 0700 apagada ao sair.
set -uo pipefail

modo="${1:-}"
case "$modo" in
  detectar | simular | migrar) ;;
  desfazer-versao) [[ "${2:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "desfazer-versao exige X.Y.Z"; exit 2; } ;;
  *) echo "uso: migrar-producao.sh detectar|simular|migrar|desfazer-versao X.Y.Z"; exit 2 ;;
esac
: "${VPS_MIGRATE_SSH_KEY:?defina VPS_MIGRATE_SSH_KEY}" "${VPS_KNOWN_HOSTS:?defina VPS_KNOWN_HOSTS}" "${VPS_HOST:?defina VPS_HOST}"
[[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "VPS_HOST inválido"; exit 2; }
usuario="${VPS_USER:-estoma-ci}"
[[ "$usuario" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "VPS_USER inválido"; exit 2; }
pasta="${MIGRAR_PASTA:-drizzle}"
tsx_bin="${MIGRAR_TSX:-node_modules/.bin/tsx}"
ssh_bin="${MIGRAR_SSH:-ssh}"
cli="$(dirname "${BASH_SOURCE[0]}")/migrar-producao.ts"

umask 077
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
printf '%s\n' "$VPS_MIGRATE_SSH_KEY" | tr -d '\r' | sed -e '/^[[:space:]]*$/d' > "$dir/chave"
printf '%s\n' "$VPS_KNOWN_HOSTS" | tr -d '\r' | sed -e '/^[[:space:]]*$/d' > "$dir/known_hosts"

erro() { echo "::error title=Migração de produção::$1"; exit 1; }

# remoto COMANDO: roda no VPS (stdin repassado). A resposta vai para $dir/saida; stderr do ssh para $dir/erro.
remoto() {
  "$ssh_bin" -T -i "$dir/chave" -o IdentitiesOnly=yes -o BatchMode=yes \
    -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$dir/known_hosts" \
    -o ConnectTimeout=20 -o ServerAliveInterval=30 "$usuario@$VPS_HOST" "$1" > "$dir/saida" 2> "$dir/erro"
}

# resposta_ok MARCA: a última linha da resposta tem de ser exatamente MARCA; senão explica o motivo e sai com 1.
resposta_ok() {
  local linha
  linha="$(tail -n 1 "$dir/saida" | tr -d '\r')"
  if [ "$linha" = "$1" ]; then return 0; fi
  if [[ "$linha" =~ ^MIGRACAO_FALHOU\  ]]; then
    erro "${linha:0:300}"
  fi
  echo "ssh: $(tail -n 8 "$dir/erro" | tr -d '\r' | cut -c1-200)"
  erro "sem resposta válida do VPS (chave de migração, known_hosts, instalação do ci-migrate.sh ou rede)"
}

if [ "$modo" = desfazer-versao ]; then
  remoto "desfazer-versao $2" < /dev/null || true
  resposta_ok "VERSAO_DESFEITA $2"
  echo "Versão $2 removida de app_releases."
  exit 0
fi

remoto estado < /dev/null || true
resposta_ok ESTADO_OK
cp "$dir/saida" "$dir/estado.txt"

resumo="$("$tsx_bin" "$cli" plano "$dir/estado.txt" "$dir/plano.sql" "$pasta")" || erro "não foi possível planejar a migração (veja acima)"
echo "$resumo"
pendentes="$(printf '%s\n' "$resumo" | sed -n 's/^PENDENTES=//p')"
tags="$(printf '%s\n' "$resumo" | sed -n 's/^TAGS=//p')"
nao_aditivas="$(printf '%s\n' "$resumo" | sed -n 's/^NAO_ADITIVAS=//p')"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "pendentes=$pendentes"
    echo "tags=$tags"
    echo "nao_aditivas=$nao_aditivas"
  } >> "$GITHUB_OUTPUT"
fi
[[ "$pendentes" =~ ^[0-9]+$ ]] || erro "plano sem contagem de pendências"
# Marca de fim exigida pelo ci-migrate.sh: entrada cortada no meio do ssh nunca vira COMMIT parcial.
printf '%s\n' '-- ESTOMASYSTECH-FIM' >> "$dir/plano.sql"

if [ "$pendentes" -eq 0 ]; then
  echo "Nenhuma migração pendente: o banco já está no esquema desta versão."
elif [ "$modo" = detectar ]; then
  echo "Pendentes ($pendentes): $tags. Serão aplicadas pelo dono, antes do deploy, depois do backup."
  if [ "$nao_aditivas" != nenhuma ]; then
    echo "::warning title=Migração não aditiva::${nao_aditivas}. O rollback automático volta a imagem, mas o código antigo roda sobre o esquema novo."
  fi
else
  if [ "$modo" = simular ]; then
    remoto simular < "$dir/plano.sql" || true
    resposta_ok SIMULACAO_OK
    echo "Simulação ok: $pendentes migração(ões) rodariam sem erro (ROLLBACK, nada foi gravado)."
  else
    remoto aplicar < "$dir/plano.sql" || true
    resposta_ok MIGRACAO_OK
    echo "Migrações aplicadas pelo dono, numa transação: $tags."
  fi
fi

if [ "$modo" = migrar ]; then
  remoto estado < /dev/null || true
  resposta_ok ESTADO_OK
  cp "$dir/saida" "$dir/estado-final.txt"
  "$tsx_bin" "$cli" verificar "$dir/estado-final.txt" "$pasta" || erro "o banco ainda deixa migração pendente; o deploy não segue"
fi
