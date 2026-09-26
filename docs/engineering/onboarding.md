---
title: "Onboarding técnico e setup"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
related:
  - .env.example
  - docs/engineering/integrations/README.md
  - docs/engineering/troubleshooting.md
---

# Onboarding técnico e setup

> **TL;DR (5 min):** `cp .env.example .env` → preencha `AUTH_SECRET`, `VITTA_BOOTSTRAP_TOKEN`,
> `RESEND_API_KEY`, `EMAIL_FROM` → `docker compose up -d --build` → `POST /api/auth/bootstrap`
> → abra o link de convite. Travou? [Troubleshooting](troubleshooting.md).

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

Sobe Postgres 16 + app. Migrações rodam no boot (advisory lock, seguro com réplicas).

```bash
cp .env.example .env
# preencha no mínimo:
#   POSTGRES_PASSWORD=$(openssl rand -hex 24)
#   AUTH_SECRET=$(openssl rand -hex 32)
#   VITTA_BOOTSTRAP_TOKEN=$(openssl rand -hex 24)
#   RESEND_API_KEY=...   EMAIL_FROM="VittaFlow <nao-responda@suaclinica.com>"
docker compose up -d --build

# espere o Next aceitar conexões
until curl -sf http://localhost:3000/api/auth/providers >/dev/null; do sleep 2; done

# primeira conta (só funciona com zero contas): cria o Super Admin e envia o convite
set -a; . ./.env; set +a
curl -sX POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $VITTA_BOOTSTRAP_TOKEN" \
  -d '{"email":"voce@exemplo.com"}'
# confira `delivered` na resposta: se false, abra o `inviteUrl` retornado
```

| Serviço | Endereço |
| --- | --- |
| App | http://localhost:3000 |
| Postgres | `127.0.0.1:5432` (só loopback) · usuário `vitta` · senha `POSTGRES_PASSWORD` · db `vitta` |

- **Sem senha padrão:** o compose não sobe sem `POSTGRES_PASSWORD`, e a porta do banco só é publicada
  no loopback do host — o app usa a rede interna do compose.
- **Fotos clínicas** (com `PHOTO_STORAGE` vazio) ficam no volume nomeado `uploads`, montado em
  `/app/uploads`; sobrevivem a `docker compose up --build`. `docker compose down -v` apaga fotos e banco.
- **Health check:** o serviço `app` fica `healthy` quando `GET /api/auth/providers` responde 200.
- **Fuso:** a imagem define `TZ` e `APP_TIMEZONE` (`America/Sao_Paulo`); em produção o app recusa subir
  se os dois divergirem.

Porta ocupada: `POSTGRES_PORT=5477 APP_PORT=3001 docker compose up -d --build`.
Parar: `docker compose down` · apagar dados: `docker compose down -v`.

## 3. Via B — Node local + Postgres do compose

```bash
cp .env.example .env          # defina POSTGRES_PASSWORD e use a mesma senha no DATABASE_URL
docker compose up -d db
npm install
npm run dev                   # http://localhost:3000
```

- **Modo aberto (só dev):** sem `AUTH_SECRET`, tudo responde 503. Para navegar sem login,
  `VITTA_ALLOW_OPEN_MODE=true` (ignorado em produção; auditoria registra `anonymous`).
- **Migração manual:** `npm run db:migrate` e `VITTA_MIGRATE_ON_BOOT=false`.
- **E-mail em dev:** sem `RESEND_API_KEY` o gateway é dry-run e o link sai no log (`[e-mail desativado] …`).

## 4. Variáveis de ambiente

> **Única tabela do repositório.** `README.md` e `AGENTS.md` linkam aqui; `.env.example` traz os
> mesmos nomes com comentários. Mudou uma variável? Atualize os dois no mesmo PR.

