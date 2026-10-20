---
title: "Onboarding técnico e setup"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related:
  - .env.example
  - docs/engineering/integrations/README.md
  - docs/engineering/troubleshooting.md
---

# Onboarding técnico e setup

> **Este documento é de desenvolvimento local.** Produção roda no Coolify (Dockerfile + PostgreSQL 18
> gerenciado, deploy manual): estado atual, release e rollback em
> [`producao.md`](producao.md) § 0 e § 3.1. Localmente o compose sobe o mesmo major
> (Postgres 18, [ADR-037](../adr/037-postgres-18-em-producao-e-alinhamento-do-dev.md)). Quem tem um volume `pgdata` criado
> com Postgres 16 precisa recriá-lo: `docker compose down -v` (apaga o banco local) ou dump/restore antes da troca.

> **TL;DR (5 min):** `cp .env.example .env` → preencha `POSTGRES_PASSWORD`, `AUTH_SECRET`,
> `DATA_ENCRYPTION_KEY`, `ESTOMASYSTECH_BOOTSTRAP_TOKEN` → `docker compose up -d --build` → `POST /api/auth/bootstrap` → abra o
> link de convite (vem no `inviteUrl` da resposta; por e-mail só com `RESEND_API_KEY`/`EMAIL_FROM`,
> opcionais — [ADR-011](../adr/011-canal-de-comunicacao-por-clinica.md)). Travou?
> [Troubleshooting](troubleshooting.md).

