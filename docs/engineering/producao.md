---
title: "Runbook de produção"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
---

# Runbook de produção

Como manter no ar o EstomaSysTech com dado de saúde (LGPD). Alvo decidido pelo dono do
produto ([#206](https://github.com/KalleoPinheiro/estomasystech/issues/206), 2026-10-11): **VPS
Hetzner**, **uma réplica**, Traefik do Coolify na frente terminando TLS, fotos em volume local.
**No ar desde 2026-10-18**, no formato Dockerfile + Postgres gerenciado pelo Coolify (§ 0).
Desenvolvimento local fica em [`onboarding.md`](onboarding.md); erros conhecidos, em
[`troubleshooting.md`](troubleshooting.md).

## 0. Estado atual da produção (2026-10-18)

Fonte da verdade do que **está rodando**; o resto do runbook diz como montar e operar. O formato
`docker compose` das seções 2 e 5 continua suportado no repositório, mas **não é o que roda**.

| Peça | Como está |
| --- | --- |
| URL | `https://estomasystech.kalleopinheiro.com.br` (DNS no Registro.br, sem curinga) |
| Servidor | Hetzner `ubuntu-8gb-fsn1-1` (Alemanha), Ubuntu 26.04 LTS, 8 GB de RAM, 4 GB de swap; acesso por `ssh vps` |
| Orquestração | Coolify v4.4.6 em `https://coolify.kalleopinheiro.com.br` (2FA, registro fechado), GitHub App ligado ao repositório. Backup diário do próprio Coolify no R2 (em claro, a desligar: § 5.1 passo 8) |
| Proxy | Traefik do Coolify, único na borda ([ADR-036](../adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md)); middlewares `rate-limit-app`, `rate-limit-strict` e `security-headers` (`@file`, sem CSP: o app usa nonce) |
| App | Recurso "Dockerfile" (porta 3000), **deploy manual** (sem deploy automático por push); heap do build no `Dockerfile` ([#383](https://github.com/KalleoPinheiro/estomasystech/pull/383)) |
| Banco | PostgreSQL 18 (`postgres:18-alpine`) gerenciado pelo Coolify, privado (sem porta pública). Backup **cifrado** (`age`) do banco e das fotos às 02:00 de São Paulo para o R2 na UE (§ 5, desde 2026-10-18), além do backup do Coolify às 03:00. O CI e os testes seguem em Postgres 16 |
| Variáveis | 9 só de runtime: `APP_URL`, `TRUSTED_PROXY_HOPS=1`, `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL_TO`. `ESTOMASYSTECH_BOOTSTRAP_TOKEN` foi **removido** depois do bootstrap |
| Fotos | volume do Coolify em `/app/uploads` (uma réplica) |
| Migrações | aplicadas no boot, com advisory lock; `/api/health/ready` responde `200` ([#384](https://github.com/KalleoPinheiro/estomasystech/pull/384)) |
| Jobs | Scheduled Tasks do Coolify, não crontab do host (§ 7) |
| Monitoramento | UptimeRobot em `/api/health/ready`, no painel do Coolify e no SSH; alertas do app por e-mail (§ 9) |
| Dados | Super Admin criado pelo bootstrap; existe só a "Clínica legada" da migração, a renomear quando a clínica real for cadastrada |
| Backup cifrado | `systemd` timer do host (`estomasystech-backup.timer`), scripts em `/opt/estomasystech-backup`, configuração em `/etc/estomasystech`, alerta de falha por `msmtp` (Resend). Roteiro: [`backup-passo-a-passo.md`](backup-passo-a-passo.md) |
| Não existe em produção | GlitchTip (§ 9.5), `/etc/cron.d`, `/opt/estomasystech`, Caddy, `docker-compose.prod.yml` |

Pendências de go-live: [#381](https://github.com/KalleoPinheiro/estomasystech/issues/381) (operação e
backup cifrado) e [#376](https://github.com/KalleoPinheiro/estomasystech/issues/376) (jurídico,
art. 33). **Paciente real só depois de** backup cifrado (ADR-018), backup do volume `uploads` e do
art. 33 para Resend e Google.

## 1. Decisões

| Decidido (#206) | Valor |
| --- | --- |
| Hospedagem | VPS Hetzner com Coolify, 1 réplica. Decidido em #206 como `docker compose`; em produção virou Dockerfile + Postgres do Coolify (§ 0, ADR-036) |
| Fotos | volume `uploads` no servidor (`PHOTO_STORAGE` vazio) |
| RPO / RTO | 24 h / 4 h: backup diário cifrado do banco e das fotos, 30 dias fora do servidor, teste de restauração mensal (§ 5). **Hoje** só o banco tem backup diário (Coolify → R2), ainda sem a cifra `age` do ADR-018 (#381) |
| Operação e alertas | o dono da plataforma opera; alertas por e-mail ao operador pelo canal da plataforma (§ 9, [#212](https://github.com/KalleoPinheiro/estomasystech/issues/212)) |
| Observabilidade (#212) | `/api/health` e `/api/health/ready`, logs JSON com `requestId`, alertas por e-mail; GlitchTip opcional, hoje desligado ([ADR-014](../adr/014-observabilidade-sem-pii.md)) |

**Transferência internacional (LGPD art. 33):** o servidor fica fora do Brasil (Alemanha, UE). A
base técnica está decidida no [ADR-018](../adr/018-transferencia-internacional-ue.md): destino na
UE, adequação recíproca Brasil ↔ UE como base e cláusulas-padrão da ANPD como reserva; o backup
sai cifrado (`age`) para um bucket R2 com jurisdição **UE** ([ADR-040](../adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md)). **Pendência jurídica
(bloqueia cadastrar paciente real):** a conferência da adequação na fonte primária, o mecanismo
para Resend e Google Agenda (fora da UE) e a revisão jurídica dos cinco textos (aviso, TCLE, imagem, parceiro, direitos do titular; hoje `LEGAL_REVIEW_PENDING`, [ADR-030](../adr/030-textos-lgpd-ligados-sem-revisao-juridica.md)) e a ato da ANPD, na
[#216](https://github.com/KalleoPinheiro/estomasystech/issues/216).

Decisões do dono em 2026-10-12 ([#313](https://github.com/KalleoPinheiro/estomasystech/issues/313),
`.specs/STATE.md` AD-033):

| Tema | Decisão | Onde entra |
| --- | --- | --- |
| Cópia fora do servidor | ~~Hetzner Storage Box~~ substituída em 2026-10-18 por **bucket R2 com jurisdição UE**, trava de objeto de 30 dias ([ADR-040](../adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md)) | § 5 — `BACKUP_RCLONE_DEST` |
| Região | **Alemanha** (UE); vale também para a base legal da transferência internacional (#216) | § 2 |
| Cifra do disco | **Sem LUKS**: só os backups cifrados (`age`) e os campos cifrados ([ADR-006](../adr/006-chave-de-dados-clinicos.md)). As fotos ficam em claro no disco da VPS e o servidor volta sozinho após um reboot ([ADR-015](../adr/015-servidor-sem-cifra-de-disco.md)) | § 2 |
| E-mail do host (alertas do cron) | **`msmtp` pela porta 587 com o SMTP do Resend** (a porta 25 é bloqueada) | § 9.3 |
| Lembretes | **08:00 de São Paulo** (mantido) | § 7 |
| Uptime externo | **UptimeRobot**, checando `/api/health/ready` a cada 5 min, com alerta por e-mail | § 9.3 |
| GlitchTip | acesso **só por túnel SSH**; retenção de **30 dias** | § 9.5 |
| Limiares dos alertas | `10` (5xx) e `3` (falha de envio) em 15 min, mantidos; "falha de envio" = só erro do provedor | § 9.2 |
| Erro do navegador | **não capturar por ora** | § 9.5 |

## 2. Topologia e provisionamento

> **Formato `docker compose` (suportado, não é o que roda).** Esta seção e o § 5 descrevem a VPS
> montada à mão (`/opt/estomasystech`, `/etc/cron.d`, `msmtp`). A produção real usa Coolify (§ 0 e
> § 3). Os scripts de backup e restore do § 5 servem aos dois formatos (Coolify e compose).

| Peça | Configuração |
| --- | --- |
| Servidor | Ubuntu LTS (produção: 26.04, 8 GB). **4 GB de RAM** no mínimo: o build do Next usa até 4 GB de heap (`npm run build`), e cada login é um scrypt de ~128 MiB (#208), até 4 em paralelo |
| App + banco | `docker compose up -d --build`; o Postgres só no loopback (`127.0.0.1:5432`) |
| TLS | Traefik do Coolify ([ADR-036](../adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md)): certificado Let's Encrypt automático; [`docker-compose.prod.yml`](../../docker-compose.prod.yml) tira app e banco das portas do host |
| Região | Hetzner, Alemanha (UE) |
| Fotos | volume `uploads` (uma réplica). Mais de uma réplica exige bucket (`PHOTO_STORAGE=s3`) |
| Disco | **sem LUKS** ([ADR-015](../adr/015-servidor-sem-cifra-de-disco.md)): o servidor volta sozinho após um reboot; as fotos ficam em claro no volume, e o que protege são os backups `age`, os campos cifrados (ADR-006), o acesso SSH só por chave e o Cloud Firewall |
| Cron | `/etc/cron.d/estomasystech` do host (§ 7) |
| Fuso | a imagem define `TZ=America/Sao_Paulo`; o host pode ficar em UTC (as linhas do cron estão em UTC) |

Provisionamento, uma vez:

1. Crie o servidor na região da Alemanha, com chave SSH (sem senha) e um **Cloud Firewall** da Hetzner liberando só
   22 (de preferência restrito ao IP do operador), 80 e 443. Use o firewall da Hetzner, não o
   `ufw`: porta publicada pelo Docker passa por fora do `ufw`.
2. No host: usuário não-root com `sudo`, `PasswordAuthentication no` no SSH,
   `unattended-upgrades` ligado. Instale Docker Engine com o plugin compose (pela documentação
   oficial do Docker), `git`, `age` e `curl`.
3. DNS: registro `A`/`AAAA` do domínio apontando para o servidor (o Traefik precisa dele para emitir
   o certificado).
4. `git clone` do repositório em `/opt/estomasystech` e, ali, um `.env` com `chmod 600`, a partir do
   `.env.example`, contendo pelo menos:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
   APP_URL=https://clinica.exemplo.com.br
   TRUSTED_PROXY_HOPS=1
   POSTGRES_PASSWORD=...      # openssl rand -hex 24
   AUTH_SECRET=...            # openssl rand -hex 32
   DATA_ENCRYPTION_KEY=...    # openssl rand -hex 32 — cópia no cofre (§ 6)
   CRON_SECRET=...            # openssl rand -hex 24
   ESTOMASYSTECH_BOOTSTRAP_TOKEN=...  # só até o primeiro acesso (§ 8)
   RESEND_API_KEY=...         # canal da plataforma: convite do Super Admin e alertas (§ 9)
   EMAIL_FROM="EstomaSysTech <nao-responda@exemplo.com.br>"
   ALERT_EMAIL_TO=operador@exemplo.com.br
   ```

   Com `COMPOSE_FILE` no `.env`, todo `docker compose` rodado em `/opt/estomasystech` (inclusive
   pelos scripts de backup) já usa o override de produção. No Coolify o domínio é configurado no
   próprio recurso (§ 3); `APP_DOMAIN` não existe mais.
5. `docker compose up -d --build` e confira:
   `curl -fsS https://clinica.exemplo.com.br/api/health/ready` (`200` com banco e migrações `ok`).
6. Backup (§ 5), cron (§ 7), primeiro acesso (§ 8) e alertas (§ 9).

**Atualizar a versão:** `git pull`,
`sudo systemctl start estomasystech-backup` (rollback é restaurar, § 4) e
`docker compose up -d --build`. O app fica fora do ar só enquanto o container novo sobe e migra.

### Alternativa não adotada: Vercel + Supabase

O código continua compatível (`vercel.json`), mas não é o alvo. Diferenças que importam: o app
usa o pooler do Supabase em modo transação (porta `6543`) e as migrações a conexão direta
(`5432`), com `ESTOMASYSTECH_MIGRATE_ON_BOOT=false` e `PG_POOL_MAX=5`; fotos **obrigatoriamente** em
bucket (`PHOTO_STORAGE=s3`, a aplicação recusa o disco local quando `VERCEL` existe); o Vercel
Cron chama `GET /api/reminders/run` e `GET /api/retention/run` com
`Authorization: Bearer $CRON_SECRET`; `TZ` é reservado e
o app alinha o fuso a `APP_TIMEZONE` na subida (`src/instrumentation.ts`).

## 3. TLS, URL pública e proxy

- **Proxy de entrada: só o Traefik do Coolify** ([ADR-036](../adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md)).
  Ele já ocupa 80/443 e emite o certificado; nenhum outro proxy sobe no repositório. Dois formatos:
  - **Recomendado: Dockerfile + Postgres gerenciado.** No Coolify, recurso "Dockerfile" apontando
    para o repositório (porta 3000, domínio `estomasystech.kalleopinheiro.com.br`) e um recurso
    PostgreSQL 18 (`postgres:18-alpine`) do próprio Coolify (sem porta pública) com a `DATABASE_URL` interna no app.
  - **Compose** (`docker-compose.yml:docker-compose.prod.yml`): app e banco sem porta no host;
    o domínio entra na variável mágica `SERVICE_FQDN_APP_3000` do recurso.
- **Middlewares do Traefik** (arquivo `shared-middlewares.yaml` do proxy): `rate-limit-app`,
  `rate-limit-strict` e `security-headers`. Referencie-os em "Custom Labels" do recurso (ou na
  label `coolify.traefik.middlewares`, já posta no compose de produção) com o sufixo `@file`,
  ex.: `coolify.traefik.middlewares=rate-limit-app@file,security-headers@file`. Use
  `rate-limit-strict@file` numa rota própria para `/api/auth/*`, se for separada.
  O rate limit do app (`TRUSTED_PROXY_HOPS`) continua valendo por conta.
- **Checklist de deploy no Coolify (Dockerfile)** — verificado contra o código em 2026-10-18:
  - *Imagem*: `Dockerfile` já roda como `nextjs` (não-root), `PORT=3000`, `HOSTNAME=0.0.0.0`,
    `HEALTHCHECK` em `/api/health` (liveness, sem banco) e `TZ`/`APP_TIMEZONE=America/Sao_Paulo`.
    No Coolify use a porta 3000 e, como verificação do recurso, `/api/health/ready`.
  - *Memória do build*: o `Dockerfile` define `ENV NODE_OPTIONS=--max-old-space-size=4096` no
    estágio `builder` (só nele; o `runner` não herda). O `--max-old-space-size` do script
    `npm run build` não alcança o processo filho do "Running TypeScript" do Next, que estourava
    memória (OOM) no primeiro deploy. Não é preciso variável de build no Coolify; se você criou
    `NODE_OPTIONS` como *Buildtime only* de contorno, pode apagá-la.
  - *Variáveis* (marque como secreto no Coolify): `DATABASE_URL`, `AUTH_SECRET`,
    `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `ESTOMASYSTECH_BOOTSTRAP_TOKEN`;
    não secretas: `APP_URL=https://estomasystech.kalleopinheiro.com.br`, `EMAIL_FROM`,
    `ALERT_EMAIL_TO`, `TRUSTED_PROXY_HOPS=1`. Sem `AUTH_SECRET` tudo responde 503.
  - *Migrações*: com uma réplica, deixe o boot migrar (padrão, com advisory lock). A imagem
    standalone **não** traz `tsx`/`drizzle-kit`: `calendar:minimize`, `clinics:cnpj-review` e
    `db:portal-orphans` rodam de um checkout (`npm ci`) com `DATABASE_URL` alcançável. Como o
    banco do Coolify não tem porta pública, rode-os num container descartável na rede do Docker
    do Coolify (`docker run --rm --network <rede-do-banco> -v "$PWD":/w -w /w node:24-alpine
    sh -c 'npm ci && npm run calendar:minimize -- --confirmar'`) ou por túnel SSH.
  - *Cabeçalhos e CSP*: o app já envia HSTS, `X-Frame-Options`, `Referrer-Policy` etc.
    (`next.config.ts`) e a **CSP com nonce por requisição** (`src/proxy.ts`). O middleware
    `security-headers@file` não pode definir `Content-Security-Policy` (sobrescreveria o nonce e
    quebraria a página); duplicar os demais cabeçalhos é inofensivo.
  - *Cookies*: são `Secure` por `NODE_ENV=production`, independente de cabeçalho do proxy; basta
    o acesso ser por HTTPS, que o Traefik garante.
  - *Fotos*: sem bucket, monte um volume persistente do Coolify em `/app/uploads`.
  - *Healthcheck*: vale o `HEALTHCHECK` do `Dockerfile` (liveness em `/api/health`, sem banco); o
    healthcheck próprio do Coolify fica **desligado**. Quem checa o banco e as migrações é o
    `/api/health/ready`, pelo UptimeRobot e pelo alerta por e-mail (§ 9).
  - *Variável nova no Coolify*: nasce marcada como *Buildtime* por padrão. As do app são só
    *Runtime*; desmarque *Buildtime* ao criar (o build não precisa delas, e as marcadas assim entram como argumento de build).
  - *Campo de domínio*: o campo **Domains** do recurso mistura o seletor de protocolo e o host;
    confira que ficou `https://estomasystech.kalleopinheiro.com.br` (sem barra no fim, sem porta).
  - *Git*: o repositório não usa Git LFS nem submódulos; em *Configuration → Source*, deixe
    desligados "Use Git LFS" e "Include Git Submodules" (menos superfície no clone do deploy).
  - *Rótulo dos middlewares*: confira em *Configuration → General → Custom Labels* (ou na aba
    *Advanced*) que existe `traefik.http.routers.<router>.middlewares=rate-limit-app@file,security-headers@file`
    (o Coolify também aceita `coolify.traefik.middlewares`). Prova pela resposta, § 9.6.
- O cookie de sessão é `Secure` em produção: **login não funciona por HTTP** fora de `localhost`.
- `APP_URL` precisa ser `https://…` (compõe os links de convite/reset e o redirect da agenda).
- O app lê o IP do cliente contando `TRUSTED_PROXY_HOPS` saltos a partir do fim do
  `x-forwarded-for` (rate limit do login e da API). O Traefik acrescenta o IP de quem conectou
  ao fim da cadeia, então:
  - Traefik sozinho (o decidido, sem Cloudflare): `TRUSTED_PROXY_HOPS=1`.
  - Cloudflare (proxy laranja) na frente do Traefik: o Traefik precisa confiar nas faixas de IP
    da Cloudflare (`forwardedHeaders.trustedIPs` no entrypoint, configuração do proxy do Coolify)
    para manter a cadeia; só então use `TRUSTED_PROXY_HOPS=2`. Sem isso o Traefik descarta o
    cabeçalho recebido e `2` junta todo mundo no mesmo balde `unknown`.
  - Valor maior que o número real de proxies deixa o cliente escolher o próprio IP; menor junta
    todo mundo no IP do proxy. O log `[config] Requisição sem x-forwarded-for` indica app exposto
    sem proxy.
- Não publique a porta do app no host: o `docker-compose.prod.yml` faz `ports: !reset []` no
  `app` (exige Docker Compose 2.24 ou mais novo).

### 3.1 Release e rollback com deploy manual

O deploy é **manual** (botão *Deploy* no Coolify): nada sobe sozinho por um push na `main`. Isso é
proposital enquanto não há staging e as migrações não têm `down`
([ADR-039](../adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md)).

1. **Antes:** a `main` com o CI verde (ou o gate local, enquanto o Actions estiver sem cota) e o
   `.specs/archive/handoff-2026.md` do lote escrito. Anote o commit em produção (*Deployments* do
   recurso mostra o SHA) e as migrações novas do lote (`drizzle/*.sql`, ordem do § 4).
2. **Backup:** *Backups → Backup now* no recurso do banco (e confira *Available* no R2). Sem backup
   do mesmo dia, não deploye migração.
3. **Deploy:** *Deploy* no recurso do app. O container novo migra no boot (advisory lock) e o
   `HEALTHCHECK` passa a `healthy`; o container antigo só sai depois.
4. **Verificar:** `curl -fsS https://estomasystech.kalleopinheiro.com.br/api/health/ready` (`200`,
   `database` e `migrations` `ok`) e a fumaça do § 9.6. Se o lote traz script manual (§ 4, § 7.2,
   § 7.3), rode-o agora, primeiro em simulação.
5. **Rollback sem migração nova:** *Deployments* → *Redeploy* do commit anterior. Rápido e seguro.
6. **Rollback com migração nova:** redeploy do commit anterior **não** desfaz o esquema; só serve se
   a migração for aditiva (coluna, tabela ou índice novo, o caso quase sempre) e o código antigo
   ignorar o que foi adicionado. Do contrário, restaure o backup do passo 2 (perde o que foi escrito
   depois dele) ou escreva uma migração nova que desfaça a mudança. Decida **antes** do deploy qual
   dos dois vale para o lote.
7. **Depois:** apague do Coolify variável de contorno que sobrou e registre o commit no handoff.

## 4. Migrações

- Padrão em produção: o app migra no boot com advisory lock (`ESTOMASYSTECH_MIGRATE_ON_BOOT` vazio;
  a variável foi removida do Coolify). Uma réplica, então o deploy é: backup, *Deploy* no Coolify
  (§ 3.1), o container novo migra e sobe. No formato compose: backup e `docker compose up -d --build`.
- Para migrar como passo separado: `ESTOMASYSTECH_MIGRATE_ON_BOOT=false` e rodar
  `npm run db:migrate` de um checkout com `DATABASE_URL` alcançável. No Coolify o banco não tem
  porta pública: use o container descartável do § 3 (a imagem standalone não tem `drizzle-kit`).
- **Ordem das migrações 0050 e 0051.** O Drizzle só aplica migração com `when` maior que o da
  última aplicada. O `when` da `0051_job-runs` (#306) é maior que o da `0050_data-subject-requests`
  (#303). Por isso **nunca deploye um commit que tenha a 0051 sem a 0050**: se a 0051 rodar antes,
  o migrador pula a 0050 para sempre. Na `main` as duas já vêm juntas e na ordem certa, então o
  deploy normal (`main` inteira) está seguro; o risco é cherry-pick ou deploy de branch. Se
  acontecer, `/api/health/ready` responde `503` com `migrations: "pending"`; restaure o backup
  (§ 3.1 e § 5) e refaça o deploy pelo commit completo. Mesma regra para qualquer par de migrações
  geradas em branches paralelas: confira a ordem de `when` em `drizzle/meta/_journal.json`.
- **Rollback:** as migrações não têm `down`. Reverter é restaurar o backup tirado antes do deploy
  (§ 5) ou escrever uma migração nova que desfaça a mudança.
- **Atualizando de uma versão anterior à `0053`**: aplique **todas** as migrações `0053` a `0066`, em ordem,
  pelo commit completo da `main`; o boot as aplica sozinho (acima). Em produção isso já aconteceu
  no primeiro deploy (2026-10-18), então vale só para outra instalação ou para restaurar backup antigo. Resumo do que cada uma faz e
  onde está a regra:

  | Migração | Muda | Regra |
  | --- | --- | --- |
  | `0053`, `0054` | índices da trilha de auditoria; alerta do prazo dos direitos do titular | [Acesso](../domains/acesso/README.md), [Portal](../domains/portal/README.md) |
  | `0055` | quem registrou o consentimento em papel do parceiro | [Portal](../domains/portal/README.md) |
  | `0056` | `appointments.calendar_minimized_at` | § 7.2 |
  | `0057`, `0059` | e-mail de contato opcional (sem `NOT NULL` nem unicidade); responsável do paciente | [ADR-023](../adr/023-email-de-contato-do-paciente-e-login-do-portal.md), [ADR-024](../adr/024-responsavel-do-paciente.md) |
  | `0058` | motivo da suspensão da clínica | [Acesso](../domains/acesso/README.md) |
  | `0060` | CPF do paciente e do pagador (cifrado) | [ADR-025](../adr/025-cpf-no-recibo-e-protecao.md) |
  | `0061`, `0062` | conta de responsável no portal; revogação pelo paciente | [ADR-027](../adr/027-responsavel-acessa-portal-em-nome-do-paciente.md), [ADR-028](../adr/028-paciente-encerra-acesso-do-responsavel.md) |
  | `0063` | marca de CNPJ para correção | § 7.3, [ADR-029](../adr/029-cnpj-antigo-invalido-marcado-para-correcao.md) |
  | `0064` | encarregado por clínica e finalidade do consentimento | [ADR-030](../adr/030-textos-lgpd-ligados-sem-revisao-juridica.md) |
  | `0065`, `0066` | maioridade e quem assinou os termos (paciente e parceiro) | [ADR-032](../adr/032-paciente-menor-no-portal-pelo-representante-legal.md), [ADR-033](../adr/033-direitos-do-menor-pelo-representante-e-prazo-do-aceite.md) |

  Nenhuma apaga dado: quase todas só adicionam colunas, tabelas ou índices; a `0053` troca um
  índice e a `0057` deixa de exigir o e-mail do paciente (e a unicidade dele). Sem `down`: faça o
  backup (§ 5) antes. Depois
  do deploy, na ordem: `npm run db:portal-orphans`, `npm run data:reencrypt` (abaixo),
  `npm run calendar:minimize` (§ 7.2) e `npm run clinics:cnpj-review` (§ 7.3), cada um primeiro
  em simulação e depois com `--confirmar`. Pacientes e parceiros reaceitam o termo da versão
  nova e aceitam o de imagem no primeiro acesso ao portal.
- **Depois das migrações deste lote:**
  1. `npm run db:portal-orphans` — lista contas de portal que a migração `0040` não conseguiu
     vincular ao cadastro pelo e-mail ([#196](https://github.com/KalleoPinheiro/estomasystech/issues/196));
     recrie-as em */configuracoes* escolhendo o paciente/parceiro.
  2. `npm run data:reencrypt` — § 6.

## 5. Backup e restore

Guarda do prontuário: Lei 13.787/2018 e LGPD art. 46. **Sem restauração testada, não há backup.**
Meta decidida: RPO 24 h, RTO 4 h. Desenho: [ADR-040](../adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md).

| O quê | Como |
| --- | --- |
| Banco | [`scripts/backup.sh`](../../scripts/backup.sh): `pg_dump -Fc` por `docker exec` no container do Postgres do Coolify → `db.dump.age` |
| Fotos | o mesmo script: `tar` do volume montado em `/app/uploads`, num container sem rede e sem log (o tar não para em claro no disco) → `uploads.tar.age` |
| Cifra | `age` com chave pública no servidor; a **chave privada fica fora dele** (cofre + cópia offline). O dado em claro não toca o disco |
| Agenda | `systemd` timer do host, **02:00 de São Paulo**, 1 h 30 antes da retenção do Coolify (03:30), que apaga fotos ([`deploy/backup/`](../../deploy/backup/)) |
| Destino | `/var/backups/estomasystech/<data UTC>/` no servidor e cópia num **bucket R2 com jurisdição `eu`** (`BACKUP_RCLONE_DEST`) |
| Retenção | 7 dias no servidor (`BACKUP_KEEP_DAYS`); no R2, **trava de objeto de 30 dias** (nem o token do servidor apaga) e ciclo de vida que apaga com 35 |
| Falha | e-mail ao operador por `msmtp` no SMTP do Resend (`OnFailure`, [`scripts/backup-alert.sh`](../../scripts/backup-alert.sh)) |
| Chaves | `DATA_ENCRYPTION_KEY` (e as anteriores) e a chave privada `age` no cofre de segredos, **nunca** dentro do backup |

O backup nativo do Coolify (03:00, bucket `estomasystech-backups`) **não é cifrado**: desligue o
envio dele para o S3 depois do primeiro backup cifrado conferido e da primeira restauração de
teste, e apague do bucket antigo os dumps em claro (passo 8).

**Retenção e backup (#311, [ADR-013](../adr/013-retencao-por-anonimizacao.md)):** a anonimização
não reescreve cópias antigas. Com a guarda de 30 dias no R2, o dado identificável de um paciente
anonimizado some dos backups 30 a 35 dias depois. Ao restaurar um backup, rode
`POST /api/retention/run` em seguida: o job é idempotente e refaz a anonimização do que já tinha
vencido.

Sem `DATA_ENCRYPTION_KEY` o backup do banco não serve: os textos clínicos estão cifrados com ela.
Sem a chave privada `age`, nenhum backup serve.

### 5.1 Instalar, uma vez

Os comandos do servidor rodam por `ssh vps`; os da máquina do operador, no WSL. **Nenhum segredo
vai para o chat nem para o repositório.** No zsh, para digitar um segredo sem eco, use
`bash -c 'read -rs V; ...'`. Roteiro para leigo, com cada comando e as armadilhas da instalação
real: [`backup-passo-a-passo.md`](backup-passo-a-passo.md).

1. **Chave `age`, na máquina do operador** (nunca no servidor):

   ```bash
   age-keygen -o estomasystech-backup.key
   ```

   Guarde o arquivo no cofre e numa cópia offline. A linha `# public key: age1…` é a única coisa
   que vai para o servidor.

2. **Bucket e token, no painel da Cloudflare (R2):**
   - *Create bucket* `estomasystech-backups-age`, **Location → Specify jurisdiction → European
     Union (`eu`)**. A jurisdição não muda depois de criado.
   - No bucket, *Settings → Bucket lock rules → Add rule*: prefixo `prod/`, retenção **30 dias**.
   - *Settings → Object lifecycle rules → Add rule*: prefixo `prod/`, apagar objetos com **35 dias**.
   - *Manage API tokens → Create Account API token*: permissão **Object Read & Write**, só esse
     bucket. Anote o Access Key ID (32 caracteres) e o Secret (64) da tela de sucesso, não o
     "Token value" (vão direto para o servidor no passo 4). `403 AccessDenied` no passo 4 com
     escopo certo = dupla de chaves de outro token: crie outro.

3. **Pacotes e arquivos no servidor:**

   ```bash
   sudo DEBIAN_FRONTEND=noninteractive apt install -y age msmtp
   cd /tmp && curl -fsSLO https://downloads.rclone.org/rclone-current-linux-amd64.deb \
     && sudo apt install -y ./rclone-current-linux-amd64.deb && rm rclone-current-linux-amd64.deb
   sudo install -d -m 700 /etc/estomasystech /opt/estomasystech-backup
   ```

   O `rclone` do `apt` do Ubuntu (1.60) falha no R2 com `501 NotImplemented`; o pacote oficial
   (1.75+) funciona.

   Da máquina do operador, num checkout atualizado do repositório:

   ```bash
   scp scripts/backup.sh scripts/backup-target.sh scripts/restore.sh scripts/backup-alert.sh \
     deploy/backup/estomasystech-backup.* deploy/backup/estomasystech-backup-alert.service vps:/tmp/
   ssh vps 'cd /tmp && sudo install -m 700 backup.sh backup-target.sh restore.sh backup-alert.sh /opt/estomasystech-backup/ \
     && sudo install -m 644 estomasystech-backup.service estomasystech-backup.timer estomasystech-backup-alert.service /etc/systemd/system/ \
     && rm backup.sh backup-target.sh restore.sh backup-alert.sh estomasystech-backup*'
   ```

4. **Configuração no servidor** (todos `chmod 600`, dono root). Crie cada arquivo com
   `sudo install -m 600 /dev/null <arquivo> && sudo nano <arquivo>` e cole o conteúdo lá, no
   terminal do servidor:
   - `/etc/estomasystech/backup.pub`: a linha `age1…` do passo 1.
   - Nomes do Coolify: `docker ps --format '{{.Names}}\t{{.Image}}'` (o Postgres é o container
     com `postgres:18-alpine`) e `docker volume ls` (o volume termina em `-estomasystech-uploads`).
   - `/etc/estomasystech/rclone.conf` (o `<ACCOUNT_ID>` está na página do R2):

     ```ini
     [r2]
     type = s3
     provider = Cloudflare
     endpoint = https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com
     region = auto
     access_key_id = <Access Key ID do passo 2>
     secret_access_key = <Secret do passo 2>
     no_check_bucket = true
     ```

   - `/etc/estomasystech/backup.env` (formato `CHAVE=valor`, sem `export`, lido pelo systemd):

     ```bash
     BACKUP_AGE_RECIPIENTS_FILE=/etc/estomasystech/backup.pub
     BACKUP_DB_CONTAINER=<nome do container do Postgres>
     BACKUP_UPLOADS_VOLUME=<nome do volume das fotos>
     BACKUP_RCLONE_DEST=r2:estomasystech-backups-age/prod
     BACKUP_KEEP_DAYS=7
     RCLONE_CONFIG=/etc/estomasystech/rclone.conf
     BACKUP_ALERT_TO=<e-mail do operador>
     ```

     Se o app usa um banco diferente do `POSTGRES_DB` do container (compare com a `DATABASE_URL`
     do app), acrescente `BACKUP_DB_NAME=<banco>`.

   - `/etc/msmtprc` (SMTP do Resend; a senha é uma API key do Resend só de envio):

     ```text
     defaults
     auth on
     tls on
     tls_starttls on
     tls_trust_file /etc/ssl/certs/ca-certificates.crt
     account resend
     host smtp.resend.com
     port 587
     user resend
     password <API key do Resend>
     from <só o endereço, de um domínio verificado no Resend>
     from_full_name EstomaSysTech
     account default : resend
     ```

     `from` com nome ou `< >` faz o Resend responder `501 Bad sender address syntax`.

5. **Primeiro backup, à mão:**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start estomasystech-backup     # volta quando terminar
   sudo journalctl -u estomasystech-backup -n 20 --no-pager
   sudo rclone --config /etc/estomasystech/rclone.conf lsl r2:estomasystech-backups-age/prod/
   ```

   O log termina em `cópia fora do servidor ok` e o R2 mostra a pasta `<data UTC>/` com
   `db.dump.age`, `uploads.tar.age` e `SHA256SUMS`.

6. **Teste do alerta:** `sudo systemctl start estomasystech-backup-alert` deve chegar no e-mail
   (confira o spam). Depois ligue a agenda:
   `sudo systemctl enable --now estomasystech-backup.timer` e confira em
   `systemctl list-timers estomasystech-backup.timer`.

7. **Restauração de teste** (§ 5.3), na máquina do operador, com o backup do passo 5.

8. Só depois do passo 7 ok: no Coolify, no backup agendado do `estomasystech-db`, desligue o
   envio para o S3 e apague do bucket `estomasystech-backups` os dumps em claro já enviados
   (irreversível: confira antes que o passo 7 passou).

| Saída do `backup.sh` | Significado |
| --- | --- |
| `0` | backup gerado e copiado para fora do servidor; cópias locais além de `BACKUP_KEEP_DAYS` apagadas |
| `2` | configuração: chave pública ausente, `age`/`flock`/`rclone` faltando, container do banco parado ou com outro nome, volume não encontrado ou outro backup rodando. Nada foi gerado |
| `3` | backup gerado **só** no servidor: destino vazio ou cópia falhou. Corrija e rode de novo |
| `1` | falha inesperada (ex.: banco fora do ar, foto apagada no meio do tar). Pasta parcial descartada |

### 5.2 Restaurar

[`scripts/restore.sh`](../../scripts/restore.sh) usa o mesmo alvo do backup (`BACKUP_DB_CONTAINER`,
`BACKUP_UPLOADS_VOLUME`) e a chave privada trazida do cofre **só para isso**:

```bash
# da máquina do operador
scp estomasystech-backup.key vps:/tmp/
# no servidor (troque a data pela pasta escolhida no R2)
sudo install -d -m 700 /root/restore && sudo mv /tmp/estomasystech-backup.key /root/restore/
sudo rclone --config /etc/estomasystech/rclone.conf copy r2:estomasystech-backups-age/prod/20261019T050000Z /root/restore/20261019T050000Z
sudo sh -c 'set -a; . /etc/estomasystech/backup.env; set +a; BACKUP_AGE_IDENTITY_FILE=/root/restore/estomasystech-backup.key /opt/estomasystech-backup/restore.sh /root/restore/20261019T050000Z'
```

Sem `--confirmar` o script só confere: `SHA256SUMS`, decifra os dois arquivos (chave errada sai
com `2`) e lista o dump e o tar das fotos. Para substituir: **pare o app no Coolify** (Stop),
repita com `--confirmar` (recria o banco, restaura o dump e troca o conteúdo do volume de fotos),
**ligue o app** (Start; as migrações do boot alinham o schema se o backup for de versão anterior)
e rode `POST /api/retention/run`. Com o app conectado ao banco, o `--confirmar` sai com `2` sem
alterar nada. Saída `0` ok, `2` uso ou pré-condição (nada foi alterado), `1` falha no meio: rode de
novo. Ao terminar, `sudo rm -rf /root/restore` (a chave privada não fica no servidor).

**Desastre (servidor perdido):** provisione outro (§ 2), recrie no Coolify o app e o Postgres com
as variáveis do cofre, instale o backup (§ 5.1, passos 3 e 4 com os nomes novos), traga a pasta mais
recente do R2 e restaure com `--confirmar`. O RTO de 4 h cabe nisso só se o teste mensal mostrar
que cabe.

### 5.3 Teste de restauração (mensal)

Numa máquina descartável (o WSL do operador, com o repositório e Docker), sem tocar a produção.
O banco do teste sobe em **Postgres 18**, o mesmo da produção: o `docker-compose.yml` ainda é 16
([#385](https://github.com/KalleoPinheiro/estomasystech/issues/385)) e o `pg_restore` 16 não lê
dump do 18; a imagem 18 guarda os dados em `/var/lib/postgresql` (não em `.../data`), por isso o
override troca o volume. Os `read` são de bash (no zsh, rode `bash` antes). O download usa um token R2 **só de
leitura** (não o do servidor), passado por variáveis de ambiente, sem arquivo:

```bash
printf 'services:\n  db:\n    image: postgres:18-alpine\n    volumes: !override\n      - pgdata:/var/lib/postgresql\n' > /tmp/compose.restore-pg18.yml
export COMPOSE_FILE=docker-compose.yml:/tmp/compose.restore-pg18.yml COMPOSE_PROJECT_NAME=estomasystech-restore APP_PORT=3100 POSTGRES_PORT=5433 APP_URL=http://localhost:3100
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
read -rsp "AUTH_SECRET: " AUTH_SECRET; echo; export AUTH_SECRET                       # de produção
read -rsp "DATA_ENCRYPTION_KEY: " DATA_ENCRYPTION_KEY; echo; export DATA_ENCRYPTION_KEY   # de produção
docker compose up -d --build --wait
read -rp "Access Key ID: " AK; read -rsp "Secret: " SK; echo
RCLONE_CONFIG_R2RO_TYPE=s3 RCLONE_CONFIG_R2RO_PROVIDER=Cloudflare RCLONE_CONFIG_R2RO_REGION=auto \
RCLONE_CONFIG_R2RO_ENDPOINT=https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com \
RCLONE_CONFIG_R2RO_ACCESS_KEY_ID="$AK" RCLONE_CONFIG_R2RO_SECRET_ACCESS_KEY="$SK" \
  rclone copy r2ro:estomasystech-backups-age/prod/<data UTC> ./<data UTC>; unset AK SK
docker compose stop app
BACKUP_AGE_IDENTITY_FILE=./estomasystech-backup.key scripts/restore.sh ./<data UTC> --confirmar
docker compose up -d --wait app
```

Sem `BACKUP_DB_CONTAINER`, o script usa o `db` e o volume `uploads` desse projeto compose.
Abra `http://localhost:3100`, entre e confira a ficha de um paciente com evolução, anamnese e
foto. Cronometre do início do download até a ficha abrir (é o RTO real). Depois,
`docker compose down -v`, apague a chave, o backup e `/tmp/compose.restore-pg18.yml` da máquina. Registre abaixo; se algo
falhar, abra issue com o rótulo `bug`.

| Data | Backup de | Quem | Tempo até voltar | Resultado |
| --- | --- | --- | --- | --- |
| 2026-10-18 | `20261018T231224Z` (1º backup) | Kalléo (com Claude, no WSL) | **24 s** do `up` ao app no ar (sem o download, que é de segundos com 160 KB) | **ok**: `SHA256SUMS`, conferência e `--confirmar` (104 tabelas); app com `AUTH_SECRET` e `DATA_ENCRYPTION_KEY` de produção (do cofre), `/api/health/ready` `200`; contagens iguais à produção (1 clínica, 1 conta, 5 eventos de auditoria). Produção ainda sem paciente nem foto: repetir com dado clínico real para provar a decifragem e o volume |

O CI repete o ciclo inteiro a cada PR com uma chave descartável
([`scripts/backup-smoke.sh`](../../scripts/backup-smoke.sh)): grava linha e foto, faz backup, apaga
tudo, restaura com o app parado e confere.

### 5.4 Segurança do backup (checklist)

Estado conferido na instalação de 2026-10-18. Revise junto com o teste mensal (§ 5.3).

| Item | Regra | Estado |
| --- | --- | --- |
| Chave privada `age` | só no cofre (Bitwarden) e num pendrive guardado; **nunca** no servidor nem em disco de máquina de uso diário. Para testar, traga do cofre e apague no fim (`shred -u`) | pendrive + cópia em claro no WSL do operador; **conferir se a nota do Bitwarden tem a chave** (no teste ela não veio do cofre) antes de apagar a cópia do WSL |
| Token R2 do servidor | **Object Read & Write** só no bucket `estomasystech-backups-age`, com filtro de IP (IPv4 `/32` e IPv6 `/64` do servidor) | escopo ok; filtro de IP a recolocar |
| Token R2 de restauração | **Object Read only**, só o bucket, TTL de 7 dias; apagar depois do teste | criado em 2026-10-18; apagar ou deixar expirar |
| Trava de objeto | `prod/` com 30 dias: nem um servidor comprometido apaga os backups recentes | ativa |
| Backup em claro do Coolify | envio para o S3 desligado, dumps e bucket `estomasystech-backups` apagados, token `coolify-backups` removido (§ 5.1 passo 8) | em curso |
| Arquivos no servidor | `/etc/estomasystech/*` e `/etc/msmtprc` com `600 root`; scripts com `700 root` | ok |
| Chave do Resend do servidor | só *Sending access*, nome `estomasystech-backup-alerta`, guardada no cofre | ok |
| Bitwarden CLI | `bw lock` ao terminar; nunca mande print com `BW_SESSION` | travado depois do teste; `~/.bw_session` apagado |
| Alerta de falha | `OnFailure` por e-mail, testado (§ 5.1 passo 6) | ok |

**Se algo vazar:**

| Vazou | Faça |
| --- | --- |
| Token R2 do servidor | R2 → API Tokens → *Roll* (ou apague e crie outro) e regrave `/etc/estomasystech/rclone.conf` ([roteiro, 4.4](backup-passo-a-passo.md#44-rcloneconf-pede-as-chaves-do-token-da-etapa-2)) |
| Chave do Resend | apague no Resend, crie outra e regrave `/etc/msmtprc` |
| Chave privada `age` | gere outra (§ 5.1 passo 1), troque `/etc/estomasystech/backup.pub` e rode um backup. Os backups antigos continuam abertos pela chave vazada até saírem do R2 (35 dias): trate como incidente LGPD (art. 48) |

## 6. Segredos e rotação

Gere com `openssl rand -hex 32` (ou `-hex 24` onde indicado no `.env.example`). Em produção os
segredos moram nas variáveis *Runtime* do recurso no Coolify (marcadas como secretas), com uma cópia
no cofre de segredos do operador; no formato compose, no `.env` com permissão `600`, fora do
controle de versão. Nenhum dos dois entra no backup. Trocar uma variável no Coolify exige novo
*Deploy* (ou *Restart*) do app.

| Segredo | Rotação | Efeito |
| --- | --- | --- |
| `AUTH_SECRET` | incidente ou troca de pessoal | derruba **todas** as sessões (todos logam de novo). Não afeta o dado clínico ([ADR-006](../adr/006-chave-de-dados-clinicos.md)); mantenha o valor antigo só se ainda houver dado no formato legado (antes de rodar a recifra) |
| `DATA_ENCRYPTION_KEY` | anual ou incidente | 1) valor atual → `DATA_ENCRYPTION_KEY_PREVIOUS`; 2) novo valor em `DATA_ENCRYPTION_KEY`; 3) deploy; 4) `npm run data:reencrypt`; 5) quando o script reportar 0 pendências, remova o antigo de `_PREVIOUS`. Guarde a chave antiga no cofre enquanto houver backup (30 dias) cifrado com ela |
| Senha do Postgres | incidente | no Coolify a senha é do recurso do banco: troque lá e atualize a `DATABASE_URL` do app, depois *Deploy*. No compose: `ALTER ROLE estomasystech PASSWORD '…'` no `db`, novo valor no `.env`, `docker compose up -d` |
| Chave `age` do backup | incidente ou troca de operador | gere outra, troque `/etc/estomasystech/backup.pub`; guarde a privada antiga enquanto houver backup (30 dias) cifrado com ela |
| `ESTOMASYSTECH_BOOTSTRAP_TOKEN` | — | só serve enquanto não existe nenhuma conta; **removido** da produção depois do primeiro acesso (§ 8) |
| `CRON_SECRET` | incidente | troque a variável no Coolify e faça *Deploy*; as Scheduled Tasks leem o valor do ambiente do container (§ 7), então nada mais muda. No compose, atualize também `/etc/estomasystech/cron.headers` |
| `RESEND_API_KEY`, credenciais Google | conforme o provedor | troque no provedor e na variável do Coolify (ou `.env`) |
| `GLITCHTIP_SECRET_KEY`, `GLITCHTIP_DB_PASSWORD` | incidente | troca derruba as sessões da interface do GlitchTip; a senha do banco dele segue o roteiro da `POSTGRES_PASSWORD` no serviço `glitchtip-db` |
| `GLITCHTIP_DSN` | incidente | gere outra chave no projeto do GlitchTip, troque no `.env`, `docker compose up -d app` e revogue a antiga |

`npm run data:reencrypt` (a partir de um checkout, com `DATABASE_URL`, `DATA_ENCRYPTION_KEY`,
`DATA_ENCRYPTION_KEY_PREVIOUS` e, se ainda houver dado legado, o `AUTH_SECRET` antigo) regrava
com a chave atual todo texto clínico em claro, no formato legado ou de uma chave anterior. É
idempotente: pode ser interrompido e rodado de novo.

## 7. Cron (lembretes, backup, retenção, alertas)

Em produção os jobs são **Scheduled Tasks do Coolify** no recurso do app
([ADR-038](../adr/038-scheduled-tasks-do-coolify-no-lugar-do-crontab.md)), não crontab do host. Cada
tarefa roda dentro do container do app, que já tem `CRON_SECRET` e `APP_URL` no ambiente: o segredo
não aparece na linha do comando nem em arquivo. A imagem é `node:alpine`, então o cliente é o
`wget` do busybox. O Coolify roda no fuso de São Paulo, e é esse fuso que vale para as expressões:

| Tarefa | Expressão | Comando (no container do app) |
| --- | --- | --- |
| alertas | `*/5 * * * *` | `wget -q -O /dev/null --post-data='' --header="x-cron-secret: $CRON_SECRET" "$APP_URL/api/alerts/run"` |
| lembretes | `0 8 * * *` | o mesmo, com `/api/reminders/run` |
| retenção | `30 3 * * *` | o mesmo, com `/api/retention/run` |

- `wget` sai com código diferente de zero em resposta não-2xx; o Coolify guarda a execução (status e
  saída) em *Scheduled Tasks → Executions* e avisa por e-mail se a notificação de falha de tarefa
  agendada estiver ligada em *Notifications* (confira uma vez).
- **Não há backup nem `flock` aqui.** O backup cifrado do banco e das fotos é um timer do systemd
  no host às 02:00 de São Paulo (§ 5, [ADR-040](../adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md)),
  1 h 30 antes da retenção (03:30): a retenção apaga fotos e não pode cruzar o `tar` do volume.
- Formato compose (alternativa): crontab do host em `/etc/cron.d/estomasystech`, com
  `curl -fsS -X POST -H @/etc/estomasystech/cron.headers …` e o `scripts/backup.sh` do § 5. O
  host fica em UTC, então as horas ali são as de São Paulo + 3 (backup `0 5`, lembretes `0 11`,
  retenção `0 6` atrás de `flock -w 3600 /var/backups/estomasystech/.lock`, alertas `*/5`), com
  `MAILTO` e `msmtp` (§ 9.3) para a falha chegar por e-mail.

- Sem `CRON_SECRET` as rotas de lembretes, retenção e alertas respondem 503 (job desligado). Falha do job: resposta
  não-2xx (a execução da tarefa fica com erro no Coolify) e os logs do app (§ 9.4).
- **Antes do primeiro disparo real:**
  - Nome da empresa em */configuracoes*: a empresa criada pela migração se chama "Clínica
    legada" (é a única que existe hoje) e o nome vai no texto do e-mail e do `wa.me`. Renomeie
    quando a clínica real for cadastrada.
  - Retornos `pending` antigos: na primeira execução, cada retorno vencido há 30 dias ou mais
    recebe de uma vez a 3ª tentativa (só a mais alta cabível — COM-RN-06). Conclua ou cancele
    os que não devem gerar e-mail. Contagem:
    `SELECT clinic_id, count(*) FROM follow_ups WHERE status = 'pending' AND due_date < now() GROUP BY 1;`
  - Teto do Resend Free: 100 e-mails/dia. Acima disso o envio conta `failed` no resumo, sem
    alarme, e é tentado de novo no dia seguinte.
- **Teste de fumaça** (escreve dado: só com paciente de teste, nunca com dado real): paciente de
  teste com o seu e-mail e consulta `scheduled` amanhã; dispare o job manualmente (*Execute Now* da
  tarefa no Coolify) e espere `channel: "configured"` e `sent: 1` na entrada da clínica, e nenhuma entrada com `error`.
  Disparar de novo no mesmo dia deve devolver `sent: 0`. Na agenda, **Enviar WhatsApp** abre o
  `wa.me` e passa a mostrar "enviado hoje às HH:MM".

### 7.1 Cron de retenção e anonimização (#294, #323)

Anonimiza o que passou do prazo (prontuário e fotos 20 anos após a última atividade, trilha de
auditoria 5 anos, lista de espera e contas inativas 2 anos). Nada é excluído do banco; o arquivo
da foto é apagado do volume `uploads`. Contrato e regras:
[`integrations/retencao.md`](integrations/retencao.md), [ADR-013](../adr/013-retencao-por-anonimizacao.md),
[ADR-031](../adr/031-retencao-em-dias-inteiros-e-fonte-unica.md).
Issues: [#294](https://github.com/KalleoPinheiro/estomasystech/issues/294),
[#323](https://github.com/KalleoPinheiro/estomasystech/issues/323).

- **Agendamento:** Scheduled Task do § 7, uma vez por dia às 03:30 de São Paulo, depois do backup
  do banco das 03:00, com o mesmo `CRON_SECRET` dos lembretes. Na alternativa Vercel, o
  `vercel.json` agenda `GET /api/retention/run` às 06:00 UTC.
- **Prazo e fronteira:** conta em dias inteiros no `APP_TIMEZONE`. O último dia do prazo fica
  inteiro: um evento de auditoria de 18/10/2021 sai na execução de 19/10/2026, não antes. Nenhum
  dado clínico sai dentro dos 20 anos.
- **Trocar um prazo:** não há variável de ambiente. Mude `RETENTION_YEARS`
  (`src/domain/retention/retention-policy.ts`) e suba `PRIVACY_NOTICE_VERSION` no mesmo PR: o aviso
  de privacidade lê os números de lá, e o teste de `legal-text` falha se só um dos dois mudar.
- **Primeira execução:** a trilha de auditoria pode ter muitos eventos com mais de 5 anos e a
  atualização é uma só por empresa; rode fora do horário de uso. (Em produção a primeira execução
  não tem nada a anonimizar: o banco nasceu em 2026-10-18.) Contagem prévia (aproximada: o
  job usa o dia em São Paulo):
  `SELECT clinic_id, count(*) FROM audit_events WHERE occurred_at < date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo' - interval '5 years') AT TIME ZONE 'America/Sao_Paulo' AND actor_id <> 'anonimizado' GROUP BY 1;`
- **Rodar à mão** (depois de restaurar backup, ou para conferir): *Execute Now* na tarefa de
  retenção do Coolify, ou, no terminal do container do app, o mesmo `wget` do § 7 (sem `-O
  /dev/null`, para ver o resumo). É idempotente; a segunda execução no mesmo dia devolve tudo `0`.
  No formato compose, use o mesmo `flock` da linha do cron se o backup estiver rodando.
- **Conferir que rodou:** *Plataforma → Auditoria* (Super Admin) mostra um evento `retention` do
  ator `retention-job` **por execução**, mesmo sem nada vencido. O detalhe traz as contagens da
  trilha de plataforma, `clinics` (empresas processadas), `failedClinics` (quantas falharam) e
  `auditTrailCutoff` (o corte usado). A trilha de cada clínica (*Configurações → Auditoria*) só
  ganha o evento quando algo foi anonimizado nela, com as contagens por tipo. Pelo banco:
  `SELECT occurred_at, detail FROM audit_events WHERE resource_type = 'retention' AND clinic_id IS NULL ORDER BY occurred_at DESC LIMIT 5;`
- **Sem evento de hoje** depois das 03:30: a tarefa não rodou ou o app não respondeu. Veja
  *Scheduled Tasks → Executions* no Coolify e os logs do app, e rode à mão.
- **`failedClinics` acima de zero** ou entrada com `error` na resposta: a empresa que falhou está
  no log (`Retenção da empresa <id>: falha`); as outras seguiram, e o que já tinha sido feito na
  empresa com falha está contado na trilha dela. Corrija a causa e rode à mão; o job retoma de onde
  parou.
- **Backup:** o dado anonimizado continua identificável nos backups até eles expirarem, no
  máximo 30 dias (§ 5), mais o que a retenção do destino fora do servidor guardar. Ao restaurar,
  rode o job à mão em seguida.
- **Tamanho:** a trilha anonimizada continua no banco (ADR-013). Acompanhe com
  `SELECT pg_size_pretty(pg_total_relation_size('audit_events'));`; expurgar ou particionar é
  decisão nova (ADR-031).
- Contas inativas antes da migração `0049` contam os 2 anos a partir dela.

### 7.2 Reescrita dos eventos antigos do Google Agenda (#339)

Roda **uma vez por empresa com Google Agenda conectado**, depois do deploy da migração `0056` (em produção, nenhuma empresa tem Google conectado ainda: só será preciso se houver evento antigo)
(coluna `appointments.calendar_minimized_at`). **Manual**: não está no cron nem no deploy. Regras e
contrato: [`integrations/google-calendar.md`](integrations/google-calendar.md#reescrita-em-lote-dos-eventos-antigos-339-age-rn-19).

1. De um checkout com `DATABASE_URL` alcançável (a imagem standalone não tem `tsx`; no Coolify use o
   container descartável do § 3): `DATABASE_URL=… APP_URL=https://… npm run calendar:minimize` — **simulação**, imprime
   `pendentes=N` por empresa.
2. `npm run calendar:minimize -- --confirmar` — reescreve até 500 consultas por empresa, das mais
   futuras para as mais antigas. Saída `0` = lote sem falha; `1` = houve `falhas` ou a cota do Google
   esgotou (`cota_esgotada=true`).
3. Repita o passo 2 (se a cota esgotou, espere alguns minutos) até o passo 1 mostrar `pendentes=0`.
   Reexecutar é seguro: o que já foi reescrito não é tocado.
- `--empresa=<id>` limita a uma empresa; `--desde=AAAA-MM-DD` limita a consultas a partir da data.
- Precisa das mesmas credenciais do app (`GOOGLE_*`, `AUTH_SECRET`); sem integração a empresa é
  pulada. `APP_URL` define o link do evento; sem ela o evento fica sem link.
- Verificação: *Configurações → Auditoria* mostra um evento `calendar-minimization` por execução;
  no Google, o título passa a `Consulta · J.S.` e a descrição a só o link.

### 7.3 Marcar CNPJs antigos inválidos (#355)

Roda **uma vez**, depois da migração `0063`. **Manual**. Regras: ACE-RN-57, [ADR-029](../adr/029-cnpj-antigo-invalido-marcado-para-correcao.md).

1. De um checkout (ou do container descartável do § 3): `DATABASE_URL=… npm run clinics:cnpj-review` — **simulação**, lista
   `id`, nome e CNPJ das empresas com dígito verificador inválido.
2. `npm run clinics:cnpj-review -- --confirmar` — marca cada uma (o número não muda) e audita.
   Reexecutar é seguro. Avise as clínicas listadas: o aviso aparece em *Configurações → Dados da clínica*.

## 8. Primeiro acesso

Já feito em produção (2026-10-18): o Super Admin foi criado e o token removido. O roteiro vale para
uma instalação nova ou para recriar o banco.

1. Configure as variáveis obrigatórias (`.env.example`), incluindo `ESTOMASYSTECH_BOOTSTRAP_TOKEN`
   (no Coolify, como *Runtime*), e faça o deploy.
2. Chame o bootstrap **sem colocar o token na linha de comando nem no histórico do shell**. O shell do
   operador é o zsh, onde `read -p` não é o prompt (lê de um coprocesso) e o comando falha; por isso
   o `bash -c`:

   ```bash
   bash -c 'read -rs -p "Token: " T; echo; curl -sX POST "https://estomasystech.kalleopinheiro.com.br/api/auth/bootstrap" -H "Content-Type: application/json" -H "x-bootstrap-token: $T" -d "{\"email\":\"responsavel@clinica.com.br\"}"'
   ```

   Cria o Super Admin e envia o convite. A rota só responde enquanto não existe nenhuma conta.
3. Defina a senha pelo link do convite e entre. Com `RESEND_API_KEY`/`EMAIL_FROM`
   ([ADR-011](../adr/011-canal-de-comunicacao-por-clinica.md)) ele chega por e-mail; sem elas, ou se o
   envio falhar, vem no campo `inviteUrl` da resposta do passo 2.
4. **Remova `ESTOMASYSTECH_BOOTSTRAP_TOKEN`** do Coolify (ou do `.env`) e faça o deploy.
5. Cadastre a clínica (a "Clínica legada" da migração pode ser renomeada) e convide o administrador
   dela; em */configuracoes* da clínica: dados (CNPJ, responsável técnico), canal de e-mail, grade
   de horários, profissionais, contas da equipe.
6. Contas de portal: crie a partir do paciente/parceiro já cadastrado (o vínculo é obrigatório).

## 9. Monitoramento e alertas

Decisões do dono ([#212](https://github.com/KalleoPinheiro/estomasystech/issues/212)): tudo
self-hosted, alertas por **e-mail** ao operador pelo canal da plataforma. Desenho e o que sai do
processo: [ADR-014](../adr/014-observabilidade-sem-pii.md).

### 9.1 Health check

| Rota | Checa | Quem usa |
| --- | --- | --- |
| `GET /api/health` | o processo responde (sem banco, sem rate limit) | `HEALTHCHECK` da imagem e do compose |
| `GET /api/health/ready` | `select 1` e todas as migrações de `drizzle/` aplicadas; `503` senão, em até 3 s | verificador externo, alerta `readiness` |

O corpo diz só `database` e `migrations` (`ok`/`fail`/`pending`/`unknown`). Banco recém-criado, nunca migrado (sem a tabela `drizzle.__drizzle_migrations`), responde `503` com `database: "ok"` e `migrations: "pending"`. `docker compose ps`
mostra `unhealthy` quando a liveness falha; `restart: unless-stopped` reinicia o processo que
morre, mas não o que fica `unhealthy`.

### 9.2 Alertas por e-mail

A Scheduled Task `*/5` (§ 7) chama `POST /api/alerts/run`. Precisa de `ALERT_EMAIL_TO` e
do canal da plataforma (`RESEND_API_KEY`/`EMAIL_FROM`) nas variáveis do app. Contrato e detalhes:
[`integrations/alertas.md`](integrations/alertas.md).

| Alerta | Ativo quando |
| --- | --- |
| aplicação não está pronta | `/api/health/ready` falharia (banco fora ou migração pendente) |
| erros 5xx acima do limiar | ≥ `ALERT_5XX_THRESHOLD` (10) erros 500 em 15 min |
| job de lembretes sem rodar | última execução há mais de 26 h |
| falhas de entrega recorrentes | ≥ `ALERT_DELIVERY_FAILURE_THRESHOLD` (3) envios de e-mail recusados em 15 min |

Mesmo alerta ativo volta no máximo a cada 60 min. Os contadores ficam em memória: reiniciar o
app os zera (uma réplica). Sem destinatário ou sem canal, o alerta vira linha `error` no log.

**Teste de fumaça** (derruba o banco: só fora do horário de uso): com o app no ar, pare o recurso do
banco no Coolify; em até 5 min chega "aplicação não está pronta". Inicie o banco em seguida. No
compose: `docker compose stop db` / `start db`.

### 9.3 Outros sinais

| Sinal | Como |
| --- | --- |
| App fora do ar | o UptimeRobot (abaixo) avisa por e-mail; a tarefa de alertas também falha no Coolify |
| Lembretes ou retenção falharam | execução com erro em *Scheduled Tasks → Executions* (e e-mail do Coolify, se ligado); o alerta "job de lembretes sem rodar" (26 h) cobre os lembretes |
| Backup do banco | notificação do Coolify e *Backups → Executions* (*Available* no R2). No compose, `MAILTO` do cron (§ 7) |
| Disco e atualizações do host | Coolify (alerta de disco do servidor) e a rotina mensal do 1º sábado (#381). No compose: linha no `cron.d` com `df` |
| Backup que não rodou | o verificador de "último backup" segue fora desta entrega |

**E-mail do host (`msmtp`) — só no formato compose; não existe na produção atual** (os avisos saem do
Coolify e do app, ambos pelo Resend). O `MAILTO` do cron precisa de um relay no host: a Hetzner bloqueia a
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
cai. Em produção já monitora `/api/health/ready`, o painel do Coolify e o SSH. Cadastro, uma vez:

1. Crie o monitor do tipo **HTTP(s)** com a URL `https://<domínio>/api/health/ready`.
2. Intervalo de **5 min**.
3. Contato de alerta: o **e-mail** do operador.
4. Confira derrubando o banco (pare o recurso no Coolify; `/api/health/ready` passa a responder
   `503`) e religue depois.

### 9.4 Logs

Os logs do app (aba *Logs* do recurso no Coolify, ou `docker logs <container>` no servidor; no
compose, `docker compose logs app`) trazem uma linha JSON por evento: `time`, `level`, `msg`,
`requestId` e campos. O `x-request-id` volta em toda resposta; com ele, ache todas as linhas do request:

```bash
docker logs <container-do-app> 2>&1 | grep '"requestId":"<id>"' | jq .
docker logs <container-do-app> 2>&1 | jq -c 'select(.level == "error")'
```

Os logs não carregam dado pessoal (`logError`,
[#202](https://github.com/KalleoPinheiro/estomasystech/issues/202); e-mail e número longo viram
`[e-mail]`/`[número]`). O erro não tratado que o próprio Next escreve (`⨯ …`) segue em texto; o
mesmo erro sai limpo e em JSON (`Erro não tratado na requisição`).

### 9.5 GlitchTip (error tracking)

Opcional: sem `GLITCHTIP_DSN` o app funciona igual. **Em produção está desligado** (decisão de
2026-10-18: o app roda como Dockerfile no Coolify, sem o compose do GlitchTip; os 5xx chegam pelo
alerta por e-mail e pelos logs). O roteiro abaixo vale para o formato compose. Configurar, uma vez:

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

### 9.6 Fumaça pós-deploy (somente leitura)

Roda depois de todo deploy e em qualquer revisão de produção. Não escreve nada, não usa login nem
dado de paciente. Substitua `U=https://estomasystech.kalleopinheiro.com.br`.

| Confere | Comando | Esperado |
| --- | --- | --- |
| liveness | `curl -s -o /dev/null -w '%{http_code}' $U/api/health` | `200` |
| readiness | `curl -s $U/api/health/ready` | `200`; corpo só com `database` e `migrations`, ambos `ok` |
| TLS e HSTS | `curl -sI $U/login` | `200`; `strict-transport-security` presente; HTTP em `http://…` redireciona para HTTPS |
| CSP única com nonce | `curl -sI $U/login \| grep -ic '^content-security-policy'` | `1`, com `nonce-` na política |
| demais cabeçalhos | `curl -sI $U/login` | `x-frame-options`, `x-content-type-options`, `referrer-policy`, `cross-origin-opener-policy` e `cross-origin-resource-policy` presentes, sem duplicar a CSP |
| rotas de job fechadas | `curl -s -o /dev/null -w '%{http_code}' -X POST $U/api/alerts/run` (sem `x-cron-secret`) | `401` (`503` significa `CRON_SECRET` ausente; `200` seria falha grave) |
| cookies | DevTools → Application → Cookies, depois de um login | cookie de sessão com `Secure`, `HttpOnly` e `SameSite` (exige login: não faz parte da fumaça sem conta) |
| rate limit | leia o limite de `rate-limit-app` em `shared-middlewares.yaml` do proxy e exceda-o com `GET` em `/api/health` | `429` ao passar do limite; se nunca vier, o rótulo do § 3 não está aplicado ao recurso |
| imagem | *Deployments* do Coolify | SHA igual ao esperado e `healthy` |

Sem o login, os itens que dependem de sessão (lembretes, evento `retention` na auditoria) se
verificam no painel: *Plataforma → Auditoria* mostra o evento `retention` do dia depois das 03:30
(§ 7.1), e as tarefas de lembretes e alertas mostram execução sem erro no Coolify.

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
