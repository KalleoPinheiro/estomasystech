---
title: "Domínio: Comunicação"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
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
| COM-RN-04 | Clínica sem canal de e-mail: os lembretes dela rodam em dry-run (loga só metadados — destinatário mascarado e assunto, nunca o corpo —, não grava log) e nunca falha por isso | `NullEmailGateway` |
| COM-RN-05 | Job só roda com `CRON_SECRET` configurado e enviado no header | `src/app/api/reminders/run/route.ts` |
| COM-RN-06 | Cadência do recall: D+1, D+7 e D+30 após o vencimento (dias no fuso `APP_TIMEZONE`), no máximo 3 tentativas. Retorno que passou de várias marcas recebe só a mais alta; `done`/`cancelled` para a sequência; esgotado, segue `pending` com o selo "3 lembretes sem resposta" | `src/domain/messaging/recall-cadence.ts` |
| COM-RN-07 | Job por empresa: cada clínica é lida com `clinicScope(id)`, o texto leva o nome dela, o log grava o `clinic_id` dela; falha numa empresa não impede as demais | `src/application/reminders/send-reminders.ts` |
| COM-RN-08 | Botão **Enviar WhatsApp** (agenda, consulta `scheduled`; retornos pendentes): registra o clique e abre `wa.me` com o texto que inclui procedimento/motivo. Mostra "enviado hoje às HH:MM" (primeiro clique do dia) para toda a equipe. Telefone do paciente inválido: `400` com o motivo e sem registro de clique ([PRO-RN-18](../pacientes-prontuario/README.md)) | `src/application/reminders/send-whatsapp-reminder.ts`, `src/components/whatsapp-reminder-button.tsx` |
| COM-RN-09 | Clínica suspensa (ACE-RN-27) fica fora do job: o escopo dela nem é aberto, nenhum lembrete sai e ela não aparece no resumo do disparo. Reativada, volta no próximo disparo. O botão Enviar WhatsApp não tem como ser usado: a equipe dela não entra | `src/application/reminders/send-reminders.ts` |
| COM-RN-10 | Canal por clínica: e-mail enviado no escopo de uma clínica (convite e reenvio feitos pela equipe dela) sai **só** pela chave que ela cadastrou (`clinic_channels`, cifrada); sem canal, ou com a chave que não decifra, não sai — nunca pela chave da plataforma. `RESEND_API_KEY`/`EMAIL_FROM` são opcionais e servem ao escopo de sistema (o Super Admin). O job de lembretes envia cada clínica pelo canal dela: sem canal, os lembretes contam `skipped`, sem `reminder_logs`, e o resumo traz `channel: 'none'` na entrada da clínica (`'configured'` com canal); falha de envio conta `failed` sem tentar outro canal. O "esqueci a senha" sai pelo canal da clínica de cada conta (C2, #265) | `src/infrastructure/container.ts` (`emailGatewayFor`), [ADR-011](../../adr/011-canal-de-comunicacao-por-clinica.md) |
| COM-RN-11 | Configuração do canal (C3, #266): só o `company_admin` salva, testa e remove o canal de e-mail da própria clínica em `/configuracoes` (família `administrative`; demais papéis e o `super_admin` recebem `403` e não veem a seção). Provedor: só Resend. Remetente `Nome <a@b.c>` ou `a@b.c`, senão `400`; chave obrigatória no 1º salvamento; salvar de novo com a chave vazia mantém a gravada (e o último teste), com chave nova o último teste volta a nulo. A chave nunca volta por API, log ou trilha: a tela mostra só `••••` + os 4 últimos caracteres | `src/application/clinic/manage-email-channel.ts`, `src/app/api/settings/email-channel/` |
| COM-RN-12 | E-mail de teste do canal: vai para o e-mail da conta logada, pelo canal da clínica, com o assunto `VittaFlow — teste do canal de e-mail` e sem dado de paciente; grava `last_status` (`ok`/`failed`), `last_status_at` e, na recusa do provedor, `last_error` (mensagem do provedor sem o destinatário, até 300 caracteres) — a recusa responde `200`. Sem canal, `409` "Configure o canal antes de testar". No máximo 5 testes por minuto por clínica (`429`) | idem, `POST /api/settings/email-channel/test` |
| COM-RN-13 | Salvar, testar e remover o canal gravam na trilha da clínica `resourceType: 'clinic_channel'` com o id do canal: `create` no 1º salvamento, `update` nos seguintes e no teste (`detail` `test-ok`/`test-failed`), `delete` na remoção. Remover apaga a linha sem decifrar a chave (funciona mesmo com a chave de dados trocada) e o próximo envio da clínica não sai. Dois admins salvando ao mesmo tempo: vence a última escrita | idem |
| COM-RN-14 | Alertas ao operador (#212): `POST /api/alerts/run`, pelo cron a cada 5 min, manda um e-mail por alerta ativo a `ALERT_EMAIL_TO` **pelo canal da plataforma** — readiness falhando, 5xx ≥ `ALERT_5XX_THRESHOLD` em 15 min, lembretes sem rodar há mais de 26 h (`job_runs`), falhas de envio de e-mail ≥ `ALERT_DELIVERY_FAILURE_THRESHOLD` em 15 min. Clínica sem canal não conta como falha. Mesmo alerta ativo no máximo a cada 60 min; sem destinatário ou canal, vira linha de erro no log. O e-mail não leva dado de paciente, conta ou clínica. O job de lembretes grava a hora de cada execução em `job_runs` | `src/application/monitoring/evaluate-alerts.ts`, [`alertas.md`](../../engineering/integrations/alertas.md), [ADR-014](../../adr/014-observabilidade-sem-pii.md) |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Lembretes de confirmação e recall por e-mail, por empresa, com cadência | entregue | `POST /api/reminders/run` |
| Botão Enviar WhatsApp (`wa.me`) e registro do clique | entregue | `POST`/`GET /api/reminders/whatsapp-link` |
| Selo de recall esgotado | entregue | `GET /api/follow-ups` (`recallExhausted`) |
| Canal de e-mail da clínica: salvar, testar e remover (`company_admin`) | entregue | `/configuracoes` · `GET`/`PUT`/`DELETE /api/settings/email-channel`, `POST /api/settings/email-channel/test` |
| Templates aprovados da Meta (opt-in por clínica) | adiado (Later) | `.specs/features/lembretes-whatsapp-templates-cadencia/` |

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/messaging/` |
| casos de uso | `src/application/reminders/`, `src/application/clinic/manage-email-channel.ts` |
| API | `src/app/api/reminders/run/`, `src/app/api/reminders/whatsapp-link/`, `src/app/api/settings/email-channel/` |
| tela | `src/app/(staff)/configuracoes/email-channel-section.tsx` |
| gateways | `src/infrastructure/messaging/`, `src/infrastructure/email/` |

## Decisões

- Integrações: [Resend](../../engineering/integrations/resend.md), [cron](../../engineering/integrations/cron.md), [WhatsApp Meta](../../engineering/integrations/whatsapp-meta.md) (fora do job até o RM-14)
- Custo zero de mensageria: [`.design/lembretes-custo-zero.md`](../../../.design/lembretes-custo-zero.md) e [`.tasks/lembretes-custo-zero.md`](../../../.tasks/lembretes-custo-zero.md)
- Canal por clínica: [`.design/canal-por-clinica.md`](../../../.design/canal-por-clinica.md) e [`.tasks/c3-tela-canal-configuracoes.md`](../../../.tasks/c3-tela-canal-configuracoes.md) (em aberto, com default: limite do teste 5/min por clínica; última escrita vence)
- Em aberto (defaults aplicados): opt-out do recall, remetente por clínica, `.ics`, clique suprimir e-mail, plano Resend — `.tasks/lembretes-custo-zero.md`, Unresolved
