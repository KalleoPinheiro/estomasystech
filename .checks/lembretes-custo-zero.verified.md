# Lembretes ao paciente sem custo de mensageria Verification

**Verdict**: PASS - 33/33 checks proven; the round-1 level gap on C10 is closed
**Profile**: light (AGENTS.md declares no `tlc-implement` profile)
**Diff range**: 8d9e4c6..HEAD (fe0cd59, branch feature/fervent-fermat-e31skh); fix diff f1183a0..fe0cd59
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

## Round 2 scope (verified at fe0cd59)

The fix diff `f1183a0..fe0cd59` touches three files:

- `tests/api/reminders-run-clinic-failure.test.ts` (new)
- `.checks/lembretes-custo-zero.md` (+3 proof lines: C3, C10, C12)
- this report

No production source changed. This round:

- re-ran every proof at fe0cd59 in one batch;
- checked the three added proofs;
- re-judged C10 (LEVEL GAP) and findings 2 and 4, which the fix targets.

Every other citation is carried from f1183a0, because the fix touched none of those files.

## Binding sources (carried from f1183a0)

No binding source. The checklist says "Sem design de tela vinculante"; profile `light` does not run step 1.

## Steps not run under `light` (carried from f1183a0)

- `Coverage` join recompute: not run (light).
- `Test policy` row verdicts: not run (light; the checklist has no `## Test policy` section either).
- Fault injection: not run (light).

## Proof run (verified at fe0cd59)

Round 2 used one invocation at fe0cd59 with the same six files plus `tests/api/reminders-run-clinic-failure.test.ts`, and `-t "^.*C[0-9]+ |Dado fuso de São Paulo, Quando contar dias"`. Result: 7 files passed; 45 passed, 21 skipped. That is the 43 round-1 proofs plus the new C10 route proof and the C12 time-zone proof. Each appears by its own name as passed.

`rg` hits for the new proofs:

- `tests/api/reminders-run-clinic-failure.test.ts:39`: `it('C10 resposta traz a empresa que falhou com error e contadores zerados'`
- `tests/domain/reminder-content.test.ts:120`: `it('Dado fuso de São Paulo, Quando contar dias, Então usa o calendário local'`
- `tests/api/reminders-routes.test.ts:181`: `it('C8 run separa por empresa'` (now also a C3 proof)

Round 1 (f1183a0), for reference:

```
npx vitest run tests/application/send-reminders.test.ts tests/api/reminders-routes.test.ts \
  tests/domain/reminder-content.test.ts tests/domain/reminder-log.test.ts \
  tests/infrastructure/drizzle-reminder-log.test.ts tests/pages/whatsapp-link-ui.test.tsx \
  -t "^.*C[0-9]+ " --reporter=verbose
```

Result: 6 files passed; 43 passed, 22 skipped (the skipped ones are the unnamed Gherkin tests the filter excluded). Every named proof appears in the output by its own name as passed. Each name was also found with `rg -n "it\((\"|'|\`)C[0-9]+ " tests/`: 43 hits, and every proof named in the checklist matches one of them. No name is missing. The C10 proof reuses the C9 test, as the checklist says. Every proof file is in the diff. `send-reminders.test.ts` gains 17 `C*` titles in the diff, `reminder-log.test.ts` gains the C17 title, and the other four files are new.

## Checks (proofs re-run at fe0cd59; citations carried from f1183a0 except C3, C10, C12, refreshed at fe0cd59)

