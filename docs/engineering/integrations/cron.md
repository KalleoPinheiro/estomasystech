---
title: "Integração: cron de lembretes"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
---

# Cron de lembretes (`POST /api/reminders/run`)

## Propósito

Um agendador externo (cron do host, Vercel Cron, GitHub Actions…) chama a rota uma vez por dia
para enviar os lembretes por [e-mail](resend.md), empresa a empresa. Domínio: [comunicação](../../domains/comunicacao/README.md).

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

Ou, no formato do Vercel Cron (`vercel.json`, [runbook](../producao.md) § 7):

```http
GET /api/reminders/run
Authorization: Bearer $CRON_SECRET
```

Resposta `200` no envelope `{ success, data }`:

```json
{ "sent": 3, "skipped": 0, "failed": 0, "channelEnabled": true,
  "clinics": [{ "clinicId": "…", "sent": 3, "skipped": 0, "failed": 0 }] }
```

Uma entrada por empresa ativa; clínica suspensa (COM-RN-09) fica de fora, sem entrada. A que falhou
ao ser lida aparece com `error: "<mensagem>"` e contadores zerados, e as demais seguem. O que é enviado a cada execução, em cada clínica (`clinicScope`):

| Tipo | Quem recebe |
| --- | --- |
| `confirmation` | consulta de amanhã (data local no fuso `APP_TIMEZONE`) ainda `scheduled` |
| `recall` | retorno `pending` vencido, em D+1, D+7 e D+30 (teto de 3 tentativas) |

Rodar duas vezes no mesmo dia não duplica: a confirmação é única por (referência, dia) e o recall
por tentativa. "Amanhã", o dia do registro e a data/hora do e-mail usam `APP_TIMEZONE` (padrão
`America/Sao_Paulo`); o app alinha o fuso do processo a esse valor na subida (#205, #206 — na
Vercel `TZ` é reservado e as funções rodam em UTC).

## Modos de falha

| Situação | Resposta |
| --- | --- |
| `CRON_SECRET` não configurado | `503` — job desativado |
| header ausente ou diferente | `401` |
| Resend sem credenciais (fora de produção) | `200` com `channelEnabled: false` (dry-run) |
| falha ao ler uma empresa | `200`; a entrada da empresa traz `error` |

## Teste local

```bash
CRON_SECRET=dev npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/reminders/run
```
