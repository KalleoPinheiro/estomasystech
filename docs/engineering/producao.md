---
title: "Runbook de produção"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
---

# Runbook de produção

Como colocar e manter no ar o Vitta Flow com dado de saúde (LGPD). Alvo decidido pelo dono do
produto ([#206](https://github.com/KalleoPinheiro/vitta-flow/issues/206), 2026-10-11): **VPS
Hetzner + `docker compose`** (app + Postgres), **uma réplica**, Caddy na frente terminando TLS,
fotos em volume local. Desenvolvimento local fica em [`onboarding.md`](onboarding.md); erros
conhecidos, em [`troubleshooting.md`](troubleshooting.md).

## 1. Decisões

| Decidido (#206) | Valor |
| --- | --- |
| Hospedagem | VPS Hetzner, `docker-compose.yml` + `docker-compose.prod.yml`, 1 réplica |
| Fotos | volume `uploads` no servidor (`PHOTO_STORAGE` vazio) |
| RPO / RTO | 24 h / 4 h: backup diário cifrado do banco e das fotos, 30 dias fora do servidor, teste de restauração mensal (§ 5) |
| Operação e alertas | o dono da plataforma opera; alertas por e-mail ao operador pelo canal da plataforma (§ 9, [#212](https://github.com/KalleoPinheiro/vitta-flow/issues/212)) |
| Observabilidade (#212) | `/api/health` e `/api/health/ready`, logs JSON com `requestId`, GlitchTip self-hosted no compose ([ADR-014](../adr/014-observabilidade-sem-pii.md)) |

**Pendência jurídica:** o servidor fica fora do Brasil (Alemanha, UE), então guardar dado de
saúde nele é transferência internacional (LGPD art. 33). A base legal está em aberto na
[#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216) — resolva antes de cadastrar
paciente real. A região escolhida vale também para essa base legal, e o mesmo vale para o destino
do backup fora do servidor.

Decisões do dono em 2026-10-12 ([#313](https://github.com/KalleoPinheiro/vitta-flow/issues/313),
`.specs/STATE.md` AD-033):

| Tema | Decisão | Onde entra |
| --- | --- | --- |
| Cópia fora do servidor | **Hetzner Storage Box** em outra localização, com snapshots no destino. O `rsync --delete` não pode apagar os snapshots | § 5 — `BACKUP_OFFSITE_CMD` |
| Região | **Alemanha** (UE); vale também para a base legal da transferência internacional (#216) | § 2 |
| Cifra do disco | **Sem LUKS**: só os backups cifrados (`age`) e os campos cifrados ([ADR-006](../adr/006-chave-de-dados-clinicos.md)). As fotos ficam em claro no disco da VPS e o servidor volta sozinho após um reboot ([ADR-015](../adr/015-servidor-sem-cifra-de-disco.md)) | § 2 |
| E-mail do host (alertas do cron) | **`msmtp` pela porta 587 com o SMTP do Resend** (a porta 25 é bloqueada) | § 9.3 |
| Lembretes | **08:00 de São Paulo** (mantido) | § 7 |
| Uptime externo | **UptimeRobot**, checando `/api/health/ready` a cada 5 min, com alerta por e-mail | § 9.3 |
| GlitchTip | acesso **só por túnel SSH**; retenção de **30 dias** | § 9.5 |
| Limiares dos alertas | `10` (5xx) e `3` (falha de envio) em 15 min, mantidos; "falha de envio" = só erro do provedor | § 9.2 |
| Erro do navegador | **não capturar por ora** | § 9.5 |

## 2. Topologia e provisionamento

| Peça | Configuração |
| --- | --- |
| Servidor | Ubuntu 24.04 LTS. **4 GB de RAM** no mínimo: o build do Next usa até 4 GB de heap (`npm run build`), e cada login é um scrypt de ~128 MiB (#208), até 4 em paralelo |
| App + banco | `docker compose up -d --build`; o Postgres só no loopback (`127.0.0.1:5432`) |
| TLS | serviço `caddy` de [`docker-compose.prod.yml`](../../docker-compose.prod.yml) + [`deploy/Caddyfile`](../../deploy/Caddyfile): certificado Let's Encrypt automático; o app deixa de ser publicado no host |
| Região | Hetzner, Alemanha (UE) |
| Fotos | volume `uploads` (uma réplica). Mais de uma réplica exige bucket (`PHOTO_STORAGE=s3`) |
| Disco | **sem LUKS** ([ADR-015](../adr/015-servidor-sem-cifra-de-disco.md)): o servidor volta sozinho após um reboot; as fotos ficam em claro no volume, e o que protege são os backups `age`, os campos cifrados (ADR-006), o acesso SSH só por chave e o Cloud Firewall |
| Cron | `/etc/cron.d/vitta` do host (§ 7) |
| Fuso | a imagem define `TZ=America/Sao_Paulo`; o host pode ficar em UTC (as linhas do cron estão em UTC) |

Provisionamento, uma vez:

1. Crie o servidor na região da Alemanha, com chave SSH (sem senha) e um **Cloud Firewall** da Hetzner liberando só
   22 (de preferência restrito ao IP do operador), 80 e 443. Use o firewall da Hetzner, não o
   `ufw`: porta publicada pelo Docker passa por fora do `ufw`.
2. No host: usuário não-root com `sudo`, `PasswordAuthentication no` no SSH,
   `unattended-upgrades` ligado. Instale Docker Engine com o plugin compose (pela documentação
   oficial do Docker), `git`, `age` e `curl`.
3. DNS: registro `A`/`AAAA` do domínio apontando para o servidor (o Caddy precisa dele para emitir
   o certificado).
4. `git clone` do repositório em `/opt/vitta-flow` e, ali, um `.env` com `chmod 600`, a partir do
   `.env.example`, contendo pelo menos:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
   APP_DOMAIN=clinica.exemplo.com.br
   APP_URL=https://clinica.exemplo.com.br
   TRUSTED_PROXY_HOPS=1
   POSTGRES_PASSWORD=...      # openssl rand -hex 24
   AUTH_SECRET=...            # openssl rand -hex 32
   DATA_ENCRYPTION_KEY=...    # openssl rand -hex 32 — cópia no cofre (§ 6)
   CRON_SECRET=...            # openssl rand -hex 24
   VITTA_BOOTSTRAP_TOKEN=...  # só até o primeiro acesso (§ 8)
   RESEND_API_KEY=...         # canal da plataforma: convite do Super Admin e alertas (§ 9)
   EMAIL_FROM="Vitta Flow <nao-responda@exemplo.com.br>"
   ALERT_EMAIL_TO=operador@exemplo.com.br
   ```

   Com `COMPOSE_FILE` no `.env`, todo `docker compose` rodado em `/opt/vitta-flow` (inclusive
   pelos scripts de backup) já inclui o Caddy.
5. `docker compose up -d --build` e confira:
   `curl -fsS https://clinica.exemplo.com.br/api/health/ready` (`200` com banco e migrações `ok`).
6. Backup (§ 5), cron (§ 7), primeiro acesso (§ 8) e alertas (§ 9).

**Atualizar a versão:** `git pull`,
`sudo sh -c '. /etc/vitta/backup.env && scripts/backup.sh'` (rollback é restaurar, § 4) e
`docker compose up -d --build`. O app fica fora do ar só enquanto o container novo sobe e migra.

### Alternativa não adotada: Vercel + Supabase

O código continua compatível (`vercel.json`), mas não é o alvo. Diferenças que importam: o app
usa o pooler do Supabase em modo transação (porta `6543`) e as migrações a conexão direta
(`5432`), com `VITTA_MIGRATE_ON_BOOT=false` e `PG_POOL_MAX=5`; fotos **obrigatoriamente** em
bucket (`PHOTO_STORAGE=s3`, a aplicação recusa o disco local quando `VERCEL` existe); o Vercel
Cron chama `GET /api/reminders/run` e `GET /api/retention/run` com
`Authorization: Bearer $CRON_SECRET`; `TZ` é reservado e
o app alinha o fuso a `APP_TIMEZONE` na subida (`src/instrumentation.ts`).

## 3. TLS, URL pública e proxy

- O cookie de sessão é `Secure` em produção: **login não funciona por HTTP** fora de `localhost`.
- `APP_URL` precisa ser `https://…` (compõe os links de convite/reset e o redirect da agenda).
- O app lê o IP do cliente contando `TRUSTED_PROXY_HOPS` saltos a partir do fim do
  `x-forwarded-for` (rate limit do login e da API). Sem `trusted_proxies`, o Caddy **substitui**
  esse cabeçalho pelo IP de quem conectou, então a cadeia tem um item só:
  - Caddy sozinho (o decidido): `TRUSTED_PROXY_HOPS=1`.
  - Cloudflare (proxy laranja) na frente do Caddy: declare as faixas de IP da Cloudflare em
    `trusted_proxies static …` dentro da opção global `servers { }` do `deploy/Caddyfile` (o Caddy passa a manter a cadeia e
    acrescentar o IP da Cloudflare) e só então use `TRUSTED_PROXY_HOPS=2`. Com `2` e sem
    `trusted_proxies`, todo mundo cai no mesmo balde `unknown`.
  - Valor maior que o número real de proxies deixa o cliente escolher o próprio IP; menor junta
    todo mundo no IP do proxy. O log `[config] Requisição sem x-forwarded-for` indica app exposto
    sem proxy.
- Não publique a porta do app no host: o `docker-compose.prod.yml` faz `ports: !reset []` no
  `app` (exige Docker Compose 2.24 ou mais novo).

## 4. Migrações

- Padrão na VPS: o app migra no boot com advisory lock (`VITTA_MIGRATE_ON_BOOT` vazio). Uma
  réplica, então o deploy é: backup, `docker compose up -d --build`, o container novo migra e sobe.
- Para migrar como passo separado: `VITTA_MIGRATE_ON_BOOT=false` e, de um checkout no host,
  `DATABASE_URL=postgres://vitta:…@127.0.0.1:5432/vitta npm run db:migrate` (a imagem standalone
  não tem `drizzle-kit`).
- **Rollback:** as migrações não têm `down`. Reverter é restaurar o backup tirado antes do deploy
  (§ 5) ou escrever uma migração nova que desfaça a mudança.
- **Depois das migrações deste lote:**
  1. `npm run db:portal-orphans` — lista contas de portal que a migração `0040` não conseguiu
     vincular ao cadastro pelo e-mail ([#196](https://github.com/KalleoPinheiro/vitta-flow/issues/196));
     recrie-as em */configuracoes* escolhendo o paciente/parceiro.
  2. `npm run data:reencrypt` — § 6.

## 5. Backup e restore

Guarda do prontuário: Lei 13.787/2018 e LGPD art. 46. **Sem restauração testada, não há backup.**
Meta decidida: RPO 24 h, RTO 4 h.

| O quê | Como |
| --- | --- |
| Banco | [`scripts/backup.sh`](../../scripts/backup.sh): `pg_dump -Fc` do serviço `db` → `db.dump.age` |
| Fotos | o mesmo script: `tar` do volume `uploads` pelo serviço `uploads-backup` do compose (sem log, para o tar não parar em claro no disco) → `uploads.tar.age` |
| Cifra | `age` com chave pública no servidor; a **chave privada fica fora dele** (cofre + cópia offline). O dado em claro não toca o disco |
| Destino | `$BACKUP_DIR/<data UTC>/` no servidor e cópia fora dele, numa Hetzner Storage Box de outra localização, por `BACKUP_OFFSITE_CMD` |
| Retenção | 30 dias (`BACKUP_KEEP_DAYS`) no servidor; fora dele, espelhe a pasta com `rsync --delete`; os snapshots da Storage Box guardam o que o espelho apagar |
| Chaves | `DATA_ENCRYPTION_KEY` (e as anteriores) e a chave privada `age` no cofre de segredos, **nunca** dentro do backup |

Sem `DATA_ENCRYPTION_KEY` o backup do banco não serve: os textos clínicos estão cifrados com ela.
Sem a chave privada `age`, nenhum backup serve.

**Configurar, uma vez:**

1. Na máquina do operador (não no servidor): `age-keygen -o vitta-backup.key`. Guarde o arquivo
   no cofre e numa cópia offline; a linha `# public key: age1…` vai para o servidor em
   `/etc/vitta/backup.pub` (`chmod 600`).
2. Prepare a Storage Box (uma vez, no painel da Hetzner e na máquina do operador): crie a caixa
   **em outra localização** que não a do servidor; habilite o acesso por SSH; instale a chave
   pública SSH do servidor na caixa (`~/.ssh/authorized_keys` dela); ligue os **snapshots** da caixa.
   O script roda o comando de cópia com `sh -c`, exportando `BACKUP_PATH` (pasta do backup novo) e
   `BACKUP_DIR` (todas). Para a Storage Box (SSH na porta 23), em `/etc/vitta/backup.env` (§ 7):

   ```bash
   export BACKUP_OFFSITE_CMD='rsync -a --delete -e "ssh -p 23" "$BACKUP_DIR"/ u123456@u123456.your-storagebox.de:vitta/'
   ```

   (`u123456` é o usuário da sua caixa.) O `--delete` espelha a pasta `vitta/` dentro da caixa:
   quem apagar os backups do servidor apaga também a cópia espelhada no próximo ciclo. O que
   protege disso são os **snapshots da caixa**; o comando acima mexe só na pasta espelhada, e
   nenhum comando do runbook apaga snapshots.
3. Rode uma vez à mão e confira a pasta nova no destino:

   ```bash
   cd /opt/vitta-flow
   sudo BACKUP_AGE_RECIPIENTS_FILE=/etc/vitta/backup.pub BACKUP_OFFSITE_CMD='…' scripts/backup.sh
   ```

4. Agende no cron (§ 7).

| Saída do `backup.sh` | Significado |
| --- | --- |
| `0` | backup gerado e copiado para fora do servidor; cópias locais com mais de 30 dias apagadas |
| `2` | configuração: chave pública ausente, `age`/`flock` faltando ou outro backup rodando. Nada foi gerado |
| `3` | backup gerado **só** no servidor: `BACKUP_OFFSITE_CMD` vazio ou falhou. Corrija e rode de novo |
| `1` | falha inesperada (ex.: banco fora do ar). Pasta parcial descartada |

**Restaurar** ([`scripts/restore.sh`](../../scripts/restore.sh)), com a chave privada trazida do
cofre só para isso:

```bash
BACKUP_AGE_IDENTITY_FILE=./vitta-backup.key scripts/restore.sh /caminho/20261011T060000Z
BACKUP_AGE_IDENTITY_FILE=./vitta-backup.key scripts/restore.sh /caminho/20261011T060000Z --confirmar
```

Sem `--confirmar` o script só confere: `SHA256SUMS`, decifra os dois arquivos (chave errada sai
com `2`) e lista o dump e o tar das fotos.
Com `--confirmar` ele para o app, recria o banco `vitta`, restaura o dump, troca o conteúdo do
volume de fotos e sobe o app (que roda as migrações pendentes se o backup for de versão
anterior). Saída `0` ok, `2` uso ou pré-condição (nada foi alterado), `1` falha no meio — rode de
novo. Apague a chave privada do servidor ao terminar.

**Desastre (servidor perdido):** provisione outro (§ 2) com o mesmo `.env` do cofre, suba
(`docker compose up -d --build`), traga a pasta do backup mais recente do destino e restaure com
`--confirmar`. O RTO de 4 h cabe nisso só se o teste mensal mostrar que cabe.

**Teste de restauração (mensal):** numa máquina descartável (outra VPS ou o notebook do operador,
com o repositório e Docker), sem o Caddy e em portas que não colidem:

```bash
export COMPOSE_FILE=docker-compose.yml COMPOSE_PROJECT_NAME=vitta-restore APP_PORT=3100 POSTGRES_PORT=5433
# POSTGRES_PASSWORD, AUTH_SECRET e DATA_ENCRYPTION_KEY de produção (do cofre) no ambiente
docker compose up -d --build
BACKUP_AGE_IDENTITY_FILE=./vitta-backup.key scripts/restore.sh ./20261011T060000Z --confirmar
```

Abra `http://localhost:3100`, entre e confira a ficha de um paciente com evolução, anamnese e
foto. Cronometre do início do download até a ficha abrir (é o RTO real). Depois,
`docker compose down -v` e apague a chave e o backup da máquina. Registre abaixo; se algo
falhar, abra issue com o rótulo `bug`.

| Data | Backup de | Quem | Tempo até voltar | Resultado |
| --- | --- | --- | --- | --- |
| — | — | — | — | nenhum teste registrado ainda |

O CI repete o ciclo inteiro a cada PR com uma chave descartável
([`scripts/backup-smoke.sh`](../../scripts/backup-smoke.sh)): grava linha e foto, faz backup, apaga
tudo, restaura e confere.

## 6. Segredos e rotação

Gere com `openssl rand -hex 32` (ou `-hex 24` onde indicado no `.env.example`). Na VPS, `.env`
com permissão `600`, fora do controle de versão (o `.gitignore` o ignora), e uma cópia no cofre de segredos do operador (o `.env`
**não** entra no backup).

| Segredo | Rotação | Efeito |
| --- | --- | --- |
| `AUTH_SECRET` | incidente ou troca de pessoal | derruba **todas** as sessões (todos logam de novo). Não afeta o dado clínico ([ADR-006](../adr/006-chave-de-dados-clinicos.md)); mantenha o valor antigo só se ainda houver dado no formato legado (antes de rodar a recifra) |
| `DATA_ENCRYPTION_KEY` | anual ou incidente | 1) valor atual → `DATA_ENCRYPTION_KEY_PREVIOUS`; 2) novo valor em `DATA_ENCRYPTION_KEY`; 3) deploy; 4) `npm run data:reencrypt`; 5) quando o script reportar 0 pendências, remova o antigo de `_PREVIOUS`. Guarde a chave antiga no cofre enquanto houver backup (30 dias) cifrado com ela |
| `POSTGRES_PASSWORD` | incidente | `ALTER ROLE vitta PASSWORD '…'` no `db`, novo valor no `.env`, `docker compose up -d` |
| Chave `age` do backup | incidente ou troca de operador | gere outra, troque `/etc/vitta/backup.pub`; guarde a privada antiga enquanto houver backup (30 dias) cifrado com ela |
| `VITTA_BOOTSTRAP_TOKEN` | — | só serve enquanto não existe nenhuma conta; **remova** depois do primeiro acesso (§ 8) |
| `CRON_SECRET` | incidente | atualize junto em `/etc/vitta/cron.headers` (§ 7) |
| `RESEND_API_KEY`, credenciais Google | conforme o provedor | troque no provedor e no `.env` |
| `GLITCHTIP_SECRET_KEY`, `GLITCHTIP_DB_PASSWORD` | incidente | troca derruba as sessões da interface do GlitchTip; a senha do banco dele segue o roteiro da `POSTGRES_PASSWORD` no serviço `glitchtip-db` |
| `GLITCHTIP_DSN` | incidente | gere outra chave no projeto do GlitchTip, troque no `.env`, `docker compose up -d app` e revogue a antiga |

`npm run data:reencrypt` (a partir de um checkout, com `DATABASE_URL`, `DATA_ENCRYPTION_KEY`,
`DATA_ENCRYPTION_KEY_PREVIOUS` e, se ainda houver dado legado, o `AUTH_SECRET` antigo) regrava
com a chave atual todo texto clínico em claro, no formato legado ou de uma chave anterior. É
idempotente: pode ser interrompido e rodado de novo.

## 7. Cron (lembretes, backup, retenção, alertas)

O host fica em UTC; São Paulo é UTC−3 o ano todo. Guarde o segredo do cron num arquivo, não na
linha do crontab (`/etc/vitta/cron.headers`, `chmod 600`, com a linha
`x-cron-secret: <CRON_SECRET>`). Em `/etc/cron.d/vitta`:

```text
MAILTO=operador@exemplo.com.br
# Backup diário às 02:00 de São Paulo. Silencioso quando dá certo; a falha vai por e-mail.
0 5 * * * root . /etc/vitta/backup.env && /opt/vitta-flow/scripts/backup.sh >> /var/log/vitta-backup.log 2>&1 || echo "backup falhou: /var/log/vitta-backup.log"
# Lembretes às 08:00 de São Paulo (decidido em 2026-10-12, #313).
0 11 * * * root curl -fsS -o /dev/null -X POST -H @/etc/vitta/cron.headers https://clinica.exemplo.com.br/api/reminders/run
# Retenção LGPD às 03:00 de São Paulo, depois do backup (§ 7.1). O flock espera o backup
# terminar: apagar uma foto enquanto o tar lê o volume faria o backup falhar.
0 6 * * * root flock -w 3600 /var/backups/vitta/.lock curl -fsS -o /dev/null -X POST -H @/etc/vitta/cron.headers https://clinica.exemplo.com.br/api/retention/run
# Alertas ao operador a cada 5 min (§ 9). O e-mail sai do app; se o app não responder, o
# curl falha e o MAILTO avisa.
*/5 * * * * root curl -fsS -o /dev/null -X POST -H @/etc/vitta/cron.headers https://clinica.exemplo.com.br/api/alerts/run
```

`/etc/vitta/backup.env` (`chmod 600`) exporta a configuração do § 5:
`export BACKUP_AGE_RECIPIENTS_FILE=/etc/vitta/backup.pub` e `export BACKUP_OFFSITE_CMD='…'`.
O `cron` manda por e-mail ao `MAILTO` tudo que o comando escrever; as quatro linhas só escrevem
quando falham. Precisa de um relay de e-mail no host (`msmtp`, § 9.3).

- Sem `CRON_SECRET` as rotas de lembretes e de retenção respondem 503 (job desligado). Falha do job: resposta
  não-2xx (o `curl -f` escreve o erro) e `docker compose logs app`.
- **Antes do primeiro disparo real:**
  - Nome da empresa em */configuracoes*: a empresa criada pela migração se chama "Clínica
    legada" e o nome vai no texto do e-mail e do `wa.me`.
  - Retornos `pending` antigos: na primeira execução, cada retorno vencido há 30 dias ou mais
    recebe de uma vez a 3ª tentativa (só a mais alta cabível — COM-RN-06). Conclua ou cancele
    os que não devem gerar e-mail. Contagem:
    `SELECT clinic_id, count(*) FROM follow_ups WHERE status = 'pending' AND due_date < now() GROUP BY 1;`
  - Teto do Resend Free: 100 e-mails/dia. Acima disso o envio conta `failed` no resumo, sem
    alarme, e é tentado de novo no dia seguinte.
- **Teste de fumaça:** paciente de teste com o seu e-mail e consulta `scheduled` amanhã; dispare
  o job manualmente e espere `channel: "configured"` e `sent: 1` na entrada da clínica, e nenhuma entrada com `error`.
  Disparar de novo no mesmo dia deve devolver `sent: 0`. Na agenda, **Enviar WhatsApp** abre o
  `wa.me` e passa a mostrar "enviado hoje às HH:MM".

### 7.1 Cron de retenção e anonimização (#294)

Anonimiza o que passou do prazo (prontuário e fotos 20 anos após a última atividade, trilha de
auditoria 5 anos, lista de espera e contas inativas 2 anos). Nada é excluído do banco; o arquivo
da foto é apagado do volume `uploads`. Contrato e regras:
[`integrations/retencao.md`](integrations/retencao.md), [ADR-013](../adr/013-retencao-por-anonimizacao.md).
Issue: [#294](https://github.com/KalleoPinheiro/vitta-flow/issues/294).

- Linha do `/etc/cron.d/vitta` no § 7: uma vez por dia, fora do horário da clínica, com o mesmo
  `CRON_SECRET` dos lembretes. Na alternativa Vercel, o `vercel.json` agenda
  `GET /api/retention/run` às 06:00 UTC.
- **Backup:** o dado anonimizado continua identificável nos backups até eles expirarem — no
  máximo 30 dias (§ 5), mais o que a retenção do destino fora do servidor guardar.
- **Primeira execução:** a trilha de auditoria pode ter muitos eventos com mais de 5 anos e a
  atualização é uma só por empresa; rode fora do horário de uso. Contagem prévia:
  `SELECT clinic_id, count(*) FROM audit_events WHERE occurred_at < now() - interval '5 years' AND actor_id <> 'anonimizado' GROUP BY 1;`
- **Verificação:** a resposta traz só contagens por tipo e por empresa; a segunda execução no
  mesmo dia devolve tudo `0`. Entrada com `error` indica empresa que falhou (as outras seguem);
  veja `docker compose logs app`.
- Contas inativas antes da migração `0049` contam os 2 anos a partir dela.

## 8. Primeiro acesso

1. Configure todas as variáveis obrigatórias (`.env.example`), incluindo `VITTA_BOOTSTRAP_TOKEN`.
2. `curl -sX POST "$APP_URL/api/auth/bootstrap" -H "Content-Type: application/json" -H "x-bootstrap-token: $VITTA_BOOTSTRAP_TOKEN" -d '{"email":"responsavel@clinica.com.br"}'` — cria o Super Admin e envia o convite.
3. Defina a senha pelo link do convite e entre. Com `RESEND_API_KEY`/`EMAIL_FROM` (opcionais,
   [ADR-011](../adr/011-canal-de-comunicacao-por-clinica.md)) ele chega por e-mail; sem elas, ou se o
   envio falhar, vem no campo `inviteUrl` da resposta do passo 2.
4. Remova `VITTA_BOOTSTRAP_TOKEN` do `.env` e `docker compose up -d`.
5. Cadastre a clínica e convide o administrador dela; em */configuracoes* da clínica: dados (CNPJ,
   responsável técnico), canal de e-mail, grade de horários, profissionais, contas da equipe.
6. Contas de portal: crie a partir do paciente/parceiro já cadastrado (o vínculo é obrigatório).

## 9. Monitoramento e alertas

Decisões do dono ([#212](https://github.com/KalleoPinheiro/vitta-flow/issues/212)): tudo
self-hosted, alertas por **e-mail** ao operador pelo canal da plataforma. Desenho e o que sai do
processo: [ADR-014](../adr/014-observabilidade-sem-pii.md).

### 9.1 Health check

| Rota | Checa | Quem usa |
| --- | --- | --- |
| `GET /api/health` | o processo responde (sem banco, sem rate limit) | `HEALTHCHECK` da imagem e do compose |
| `GET /api/health/ready` | `select 1` e todas as migrações de `drizzle/` aplicadas; `503` senão, em até 3 s | verificador externo, alerta `readiness` |

O corpo diz só `database` e `migrations` (`ok`/`fail`/`pending`/`unknown`). `docker compose ps`
mostra `unhealthy` quando a liveness falha; `restart: unless-stopped` reinicia o processo que
morre, mas não o que fica `unhealthy`.

### 9.2 Alertas por e-mail

`*/5` no `/etc/cron.d/vitta` (§ 7) chama `POST /api/alerts/run`. Precisa de `ALERT_EMAIL_TO` e
do canal da plataforma (`RESEND_API_KEY`/`EMAIL_FROM`) no `.env`. Contrato e detalhes:
[`integrations/alertas.md`](integrations/alertas.md).

| Alerta | Ativo quando |
| --- | --- |
| aplicação não está pronta | `/api/health/ready` falharia (banco fora ou migração pendente) |
| erros 5xx acima do limiar | ≥ `ALERT_5XX_THRESHOLD` (10) erros 500 em 15 min |
| job de lembretes sem rodar | última execução há mais de 26 h |
| falhas de entrega recorrentes | ≥ `ALERT_DELIVERY_FAILURE_THRESHOLD` (3) envios de e-mail recusados em 15 min |

Mesmo alerta ativo volta no máximo a cada 60 min. Os contadores ficam em memória: reiniciar o
app os zera (uma réplica). Sem destinatário ou sem canal, o alerta vira linha `error` no log.

**Teste de fumaça:** com o app no ar, `docker compose stop db`; em até 5 min chega "aplicação
não está pronta". `docker compose start db` em seguida.

### 9.3 Outros sinais

| Sinal | Como |
| --- | --- |
| App fora do ar | o `curl -f` do cron de alertas falha e o `MAILTO` avisa; com o servidor inteiro fora, só o verificador externo avisa (UptimeRobot, abaixo) |
| Backup, lembretes ou retenção falharam | `MAILTO` do cron (§ 7) |
| Disco | linha no `/etc/cron.d/vitta`: `0 * * * * root df --output=pcent / /var/lib/docker \| awk 'NR>1 && $1+0 > 85 {print "disco em " $1}'` |
| Backup que não rodou | o `MAILTO` não pega cron parado; o verificador de "último backup" segue fora desta entrega |

**E-mail do host (`msmtp`).** O `MAILTO` do cron precisa de um relay no host: a Hetzner bloqueia a
porta 25 de saída, então o decidido é o `msmtp` na **porta 587** com o SMTP do Resend (o mesmo
provedor do canal da plataforma). Uma vez, no servidor:

1. `sudo apt install msmtp-mta` (entrega o `sendmail` que o `cron` usa).
2. `/etc/msmtprc` (`chmod 600`, dono `root`):

   ```text
   defaults
   auth           on
   tls            on
   tls_starttls   on
   tls_trust_file /etc/ssl/certs/ca-certificates.crt
   logfile        /var/log/msmtp.log

   account        resend
   host           smtp.resend.com
   port           587
   user           resend
   password       <RESEND_API_KEY>
   from           nao-responda@exemplo.com.br

   account default : resend
   ```

   `from` é um endereço do domínio verificado no Resend (o mesmo do `EMAIL_FROM`); a senha é a
   `RESEND_API_KEY`, que passa a morar também nesse arquivo: troque nos dois ao rotacionar (§ 6).
3. Teste: `printf 'Subject: teste msmtp\n\nok\n' | sendmail operador@exemplo.com.br`. Se não
   chegar, veja `/var/log/msmtp.log`.

**Uptime externo (UptimeRobot).** Fica fora do servidor, então avisa também quando a VPS inteira
cai. Cadastro, uma vez:

1. Crie o monitor do tipo **HTTP(s)** com a URL `https://<domínio>/api/health/ready`.
2. Intervalo de **5 min**.
3. Contato de alerta: o **e-mail** do operador.
4. Confira derrubando o banco (`docker compose stop db`; `/api/health/ready` passa a responder
   `503`) e religue depois (`docker compose start db`).

### 9.4 Logs

`docker compose logs app` traz uma linha JSON por evento: `time`, `level`, `msg`, `requestId` e
campos. O `x-request-id` volta em toda resposta; com ele, ache todas as linhas do request:

```bash
docker compose logs --no-log-prefix app | grep '"requestId":"<id>"' | jq .
docker compose logs --no-log-prefix app | jq -c 'select(.level == "error")'
```

Os logs não carregam dado pessoal (`logError`,
[#202](https://github.com/KalleoPinheiro/vitta-flow/issues/202); e-mail e número longo viram
`[e-mail]`/`[número]`). O erro não tratado que o próprio Next escreve (`⨯ …`) segue em texto; o
mesmo erro sai limpo e em JSON (`Erro não tratado na requisição`).

### 9.5 GlitchTip (error tracking)

Opcional: sem `GLITCHTIP_DSN` o app funciona igual. Configurar, uma vez:

1. No `.env`: `GLITCHTIP_DB_PASSWORD` (`openssl rand -hex 24`), `GLITCHTIP_SECRET_KEY`
   (`openssl rand -hex 32`) e `docker-compose.glitchtip.yml` no fim do `COMPOSE_FILE`.
   Guarde os dois no cofre.
2. `docker compose up -d glitchtip` e crie o operador:
   `docker compose exec glitchtip ./manage.py createsuperuser`. O cadastro aberto fica desligado.
3. Da máquina do operador: `ssh -L 8000:127.0.0.1:8000 <servidor>` e abra
   `http://localhost:8000`. A interface não tem porta pública.
4. Crie organização e projeto (plataforma Node), copie o DSN e grave no `.env` trocando o host
   pelo serviço: `GLITCHTIP_DSN=http://<chave>@glitchtip:8000/<projeto>`. Opcional:
   `APP_RELEASE=$(git rev-parse --short HEAD)` a cada deploy.
5. `docker compose up -d app`. Confira com um erro de verdade (ex. a fumaça do § 9.2).

O que sai do app para o GlitchTip e o que nunca sai: [`integrations/glitchtip.md`](integrations/glitchtip.md).
A interface só abre por túnel SSH (passo 3), sem porta pública. Retenção decidida: **30 dias** (`GLITCHTIP_MAX_EVENT_LIFE_DAYS`, o padrão do compose). O banco do GlitchTip não
entra no backup (§ 5): não guarda dado de paciente e perdê-lo só perde o histórico de erros.
O erro do navegador **não é capturado por ora**: só o servidor envia eventos. RAM: o GlitchTip `all_in_one` usa cerca de 512 MB a mais; com 4 GB, acompanhe no primeiro
build com ele no ar.

## 10. Recuperação de emergência do Super Admin

Quando o Super Admin perdeu **tudo** — a senha, o e-mail ou o autenticador **e** os códigos de
recuperação. Perdeu só o celular: entre com um código de recuperação, sem script
([ADR-008](../adr/008-segundo-fator-do-super-admin.md)). Não há rota pública para isto: quem
tem `DATABASE_URL` já tem o banco ([ADR-009](../adr/009-recuperacao-de-emergencia-do-super-admin.md)).

1. De um checkout do repositório (Vercel) ou do host (VPS), com `DATABASE_URL` (conexão direta)
   e `APP_URL` (a URL pública `https://`), simule:
   `npm run admin:recover -- --novo-email=novo@clinica.com.br`
   (sem `--novo-email` o e-mail não muda). A simulação mostra a conta, o e-mail novo e o que
   será feito, e não grava nada.
2. Confira e aplique: repita o comando com `--confirmar`. Numa única transação o script:
   - remove o segundo fator e os códigos de recuperação;
   - invalida a senha atual (nenhuma senha entra) e reativa a conta se estiver desativada;
   - troca o e-mail, se pedido;
   - incrementa `session_version`: toda sessão aberta cai em até 60 s, inclusive a de quem
     tomou a conta com o e-mail antigo;
   - invalida convites e links de reset pendentes e grava o evento `account-recovery` na
     auditoria (hoje na trilha da clínica legada, até a trilha de plataforma existir).
3. O script imprime o link de definir senha — **só no terminal, nunca por e-mail**. Ele vale
   **1 hora** e uma vez. Não cole o link em chat ou ticket; se a hora passar, rode de novo (o link
   anterior deixa de valer).
4. Abra o link, defina a senha, entre em `/login` e cadastre o autenticador de novo; guarde os 10
   códigos de recuperação.

| Saída | Significado |
| --- | --- |
| `0` | aplicado, ou simulado sem `--confirmar` |
| `2` | comando ou pré-condição: flag desconhecida, `APP_URL` ausente ou sem `https://`, e-mail inválido, e-mail já usado por outra conta, nenhum Super Admin (use o § 8). Nada foi gravado |
| `1` | falha inesperada. Banco não abriu (ex.: `DATABASE_URL` errada, banco fora do ar): `Falha ao conectar ao banco (confira DATABASE_URL): nada foi alterado.` — nenhuma transação chegou a existir. Erro no meio depois de o banco abrir: a transação foi desfeita, nada foi alterado. Em ambos os casos, corrija e rode de novo |
