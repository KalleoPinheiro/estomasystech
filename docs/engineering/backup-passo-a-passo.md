---
title: "Backup cifrado — passo a passo do zero"
status: living
audience: [ops]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
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
| Chave privada `age` | cofre (Bitwarden), com uma segunda cópia fora dele (veja a Etapa 1). **Nunca** no servidor, nunca no chat |
| Chave pública `age` | servidor, `/etc/estomasystech/backup.pub` |
| Scripts | servidor, `/opt/estomasystech-backup/` |
| Configuração | servidor, `/etc/estomasystech/` e `/etc/msmtprc` |
| Agenda | servidor, `systemd` (`estomasystech-backup.timer`) |
| Cópias | servidor (7 dias) e R2 `estomasystech-backups-age/prod/` (30 dias travados, apagadas com 35) |

## Palavras que aparecem aqui

| Palavra | O que é |
| --- | --- |
| Servidor, VPS | o computador alugado na Hetzner onde o app roda. Você entra nele com `ssh vps` |
| SSH | o jeito de abrir um terminal no servidor a partir da sua máquina |
| Coolify | o painel que sobe o app e o banco no servidor |
| R2, bucket | o "HD na nuvem" da Cloudflare; o bucket é a pasta onde as cópias ficam |
| Token (R2, Resend) | uma senha de serviço, com permissão limitada, que um programa usa no seu lugar |
| Chave `age` pública / privada | um par: a pública só **tranca** (fica no servidor); a privada **destranca** (fica só no cofre) |
| Cofre (Bitwarden) | onde ficam todas as senhas e chaves. Nada sensível fica fora dele |
| `systemd` timer | o "despertador" do servidor que roda o backup todo dia |

## Quem faz o quê

O **Super Admin** do EstomaSysTech é quem opera a plataforma: tem o cofre, o SSH do servidor e
os painéis (Coolify, Cloudflare, Resend). O papel *Super Admin* **dentro do app** não dá acesso a
nada disso: são acessos separados, e cada um tem a própria senha ou chave no cofre.

