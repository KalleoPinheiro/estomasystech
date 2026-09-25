# Lembretes ao paciente sem custo de mensageria

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, budget 150k.

Sources:

- [`.tasks/lembretes-custo-zero.md`](../.tasks/lembretes-custo-zero.md) - registro de decisão: critérios 1–25, Decided 1–2, Unresolved 1–8 (defaults aplicados, nada decidido aqui)
- [`.design/lembretes-custo-zero.md`](../.design/lembretes-custo-zero.md) - Journey, Shape (`reminderContent`, `whatsappLink`, rota `whatsapp-link`), Open 1–5
- [`.specs/features/lembretes-whatsapp-templates-cadencia/spec.md`](../.specs/features/lembretes-whatsapp-templates-cadencia/spec.md) - N2/N3 e entregas 2–3 reaproveitadas
- Sem design de tela vinculante: o botão entra nas telas existentes, sem mock

## Out of scope

- Templates da Meta (RM-14 entrega 1) - Later; `MetaWhatsAppGateway`/`MessagingGateway` ficam no código, fora do job
- Push/PWA, webhook de entrada do WhatsApp, webhook de bounce do Resend - task, Out of scope
- Filtro "sem resposta", remetente por clínica, opt-out, `.ics` - task, Out of scope / Unresolved 3–5
- Trava contra duas execuções simultâneas do job - task, Swept (cron único e diário)

## Landing

Toca `src/domain/messaging` (conteúdo, link, log), `src/application/reminders` (job por empresa + cadência + registro do clique),
repositórios de `reminder_logs`, `follow_ups` e `clinics`, as rotas `reminders/run`, `reminders/whatsapp-link` e `follow-ups`,
e as telas `agenda/appointment-detail.tsx` e `(staff)/page.tsx`. Reaproveita `EmailGateway`/`NullEmailGateway`,
`normalizeBrazilianPhone` (movido para o domínio), `requireStaffSession`, `writeScope`, `clinicScope`, `useToast`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Esquema de `reminder_logs` (task, Decided 1) | migração `0037`: `channel text not null default 'email'`; `attempt integer not null default 1`; backfill `attempt = row_number() over (partition by reference_id order by sent_on)` para `kind='recall'`; `drop index uq_reminder_logs_daily`; `uq_reminder_logs_daily (kind, reference_id, channel, sent_on) where not (kind='recall' and channel='email')`; `uq_reminder_logs_recall_attempt (kind, reference_id, channel, attempt) where kind='recall' and channel='email'` | índice único `(kind, reference_id, channel, attempt)` para tudo - consulta remarcada mantém o id e nunca receberia o D-1 da nova data (task) |
| Valores de canal (task, Decided 2) | `REMINDER_CHANNELS = ['email', 'whatsapp_link']`, texto em `reminder_logs.channel` | `'whatsapp'` - colide com o canal automático da Meta no RM-14 |
| Listagem de empresas | `ClinicRepository.findAll(): Promise<Clinic[]>`; `reminders/run` usa `systemScope()` só para `clinics.findAll()` e `clinicScope(id)` para todo o resto; allowlist reduzida a "listar empresas para o cron" | ler a lista de empresas direto no route com `db.select` - fura a camada de repositório que toda rota usa |
| Leitura sem `MAX_ROWS` para o job | `FollowUpRepository.findPendingDueBefore(date)`: sem `limit`, sempre com filtro de empresa | paginar por cursor - contrato novo de cursor para um conjunto limitado aos retornos pendentes de uma empresa; `findAll` segue com `MAX_ROWS` para as telas |
| `DrizzleReminderLogRepository.save` sem empresa | lança `Error` quando `clinicId === null`, como `DrizzleFollowUpRepository.save`; `LEGACY_CLINIC_ID` sai do arquivo | manter o fallback legado - é exatamente o N3 |
| "enviado hoje às HH:MM" lido pela tela | `GET /api/reminders/whatsapp-link?kind=<kind>&referenceIds=<id,id>` → `{ [referenceId]: sentAt ISO }` (só ids com clique hoje, na empresa da sessão) | campo no `AppointmentDto` - obrigaria a listagem de consultas (e o resumo do dashboard) a juntar `reminder_logs`; a rota nova fica ao lado do POST e serve as duas telas |
| Selo de recall esgotado | `FollowUpDto.recallExhausted: boolean`, calculado em `GET /api/follow-ups` via `ReminderLogRepository.exhaustedRecalls(ids)` | coluna em `follow_ups` - task proíbe (migração única) |
| Link montado no servidor | `POST` devolve `{ url, sentAt }`; `patientPhone` não entra nos DTOs | montar no cliente - exporia o telefone em toda listagem |
| Texto de fallback da confirmação (critério 3) | "Entre em contato com a clínica em caso de dúvida." no lugar do link do portal | reusar "…para agendar." do recall - não faz sentido para consulta já marcada |