| Preciso de… | Vá para |
| --- | --- |
| instalar ferramentas | [§1 Requisitos](#1-requisitos) |
| rodar tudo em container | [§2 Via A — Docker Compose](#2-via-a--docker-compose-recomendado) |
| hot reload | [§3 Via B — Node local](#3-via-b--node-local--postgres-do-compose) |
| saber o que cada variável faz | [§4 Variáveis de ambiente](#4-variáveis-de-ambiente) |
| configurar e-mail, agenda, WhatsApp, fotos | [Integrações](integrations/README.md) |
| rodar testes | [§5 Testes](#5-testes) |
| rodar os gates antes do PR | [§6 Gates locais](#6-gates-locais) |

## 1. Requisitos

| Ferramenta | Versão | Para |
| --- | --- | --- |
| Docker + Compose | atual | Via A (tudo) e Via B (só banco) |
| Node.js | 24 (imagem `node:24-alpine`; 20+ funciona) | Via B, testes, scripts |
| npm | o do Node | sem workspaces; `npm ci` no CI |
| openssl | qualquer | gerar segredos |
| RAM livre | ≥ 4 GB | `npm run build` tem pico de ~2,5 GB |

## 2. Via A — Docker Compose (recomendado)

Sobe Postgres 18 + app. Migrações rodam no boot (advisory lock, seguro com réplicas).

```bash
cp .env.example .env
# preencha no mínimo:
#   POSTGRES_PASSWORD=$(openssl rand -hex 24)
#   AUTH_SECRET=$(openssl rand -hex 32)
#   ESTOMASYSTECH_BOOTSTRAP_TOKEN=$(openssl rand -hex 24)
#   RESEND_API_KEY=...   EMAIL_FROM="EstomaSysTech <nao-responda@suaclinica.com>"
docker compose up -d --build

# espere o Next aceitar conexões
until curl -sf http://localhost:3000/api/auth/providers >/dev/null; do sleep 2; done

# primeira conta (só funciona com zero contas): cria o Super Admin e envia o convite
set -a; . ./.env; set +a
curl -sX POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $ESTOMASYSTECH_BOOTSTRAP_TOKEN" \
  -d '{"email":"voce@exemplo.com"}'
# confira `delivered` na resposta: se false, abra o `inviteUrl` retornado
```

| Serviço | Endereço |
| --- | --- |
| App | http://localhost:3000 |
| Postgres | `127.0.0.1:5432` (só loopback) · usuário `estomasystech` · senha `POSTGRES_PASSWORD` · db `estomasystech` |

- **Sem senha padrão:** o compose não sobe sem `POSTGRES_PASSWORD`, e a porta do banco só é publicada
  no loopback do host — o app usa a rede interna do compose.
- **Fotos clínicas** (com `PHOTO_STORAGE` vazio) ficam no volume nomeado `uploads`, montado em
  `/app/uploads`; sobrevivem a `docker compose up --build`. `docker compose down -v` apaga fotos e banco.
- **Health check:** o serviço `app` fica `healthy` quando `GET /api/auth/providers` responde 200.
- **Fuso:** a imagem define `TZ` e `APP_TIMEZONE` (`America/Sao_Paulo`); em produção o app recusa subir
  se os dois divergirem.

Porta ocupada: `POSTGRES_PORT=5477 APP_PORT=3001 docker compose up -d --build`.
Parar: `docker compose down` · apagar dados: `docker compose down -v`.

### Ambiente local completo (um comando)

```bash
npm run ambiente:local        # compose próprio (Postgres 18 + app) + migra + semeia + imprime URL e contas
npm run test:integracao       # suíte de integração contra esse Postgres (não PGlite)
npm run ambiente:local:down   # derruba e apaga volume e segredos descartáveis
```

- Projeto compose `estomasystech-local` (não mexe no `docker compose up` do dia a dia). O app é a imagem de
  produção; o banco fica em `127.0.0.1:55432` (`POSTGRES_PORT`) e o app em `http://localhost:3000` (`APP_PORT`).
- Mesma massa e mesmas contas fictícias da [homologação](homologacao.md#4-contas-fictícias-do-seed); a senha é
  gerada na 1ª execução e fica em `.ambiente-local/` (fora do git). O cookie de sessão é `Secure`: use Chrome,
  Edge ou Firefox.
- **Recusa produção:** `APP_ENV`/`NODE_ENV=production`, host em `PRODUCTION_DB_HOSTS` ou `DATABASE_URL` que não seja
  da própria máquina. Desfaça a variável e rode de novo.
- `test:integracao` aceita `INTEGRATION_DATABASE_URL` (um Postgres local, usuário que cria bancos) para rodar sem
  Docker; cada arquivo de teste ganha um banco clonado de um modelo migrado. Decisão e limites:
  [ADR-044](../adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md).

## 3. Via B — Node local + Postgres do compose

```bash
cp .env.example .env          # defina POSTGRES_PASSWORD e use a mesma senha no DATABASE_URL
docker compose up -d db
npm install
npm run dev                   # http://localhost:3000
```

- **Sem login não há app:** sem `AUTH_SECRET`, tudo responde 503, em qualquer ambiente. O antigo
  "modo aberto" (`ESTOMASYSTECH_ALLOW_OPEN_MODE`) foi removido (#327) e a variável não tem efeito.
- **Migração manual:** `npm run db:migrate` e `ESTOMASYSTECH_MIGRATE_ON_BOOT=false`.
- **E-mail em dev:** sem `RESEND_API_KEY` o gateway é dry-run: o log traz destinatário mascarado,
  assunto e o link de definição de senha (`[e-mail desativado] Para fu***@x.com — …`) — nunca o
  corpo. O link só sai com `NODE_ENV !== 'production'`.

## 4. Variáveis de ambiente

> **Única tabela do repositório.** `README.md` e `AGENTS.md` linkam aqui; `.env.example` traz os
> mesmos nomes com comentários. Mudou uma variável? Atualize os dois no mesmo PR —
> `tests/docs/env-docs.test.ts` compara as variáveis que `src/` lê com esta tabela e com o
> `.env.example`.

| Variável | Obrigatória | Para | Detalhe |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | sim (compose) | senha do Postgres do compose, sem padrão | `openssl rand -hex 24`; entra no `DATABASE_URL` do app |
| `DATABASE_URL` | sim (fora do compose) | Postgres | `postgres://estomasystech:<POSTGRES_PASSWORD>@localhost:5432/estomasystech` |
| `INTEGRATION_DATABASE_URL` | não | Postgres local da suíte de integração (`npm run test:integracao`); sem ela, sobe o `db` do compose | `postgres://estomasystech:<senha>@127.0.0.1:5432/postgres` (só máquina local; produção é recusada) |
| `AUTH_SECRET` | sim em produção | assina a sessão (só isso: o dado clínico tem chave própria) | `openssl rand -hex 32`; sem ele, 503 em toda rota. Rotacionar derruba todas as sessões |
| `DATA_ENCRYPTION_KEY` | sim em produção | cifra o texto clínico e o token do Google em repouso ([ADR-006](../adr/006-chave-de-dados-clinicos.md)) | `openssl rand -hex 32` (≥ 32 caracteres); fora de produção, sem ela, usa chave de desenvolvimento. Perdê-la é perder o prontuário: guarde no cofre |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | só na rotação | chaves anteriores, separadas por vírgula, só para leitura | roteiro em [producao.md](producao.md) § 6 |
| `APP_URL` | sim em produção | links de convite/reset, redirect do OAuth, link do recall | — |
| `ESTOMASYSTECH_BOOTSTRAP_TOKEN` | primeira instalação | header `x-bootstrap-token` de `POST /api/auth/bootstrap` | [ADR-004](../adr/004-remocao-google-oauth-autenticacao.md) |
| `RESEND_API_KEY` / `EMAIL_FROM` | não | e-mail **da plataforma** (contas sem clínica: bootstrap e reset do Super Admin); cada clínica usa a chave que cadastra ([ADR-011](../adr/011-canal-de-comunicacao-por-clinica.md)) | [resend.md](integrations/resend.md) |
| `APP_ENV` | obrigatória na Vercel | `production`, `staging`, `preview` ou `development` | ausente fora da Vercel: `NODE_ENV=production` é produção, o resto é desenvolvimento ([ADR-041](../adr/041-homologacao-na-vercel-e-branch-staging.md)) |
| `MOCK_INTEGRATIONS` | não | `true` liga o MSW (Resend, Google, S3/R2 simulados) | recusado em `production` |
| `PRODUCTION_DB_HOSTS` | homologação | hosts de banco de produção, separados por vírgula | `DATABASE_URL` com esse host é recusada fora de `production` |
| `STAGING_SEED_PASSWORD` | `npm run seed:staging` | senha (≥ 10 caracteres) das contas fictícias | [homologacao.md](homologacao.md) § 4 |
| `NEXT_PUBLIC_APP_VERSION` | não | versão exibida às clínicas; o `next.config.ts` a embute no build a partir do `package.json` | [ADR-043](../adr/043-versionamento-com-changesets-e-release-por-tag.md) |
| `NEXT_PUBLIC_APP_COMMIT` | não | SHA curto exibido junto da versão; só em homologação e preview | vem de `VERCEL_GIT_COMMIT_SHA` |
| `VERCEL_GIT_COMMIT_SHA` | Vercel | injetada pela Vercel no build | origem de `NEXT_PUBLIC_APP_COMMIT` |
| `CHANGESET_BASE` | não | base do `npm run check:changeset` (padrão `origin/main`; o CI usa a base do PR) | [ADR-043](../adr/043-versionamento-com-changesets-e-release-por-tag.md) |
| `DATABASE_URL_UNPOOLED` | Neon/Vercel | conexão direta usada na migração do build | [homologacao.md](homologacao.md) § 3 |
| `TZ` | recomendada | fuso do processo Node | `America/Sao_Paulo` na imagem e no compose |
| `APP_TIMEZONE` | não | fuso das regras: grade da agenda, "amanhã" dos lembretes, horário em e-mails e documentos | padrão `America/Sao_Paulo`; se o processo estiver em outro fuso (ex.: Vercel, sempre UTC), o boot alinha `TZ` a ele |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | não | sync de agenda via OAuth (nunca login) | [google-calendar.md](integrations/google-calendar.md) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID` | não | sync via service account (alternativa) | idem |
| `CRON_SECRET` | sim para os lembretes e a retenção | header `x-cron-secret` de `POST /api/reminders/run` e `POST /api/retention/run` (ou `Authorization: Bearer` do Vercel Cron em `GET`); sem ele, 503 | [cron.md](integrations/cron.md), [retencao.md](integrations/retencao.md) |
| `DATA_REQUEST_ALERT_DAYS` | não | dias antes do vencimento (15 dias) em que o Admin é avisado de pedido do titular pendente; 1 a 14, padrão 3 | [cron.md](integrations/cron.md) |
| `PHOTO_STORAGE` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` / `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` / `S3_SSE` | não (sim com várias réplicas e na Vercel) | fotos em bucket S3-compatível | [s3-storage.md](integrations/s3-storage.md) |
| `UPLOADS_DIR` | não | diretório das fotos no disco local | padrão `./uploads`; no compose, `/app/uploads` (volume `uploads`) |
| `TRUSTED_PROXY_HOPS` | não | quantos proxies reversos confiáveis ficam à frente do app (define o IP do cliente no `x-forwarded-for`) | padrão `1`; Nginx/Traefik = `1`, Cloudflare + Nginx = `2` |
| `API_RATE_LIMIT_MAX` | não | req/min em `/api/*`, somado entre réplicas: **por conta** quando autenticado (empresa + e-mail), por IP quando anônimo | padrão `120` — cada tela faz de 2 a 8 chamadas ao abrir (Agenda 7, Configurações 8, Dashboard 5, Ficha 6), ou seja ~15 trocas de tela por minuto por pessoa |
| `PG_POOL_MAX` / `PG_CONNECT_TIMEOUT_MS` / `PG_IDLE_TIMEOUT_MS` / `PG_STATEMENT_TIMEOUT_MS` | não | tuning do pool Postgres | — |
| `GLITCHTIP_DSN` / `APP_RELEASE` | não | error tracking no GlitchTip self-hosted ([ADR-014](../adr/014-observabilidade-sem-pii.md)) e a versão marcada em cada evento | vazio = no-op; [glitchtip.md](integrations/glitchtip.md) |
| `GLITCHTIP_DB_PASSWORD` / `GLITCHTIP_SECRET_KEY` | só com o GlitchTip | senha do Postgres próprio e chave do GlitchTip, lidas por `docker-compose.glitchtip.yml` (não pelo app) | [producao.md](producao.md) § 9.5 |
| `ALERT_EMAIL_TO` / `ALERT_5XX_THRESHOLD` / `ALERT_DELIVERY_FAILURE_THRESHOLD` | não (sim em produção) | alertas por e-mail ao operador (`POST /api/alerts/run`) pelo canal da plataforma | limiares em 15 min, padrão `10` e `3`; [alertas.md](integrations/alertas.md) |
| `ESTOMASYSTECH_MIGRATE_ON_BOOT` | não | `false` desliga a migração no boot | padrão: migra |
| `POSTGRES_PORT` / `APP_PORT` | não | portas publicadas pelo compose no host | padrão `5432` (só loopback) e `3000` |
| `E2E_AUTH_SECRET` / `E2E_BOOTSTRAP_TOKEN` / `E2E_DATA_ENCRYPTION_KEY` | não | só para a suíte E2E reaproveitar um `npm run dev` já no ar | ver §5 |
| `E2E_ADMIN_PASSWORD` / `E2E_CLINIC_ADMIN_PASSWORD` / `E2E_ROLE_PASSWORD` | não | senhas que as contas da suíte E2E definem no convite | geradas a cada execução; defina só para repetir uma execução |
| `ESTOMASYSTECH_DB_DRIVER` / `ESTOMASYSTECH_PGLITE_TEMPLATE_PATH` | não — não defina | internas das suítes: banco PGlite e snapshot migrado dos testes | definidas por `playwright*.config.ts` e `tests/`; fora do `.env.example` |

## 5. Testes

```bash
npm test                 # domínio, aplicação, integração Postgres via PGlite, API
npm run test:changed     # só o afetado pelo diff (loop local; não substitui o próximo)
npm run test:coverage    # gate de CI: mínimo 90% (limiar em vitest.config.mts)
npm run gate:local       # E2E + todos os gates, com recibo para o PR (ADR-042)
npm run test:mutacao      # mutantes (Stryker) em src/domain e src/application; ~1h20, só local (ADR-047); um arquivo: npm run test:mutacao -- --mutate src/domain/shared/phone.ts
npm run test:e2e         # build + Playwright contra `next start` e contra `next dev` (ADR-021); na 1ª vez ou após bump: npx playwright install
npm run test:e2e:prod    # só a suíte principal, contra o build (precisa de `npm run build` antes)
npm run test:e2e:dev     # só papéis e login, contra `next dev`
```

A suíte E2E sobe os próprios servidores e gera as credenciais a cada execução. Só para
reaproveitar um `npm run dev` já no ar: `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` (suíte) e
`AUTH_SECRET`/`ESTOMASYSTECH_BOOTSTRAP_TOKEN` (servidor) precisam ter os mesmos valores.
Estilo e níveis de teste: [conventions.md](conventions.md#testes).

**Artefato de produção (#203):** o Actions roda só o gate rápido; o E2E e o resto do artefato rodam em
`npm run gate:local` ([ADR-042](../adr/042-e2e-fora-do-actions-gate-local-com-recibo.md)), que executa

```bash
npm run build && npx playwright test -c playwright.prod.config.ts   # E2E contra `next start`
docker compose build && bash scripts/docker-smoke.sh                # imagem + smoke do container (com daemon Docker)
bash scripts/backup-smoke.sh                                         # backup cifrado + restore (precisa de `age`)
```

O E2E de produção é a suíte principal ([ADR-021](../adr/021-e2e-contra-build-de-producao.md)): todos os
specs, menos as contas por papel, com a CSP estrita (sem
`'unsafe-eval'`/`'unsafe-inline'`) e falha em qualquer violação de CSP
(`e2e/csp-producao.spec.ts`). Módulo que chega ao bundle do cliente não pode importar `node:*`:
o polyfill do Node usa `Function(...)` e a CSP de produção bloqueia. O smoke sobe o
`docker-compose.yml`, espera o healthcheck, confere `/api/auth/providers` e que o usuário
`nextjs` grava no volume `uploads` e o arquivo sobrevive à recriação do container. O smoke de
backup faz o ciclo backup → apagar tudo → restore do [runbook](producao.md) § 5.

**Build:** `npm run build` fixa o heap em 4 GB (`--max-old-space-size=4096`) porque o pico é
~2,5 GB; em máquina de ~8 GB o heap padrão do V8 morre com `Ineffective mark-compacts`. Não remova.

## 6. Gates locais

No loop de desenvolvimento: `npm run test:changed`. **Antes de marcar o PR como pronto**, uma vez, com a
árvore limpa (tudo commitado):

```bash
npm run gate:local
```

Ele roda typecheck, lint, `check:sv`, `check:docs`, integridade dos testes, `test:coverage`, build, E2E de
produção, E2E em `next dev` e, se houver daemon Docker, o smoke da imagem e do backup. No fim imprime a linha
`E2E-GATE: <sha> pass ...`: cole-a no corpo do PR. O CI (`recibo-gate.yml`) reprova recibo ausente, de outro
commit (qualquer push novo invalida) ou sem as etapas obrigatórias. Se o gate falhar, **corrija o código, nunca o
teste** (regra 8 do `AGENTS.md`); só mude teste existente quando o requisito de negócio mudou, com
`TESTE-ALTERADO: <motivo>` no PR e o mesmo texto em `.gate/motivo-teste.txt` (local, fora do git; o `pre-push` e o `gate:local` leem). Sem Docker (ex.: thread na nuvem), as etapas `docker` e `backup` ficam
registradas como puladas e o `docker.yml` cobre quando o que elas validam muda.

Próximo passo: leia o [`AGENTS.md`](../../AGENTS.md) § Regras invioláveis e o domínio em que vai trabalhar.
