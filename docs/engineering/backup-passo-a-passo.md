---
title: "Backup cifrado — passo a passo do zero"
status: living
audience: [ops]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/engineering/producao.md, docs/adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md]
---

# Backup cifrado — passo a passo do zero

> **TL;DR** Roteiro para quem nunca montou o backup: do zero até o primeiro backup conferido e
> restaurado, em 8 etapas, com o que digitar e como saber que deu certo. O desenho e as regras
> ficam no runbook ([`producao.md` § 5](producao.md#5-backup-e-restore)) e no
> [ADR-040](../adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md). Montado na instalação real
> de 2026-10-18; cada armadilha que apareceu lá está marcada com ⚠️.

## O que você vai montar

Todo dia às **02:00 de São Paulo**, o servidor copia o banco e as fotos, **cifra** com `age` e
manda para um bucket R2 da Cloudflare **na União Europeia**. Só quem tem a chave privada (que
**nunca** fica no servidor) consegue abrir. Se o backup falhar, chega um e-mail.

| Peça | Onde fica |
| --- | --- |
| Chave privada `age` | cofre (Bitwarden) + pendrive. **Nunca** no servidor, nunca no chat |
| Chave pública `age` | servidor, `/etc/estomasystech/backup.pub` |
| Scripts | servidor, `/opt/estomasystech-backup/` |
| Configuração | servidor, `/etc/estomasystech/` e `/etc/msmtprc` |
| Agenda | servidor, `systemd` (`estomasystech-backup.timer`) |
| Cópias | servidor (7 dias) e R2 `estomasystech-backups-age/prod/` (30 dias travados, apagadas com 35) |

## Antes de começar

| Precisa de | Para quê |
| --- | --- |
| Acesso SSH ao servidor (`ssh vps`) com `sudo` | instalar e configurar |
| Uma máquina sua com Linux ou WSL, `git`, `age` e Docker | gerar a chave e testar a restauração |
| Conta na Cloudflare com R2 | guardar as cópias |
| Conta no Resend com o domínio do app verificado | mandar o e-mail de alerta |
| Cofre de senhas (Bitwarden) | guardar chave e tokens |

**Regras de ouro:** nenhum segredo vai para chat, print ou repositório. Segredo se digita com
`read -rs` (não aparece na tela). ⚠️ Se o seu terminal for **zsh**, digite `bash` antes de colar
os comandos deste guia: os `read -rp`/`-rsp` são de bash.

Cada etapa abaixo diz **onde** rodar: 💻 na sua máquina, 🖥️ no servidor, 🌐 no navegador.

## Etapa 1 — Chave `age` 💻

```bash
sudo apt install -y age
age-keygen -o estomasystech-backup.key
```

A tela mostra `Public key: age1…`. Essa linha é a **chave pública**: anote.
O arquivo `estomasystech-backup.key` é a **chave privada**:

1. No Bitwarden: *Novo item → Nota segura*, nome `estomasystech backup age`, cole o conteúdo
   inteiro do arquivo (`cat estomasystech-backup.key`, as 3 linhas).
2. Copie o arquivo para um pendrive que fica guardado.
3. Apague da máquina: `rm estomasystech-backup.key`.

**Pronto quando:** a chave está no Bitwarden e no pendrive, e você tem a linha `age1…` anotada.
Perder a chave privada = perder todos os backups.

## Etapa 2 — Bucket e token no R2 🌐

No painel da Cloudflare, menu **R2 Object Storage**:

1. **Create bucket**: nome `estomasystech-backups-age`, *Location* → **Specify jurisdiction →
   European Union**. ⚠️ A jurisdição não muda depois.
2. No bucket, **Settings**:
   - *Object lifecycle rules → Add rule*: prefixo `prod/`, apagar objetos com **35 dias**.
   - *Bucket lock rules → Add rule*: prefixo `prod/`, reter por **30 dias**.
   - Anote o endpoint *S3 API* da jurisdição EU: `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`.
3. Volte em **R2 → Manage API tokens → Create Account API token**:
   - Nome `estomasystech-backup-servidor`, permissão **Object Read & Write**,
     *Apply to specific buckets only* → `estomasystech-backups-age` (o que mostra **EU**),
     TTL *Forever*.
   - Na tela de sucesso (aparece **uma vez**) copie o **Access Key ID** (32 caracteres) e o
     **Secret Access Key** (64). Ignore o "Token value". Guarde os dois no Bitwarden.

⚠️ Na instalação real, o primeiro token deu `403 AccessDenied` mesmo com escopo certo: a dupla de
chaves copiada não era a desse token. Se a etapa 4 der 403, **crie outro token** e copie de novo
da tela de sucesso; não perca tempo com o filtro de IP. Depois que tudo funcionar, você pode pôr
o filtro de IP do servidor no token (*Edit → Client IP Address Filtering*: o IPv4 `/32` e o IPv6
`/64` do servidor) e testar de novo.

**Pronto quando:** o bucket existe na EU com as duas regras, e o token está criado.

## Etapa 3 — Programas e scripts no servidor 🖥️ + 💻

No servidor:

```bash
sudo DEBIAN_FRONTEND=noninteractive apt install -y age msmtp
cd /tmp && curl -fsSLO https://downloads.rclone.org/rclone-current-linux-amd64.deb \
  && sudo apt install -y ./rclone-current-linux-amd64.deb && rm rclone-current-linux-amd64.deb
rclone version | head -1
sudo install -d -m 700 /etc/estomasystech /opt/estomasystech-backup
```

⚠️ **Não use o `rclone` do `apt`** do Ubuntu (1.60, de 2022): com o R2 ele falha com
`501 NotImplemented`. O pacote oficial acima (1.75 ou mais nova) funciona.

Na sua máquina, dentro do repositório atualizado (`git pull`):

```bash
scp scripts/backup.sh scripts/backup-target.sh scripts/restore.sh scripts/backup-alert.sh \
  deploy/backup/estomasystech-backup.* deploy/backup/estomasystech-backup-alert.service vps:/tmp/
ssh vps 'cd /tmp && sudo install -m 700 backup.sh backup-target.sh restore.sh backup-alert.sh /opt/estomasystech-backup/ \
  && sudo install -m 644 estomasystech-backup.service estomasystech-backup.timer estomasystech-backup-alert.service /etc/systemd/system/ \
  && rm backup.sh backup-target.sh restore.sh backup-alert.sh estomasystech-backup*'
```

**Pronto quando:** `rclone version` mostra 1.75+ e `sudo ls -l /opt/estomasystech-backup` lista
os 4 scripts.

## Etapa 4 — Configuração no servidor 🖥️

### 4.1 Chave pública

```bash
sudo bash -c 'read -rp "Chave pública age1...: " K; umask 077; echo "$K" > /etc/estomasystech/backup.pub; cat /etc/estomasystech/backup.pub'
```

### 4.2 Nomes do Coolify

```bash
sudo docker ps --format '{{.Names}}\t{{.Image}}' | grep postgres     # 1ª coluna = container do banco
sudo docker volume ls --format '{{.Name}}' | grep estomasystech-uploads
```

### 4.3 `backup.env`

Troque os três `<…>` e cole:

```bash
sudo bash -c 'umask 077; cat > /etc/estomasystech/backup.env <<EOF
BACKUP_AGE_RECIPIENTS_FILE=/etc/estomasystech/backup.pub
BACKUP_DB_CONTAINER=<container do banco>
BACKUP_UPLOADS_VOLUME=<volume das fotos>
BACKUP_RCLONE_DEST=r2:estomasystech-backups-age/prod
BACKUP_KEEP_DAYS=7
RCLONE_CONFIG=/etc/estomasystech/rclone.conf
BACKUP_ALERT_TO=<seu e-mail>
EOF'
```

### 4.4 `rclone.conf` (pede as chaves do token da etapa 2)

Troque `<ACCOUNT_ID>`:

```bash
sudo bash -c 'read -rp "Access Key ID: " AK; read -rsp "Secret Access Key: " SK; echo
umask 077; cat > /etc/estomasystech/rclone.conf <<EOF
[r2]
type = s3
provider = Cloudflare
endpoint = https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com
region = auto
access_key_id = $AK
secret_access_key = $SK
no_check_bucket = true
EOF
export RCLONE_CONFIG=/etc/estomasystech/rclone.conf
echo teste | rclone rcat r2:estomasystech-backups-age/teste.txt && rclone ls r2:estomasystech-backups-age && rclone deletefile r2:estomasystech-backups-age/teste.txt && echo "R2 OK"'
```

**Pronto quando:** termina em `R2 OK`. `403` → chaves erradas (etapa 2, crie outro token).
`501` → `rclone` antigo (etapa 3).

### 4.5 E-mail de alerta (`msmtp` pelo Resend)

1. 🌐 Resend → **API Keys → Create API Key**: nome `estomasystech-backup-alerta`, permissão
   *Sending access*. Guarde no Bitwarden.
2. 🖥️ O remetente é **só o endereço** (⚠️ sem nome e sem `< >`, senão o Resend responde
   `501 Bad sender address syntax`), de um domínio verificado no Resend:

```bash
sudo bash -c 'read -rp "Remetente (só o endereço): " FROM; read -rsp "Chave do Resend: " KEY; echo
umask 077; cat > /etc/msmtprc <<EOF
defaults
auth on
tls on
tls_starttls on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
syslog on

account resend
host smtp.resend.com
port 587
user resend
password $KEY
from $FROM
from_full_name EstomaSysTech

account default : resend
EOF
printf "To: %s\nSubject: [EstomaSysTech] teste msmtp\n\nteste\n" "$(sed -n s/^BACKUP_ALERT_TO=//p /etc/estomasystech/backup.env)" | msmtp -t && echo ENVIADO'
```

**Pronto quando:** aparece `ENVIADO` e o e-mail chega (olhe o spam; se cair lá, marque "não é
spam").

## Etapa 5 — Primeiro backup 🖥️

```bash
sudo systemctl daemon-reload
sudo systemctl start estomasystech-backup
sudo journalctl -u estomasystech-backup -n 20 --no-pager
sudo rclone --config /etc/estomasystech/rclone.conf lsl r2:estomasystech-backups-age/prod/
```

**Pronto quando:** o log termina em `cópia fora do servidor ok` e o R2 lista
`<data UTC>/db.dump.age`, `uploads.tar.age` e `SHA256SUMS`. Anote o nome da pasta
(ex.: `20261018T231224Z`).

## Etapa 6 — Alerta e agenda 🖥️

```bash
sudo systemctl start estomasystech-backup-alert
sudo systemctl enable --now estomasystech-backup.timer
systemctl list-timers estomasystech-backup.timer
```

**Pronto quando:** chega o e-mail "[EstomaSysTech] backup falhou em …" (é só o teste) e o
`list-timers` mostra a próxima execução às **05:00 UTC** (02:00 de São Paulo).

## Etapa 7 — Teste de restauração 💻

Prova que o backup volta, sem tocar a produção. Detalhes e registro no
[runbook § 5.3](producao.md#53-teste-de-restauração-mensal).

1. 🌐 Crie um token **só de leitura** no R2 (*Object Read only*, só o bucket, TTL de 7 dias).
   ⚠️ Não use o token do servidor fora dele.
2. 💻 Baixe a pasta (troque `<ACCOUNT_ID>` e `<PASTA>`):

```bash
mkdir -p ~/restore-teste && chmod 700 ~/restore-teste && cd ~/restore-teste
read -rp "Access Key ID: " AK; read -rsp "Secret: " SK; echo
RCLONE_CONFIG_R2RO_TYPE=s3 RCLONE_CONFIG_R2RO_PROVIDER=Cloudflare RCLONE_CONFIG_R2RO_REGION=auto \
RCLONE_CONFIG_R2RO_ENDPOINT=https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com \
RCLONE_CONFIG_R2RO_ACCESS_KEY_ID="$AK" RCLONE_CONFIG_R2RO_SECRET_ACCESS_KEY="$SK" \
  rclone copy r2ro:estomasystech-backups-age/prod/<PASTA> ./<PASTA>; unset AK SK
```

3. 💻 Traga a chave privada do Bitwarden para `~/restore-teste/estomasystech-backup.key`
   (`(umask 077; cat > ~/restore-teste/estomasystech-backup.key)`, cole, Enter, Ctrl+D) e confira:
   `age-keygen -y ~/restore-teste/estomasystech-backup.key` tem que mostrar a chave pública.
4. 💻 Siga o [runbook § 5.3](producao.md#53-teste-de-restauração-mensal): sobe um ambiente
   descartável **em Postgres 18** (o mesmo da produção), restaura com `scripts/restore.sh`,
   confere e apaga tudo.

**Pronto quando:** o app descartável abre com os dados de produção e o teste está registrado na
tabela do § 5.3.

## Etapa 8 — Desligar o backup antigo, sem cifra 🌐 (irreversível)

Só depois da etapa 7 aprovada:

1. Coolify → `estomasystech-db` → **Backups** → desligue o envio para o S3 do backup das 03:00.
2. R2 → bucket antigo (`estomasystech-backups`) → apague os dumps em claro.
3. R2 → API Tokens → apague o token que o Coolify usava.

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `403 AccessDenied` no rclone | Access Key/Secret não são do token certo, ou filtro de IP | crie outro token e regrave o `rclone.conf` (4.4); tire o filtro de IP para testar |
| `501 NotImplemented` no rclone | `rclone` do `apt` (antigo) | instale o pacote oficial (etapa 3) |
| `501 Bad sender address syntax` no msmtp | `from` com nome ou `< >` | `from` só com o endereço, nome em `from_full_name` (4.5) |
| `backup.sh` sai com `2` | configuração (container, volume, chave pública) | leia a mensagem no `journalctl`; [runbook § 5.1](producao.md#51-instalar-uma-vez) |
| `backup.sh` sai com `3` | cópia para o R2 falhou | rode o teste da 4.4 |
| restauração local: `unsupported version (1.16) in file header` | banco local em Postgres 16 | use o Postgres 18 do § 5.3 |
| `read: -p: no coprocess` | colou no zsh | digite `bash` antes |
