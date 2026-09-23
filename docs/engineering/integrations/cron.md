---
title: "Integração: cron de lembretes"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Cron de lembretes (`POST /api/reminders/run`)

## Propósito

Um agendador externo (cron do host, Vercel Cron, GitHub Actions…) chama a rota uma vez por dia
para enviar os lembretes pelo [WhatsApp](whatsapp-meta.md). Domínio: [comunicação](../../domains/comunicacao/README.md).

| Campo | Valor |
| --- | --- |
| Direção | **entrada** |
| Obrigatória? | não |
| Rota | `src/app/api/reminders/run/route.ts` |
| Caso de uso | `src/application/reminders/send-reminders.ts` |

## Credenciais

| Credencial | Obrigatória | Nota |
| --- | --- | --- |
| `CRON_SECRET` | para a rota existir | `openssl rand -hex 24`; comparado em tempo constante |

## Contrato

```http
POST /api/reminders/run
x-cron-secret: $CRON_SECRET
```

Resposta `200` no envelope `{ success, data }`, com `data = { sent, skipped, failed, channelEnabled }`.

O que é enviado a cada execução, para todas as clínicas:

| Tipo | Quem recebe |
| --- | --- |
| `confirmation` | consulta de amanhã ainda `scheduled` |
| `recall` | retorno `pending` com vencimento antes de hoje (com link do portal se `APP_URL` for http(s)) |

Idempotente no dia: um lembrete por (tipo, referência, data) — rodar duas vezes não duplica.

## Modos de falha

| Situação | Resposta |
| --- | --- |
| `CRON_SECRET` não configurado | `503` — job desativado |
| header ausente ou diferente | `401` |
| canal WhatsApp sem credenciais | `200` com `channelEnabled: false` (dry-run) |

## Teste local

```bash
CRON_SECRET=dev npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/reminders/run
```