| Check | Claim | Proof run | Evidence file:line + assertion | Result |
|---|---|---|---|---|
| C1 | D-1 e-mail: first name, dd/mm/aaaa, HH:MM, clinic, `<APP_URL>/portal`, no procedure | send-reminders "C1 …" pass | `tests/application/send-reminders.test.ts:122` `expect(message.to).toBe('maria@example.com')`; `:123-124` contains `'Maria'`, not `'Maria da Silva'`; `:125` `'17/07/2026'`; `:126` `'09:30'`; `:127` `'Clínica Alfa'`; `:128` `'https://vitta.example.com/portal'`; `:129-130` `.not.toContain('Troca de bolsa')` (text and subject) | PASS |
| C2 | confirmation log kind/channel/attempt/clinic_id | send-reminders "C2 …" + drizzle "C2 save grava …" pass | `send-reminders.test.ts:140-143` `log.kind` `'confirmation'`, `log.channel` `'email'`, `log.attempt` `1`; `tests/infrastructure/drizzle-reminder-log.test.ts:69-78` `[r.clinicId, r.kind, r.channel, r.attempt, r.sentOn]` toEqual `[CLINIC_B,'recall','email',2,…],[CLINIC_A,'confirmation','whatsapp_link',1,…]`. At the route, `tests/api/reminders-routes.test.ts:237` `byRef.get(appointmentB.id)?.clinicId` toBe `CLINIC_B_ID` | PASS |
| C3 | recall e-mail: name, due date, clinic, portal CTA, no reason; log recall/email/attempt | send-reminders "C3 …" + routes "C8 run separa por empresa" pass | recall log `clinic_id` (round 2): `reminders-routes.test.ts:238` `byRef.get(followUpB.id)?.clinicId` toBe `CLINIC_B_ID`, `:239` `.channel` toBe `'email'`; `send-reminders.test.ts:168` `'15/07/2026'`; `:169` `'Clínica Alfa'`; `:170-172` `'Agende seu retorno no portal: https://vitta.example.com/portal.'`; `:173-174` `.not.toContain('Curativo')` and `.not.toContain('lesão')`; `:176-179` kind `'recall'`, channel `'email'`, attempt `1` | PASS |
| C4 | APP_URL absent or without http(s): no link, fallback, in confirmation and recall | reminder-content "C4 sem portal …" + send-reminders "C4 APP_URL sem esquema …" pass | `tests/domain/reminder-content.test.ts:71-76` confirmation contains `'Entre em contato com a clínica em caso de dúvida.'`, recall contains `'…para agendar.'`, both `.not.toMatch(/https?:\|\/portal/)`; `send-reminders.test.ts:189-193` 2 messages, each `.not.toContain('vitta.example.com')` and `.toContain('Entre em contato com a clínica')`. Absent APP_URL maps to `null` in `src/application/reminders/portal-url.ts:9-10` | PASS |
| C5 | inactive patient: no e-mail, `skipped` | send-reminders "C5 …" pass | `send-reminders.test.ts:214-216` `summary.sent` toBe `0`, `summary.skipped` toBe `2`, `email.sent` toHaveLength `0` | PASS |
| C6 | Resend throws: `failed`, no log, batch continues | send-reminders "C6 …" pass | `send-reminders.test.ts:241-244` `summary.failed` toBe `1`, `summary.sent` toBe `1`, `email.sent.map(m=>m.to)` toEqual `['joao@example.com']`, `reminderLog.items` toHaveLength `1` | PASS |
| C7 | no credentials: nothing sent, content logged, skipped, no log, 200 + `channelEnabled:false` | send-reminders "C7 dry-run …" + routes "C7 run sem Resend …" pass | `reminders-routes.test.ts:170-178` `response.status` toBe `200`, `body.data.channelEnabled` toBe `false`, `fetchSpy` not called, `info` called with `'paula.dry@example.com'`, `logs()` toHaveLength `0`; `send-reminders.test.ts:257-260` | PASS |
| C8 | A/B: B's e-mail names B, log clinic_id B, one entry per clinic | routes "C8 run separa por empresa" pass | `reminders-routes.test.ts:217-228` `entryA` toEqual `{clinicId:CLINIC_A_ID,sent:1,skipped:0,failed:0}`, `entryB` `{…sent:2…}`; `:232` `message.text` contains `'Clínica B (teste)'`; `:237-238` both B logs' `clinicId` toBe `CLINIC_B_ID` | PASS |
| C9 | one clinic's read error doesn't stop others | send-reminders "C9 …" pass | `send-reminders.test.ts:286-296` `summary.clinics` toEqual `[{clinicId:'clinic-broken',…,error:'banco indisponível'},{clinicId:'clinic-a',sent:1,…}]`, `summary.sent` toBe `1` | PASS |
| C10 | failed clinic in summary: `error: <msg>`, zero counters | send-reminders "C9 …" + run-clinic-failure "C10 resposta …" pass (route handler `route.POST`) | `tests/api/reminders-run-clinic-failure.test.ts:53` `response.status` toBe `200`; `:54-60` `body.data.clinics.find(c => c.clinicId === CLINIC_B_ID)` toEqual `{clinicId:CLINIC_B_ID,sent:0,skipped:0,failed:0,error:'banco indisponível para a empresa B'}`; `:62-63` entry A defined and has no `error` property. The failure is injected by mocking `getRepositories` for B's scope (`:12-25`), which is the loader `run/route.ts:34` calls per clinic. Application level: `send-reminders.test.ts:287-293` | PASS (level gap closed at fe0cd59) |
| C11 | 501 due follow-ups send 501 e-mails, no MAX_ROWS | send-reminders "C11 …" + drizzle "C11 findPendingDueBefore …" pass | `send-reminders.test.ts:335-336` `summary.sent` toBe `501`, `email.sent` toHaveLength `501`; `drizzle-reminder-log.test.ts:238-240` `pending` toHaveLength `501`, no other-clinic row, and `findAll` still returns `500` | PASS |
| C12 | daily D+0..D+31 sends on D+1, D+7, D+30 only, 3 total (days in `TZ`) | send-reminders "C12 …" + reminder-content "Dado fuso de São Paulo, Quando contar dias …" pass | `send-reminders.test.ts:354-358` `sentOnDays` toEqual `[1, 7, 30]`, `email.sent` toHaveLength `3`, attempts toEqual `[1, 2, 3]`; `tests/domain/reminder-content.test.ts:121-128` with `TZ=America/Sao_Paulo`, `daysSinceDue(02/06 01:00Z, 02/06 03:30Z)` toBe `1`. This discriminates: under UTC both instants fall on 02/06, giving 0 | PASS |
| C13 | after attempt=3 no more recall; stays `pending` | send-reminders "C13 …" pass | `send-reminders.test.ts:373-376` `email.sent` toHaveLength `0` (D+31, D+60, D+365), status toBe `'pending'` | PASS |
| C14 | 60 days late with no log sends only attempt=3 | send-reminders "C14 …" pass | `send-reminders.test.ts:386-387` `email.sent` toHaveLength `1`, attempts toEqual `[3]` (runs at D+60, 61, 90) | PASS |
| C15 | done/cancelled between attempts: no next attempt | send-reminders "C15 …" pass | `send-reminders.test.ts:402` `email.sent` toHaveLength `2` after D+2..D+31 (was 2 at `:394`) | PASS |
| C16 | two runs same day: no second e-mail | send-reminders "C16 …" pass | `send-reminders.test.ts:412-413` `second.sent` toBe `0`, `email.sent` toHaveLength `2` | PASS |
| C17 | 23:30 São Paulo: `sent_on` and "tomorrow" use the local date | send-reminders "C17 virada …", "C17 às 23:30 …" + reminder-log "C17 dateKey …" pass | `send-reminders.test.ts:425-428` one e-mail, `sentOn` toBe `'2026-07-16'`, text contains `'09:00'` (local); `:438-439` `summary.sent` toBe `1`, `sentOn` `'2026-07-16'`; `tests/domain/reminder-log.test.ts:76` `dateKey(new Date('2026-07-17T02:30:00Z'))` toBe `'2026-07-16'`. The assertions tell the zones apart: under UTC, `:428` would read 12:00 and `:438` would send 0 | PASS |
| C18 | partial unique indexes + backfill | drizzle "C18 índices …", "C18 backfill …" pass | `drizzle-reminder-log.test.ts:114-116` counts: confirmation/email `2` (day1 duplicate rejected, day2 accepted, which is the rescheduled case), recall/whatsapp_link `2`, recall/email `2` (duplicate attempt 1 rejected); `:189-191` backfill attempts toEqual `[1, 2, 3, 1, 1]`; `:183` 3 statements taken from the real `0037` SQL | PASS |
| C19 | button only for `scheduled` | ui "C19 …" pass | `tests/pages/whatsapp-link-ui.test.tsx:121-123` `queryByRole('button',{name:'Enviar WhatsApp'})` not in document for confirmed/completed/cancelled/no_show; `:128-130` present for scheduled | PASS |
| C20 | click opens `wa.me/55<digits>?text=` in a new tab with name, procedure, date, time, clinic | routes "C20 …" + ui "C20 …" pass | `reminders-routes.test.ts:265` url toMatch `/^https:\/\/wa\.me\/5511987654321\?text=/`; `:267-272` contains `'Carla'`, not `'Souza'`, `'Troca de bolsa de colostomia'`, `'03/10/2026'`, `'14:30'`, `'Clínica B (teste)'`; `whatsapp-link-ui.test.tsx:140-141` `openSpy` args `WA_URL`, `'_blank'` | PASS |
| C21 | click logs confirmation/whatsapp_link with the session's clinic_id | routes "C21 …" pass | `reminders-routes.test.ts:290-297` 1 row toMatchObject `{kind:'confirmation',channel:'whatsapp_link',clinicId:CLINIC_B_ID,attempt:1}` | PASS |
| C22 | every pending row has the button; recall text; log recall/whatsapp_link | ui "C22 …" + routes "C22 …" pass | `whatsapp-link-ui.test.tsx:207-209` button in row 1, `:218-227` opens `WA_URL` and POSTs `{kind:'recall',referenceId:'fu-1'}`; `reminders-routes.test.ts:319-323` contains `'Elisa'`, `'Retorno: Curativo de lesão sacral'`, `'01/09/2026'`, `'Clínica B (teste)'`, portal URL; `:326-329` toMatchObject `{kind:'recall',channel:'whatsapp_link'}`. See finding 5 (row 2) | PASS |
| C23 | "enviado hoje às HH:MM" (first click, TZ) for any user; still clickable | routes "C23 GET …" + ui "C23 …" pass | `reminders-routes.test.ts:363-364` status `200`, `body.data` toEqual `{[appointment.id]: first.data.sentAt}` for another staff user of the same clinic; `:372-374` another clinic gets `{}`; `whatsapp-link-ui.test.tsx:159` `'enviado hoje às 09:15'`, `:162` `toBeEnabled()` | PASS |
| C24 | second click reopens, one log | routes "C24 …" pass | `reminders-routes.test.ts:394-397` status `200`, `second.data.url` toBe `first.data.url`, `sentAt` equal, `logs()` toHaveLength `1` | PASS |
| C25 | concurrent POSTs leave one row | routes "C25 …" pass | `reminders-routes.test.ts:417-418` statuses toEqual `[200, 200]`, `logs()` toHaveLength `1`. See finding 3 | PASS |
| C26 | WhatsApp click doesn't suppress e-mail | send-reminders "C26 …" pass | `send-reminders.test.ts:460-461` `summary.sent` toBe `2`, `email.sent` toHaveLength `2` after whatsapp_link logs for both references | PASS |
| C27 | 401 without session | routes "C27 …" pass (route handler) | `reminders-routes.test.ts:427` `response.status` toBe `401` | PASS |
| C28 | 403 for patient and partner | routes "C28 …" pass (route handler) | `reminders-routes.test.ts:436` `response.status` toBe `403` for both roles; `:438` no logs | PASS |
| C29 | 400 for body outside the schema | routes "C29 …" pass (route handler) | `reminders-routes.test.ts:449` status toBe `400` for `{}`, `kind:'whatsapp'`, missing and empty `referenceId` | PASS |
| C30 | 404 for another clinic's or a missing reference | routes "C30 …" pass (route handler) | `reminders-routes.test.ts:476-477` statuses toEqual `[404, 404, 404]` (clinic A appointment, clinic A follow-up, missing id), no logs | PASS |
| C31 | POST fails: no wa.me, `danger` toast with API message | ui "C31 …" pass | `whatsapp-link-ui.test.tsx:181-187` finds `'Consulta não encontrado(a): appt-1'`, `data-variant` toBe `'danger'`, `openSpy` not called | PASS |
| C32 | badge only at attempt >= 3 | routes "C32 …" + ui "C32 …" pass | `reminders-routes.test.ts:530` `[0,1,2,3].map(flag)` toEqual `[false,false,false,true]` via `GET /api/follow-ups`; `whatsapp-link-ui.test.tsx:238-243` `'3 lembretes sem resposta'` in the exhausted row and absent in the other | PASS |
| C33 | whatsapp_link clicks don't count | routes "C33 …" pass | `reminders-routes.test.ts:551-553` `recallExhausted` toBe `false` after 4 whatsapp_link recall logs | PASS |

