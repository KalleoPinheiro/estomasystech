---
title: "Domínio: Comunicação"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
domain: comunicacao
---

# Comunicação

## Resumo

Mensagens ao paciente sem custo de mensageria para a clínica: lembretes automáticos por e-mail
(confirmação de consulta e recall de retorno, pelo Resend), o botão **Enviar WhatsApp** da
recepção (link `wa.me` com a mensagem pronta, enviada do WhatsApp da própria clínica) e os
e-mails transacionais de acesso (convite e reset, detalhados em [acesso](../acesso/README.md)).

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Reminder`, `Follow-up`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| COM-RN-01 | Confirmação: consulta de amanhã (data local no fuso `APP_TIMEZONE`; data e hora do e-mail também nesse fuso — #205) ainda `scheduled` recebe e-mail com data, hora, nome da clínica e link do portal — sem procedimento | `src/application/reminders/send-reminders.ts` |
| COM-RN-02 | Recall: retorno `pending` vencido recebe e-mail com a data prevista, a clínica e o link do portal — sem o motivo. Sem `APP_URL` http(s), confirmação e recall trocam o link pela orientação de contato com a clínica | idem, `src/application/reminders/portal-url.ts` |
| COM-RN-03 | Confirmação por e-mail e clique `whatsapp_link`: um por (tipo, referência, canal, dia). Recall por e-mail: um por tentativa. Os canais são independentes — o clique não suprime o e-mail | `src/domain/messaging/reminder-log.ts`, índices de `reminder_logs` |
| COM-RN-04 | Sem `RESEND_API_KEY`/`EMAIL_FROM` fora de produção, o job roda em dry-run (loga só metadados — destinatário mascarado e assunto, nunca o corpo —, não grava log) e nunca falha por isso | `NullEmailGateway` |
| COM-RN-05 | Job só roda com `CRON_SECRET` configurado e enviado no header | `src/app/api/reminders/run/route.ts` |
| COM-RN-06 | Cadência do recall: D+1, D+7 e D+30 após o vencimento (dias no fuso `APP_TIMEZONE`), no máximo 3 tentativas. Retorno que passou de várias marcas recebe só a mais alta; `done`/`cancelled` para a sequência; esgotado, segue `pending` com o selo "3 lembretes sem resposta" | `src/domain/messaging/recall-cadence.ts` |
| COM-RN-07 | Job por empresa: cada clínica é lida com `clinicScope(id)`, o texto leva o nome dela, o log grava o `clinic_id` dela; falha numa empresa não impede as demais | `src/application/reminders/send-reminders.ts` |
| COM-RN-08 | Botão **Enviar WhatsApp** (agenda, consulta `scheduled`; retornos pendentes): registra o clique e abre `wa.me` com o texto que inclui procedimento/motivo. Mostra "enviado hoje às HH:MM" (primeiro clique do dia) para toda a equipe | `src/application/reminders/send-whatsapp-reminder.ts`, `src/components/whatsapp-reminder-button.tsx` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Lembretes de confirmação e recall por e-mail, por empresa, com cadência | entregue | `POST /api/reminders/run` |
| Botão Enviar WhatsApp (`wa.me`) e registro do clique | entregue | `POST`/`GET /api/reminders/whatsapp-link` |
| Selo de recall esgotado | entregue | `GET /api/follow-ups` (`recallExhausted`) |
| Templates aprovados da Meta (opt-in por clínica) | adiado (Later) | `.specs/features/lembretes-whatsapp-templates-cadencia/` |

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/messaging/` |
| casos de uso | `src/application/reminders/` |
| API | `src/app/api/reminders/run/`, `src/app/api/reminders/whatsapp-link/` |
| gateways | `src/infrastructure/messaging/`, `src/infrastructure/email/` |

## Decisões

- Integrações: [Resend](../../engineering/integrations/resend.md), [cron](../../engineering/integrations/cron.md), [WhatsApp Meta](../../engineering/integrations/whatsapp-meta.md) (fora do job até o RM-14)
- Custo zero de mensageria: [`.design/lembretes-custo-zero.md`](../../../.design/lembretes-custo-zero.md) e [`.tasks/lembretes-custo-zero.md`](../../../.tasks/lembretes-custo-zero.md)
- Em aberto (defaults aplicados): opt-out do recall, remetente por clínica, `.ics`, clique suprimir e-mail, plano Resend — `.tasks/lembretes-custo-zero.md`, Unresolved
