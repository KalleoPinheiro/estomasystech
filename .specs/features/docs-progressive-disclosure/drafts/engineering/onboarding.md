---
title: "Onboarding técnico e setup"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: YYYY-MM-DD
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
| rodar os gates antes do PR | [§5 Gates locais](#5-gates-locais) |

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
| Postgres | `localhost:5432` · `vitta`/`vitta` · db `vitta` |

Porta ocupada: `POSTGRES_PORT=5477 APP_PORT=3001 docker compose up -d --build`.
Parar: `docker compose down` · apagar dados: `docker compose down -v`.

## 3. Via B — Node local + Postgres do compose

```bash
docker compose up -d db
cp .env.example .env          # DATABASE_URL já aponta para localhost:5432
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
| `DATABASE_URL` | sim (fora do compose) | Postgres | — |
| `AUTH_SECRET` | sim em produção | sessão + cifra de credenciais | `openssl rand -hex 32` |
| `APP_URL` | sim em produção | links de convite/reset, redirect OAuth | — |
| `VITTA_BOOTSTRAP_TOKEN` | primeira instalação | `POST /api/auth/bootstrap` | [ADR-004](../adr/004-remocao-google-oauth-autenticacao.md) |
| `RESEND_API_KEY` / `EMAIL_FROM` | sim em produção | convite e reset de senha | [resend.md](integrations/resend.md) |
| `TZ` | recomendada | horário comercial validado no fuso local | `America/Sao_Paulo` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional | sync de agenda via OAuth | [google-calendar.md](integrations/google-calendar.md) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID` | opcional | sync via service account | idem |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | opcional | lembretes | [whatsapp-meta.md](integrations/whatsapp-meta.md) |
| `CRON_SECRET` | opcional | `POST /api/reminders/run` | [cron.md](integrations/cron.md) |
| `PHOTO_STORAGE` / `S3_*` | opcional | fotos em bucket S3-compatível (padrão: disco) | [s3-storage.md](integrations/s3-storage.md) |
| `API_RATE_LIMIT_MAX` | opcional | limite geral da API | — |
| `VITTA_ALLOW_OPEN_MODE` | só dev | modo sem login | ignorada em produção |
| `VITTA_MIGRATE_ON_BOOT` | opcional | desliga migração no boot | padrão `true` |

## 5. Gates locais

Rode antes de abrir PR — o CI roda os mesmos:

```bash
npm run typecheck && npm run lint && npm run check:sv && npm run check:docs && npm run test:coverage
npm run test:e2e   # se tocou UI ou fluxo
```

Próximo passo: leia o [`AGENTS.md`](../../AGENTS.md) § Regras invioláveis e o domínio em que vai trabalhar.