| Tarefa | Quando | Seção |
| --- | --- | --- |
| Montar tudo do zero | uma vez (ou num servidor novo) | Etapas 1 a 8 |
| Ler o e-mail "backup falhou" e agir | quando chegar | [Rotina § Chegou o alerta](#chegou-o-e-mail-backup-falhou) |
| Teste de restauração | todo mês | [Rotina § Teste mensal](#todo-mês-teste-de-restauração) |
| Revisar o checklist de segurança | todo mês, junto do teste | [runbook § 5.4](producao.md#54-segurança-do-backup-checklist) |
| Trocar uma chave ou token | se vazar, se alguém sair da equipe, ou uma vez por ano | [Rotina § Trocar uma chave](#trocar-uma-chave-ou-token) |

## Antes de começar

| Precisa de | Para quê |
| --- | --- |
| Acesso SSH ao servidor (`ssh vps`) com `sudo` | instalar e configurar |
| Uma máquina sua com Linux ou WSL, `git`, `age` e Docker | gerar a chave e testar a restauração |
| Conta na Cloudflare com R2 | guardar as cópias |
| Conta no Resend com o domínio do app verificado | mandar o e-mail de alerta |
| Cofre de senhas (Bitwarden) | guardar chave e tokens |

**Regras de ouro (segurança):**

1. Nenhum segredo (senha, token, chave privada, `BW_SESSION`) vai para chat, e-mail, print,
   documento ou repositório. Antes de mandar um print, confira que nenhum aparece nele.
2. Segredo se digita com `read -rs` (não aparece na tela) ou vem do cofre direto para uma
   variável, nunca colado como texto num comando.
3. A chave privada `age` **nunca** fica no servidor e nunca fica guardada em claro no seu PC: traga
   do cofre para um teste e apague no fim (`shred -u`).
4. Cada token tem o **mínimo** de permissão: só o bucket do backup; o de teste, só leitura e com
   validade curta. Token que não se usa mais, apague.
5. Apagar backup, bucket ou chave **não tem volta**: confira duas vezes e só depois de um teste de
   restauração aprovado.
6. Terminou de usar o cofre pelo terminal: `bw lock`.

⚠️ Se o seu terminal for **zsh**, digite `bash` antes de colar os comandos deste guia: os
`read -rp`/`-rsp` são de bash.

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
2. **Antes de apagar o arquivo**, prove que o cofre guardou certo: em outra janela, puxe a nota
   do cofre e rode `age-keygen -y` nela (veja o bloco do teste mensal). Tem que sair a mesma
   linha `age1…`. Só depois apague.
3. Segunda cópia (recomendado): o Bitwarden sozinho é um ponto único. Se perder o acesso à conta,
   perde os backups. Opções: o *acesso de emergência* do Bitwarden para uma pessoa de confiança,
   ou a chave impressa em papel num envelope lacrado em local físico seguro.
4. Apague da máquina: `shred -u estomasystech-backup.key`.

**Pronto quando:** a chave está no Bitwarden (conferida com `age-keygen -y`), a segunda cópia
existe, e você tem a linha `age1…` anotada.
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

1. Coolify → `estomasystech-db` → **Automation → Backups** → desabilite o backup agendado (o botão passa a mostrar *Enable Backup*).
2. R2 → bucket antigo (`estomasystech-backups`) → apague os dumps em claro.
3. R2 → API Tokens → apague o token que o Coolify usava.
4. 🖥️ Apague os dumps em claro do app que o Coolify deixou no disco (o dump do banco interno do
   Coolify, em `/data/coolify/backups/coolify`, fica: é a recuperação do painel):

   ```bash
   sudo find /data/coolify/backups/databases -type f -name 'pg-dump-estomasystech-*.dmp' -exec shred -u {} \;
   ```

Depois, passe pelo [checklist de segurança](producao.md#54-segurança-do-backup-checklist): apague o token de restauração, recoloque o filtro de IP no token do servidor e tire a chave privada do disco.

## Etapa 9 — Backup disparado pelo CI, antes do deploy 🖥️ + 💻 (ADR-095)

O workflow de release (`release-deploy.yml`, v0.8.0) precisa de um backup confirmado antes de
mexer na produção. Para isso o Actions entra no servidor com uma **chave SSH só dele**, que **não
abre shell**: ela só consegue rodar `ci-backup.sh`, que inicia o mesmo `estomasystech-backup.service`
do timer e responde uma linha: `BACKUP_OK <timestamp>` ou `BACKUP_FALHOU <motivo>`. O backup
continua cifrado com `age` (a chave pública de `/etc/estomasystech/backup.pub`; a privada segue só
no cofre). O CI nunca vê a chave privada nem o conteúdo do backup.

O script confere três coisas: o serviço terminou com `Result=success`, apareceu uma pasta nova no
R2 e essa pasta tem `db.dump.age`, `uploads.tar.age` e `SHA256SUMS`.

Faça uma vez (💻 = sua máquina, 🖥️ = servidor):

1. 💻 Gere a chave do CI, sem senha (ela só vale para esse comando):
   `ssh-keygen -t ed25519 -N '' -C estomasystech-ci-backup -f ./ci-backup-key`
2. 🖥️ Crie o usuário e instale o script e o sudoers (a partir de um checkout do repositório):
   ```bash
   sudo adduser --disabled-password --gecos '' estoma-ci
   sudo install -m 0755 -o root -g root deploy/backup/ci-backup.sh /opt/estomasystech-backup/ci-backup.sh
   sudo visudo -cf deploy/backup/estomasystech-ci-backup.sudoers
   sudo install -m 0440 -o root -g root deploy/backup/estomasystech-ci-backup.sudoers /etc/sudoers.d/estomasystech-ci-backup
   ```
3. 🖥️ Autorize a chave **pública** com comando forçado (cole a linha de `ci-backup-key.pub` no lugar de `<CHAVE_PUBLICA>`):
   ```bash
   sudo install -d -m 0700 -o estoma-ci -g estoma-ci /home/estoma-ci/.ssh
   echo 'restrict,command="sudo /opt/estomasystech-backup/ci-backup.sh" <CHAVE_PUBLICA>' \
     | sudo -u estoma-ci tee /home/estoma-ci/.ssh/authorized_keys > /dev/null
   sudo chmod 600 /home/estoma-ci/.ssh/authorized_keys
   ```
4. 💻 Teste (tem que demorar o tempo de um backup e imprimir só uma linha):
   `ssh -i ./ci-backup-key -o IdentitiesOnly=yes estoma-ci@<host-do-servidor>`
   Esperado: `BACKUP_OK 2026…Z`. Tentar `ssh … ls` deve imprimir o mesmo (o comando é forçado) e
   `sudo -l` como `estoma-ci` deve listar só o `ci-backup.sh`.
5. 💻 Guarde `ci-backup-key` (privada) no cofre e **apague** o arquivo (`shred -u ci-backup-key`).
   Ela vira o secret `VPS_SSH_KEY` do *Environment* `producao` no GitHub, junto de `VPS_KNOWN_HOSTS`
   (saída de `ssh-keyscan -t ed25519 <host>` conferida com a impressão digital do servidor). Isso
   é feito na v0.8.0, quando o job de produção entrar. Nunca cole a chave em chat ou issue.

Se o teste do passo 4 falhar, a linha `BACKUP_FALHOU <motivo>` diz o que olhar (`journalctl -u
estomasystech-backup.service` no servidor). A chave do CI é revogada apagando a linha do
`authorized_keys`.

## Rotina do Super Admin

### Conferir que o backup rodou 🖥️

```bash
systemctl list-timers estomasystech-backup.timer                  # LAST = última execução
sudo journalctl -u estomasystech-backup -n 5 --no-pager             # termina em "cópia fora do servidor ok"
sudo rclone --config /etc/estomasystech/rclone.conf lsd r2:estomasystech-backups-age/prod/ | tail -3
```

Deve haver uma pasta por dia (data em UTC).

### Chegou o e-mail "backup falhou"

O e-mail traz as últimas linhas do log (sem dado de paciente). Procure a palavra depois de
`backup:` e siga a tabela [Se algo der errado](#se-algo-der-errado). Depois de corrigir, rode de
novo à mão e confira:

```bash
sudo systemctl start estomasystech-backup
sudo journalctl -u estomasystech-backup -n 10 --no-pager
```

Um dia sem backup não é perda de dado (os anteriores continuam no R2), mas corrija no mesmo dia:
o objetivo é perder no máximo 24 h (RPO).

### Todo mês: teste de restauração

Siga a [Etapa 7](#etapa-7--teste-de-restauração-) e o [runbook § 5.3](producao.md#53-teste-de-restauração-mensal),
com a pasta mais recente do R2. Para pegar os segredos do cofre **sem mostrar na tela**, use o
Bitwarden CLI (`npm install -g @bitwarden/cli`), em bash:

```bash
bw login --check || bw login                 # pede e-mail, senha mestra e o código 2FA
export BW_SESSION="$(bw unlock --raw)"       # guarda a sessão numa variável, sem imprimir
mkdir -p ~/restore-teste && chmod 700 ~/restore-teste
(umask 077; bw get item '<item da chave age>' \
  | jq -r '.notes // "", (.fields // [] | .[].value // "")' \
  | grep -o 'AGE-SECRET-KEY-1[0-9A-Z]*' > ~/restore-teste/estomasystech-backup.key)
age-keygen -y ~/restore-teste/estomasystech-backup.key   # tem que mostrar a chave pública do servidor
export DATA_ENCRYPTION_KEY="$(bw get item '<item do app>' | jq -r '.fields[] | select(.name=="DATA_ENCRYPTION_KEY") | .value')"
export AUTH_SECRET="$(bw get item '<item do app>' | jq -r '.fields[] | select(.name=="AUTH_SECRET") | .value')"
echo "${#DATA_ENCRYPTION_KEY} ${#AUTH_SECRET}"   # só o tamanho (64 64), nunca o valor
```

O `jq` e o `grep` acham a chave esteja ela numa nota ou num campo do item, mesmo com a chave
pública na mesma linha (instale o `jq` com `sudo apt install -y jq`). Se aparecerem duas chaves
`age1…` diferentes no cofre, vale a que é igual a `/etc/estomasystech/backup.pub` no servidor.
Troque `<…>` pelos nomes dos itens no seu cofre (liste só os nomes com
`bw list items --search estomasystech | jq -r '.[].name'`). Se o `bw login` imprimir uma linha
`export BW_SESSION=…`, **não** mande print dela. Ao terminar o teste:

```bash
cd ~/projects/estomasystech && docker compose down -v
shred -u ~/restore-teste/estomasystech-backup.key; rm -rf ~/restore-teste
unset AUTH_SECRET DATA_ENCRYPTION_KEY POSTGRES_PASSWORD COMPOSE_FILE COMPOSE_PROJECT_NAME
bw lock; unset BW_SESSION
```

Apague no R2 o token de leitura do teste. Registre a linha na tabela do
[runbook § 5.3](producao.md#53-teste-de-restauração-mensal) e revise o
[checklist § 5.4](producao.md#54-segurança-do-backup-checklist).

### Trocar uma chave ou token

| O quê | Como | Depois |
| --- | --- | --- |
| Token R2 do servidor | R2 → API Tokens → crie um novo igual ao da Etapa 2 → regrave com a [4.4](#44-rcloneconf-pede-as-chaves-do-token-da-etapa-2) → `R2 OK` | apague o token antigo |
| Chave do Resend | Resend → crie outra *Sending access* → regrave com a [4.5](#45-e-mail-de-alerta-msmtp-pelo-resend) → `ENVIADO` | apague a chave antiga |
| Chave `age` | Etapa 1 (chave nova) → Etapa 4.1 (troca a pública) → Etapa 5 (backup) | guarde a privada **antiga** até o último backup feito com ela sair do R2 (35 dias); depois apague. Se ela **vazou**, é incidente LGPD: [runbook § 5.4](producao.md#54-segurança-do-backup-checklist) |
| Alguém com acesso saiu da equipe | troque todos os tokens acima e a senha do Bitwarden compartilhado; tire o acesso dela ao SSH, ao Coolify e à Cloudflare | registre a troca no runbook |

### Onde está cada coisa (sem valores)

| Coisa | Onde |
| --- | --- |
| Chave privada `age`, tokens R2 e Resend, `AUTH_SECRET`, `DATA_ENCRYPTION_KEY` | Bitwarden (notas e itens com nome `estomasystech…`) |
| Segunda cópia da chave privada | nenhuma hoje (risco aceito em 2026-10-19). Se mudar, use o acesso de emergência do Bitwarden ou papel lacrado |
| Configuração do backup | servidor, `/etc/estomasystech/` (só `root` lê) |
| Cópias cifradas | R2, bucket `estomasystech-backups-age`, pasta `prod/` |

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `403 AccessDenied` no rclone | Access Key/Secret não são do token certo, ou filtro de IP | crie outro token e regrave o `rclone.conf` (4.4); tire o filtro de IP para testar |
| `501 NotImplemented` no rclone | `rclone` do `apt` (antigo) | instale o pacote oficial (etapa 3) |
| `501 Bad sender address syntax` no msmtp | `from` com nome ou `< >` | `from` só com o endereço, nome em `from_full_name` (4.5) |
| `backup.sh` sai com `2` | configuração (container, volume, chave pública) | leia a mensagem no `journalctl`; [runbook § 5.1](producao.md#51-instalar-uma-vez) |
| `backup.sh` sai com `3` | cópia para o R2 falhou | rode o teste da 4.4 |
| restauração local: `unsupported version (1.16) in file header` | volume `pgdata` antigo, criado quando o compose era Postgres 16 | `docker compose down -v` (apaga o banco local) e suba de novo; o compose é 18 desde a #385 |
| `read: -p: no coprocess` | colou no zsh | digite `bash` antes |
