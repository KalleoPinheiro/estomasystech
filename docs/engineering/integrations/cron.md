---
title: "Integração: cron de lembretes"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
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

Na produção (VPS), o `/etc/cron.d/vitta` do host chama a forma acima ([runbook](../producao.md) § 7).
Ou, no formato do Vercel Cron (`vercel.json`, alternativa não adotada — runbook § 2):

```http
GET /api/reminders/run
Authorization: Bearer $CRON_SECRET
```

Resposta `200` no envelope `{ success, data }`:

```json
{ "sent": 3, "skipped": 2, "failed": 0,
  "clinics": [
    { "clinicId": "…", "channel": "configured", "sent": 3, "skipped": 0, "failed": 0 },
    { "clinicId": "…", "channel": "none", "sent": 0, "skipped": 2, "failed": 0 }
  ] }
```

Uma entrada por empresa ativa; clínica suspensa (COM-RN-09) fica de fora, sem entrada. Cada clínica
envia pelo próprio canal de e-mail (ADR-011): `channel: "configured"` quando tem, `"none"` quando não
tem — aí os lembretes dela contam `skipped`. A que falhou ao ser lida aparece com
`error: "<mensagem>"`, contadores zerados e sem `channel`, e as demais seguem. O que é enviado a cada execução, em cada clínica (`clinicScope`):

| Tipo | Quem recebe |
| --- | --- |
| `confirmation` | consulta de amanhã (data local no fuso `APP_TIMEZONE`) ainda `scheduled` |
| `recall` | retorno `pending` vencido, em D+1, D+7 e D+30 (teto de 3 tentativas) |

Na mesma execução, cada clínica ativa também roda o **aviso de prazo dos pedidos do titular** (#312,
PRO-RN-16): os Admins de Empresa recebem um e-mail, pelo canal da clínica, com a contagem dos pedidos
pendentes que vencem em até `DATA_REQUEST_ALERT_DAYS` dias (padrão 3, aceita 1 a 14) ou já venceram
sem aviso; cada pedido é avisado uma vez (`deadline_alerted_at`). Sem canal de e-mail a clínica conta
`skipped` e nada é marcado. O resumo ganha o campo aditivo `dataRequestDeadlines`
(`{ "alerted": 1, "skipped": 0, "failed": 0 }`, somado de todas as empresas).

Rodar duas vezes no mesmo dia não duplica: a confirmação é única por (referência, dia) e o recall
por tentativa. "Amanhã", o dia do registro e a data/hora do e-mail usam `APP_TIMEZONE` (padrão
`America/Sao_Paulo`); o app alinha o fuso do processo a esse valor na subida (#205, #206 — na
Vercel `TZ` é reservado e as funções rodam em UTC).

## Modos de falha

| Situação | Resposta |
| --- | --- |
| `CRON_SECRET` não configurado | `503` — job desativado |
| header ausente ou diferente | `401` |
| clínica sem canal de e-mail | `200`; a entrada da clínica traz `channel: "none"` e os lembretes contam `skipped` (dry-run) |
| falha ao ler uma empresa | `200`; a entrada da empresa traz `error` |

Ao terminar, o job grava a hora em `job_runs` (`job = 'reminders'`): é o que o alerta "lembretes
sem rodar há 26 h" lê ([alertas.md](alertas.md), #212). Falha ao gravar só vai para o log; a
resposta não muda.

## Teste local

```bash
CRON_SECRET=dev npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/reminders/run
```