- Nada mais aqui é difícil de reverter

## Checks

Proofs rodam com `npx vitest run <arquivo> -t "<nome>"`. O nome entre aspas é o título do `it`.

### S1 - E-mail automático (conteúdo, falha, dry-run) · 8 files · 30 KB · ~8k

**C1** - Confirmação D-1: e-mail para `patient.email` com primeiro nome, `dd/mm/aaaa`, `HH:MM`, nome da clínica e `<APP_URL>/portal`, sem procedimento
Proof: `tests/application/send-reminders.test.ts` › "C1 confirmação por e-mail traz nome, data, hora, clínica e portal, sem procedimento"

**C2** - Confirmação grava `reminder_log` `kind='confirmation'`, `channel='email'`, `attempt=1`, `clinic_id` da consulta
Proof: `tests/application/send-reminders.test.ts` › "C2 confirmação grava log de e-mail tentativa 1"
Proof: `tests/infrastructure/drizzle-reminder-log.test.ts` › "C2 save grava channel, attempt e clinic_id da empresa"

**C3** - Recall por e-mail: primeiro nome, data prevista `dd/mm/aaaa`, nome da clínica, chamada do portal, sem o motivo; log `kind='recall'`, `channel='email'`, `attempt` da tentativa
Proof: `tests/application/send-reminders.test.ts` › "C3 recall por e-mail traz nome, data, clínica e portal, sem motivo"

**C4** - `APP_URL` ausente ou sem http(s): nenhum link, orientação de fallback, na confirmação e no recall
Proof: `tests/domain/reminder-content.test.ts` › "C4 sem portal a confirmação e o recall usam a orientação de contato"
Proof: `tests/application/send-reminders.test.ts` › "C4 APP_URL sem esquema não gera link"

**C5** - Paciente inativo: nenhum e-mail, `skipped`
Proof: `tests/application/send-reminders.test.ts` › "C5 paciente inativo é pulado"

**C6** - Resend lança: `failed` para aquele paciente, nenhum log, o resto do lote segue
Proof: `tests/application/send-reminders.test.ts` › "C6 falha de envio conta failed, não grava log e o lote segue"

**C7** - Sem credenciais (fora de produção): nenhum envio, conteúdo logado, `skipped`, nenhum log, 200 com `channelEnabled: false`
Proof: `tests/application/send-reminders.test.ts` › "C7 dry-run loga, pula e não grava log"
Proof: `tests/api/reminders-routes.test.ts` › "C7 run sem Resend responde 200 com channelEnabled false"

### S2 - Job por empresa · 6 files · 20 KB · ~5k

**C8** - Empresas A e B: e-mail de B traz o nome de B, log com `clinic_id` de B, resposta com uma entrada por empresa (`clinicId`, `sent`, `skipped`, `failed`)
Proof: `tests/api/reminders-routes.test.ts` › "C8 run separa por empresa"

