#!/usr/bin/env bash
# Backup pré-deploy disparado pelo Actions (ADR-095, ticket 2).
#
# É o ÚNICO comando que a chave SSH do CI pode rodar (authorized_keys com
# `restrict,command="sudo /opt/estomasystech-backup/ci-backup.sh"`, sudoers sem argumentos).
# Inicia estomasystech-backup.service (oneshot: `systemctl start` bloqueia até o fim), confere
# Result=success e que um backup NOVO apareceu no destino fora do servidor (R2), e imprime
# uma única linha, sem segredo, sem caminho e sem saída de outros programas:
#   BACKUP_OK <timestamp UTC do backup novo>      (saída 0)
#   BACKUP_FALHOU <motivo curto>                  (saída 1)
# Sem backup confirmado o job de deploy falha e a migração não roda (ADR-039).
#
# Variáveis (só para teste; em produção valem os padrões):
#   CI_BACKUP_ENV_FILE  padrão /etc/estomasystech/backup.env (CHAVE=valor, o mesmo do systemd)
#   CI_BACKUP_SERVICE   padrão estomasystech-backup.service
#   CI_BACKUP_TIMEOUT   padrão 10800 (3 h, igual ao TimeoutStartSec do serviço)
set -uo pipefail
umask 077

env_file="${CI_BACKUP_ENV_FILE:-/etc/estomasystech/backup.env}"
service="${CI_BACKUP_SERVICE:-estomasystech-backup.service}"
limite="${CI_BACKUP_TIMEOUT:-10800}"

fail() {
  echo "BACKUP_FALHOU $1"
  exit 1
}

# A chave não abre shell: argumento recebido é sinal de uso indevido.
[ "$#" -eq 0 ] || fail "argumentos não são aceitos"
[[ "$limite" =~ ^[0-9]+$ ]] || fail "CI_BACKUP_TIMEOUT inválido"
[ -r "$env_file" ] || fail "configuração do backup ilegível"

# Mesmo arquivo do systemd; lido sem eco para não vazar nada no retorno do SSH.
set -a
# shellcheck disable=SC1090
. "$env_file" > /dev/null 2>&1 || fail "configuração do backup inválida"
set +a
dest="${BACKUP_RCLONE_DEST:-}"
[ -n "$dest" ] || fail "BACKUP_RCLONE_DEST ausente"
command -v rclone > /dev/null 2>&1 || fail "rclone não instalado"

# Backups já existentes no destino antes de começar: o novo é o que sobra na diferença.
# Pastas <UTC>/ com 20xxxxxxTxxxxxxZ, como o backup.sh as grava.
listar() {
  local saida
  saida="$(rclone lsf --dirs-only "$dest" 2> /dev/null)" || return 2
  printf '%s\n' "$saida" | sed 's:/$::' | grep -E '^20[0-9]{6}T[0-9]{6}Z$' | sort
  return 0
}

antes="$(listar)" || fail "destino fora do servidor inacessível"

timeout "$limite" systemctl start "$service" > /dev/null 2>&1
rc=$?
[ "$rc" -ne 124 ] || fail "tempo esgotado ($limite s)"
[ "$rc" -eq 0 ] || fail "systemctl start saiu $rc"

resultado="$(systemctl show --property=Result --value "$service" 2> /dev/null)"
[ "$resultado" = "success" ] || fail "Result=${resultado:-desconhecido}"

depois="$(listar)" || fail "destino fora do servidor inacessível depois do backup"
novos="$(comm -13 <(printf '%s\n' "$antes") <(printf '%s\n' "$depois") | grep -v '^$' || true)"
[ -n "$novos" ] || fail "nenhum backup novo no destino"
novo="$(printf '%s\n' "$novos" | tail -n 1)"

# O objeto novo traz os dois arquivos cifrados (age) e a soma de integridade.
arquivos="$(rclone lsf "$dest/$novo" 2> /dev/null)" || fail "backup novo ilegível no destino"
for esperado in db.dump.age uploads.tar.age SHA256SUMS; do
  printf '%s\n' "$arquivos" | grep -qx "$esperado" || fail "backup novo sem $esperado"
done

echo "BACKUP_OK $novo"
