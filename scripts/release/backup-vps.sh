#!/usr/bin/env bash
# Backup pré-deploy no VPS pelo Actions (ADR-095, #750). Entra com a chave SSH restrita do CI, cujo comando
# forçado (deploy/backup/ci-backup.sh) inicia o backup e responde uma linha: `BACKUP_OK <timestamp>` ou
# `BACKUP_FALHOU <motivo>`. Só `BACKUP_OK` libera o passo seguinte; qualquer outra coisa sai com 1.
#
# Obrigatórias (por env do passo, nunca em argumento): VPS_SSH_KEY, VPS_KNOWN_HOSTS, VPS_HOST
# Opcionais: VPS_USER (padrão estoma-ci) e BACKUP_SSH (cliente ssh; só para teste).
# A chave e o known_hosts vão para uma pasta temporária 0700, apagada ao sair. Sem `set -x`.
# Em falha, imprime as últimas linhas do stderr do ssh (sem segredo) para diagnosticar.
set -uo pipefail

: "${VPS_SSH_KEY:?defina VPS_SSH_KEY}" "${VPS_KNOWN_HOSTS:?defina VPS_KNOWN_HOSTS}" "${VPS_HOST:?defina VPS_HOST}"
[[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "VPS_HOST inválido"; exit 2; }
usuario="${VPS_USER:-estoma-ci}"
[[ "$usuario" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "VPS_USER inválido"; exit 2; }

umask 077
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
# Colar no Windows costuma trazer CRLF: um \r no fim da linha invalida a chave do known_hosts (host key
# verification failed) e a chave privada. Tiramos \r e linhas vazias dos dois segredos.
printf '%s\n' "$VPS_SSH_KEY" | tr -d '\r' | sed -e '/^[[:space:]]*$/d' > "$dir/chave"
printf '%s\n' "$VPS_KNOWN_HOSTS" | tr -d '\r' | sed -e '/^[[:space:]]*$/d' > "$dir/known_hosts"

saida="$("${BACKUP_SSH:-ssh}" -T -i "$dir/chave" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$dir/known_hosts" \
  -o ConnectTimeout=20 -o ServerAliveInterval=30 "$usuario@$VPS_HOST" 2> "$dir/erro")"
linha="$(printf '%s\n' "$saida" | tail -n 1)"

if [[ "$linha" =~ ^BACKUP_OK\ [^[:space:]]+$ ]]; then
  echo "$linha"
  exit 0
fi
if [[ "$linha" =~ ^BACKUP_FALHOU\  ]]; then
  echo "${linha:0:120}"
else
  echo "BACKUP_FALHOU sem resposta válida do VPS (chave, known_hosts ou rede)"
  # O stderr do ssh não traz segredo (só o motivo: host key, permissão, timeout); ajuda a achar a causa.
  if [ -s "$dir/erro" ]; then
    echo "ssh: $(tail -n 8 "$dir/erro" | tr -d '\r' | cut -c1-200)"
  else
    echo "ssh: sem saída de erro (o VPS fechou a conexão sem resposta)"
  fi
fi
exit 1