**C9** - Erro ao ler uma empresa não impede as demais
Proof: `tests/application/send-reminders.test.ts` › "C9 falha de uma empresa não impede as demais"

**C10** - Falha de empresa no resumo: entrada com `error: <mensagem>` e contadores zerados (Unresolved 8, default)
Proof: `tests/application/send-reminders.test.ts` › "C9 falha de uma empresa não impede as demais"

**C11** - 501 retornos vencidos com tentativa cabível → 501 e-mails (sem `MAX_ROWS`)
Proof: `tests/application/send-reminders.test.ts` › "C11 501 retornos geram 501 e-mails"
Proof: `tests/infrastructure/drizzle-reminder-log.test.ts` › "C11 findPendingDueBefore devolve os 501 sem corte"

### S3 - Cadência do recall · 5 files · 16 KB · ~4k

**C12** - Execução diária de D+0 a D+31: e-mails exatamente em D+1 (1), D+7 (2), D+30 (3), total 3
Proof: `tests/application/send-reminders.test.ts` › "C12 cadência D+1, D+7, D+30"

**C13** - Após `attempt=3`, nunca mais recall por e-mail; retorno segue `pending`
Proof: `tests/application/send-reminders.test.ts` › "C13 após a 3ª tentativa não envia mais"

**C14** - Retorno vencido há 60 dias sem log: uma única tentativa `attempt=3`; 1 e 2 nunca saem depois
Proof: `tests/application/send-reminders.test.ts` › "C14 envia só a tentativa mais alta cabível"

**C15** - Retorno `done`/`cancelled` entre tentativas: nenhuma tentativa seguinte
Proof: `tests/application/send-reminders.test.ts` › "C15 retorno resolvido não recebe próxima tentativa"

**C16** - Duas execuções no mesmo dia: nenhum segundo e-mail de confirmação nem de recall
Proof: `tests/application/send-reminders.test.ts` › "C16 segunda execução do dia não reenvia"

**C17** - 23:30 em `America/Sao_Paulo`: `sent_on` e "amanhã" usam a mesma data local, sem dobra nem pulo na virada
Proof: `tests/application/send-reminders.test.ts` › "C17 virada 23:30 em São Paulo usa a data local"
Proof: `tests/domain/reminder-log.test.ts` › "C17 dateKey usa a data local do fuso TZ"

**C18** - Índice parcial: recall por e-mail é único por tentativa; confirmação e `whatsapp_link` únicos por dia; consulta remarcada recebe D-1 em outro dia
Proof: `tests/infrastructure/drizzle-reminder-log.test.ts` › "C18 índices únicos parciais"
Proof: `tests/infrastructure/drizzle-reminder-log.test.ts` › "C18 backfill numera tentativas do recall existente"

### S4 - Botão Enviar WhatsApp · 10 files · 90 KB · ~23k

**C19** - Detalhe da consulta `scheduled` mostra **Enviar WhatsApp**; `confirmed`, `completed`, `cancelled`, `no_show` não
Proof: `tests/pages/whatsapp-link-ui.test.tsx` › "C19 botão só aparece para consulta scheduled"

**C20** - Clique na consulta abre `https://wa.me/55<dígitos>?text=<urlencoded>` em nova aba com primeiro nome, procedimento, data, hora e clínica
Proof: `tests/api/reminders-routes.test.ts` › "C20 link de confirmação traz procedimento, data, hora e clínica"
Proof: `tests/pages/whatsapp-link-ui.test.tsx` › "C20 clique abre o wa.me em nova aba"

**C21** - Clique na consulta grava `reminder_log` `kind='confirmation'`, `channel='whatsapp_link'`, `clinic_id` da sessão
Proof: `tests/api/reminders-routes.test.ts` › "C21 clique grava log whatsapp_link na empresa da sessão"

