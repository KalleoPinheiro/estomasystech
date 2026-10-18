#!/usr/bin/env bash
# Avisa o operador por e-mail que o backup falhou (ADR-040). Roda pelo OnFailure do
# deploy/backup/estomasystech-backup.service e manda as últimas linhas do journal do
# backup, que só têm caminho, tamanho e erro (nenhum dado de paciente).
#
# Variáveis:
#   BACKUP_ALERT_TO  obrigatória: e-mail do operador
# Envia com msmtp (SMTP do Resend na porta 587, /etc/msmtprc; runbook § 5).
set -euo pipefail

to="${BACKUP_ALERT_TO:-}"
[ -n "$to" ] || {
  echo "backup-alert: defina BACKUP_ALERT_TO" >&2
  exit 2
}

{
  printf 'To: %s\nSubject: [EstomaSysTech] backup falhou em %s\n\n' "$to" "$(hostname)"
  echo "O backup cifrado de hoje falhou. Últimas linhas do log:"
  echo
  journalctl -u estomasystech-backup.service -n 30 --no-pager -o short-iso
  echo
  echo "Diagnóstico: docs/engineering/producao.md § 5. Rodar de novo: systemctl start estomasystech-backup"
} | msmtp -t
