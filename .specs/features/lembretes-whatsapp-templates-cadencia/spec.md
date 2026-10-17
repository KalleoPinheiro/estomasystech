# Lembretes por WhatsApp: templates, cadência de recall e escopo por empresa — Plano de ação

- **Status:** ⏸️ Entrega 1 (templates Meta) adiada para Later como opt-in por clínica. Entregas 2
  (cadência) e 3 (por empresa) cobertas pelo canal e-mail em
  [`.tasks/lembretes-custo-zero.md`](../../../.tasks/lembretes-custo-zero.md) (RM-19)
- **Origem:** análise de negócio/arquitetura de 2026-09-22 (achados N1, N2, N3)
- **Nota (#328, 2026-10-17):** `meta-whatsapp-gateway.ts` e `messaging-gateway.ts` foram removidos por não terem consumidor; a Entrega 1 (RM-14) recria a porta e o adapter quando for priorizada. Referência em [`whatsapp-meta.md`](../../../docs/engineering/integrations/whatsapp-meta.md).
- **Arquivos centrais (estado anterior à #328):** `src/application/reminders/send-reminders.ts`,
  `src/infrastructure/messaging/meta-whatsapp-gateway.ts`,
  `src/application/ports/messaging-gateway.ts`, `src/domain/messaging/reminder-log.ts`,
  `src/app/api/reminders/run/route.ts`

## Problema

Três falhas no mesmo fluxo, em ordem de impacto:

1. **N1 — os lembretes provavelmente não são entregues em produção.** O gateway manda
   `type: 'text'` (texto livre). A Meta Cloud API só aceita texto livre dentro da janela de 24 h
   aberta por uma mensagem do paciente; lembrete D-1 e recall são proativos e caem fora dela →
   erro `131047`/`470`. O próprio comentário do gateway já avisa, mas o código nunca foi ajustado.
   Todo envio real conta como `failed` no resumo do job, sem alarme.
2. **N2 — recall sem fim.** A idempotência é **diária** (`ReminderLog.sentOn`,
   `uq_reminder_logs_daily`): um retorno vencido e não resolvido gera um WhatsApp **por dia,
   indefinidamente**. Com N1 corrigido, isso vira spam real (e risco de bloqueio do número pela
   Meta por denúncias). Agravante: `dateKey` usa UTC e a janela "amanhã" usa hora local — cron
   rodando após 21 h (BRT) pode duplicar ou pular o D-1.
3. **N3 — lembretes não são por empresa.** O cron roda em `systemScope()` com um único número
   (`WHATSAPP_*` em env), a mensagem não cita a clínica, todo `ReminderLog` cai na clínica
   legada e as leituras têm teto de `MAX_ROWS = 500` somando **todas** as empresas — lembretes
   somem em silêncio conforme a base cresce. Viola "config em tabela, não em env" (`CONTEXT.md`).

## Decisões pendentes (do negócio — não inventar)

| # | Decisão | Default proposto | Por quê |
|---|---------|------------------|---------|
| D1 | Cadência do recall | D+1, D+7, D+30 após o vencimento; depois para | cobre esquecimento, reforço e última tentativa sem virar spam |
| D2 | O que acontece após a última tentativa | follow-up ganha marcador `recallExhaustedAt` (continua `pending`, some do job, aparece em filtro "sem resposta" na agenda) | não fecha pendência clínica sozinho — decisão fica com a equipe |
| D3 | Templates da Meta | 2 templates `utility` em pt_BR: `lembrete_consulta` (nome, procedimento, data, hora, clínica) e `recall_retorno` (nome, motivo, data prevista, clínica, link) | categoria *utility* tem aprovação mais simples e custo menor que *marketing* |
| D4 | Número de WhatsApp | um por empresa (credenciais em tabela), com fallback para o de env | cada clínica fala com o paciente com o próprio nome/número |

Se D3 ainda não existir no Business Manager, a entrega 1 segue com nomes configuráveis e o texto
sugerido documentado aqui para submissão.

## Plano de ação

Entregas independentes, cada uma um PR, nesta ordem (a 1 destrava valor sozinha):

### Entrega 1 — Templates (N1)

- Port: `MessagingGateway` ganha `sendTemplate(phone, { name, language, params })`; `sendText`
  continua para respostas dentro da janela (uso futuro com webhook).
- `MetaWhatsAppGateway.sendTemplate` → `type: 'template'`, `components[].parameters` como
  `text`. Erro da API continua lançando (resumo conta `failed`).
- `SendReminders` monta **parâmetros**, não texto: `ReminderKind → { template, params }`.
  Mensagem legível continua existindo só para o dry-run do `NullMessagingGateway`.
- Nome/idioma dos templates via config (tabela na entrega 3; env temporário
  `WHATSAPP_TEMPLATE_CONFIRMATION`/`WHATSAPP_TEMPLATE_RECALL` até lá).
- **Testes:** payload exato enviado à Graph API (mock de `fetch`); dry-run inalterado; falha de
  template conta `failed` sem abortar o lote.

### Entrega 2 — Cadência do recall (N2)

- Domínio: `recallAttemptsDue(dueDate, now, cadence)` puro → qual tentativa (1, 2, 3) cabe hoje,
  ou nenhuma. Idempotência muda de "por dia" para **"por tentativa"**:
  `ReminderLog` ganha `attempt` e índice único `(kind, reference_id, attempt)`.
- Migração: `reminder_logs.attempt int not null default 1` + troca do índice único; backfill dos
  registros existentes de recall como tentativa 1 (conservador: nunca reenvia algo já enviado).
- Após a última tentativa: marca `recallExhaustedAt` no follow-up (D2) e o job ignora.
- `dateKey` passa a usar o fuso configurado (`TZ`), igual à janela D-1 — corrige o
  duplicar/pular perto da meia-noite.
- **Testes:** tabela de dias (D+0…D+31) → tentativas esperadas; reexecução no mesmo dia não
  reenvia; follow-up agendado entre tentativas encerra a sequência.

### Entrega 3 — Por empresa (N3)

- O job itera `clinics.findAll()` e roda `SendReminders` com `clinicScope(clinic.id)` — remove
  `reminders/run` da allowlist de `systemScope` em `tests/lib/tenant-scope.test.ts`.
- Credenciais e nomes de template por empresa (tabela `clinic_messaging_settings`, token cifrado
  como `google_accounts`); sem linha → fallback para env (D4). Tela em Configurações fica para
  depois (escopo de UI).
- Nome da clínica entra como parâmetro dos templates.
- Leitura sem teto silencioso: paginar `findInRange`/follow-ups vencidos em vez de `MAX_ROWS`.
- Falha de uma empresa não aborta as outras; resumo passa a ser por empresa.
- **Testes:** isolamento (lembrete da clínica B nunca sai pelo número/nome da A), 501+ retornos
  vencidos são todos processados.

### Fora do escopo (backlog)

- Webhook de entrada (botões "Confirmar"/"Remarcar" no template → confirma a consulta sem
  portal). Depende da entrega 1 e de URL pública verificada na Meta. Maior alavanca contra
  falta, mas é feature nova.
- Opt-out do paciente ("PARAR") — exigência de política da Meta; entra junto com o webhook.

## Critérios de pronto (plano inteiro)

- Nenhum envio proativo usa `type: 'text'`.
- Um retorno vencido recebe no máximo N mensagens (N = tamanho da cadência D1).
- `reminders/run` não usa mais `systemScope()`.
- Gate completo verde (`typecheck`, `lint`, `check:sv`, `test:coverage` ≥ 90%, e2e).
