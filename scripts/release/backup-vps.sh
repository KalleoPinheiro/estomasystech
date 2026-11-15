#!/usr/bin/env bash
# Backup pré-deploy no VPS pelo Actions (ADR-095, #750). Entra com a chave SSH restrita do CI, cujo comando
# forçado (deploy/backup/ci-backup.sh) inicia o backup e responde uma linha: `BACKUP_OK <timestamp>` ou
# `BACKUP_FALHOU <motivo>`. Só `BACKUP_OK` libera o passo seguinte; qualquer outra coisa sai com 1.
#
# Obrigatórias (por env do passo, nunca em argumento): VPS_SSH_KEY, VPS_KNOWN_HOSTS, VPS_HOST
# Opcionais: VPS_USER (padrão estoma-ci) e BACKUP_SSH (cliente ssh; só para teste).
# A chave e o known_hosts vão para uma pasta temporária 0700, apagada ao sair. Sem `set -x`.
set -uo pipefail

: "${VPS_SSH_KEY:?defina VPS_SSH_KEY}" "${VPS_KNOWN_HOSTS:?defina VPS_KNOWN_HOSTS}" "${VPS_HOST:?defina VPS_HOST}"
[[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "VPS_HOST inválido"; exit 2; }
usuario="${VPS_USER:-estoma-ci}"
[[ "$usuario" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "VPS_USER inválido"; exit 2; }

umask 077
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$dir/chave"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$dir/known_hosts"

saida="$("${BACKUP_SSH:-ssh}" -T -i "$dir/chave" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$dir/known_hosts" \
  -o ConnectTimeout=20 -o ServerAliveInterval=30 "$usuario@$VPS_HOST" 2> /dev/null)"
linha="$(printf '%s\n' "$saida" | tail -n 1)"

if [[ "$linha" =~ ^BACKUP_OK\ [^[:space:]]+$ ]]; then
  echo "$linha"
  exit 0
fi
if [[ "$linha" =~ ^BACKUP_FALHOU\  ]]; then
  echo "${linha:0:120}"
else
  echo "BACKUP_FALHOU sem resposta válida do VPS (chave, known_hosts ou rede)"
fi
exit 1