| Variável | Obrigatória | Para | Detalhe |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | sim (compose) | senha do Postgres do compose, sem padrão | `openssl rand -hex 24`; entra no `DATABASE_URL` do app |
| `DATABASE_URL` | sim (fora do compose) | Postgres | `postgres://vitta:<POSTGRES_PASSWORD>@localhost:5432/vitta` |
| `AUTH_SECRET` | sim em produção | assina a sessão e cifra credenciais | `openssl rand -hex 32`; sem ele, 503 em toda rota |
| `APP_URL` | sim em produção | links de convite/reset, redirect do OAuth, link do recall | — |
| `VITTA_BOOTSTRAP_TOKEN` | primeira instalação | header `x-bootstrap-token` de `POST /api/auth/bootstrap` | [ADR-004](../adr/004-remocao-google-oauth-autenticacao.md) |
| `RESEND_API_KEY` / `EMAIL_FROM` | sim em produção | convite e reset de senha | [resend.md](integrations/resend.md) |
| `TZ` | recomendada | fuso do processo Node | `America/Sao_Paulo` na imagem e no compose |
| `APP_TIMEZONE` | não | fuso das regras: grade da agenda, "amanhã" dos lembretes, horário em e-mails e documentos | padrão `America/Sao_Paulo`; em produção o boot falha se divergir de `TZ` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | não | sync de agenda via OAuth (nunca login) | [google-calendar.md](integrations/google-calendar.md) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID` | não | sync via service account (alternativa) | idem |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | não | lembretes por WhatsApp; sem elas, dry-run | [whatsapp-meta.md](integrations/whatsapp-meta.md) |
| `CRON_SECRET` | não | header `x-cron-secret` de `POST /api/reminders/run`; sem ele, 503 | [cron.md](integrations/cron.md) |
| `PHOTO_STORAGE` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` / `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | não (sim com várias réplicas) | fotos em bucket S3-compatível | [s3-storage.md](integrations/s3-storage.md) |
| `UPLOADS_DIR` | não | diretório das fotos no disco local | padrão `./uploads`; no compose, `/app/uploads` (volume `uploads`) |
| `TRUSTED_PROXY_HOPS` | não | quantos proxies reversos confiáveis ficam à frente do app (define o IP do cliente no `x-forwarded-for`) | padrão `1`; Nginx/Caddy = `1`, Cloudflare + Nginx = `2` |
| `API_RATE_LIMIT_MAX` | não | req/min em `/api/*`, somado entre réplicas: **por conta** quando autenticado (empresa + e-mail), por IP quando anônimo | padrão `120` — cada tela faz de 2 a 8 chamadas ao abrir (Agenda 7, Configurações 8, Dashboard 5, Ficha 6), ou seja ~15 trocas de tela por minuto por pessoa |
| `PG_POOL_MAX` / `PG_CONNECT_TIMEOUT_MS` / `PG_IDLE_TIMEOUT_MS` / `PG_STATEMENT_TIMEOUT_MS` | não | tuning do pool Postgres | — |
| `VITTA_MIGRATE_ON_BOOT` | não | `false` desliga a migração no boot | padrão: migra |
| `VITTA_ALLOW_OPEN_MODE` | só dev | roda sem login | ignorada com `NODE_ENV=production` |
| `E2E_AUTH_SECRET` / `E2E_BOOTSTRAP_TOKEN` | não | só para a suíte E2E reaproveitar um `npm run dev` já no ar | ver §5 |

## 5. Testes

```bash
npm test                 # domínio, aplicação, integração Postgres via PGlite, API
npm run test:changed     # só o afetado pelo diff (loop local; não substitui o próximo)
npm run test:coverage    # gate de CI: mínimo 90% (limiar em vitest.config.mts)
npm run test:e2e         # Playwright; na 1ª vez ou após bump: npx playwright install
```

A suíte E2E sobe os próprios servidores e gera as credenciais a cada execução. Só para
reaproveitar um `npm run dev` já no ar: `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` (suíte) e
`AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN` (servidor) precisam ter os mesmos valores.
Estilo e níveis de teste: [conventions.md](conventions.md#testes).

**Build:** `npm run build` fixa o heap em 4 GB (`--max-old-space-size=4096`) porque o pico é
~2,5 GB; em máquina de ~8 GB o heap padrão do V8 morre com `Ineffective mark-compacts`. Não remova.

## 6. Gates locais

Rode antes de abrir PR — o CI roda os mesmos:

```bash
npm run typecheck && npm run lint && npm run check:sv && npm run check:docs && npm run test:coverage
npm run test:e2e   # se tocou UI ou fluxo
```

Próximo passo: leia o [`AGENTS.md`](../../AGENTS.md) § Regras invioláveis e o domínio em que vai trabalhar.
