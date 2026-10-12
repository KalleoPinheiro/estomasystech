---
title: "Integração: cron de alertas ao operador"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
---

# Cron de alertas (`POST /api/alerts/run`)

## Propósito

O cron do host chama a rota a cada 5 minutos; ela avalia quatro sinais e manda um e-mail por
alerta ativo ao operador da plataforma, pelo canal da plataforma
([ADR-011](../../adr/011-canal-de-comunicacao-por-clinica.md), [ADR-014](../../adr/014-observabilidade-sem-pii.md)).
O canal não depende do banco: banco fora do ar ainda vira alerta. Decisão do dono na
[#212](https://github.com/KalleoPinheiro/vitta-flow/issues/212).

| Campo | Valor |
| --- | --- |
| Direção | **entrada** (cron) e saída (e-mail via [Resend](resend.md)) |
| Obrigatória? | sim em produção |
| Rota | `src/app/api/alerts/run/route.ts` |
| Caso de uso | `src/application/monitoring/evaluate-alerts.ts` |

## Credenciais

| Credencial | Obrigatória | Nota |
| --- | --- | --- |
| `CRON_SECRET` | para a rota existir | o mesmo dos lembretes e da retenção |
| `ALERT_EMAIL_TO` | sim, para o e-mail sair | destinatário único |
| `RESEND_API_KEY` / `EMAIL_FROM` | sim, para o e-mail sair | canal da plataforma |
| `ALERT_5XX_THRESHOLD` | não | padrão `10` em 15 min |
| `ALERT_DELIVERY_FAILURE_THRESHOLD` | não | padrão `3` em 15 min |

## Alertas

| Alerta (`key`) | Ativo quando | Fonte |
| --- | --- | --- |
| `readiness` | `/api/health/ready` falharia (banco fora, ou migração pendente) | a mesma checagem da rota |
| `server-errors` | erros 500 em 15 min ≥ `ALERT_5XX_THRESHOLD` | `handleRequest` (500) e `onRequestError` |
| `reminders-stale` | última execução dos lembretes há mais de 26 h, ou nenhuma | tabela `job_runs` (a migração `0051` grava a hora dela) |
| `delivery-failures` | falhas de envio de e-mail em 15 min ≥ `ALERT_DELIVERY_FAILURE_THRESHOLD` | convite/reset (`IssueAuthToken`) e lembretes |

"Falha de envio" é recusa ou erro do provedor. Clínica sem canal (`delivered: false` por falta
de credencial, lembrete `skipped`) é configuração, não falha, e não conta.

Mesmo alerta ativo não sai de novo antes de 60 min. Contadores e esse intervalo ficam em memória
(uma réplica, #206): reiniciar o app zera os dois.

## Contrato

```http
POST /api/alerts/run
x-cron-secret: $CRON_SECRET
```

(ou `GET` com `Authorization: Bearer $CRON_SECRET`). Resposta `200`:

```json
{ "channel": "configured",
  "checks": [
    { "key": "readiness", "firing": false, "detail": "banco: ok; migrações: ok", "notified": false },
    { "key": "server-errors", "firing": true, "detail": "12 nos últimos 15 min (limiar 10)", "notified": true },
    { "key": "reminders-stale", "firing": false, "detail": "última execução em 2026-10-12T11:00:02.114Z (limite 26 h)", "notified": false },
    { "key": "delivery-failures", "firing": false, "detail": "0 nos últimos 15 min (limiar 3)", "notified": false }
  ] }
```

O e-mail leva só o nome do alerta, a medida, o limiar, `APP_URL` e a hora — nenhum dado de
paciente, conta ou clínica.

## Modos de falha

| Situação | Resposta |
| --- | --- |
| `CRON_SECRET` não configurado | `503` |
| header ausente ou diferente | `401` |
| sem `ALERT_EMAIL_TO` ou sem canal da plataforma | `200` com `channel: "none"`; cada alerta ativo vira linha `error` no log (e evento no GlitchTip) |
| envio do e-mail falhou | `200`, `notified: false`; tenta de novo na próxima execução |
| app fora do ar | o `curl -f` do cron falha e o `MAILTO` do host avisa ([runbook](../producao.md) § 7) |

## Teste local

```bash
CRON_SECRET=dev ALERT_EMAIL_TO=voce@exemplo.com npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/alerts/run
```