## Level check (step 3) (verified at fe0cd59)

These checks name a status code, route or response shape and have a proof that calls the route handler: C7 (`runRoute.POST`), C8, C20–C25, C27–C30 (`linkRoute.POST`/`GET`), C23 GET, and C32/C33 (`followUpsRoute.GET`). In round 1 the exception was C10. It now has a route-level proof: `reminders-run-clinic-failure.test.ts:44-60` calls `route.POST` and asserts the HTTP body. No level gaps remain.

## Criteria to checklist faithfulness (step 4) (carried from f1183a0, re-judged for C3/C12)

Every task criterion from 1 to 25 maps to at least one check: 1 to C1/C2, 2 to C3, 3 to C4, 4 to C5, 5 to C6, 6 to C7, 7 to C8, 8 to C9/C10, 9 to C11, 10 to C12, 11 to C13, 12 to C14, 13 to C15, 14 to C16, 15 to C17, 16 to C19, 17 to C20/C21, 18 to C22, 19 to C23, 20 to C24, 21 to C25, 22 to C26, 23 to C27–C30, 24 to C31, 25 to C32/C33. C18 comes from Decided 1. No check contradicts a criterion. In round 2, the C3 and C12 proofs now cover the parts of criteria 2 and 10 that their claims leave out (the recall log's `clinic_id`, and days counted in `TZ`). The claim wording itself is unchanged, but the proofs now reach it.

## Swept (existing) re-read (carried from f1183a0; the fix touched no source)

- authorization, "existing `requireStaffSession` + `writeScope`": holds. `src/app/api/reminders/whatsapp-link/route.ts:56-57` calls `requireStaffSession(request)` and returns early with `guard.response`, and `:62` calls `getRepositories(writeScope(guard.session))`. The GET at `:32` uses `requireStaffSession` and `:41` uses `sessionScope(guard.session)`.
- One-way door "listing clinics": holds. `src/app/api/reminders/run/route.ts:30-31` uses `systemScope()` only for `clinics.findAll()` (and the email gateway), and `:34` gives each clinic `clinicScope(clinicId)`. The allowlist reason in `tests/lib/tenant-scope.test.ts` now reads "listar as empresas para o cron; o job roda com clinicScope de cada uma".
- "external-dependency failure: C6": holds (C6 above).

## Findings / gaps (ranked; re-judged at fe0cd59)

Round 2 status of the round-1 findings:

- **1 (C10 level gap): closed.** Route-level proof at `tests/api/reminders-run-clinic-failure.test.ts:53-63`.
- **2 (C12 time zone): closed.** Named proof at `tests/domain/reminder-content.test.ts:121-128`.
- **4 (C3 clinic_id): closed.** Named proof at `tests/api/reminders-routes.test.ts:238`.
- **3, 5, 6: unchanged, non-blocking notes.** They were not in the fix scope.
- **New note from round 2 (non-blocking):** the C10 route test mocks by the literal `'test-clinic-b'` (`reminders-run-clinic-failure.test.ts:20`), not by the imported `CLINIC_B_ID`. The two values match today (`tests/support/clinics.ts:13`). If the constant is renamed, the mock silently stops matching, and the test then fails at `:54`, so the change would not go unnoticed.

Round 1 findings as written at f1183a0:


1. **Level gap, C10.** The `error: <mensagem>` entry with zeroed counters is part of the `POST /api/reminders/run` response shape (task Surface, Unresolved 8). Its only proof is at the application level, `tests/application/send-reminders.test.ts:286-295`, where it asserts the result of `SendReminders.execute()`. No route-level test makes one clinic fail and asserts the `clinics[]` entry in the HTTP body. The risk is low: `src/app/api/reminders/run/route.ts:27-37` returns the result as is, and C8 proves the route serialises `clinics[]`. Under the protocol it is still a level gap. Fix: a route test where one clinic's repository read throws, asserting that the response body entry equals `{clinicId, sent:0, skipped:0, failed:0, error}`.
2. **Precision/faithfulness, C12.** Criterion 10 says the days are "contados no fuso `TZ`". The C12 claim leaves this out, and its named proof runs only with the suite's TZ=UTC (`send-reminders.test.ts:344-358`). An unnamed test covers it and passes: `tests/domain/reminder-content.test.ts` "Dado fuso de São Paulo, Quando contar dias, Então usa o calendário local". Name it as a C12 proof.
3. **Weak concurrency proof, C25.** `reminders-routes.test.ts:412-418` runs `Promise.all` against PGlite, which has one connection and runs statements one at a time. The test exercises interleaved requests, not truly parallel transactions. Uniqueness at the database level is proven separately by C18 (`drizzle-reminder-log.test.ts:98-116`, the duplicate is rejected by the index through `onConflictDoNothing`), so the claim still holds when both are read together.
4. **Faithfulness, C3.** Criterion 2 also requires the recall log to carry the follow-up's `clinic_id`. The C3 claim and proof leave this out. It is proven elsewhere, at `reminders-routes.test.ts:238` (`byRef.get(followUpB.id)?.clinicId` toBe `CLINIC_B_ID`, C8).
5. **Minor coverage, C22 "cada linha".** The UI proof asserts the button only in row 1 (`whatsapp-link-ui.test.tsx:207-209`). Row 2 is checked only through its "enviado hoje às 10:40" label (`:210-212`). That label comes from the same `WhatsAppReminderButton` component (`src/components/whatsapp-reminder-button.tsx:55-69`), so the button is present by construction, but no assertion checks it.
6. **Minor, C32 ">= 3".** The claim is proven at exactly `attempt = 3`. The cadence caps attempts at 3, so no reachable value is left untested.

## Gate (verified at fe0cd59)

- Named proofs: one `npx vitest run` over 7 files: 45 passed, 0 failed (21 unnamed tests skipped by the filter).
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 (655 files; 1 pre-existing info in `tests/docs/structure.test.ts`).

### Round 1 gate (f1183a0)

- Named proofs: `npx vitest run <6 files> -t "^.*C[0-9]+ " --reporter=verbose`: 43 passed, 0 failed (22 unnamed tests skipped by the filter).
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 (1 info, pre-existing, in `tests/docs/structure.test.ts`: `findIndex` could be `indexOf`).
- Real tree `git status --porcelain` was clean before this report was written.