**C22** - Retornos pendentes: cada linha tem o botão; texto de recall com primeiro nome, motivo, data prevista, clínica e portal; log `kind='recall'`, `channel='whatsapp_link'`
Proof: `tests/pages/whatsapp-link-ui.test.tsx` › "C22 cada retorno pendente tem o botão"
Proof: `tests/api/reminders-routes.test.ts` › "C22 link de recall traz motivo, data, clínica e portal"

**C23** - Clique registrado hoje: qualquer usuário vê "enviado hoje às HH:MM" (primeiro clique, fuso `TZ`) e o botão segue clicável
Proof: `tests/api/reminders-routes.test.ts` › "C23 GET devolve o horário do primeiro clique do dia"
Proof: `tests/pages/whatsapp-link-ui.test.tsx` › "C23 mostra enviado hoje às HH:MM e segue clicável"

**C24** - Segundo clique no dia: `wa.me` abre de novo, um único log `whatsapp_link` para a referência no dia
Proof: `tests/api/reminders-routes.test.ts` › "C24 segundo clique devolve o link e mantém um registro"

**C25** - Dois POST simultâneos: um único registro
Proof: `tests/api/reminders-routes.test.ts` › "C25 POSTs concorrentes deixam um registro"

**C26** - Clique `whatsapp_link` hoje não impede o e-mail automático da mesma referência
Proof: `tests/application/send-reminders.test.ts` › "C26 clique de WhatsApp não suprime o e-mail"

**C27** - `POST /api/reminders/whatsapp-link`: 401 sem sessão
Proof: `tests/api/reminders-routes.test.ts` › "C27 401 sem sessão"

**C28** - 403 para sessão de paciente e de parceiro
Proof: `tests/api/reminders-routes.test.ts` › "C28 403 para paciente e parceiro"

**C29** - 400 com corpo fora de `{ kind: 'confirmation'|'recall', referenceId }`
Proof: `tests/api/reminders-routes.test.ts` › "C29 400 com corpo inválido"

**C30** - 404 quando a referência não existe na empresa da sessão, inclusive existindo em outra
Proof: `tests/api/reminders-routes.test.ts` › "C30 404 para referência de outra empresa"

**C31** - POST falha: `wa.me` não abre e aparece toast `danger` com a mensagem da API
Proof: `tests/pages/whatsapp-link-ui.test.tsx` › "C31 falha do POST mostra toast danger e não abre o link"

### S5 - Selo de recall esgotado · 4 files · 16 KB · ~4k

**C32** - Retorno com recall por e-mail `attempt ≥ 3` mostra "3 lembretes sem resposta"; 0, 1 ou 2 tentativas não mostram
Proof: `tests/api/reminders-routes.test.ts` › "C32 follow-ups marca recallExhausted só com a 3ª tentativa"
Proof: `tests/pages/whatsapp-link-ui.test.tsx` › "C32 selo aparece só no retorno esgotado"

**C33** - Cliques `whatsapp_link` não contam para o selo
Proof: `tests/api/reminders-routes.test.ts` › "C33 cliques de WhatsApp não esgotam o recall"

## Swept

- validation: C29; e-mail malformado recusado pelo Resend cai em C6
- failure modes: C6, C9, C10, C31
- idempotency and retry: C16, C24
- authorization: C27, C28, C30; existing `requireStaffSession` + `writeScope`
- concurrency and ordering: C25; job concorrente consigo mesmo - n/a (task, Swept)
- data lifecycle: n/a - `reminder_logs` guarda só ids, tipo, canal, tentativa e data
- external-dependency failure: C6; teto de 100/dia do Resend aparece como `failed` (Unresolved 7)
- state transitions: C12, C13, C14, C15, C32
- observability: C8 (resumo por empresa); adoção = contagem de `channel='whatsapp_link'` (C21, C22)

## Handoff

S1–S5 somam ~44k (wc -c/4 dos arquivos tocados, ~176 KB), todo o lote cabe em 150k: um único agente de build, sem handoff. O Verifier roda sobre `8d9e4c6..HEAD` com todos os checks.
