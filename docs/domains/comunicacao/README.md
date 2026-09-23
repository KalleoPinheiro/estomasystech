---
title: "Domínio: Comunicação"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
domain: comunicacao
---

# Comunicação

## Resumo

Mensagens que o sistema envia sozinho: lembretes ao paciente por WhatsApp (confirmação de
consulta e recall de retorno) e e-mails transacionais de acesso (convite e reset, detalhados em
[acesso](../acesso/README.md)).

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Reminder`, `Follow-up`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| COM-RN-01 | Confirmação: consulta de amanhã ainda `scheduled` recebe lembrete | `src/application/reminders/send-reminders.ts` |
| COM-RN-02 | Recall: retorno `pending` vencido recebe lembrete, com link do portal quando `APP_URL` é http(s) | idem |
| COM-RN-03 | Um lembrete por (tipo, referência, dia) — rodar o job de novo não duplica | `src/domain/messaging/reminder-log.ts` |
| COM-RN-04 | Sem credenciais o canal roda em dry-run e o job nunca falha por isso | `NullMessagingGateway` |
| COM-RN-05 | Job só roda com `CRON_SECRET` configurado e enviado no header | `src/app/api/reminders/run/route.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Lembretes de confirmação e recall por WhatsApp | entregue | `POST /api/reminders/run` |
| Templates aprovados da Meta e cadência configurável | especificado | `.specs/features/lembretes-whatsapp-templates-cadencia/` |

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/messaging/` |
| casos de uso | `src/application/reminders/` |
| API | `src/app/api/reminders/run/` |
| gateways | `src/infrastructure/messaging/`, `src/infrastructure/email/` |

## Decisões

- Integrações: [WhatsApp](../../engineering/integrations/whatsapp-meta.md), [cron](../../engineering/integrations/cron.md), [Resend](../../engineering/integrations/resend.md)
