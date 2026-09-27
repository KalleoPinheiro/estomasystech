# B5 — Suspensão e reativação de clínica Verification

**Verdict**: FAIL - 28/29 checks proven. C4's proof line (`-t "revoga todas as sessões da clínica"`) matches no test: vitest exits 0 with 2 skipped and 0 run. The test it points at exists and passes when run without the filter. Its name says "revogar", not "revoga". The fix is a one-word change to the proof line in the checklist, or to the test name. Every other proof ran green at HEAD and asserts the value the checklist states. No check contradicts the source design.
**Profile**: light (AGENTS.md declares no tlc-implement profile)
**Diff range**: `9a6319f..c04faa9` (feature base on main → HEAD)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Scope

- **Verified at c04faa9:** every Vitest proof, run in one invocation. Also run here: `check:sv`, `check:docs`, and the two B5 E2E specs on the dev config. The Swept rows that resolve to existing behaviour were re-read against the code.
- **Not run under `light`:** step 1 (binding sources, `ui`), the `Coverage` recompute, the `Test policy` verdicts and fault injection (step 4). The checklist has no `Test policy` section.
- **AUTHOR-REPORTED:** the full E2E suites (C28: dev 231 passed, prod 34 passed at c04faa9), the prod-config half of C26, and `npm run test:coverage` (4091 passed, 96.48% statements, 91.49% branches). I did not re-run any of these.

## Source design (not binding) - contradiction scan

I opened `.design/portal-super-admin.md` and read these parts:

- Decisions "Estado da clínica" (l.176) and "Efeito da suspensão" (l.177)
- Shape › Adds (l.107, 113, 116, 118) and Changes (l.127-129)
- Journey 7 and 8 (l.43-44)
- Open 2 (l.191)

**Contradictions: none.** What matches:

- **Columns and values.** They match C1 and the Landing row "Estado no banco". The added `CHECK` is recorded as an alternative the author rejected, and it narrows nothing the design allows.
- **Routes.** `POST .../suspend` and `.../reactivate` match "Contrato das rotas".
- **Use cases.** `SuspendClinic` and `ReactivateClinic` exist in `src/application/platform/change-clinic-status.ts:30,57`.
- **Login denied, revocation and reminders.** These match C13–C21.
- **Accounts affected.** "vale para equipe, paciente e parceiro" is covered by C13 (all five roles).
- **Journey 8 "com novo login".** Covered by C18.
- **Open 2 messages.** Both match C13/C14 exactly: the staff message, and the same message followed by the clinic contact for the portal.
- **Screens.** "Estado na lista" matches C22, and "suspender/reativar" in the detail matches C23/C24.
- **Timing.** The Landing's "em até 1 minuto" agrees with the design's "≤ 60 s".

## Checks

One invocation at c04faa9:

`npx vitest run <13 proof files> -t "<alternation of all 30 distinct proof names>" --reporter=verbose`

- Result: exit 0, **341 passed, 0 failed**, 316 skipped by the filter.
- I counted each of the 30 `(file, name)` proof lines against the verbose `✓` lines of that file. 29 matched at least one `✓` and none matched a failure line.
- **C4 matched 0.** Both tests in `drizzle-user-account-revoke-all.test.ts` show as `↓` (skipped). I re-ran C4's proof exactly as written, `npx vitest run tests/infrastructure/drizzle-user-account-revoke-all.test.ts -t "revoga todas as sessões da clínica"`: "Test Files 1 skipped, Tests 2 skipped", exit 0. The same file without a filter: 2 passed.

| Check | Claim | Proof run (name → ✓ hits) | Evidence (file:line - assertion) | Result |
|---|---|---|---|---|
| C1 | 0044: `status` default active not null, change cols; existing = active; `'outro'` → `clinics_status_check` | "estado da clínica no banco" 1✓ | `tests/infrastructure/clinic-status-migration.test.ts:30-33` - `rows.rows).toEqual([{status:'active',status_changed_at:null,status_changed_by:null} ×2])` (new row plus `legacy-clinic`); `:41-42` - `code).toBe('23514')`, `message).toContain('clinics_status_check')`. SQL: `drizzle/0044_clinic-status.sql:3-6` | PASS |
| C2 | `create` active w/o by/at; suspend/reactivate set by/at; `isSuspended`; `updateInfo` keeps state | "estado da clínica" 2✓ | `tests/domain/clinic.test.ts:257-260` - `status).toBe('active')`, `isSuspended).toBe(false)`, `statusChangedAt/By).toBeNull()`; `:264-267` - `'suspended'`, `true`, `toEqual(at)`, `'root@vitta.com'`; `:271-272` - `edited.status).toBe('suspended')`; `:276-279` - `'active'`, `false`, `toEqual(later)`, `'outro@vitta.com'` | PASS |
| C3 | `saveStatus` writes only state (a stale `update` does not undo it); `findById`/`findAll` return it | "estado" 1✓ | `tests/infrastructure/drizzle-clinic-repository.test.ts:160-161` - `saveStatus(suspend)` then `update(clinic.updateInfo(...))` from the stale instance; `:165-168` - `status).toBe('suspended')`, `statusChangedAt).toEqual(at)`, by, `city).toBe('Recife')`; `:172` - findAll `status).toBe('suspended')` | PASS |
| C4 | `revokeAllSessions()` +1 for all of the clinic, none of other | **"revoga todas as sessões da clínica" 0 hits (both tests `↓`)** | The test exists but the proof does not select it: `tests/infrastructure/drizzle-user-account-revoke-all.test.ts:50` is named "...Quando **revogar** todas as sessões da clínica A...". Its assertions are right: `:58` `toBe(1)`, `:59` `toBe(2)` (the pre-revoked account also gets +1), `:60` other clinic `toBe(0)`. They pass only when run unfiltered (2 passed). The atomic `sql\`session_version + 1\`` scoped by `eq(userAccounts.clinicId, this.clinicId)` is in `drizzle-foundation-repositories.ts:215-223` | **FAIL** - proof line matches nothing (finding 1) |
| C5 | suspend → 200, `suspended`, ISO at, by = super_admin e-mail; all clinic accounts +1, other clinic untouched | "suspende a clínica" 1✓ | `tests/api/platform-clinic-status.test.ts:113` - `status).toBe(200)`; `:114-118` - `toMatchObject({id, status:'suspended', statusChangedBy: OPERATOR})`; `:119-121` - `Date.parse(statusChangedAt)` between `before` and now; `:122-123` - admin and patient `toBe(1)`; `:124` - outsider `toBe(0)` | PASS |
| C6 | reactivate → 200 `active`, by/at updated, versions unchanged | "reativa a clínica" 1✓ | `platform-clinic-status.test.ts:136` - `200`; `:137-140` - `toMatchObject({status:'active', statusChangedBy: OPERATOR})`; `:141-145` - reactivated at `toBeGreaterThanOrEqual(suspended at)`; `:146` - version `toBe(1)` (only the suspension's +1) | PASS (precision note, finding 2) |
| C7 | repeat → 200, same at, no new audit, no version bump | "repetir é idempotente" 1✓ | `platform-clinic-status.test.ts:154-157` - reactivate while active: `200`, `'active'`, `statusChangedAt).toBeNull()`, 0 events; `:162-168` - second suspend `200`, `statusChangedAt).toBe(first...)`, `toHaveLength(1)` event, version `toBe(1)` | PASS |
| C8 | unknown → 404 `Clínica não encontrada` on both routes | "clínica inexistente" 2✓ (suspend, reactivate) | `platform-clinic-status.test.ts:176-177` - `status).toBe(404)`, `error).toBe('Clínica não encontrada')`, `it.each(['suspend','reactivate'])` at `:171` | PASS |
| C9 | write-ahead `update/clinic-status`, detail suspend/reactivate, resourceId = clinic_id, super_admin; audit fails → 500, nothing changes | "auditoria da suspensão" 1✓; "auditoria falhou" 1✓ | `platform-clinic-status.test.ts:188` - 2 events; `:190-202` - `objectContaining({action:'update', resourceType:'clinic-status', resourceId:clinicId, detail, actorRole:'super_admin', actorId:OPERATOR, clinicId})` for each detail; `:222-223` - both `toBe(500)`; `:225-227` - state `'active'`/`'suspended'` kept, version `toBe(0)` | PASS |
| C10 | GET list has `status`; GET detail has status/at/by | "estado na lista e no detalhe" 1✓ | `platform-clinic-status.test.ts:243-244` - `statusOf(clinicId)).toBe('suspended')`, `statusOf(activeId)).toBe('active')`; `:258-262` - `toMatchObject({status:'suspended', statusChangedBy:OPERATOR})`, `statusChangedAt).toEqual(expect.any(String))` | PASS |
| C11 | suspended: invite/resend → 400 msg, no account, no e-mail; deactivate/reactivate admin → 200; PATCH → 200 | "clínica suspensa na gestão de admins" 1✓ | `platform-clinic-status.test.ts:284-289` - `400`, `error).toBe(SUSPENDED_INVITE)` (`:23-24`, the exact Landing text), `findByEmail(...)).toBeNull()`; `:305-309` - resend `400`, same message, `emails.bodies).toHaveLength(0)`; `:311-312` - deactivate/reactivate `toBe(200)`; `:325-327` - PATCH `200`, `toMatchObject({city:'Recife', status:'suspended'})` | PASS (finding 6) |
| C12 | new routes 403 to staff and portal | "família negada" 157✓; "com sessão de paciente" 75✓; "com sessão de parceiro" 75✓. `api/platform/clinics/[id]/suspend/route.ts` and `.../reactivate/route.ts` each appear ✓ under company_admin/atendente/profissional (família negada), paciente and parceiro | `tests/api/route-guard-conformance.test.ts:332` - `.toBe(403)` (staff); `:224` / `:249` - `.toBe(403)` (patient/partner). The file is not in the diff, but it discovers routes with `readdirSync` (`:46-52`), so the new routes are swept automatically | PASS |
| C13 | suspended: staff roles → 403 staff msg, no cookie; patient/partner → 403 with phone+e-mail; wrong password → 401 | "equipe de clínica suspensa" 3✓; "portal de clínica suspensa" 3✓ (the name also matches the "sem contato" test); "senha errada não revela" 1✓ | `tests/api/login-clinic-suspended.test.ts:120-122` - `403`, `error).toBe(STAFF_MESSAGE)` (`:16-17`), `cookie).toBeNull()` for company_admin/atendente/profissional (`:111`); `:135-137` - `403`, `error).toBe(PORTAL_MESSAGE)` (`:18-19`, "telefone 11 3333-4444, e-mail contato@suspensa.test."), cookie null, for patient and partner (`:126`); `:148-149` - `401`, `'Email ou senha incorretos'` | PASS |
| C14 | portal without contact → staff message | "sem contato" 1✓ | `login-clinic-suspended.test.ts:159-160` - `403`, `error).toBe(STAFF_MESSAGE)` | PASS (finding 3) |
| C15 | same e-mail in active and suspended clinic → 200, cookie for the active clinic | "e-mail em clínica ativa e suspensa" 1✓ | `login-clinic-suspended.test.ts:173` - `200`; `:178` - `session?.clinicId).toBe(active.id)` | PASS |
| C16 | denied login audited `read/session` `clinic_suspended` in the account's clinic | "auditoria do login negado" 1✓ | `login-clinic-suspended.test.ts:189-200` - `objectContaining({action:'read', resourceType:'session', detail:'clinic_suspended', actorRole:'atendente', actorId:account.email, clinicId:clinic.id})` | PASS |
| C17 | after reactivating, login → 200 | "reativada entra de novo" 1✓ | `login-clinic-suspended.test.ts:207` - `403` while suspended; `:212-213` - `200`, `cookie).not.toBeNull()` | PASS |
| C18 | proxy: staff and patient cookies → 401 right after suspend (same process); still 401 after reactivate; new login → 200 | "suspensão da clínica revoga" 1✓ | `tests/api/session-revocation.test.ts` (block at `:277`): before, both `toBe(200)`; after `platformAction('suspend')`, with **no** cache clear, `proxyStatus(staffCookie)).toBe(401)` and portal `toBe(401)`; after reactivate, both old cookies `toBe(401)`; new logins `toBe(200)` for staff and `/api/portal/me` | PASS (finding 4) |
| C19 | lookup alone: clinic suspended (no version bump) → revoked; active → valid | "estado da clínica na consulta" 1✓ | `session-revocation.test.ts` (block at `:300`): after `saveStatus(suspend)` + cache clear, `proxyStatus(cookie)).toBe(401)` and `versionOf(...)).toBe(0)`; after reactivate, `toBe(200)`. Code: `src/lib/auth/staff-revocation.ts:65` - `isActive: account.isActive && !clinic?.isSuspended` | PASS |
| C20 | `SendReminders`: suspended clinic → no `servicesFor`, no send, not in summary; active sends | "ignora clínica suspensa" 1✓ | `tests/application/send-reminders.test.ts:377-381` - `servicesFor).toHaveBeenCalledTimes(1)`, `toHaveBeenCalledWith('clinic-a')`, `sent.map(to)).toEqual(['maria@example.com'])`, `summary.clinics.map(clinicId)).toEqual(['clinic-a'])`, `summary.sent).toBe(1)` | PASS |
| C21 | `POST /api/reminders/run`: suspended → no e-mail, not in `clinics`; reactivated → processed, e-mail sent | "clínica suspensa com consulta amanhã" 1✓ | `tests/api/reminders-run-suspended.test.ts:85-88` - `clinics...).not.toContain(CLINIC_ID)`, `bodies.some(startsWith(PATIENT_EMAIL))).toBe(false)`; `:92-95` - `toContain(CLINIC_ID)`, `...).toBe(true)` | PASS |
| C22 | `/plataforma` column `Situação` with `Ativa`/`Suspensa` | "situação da clínica" 1✓ | `tests/pages/plataforma.test.tsx:183` - `getByRole('columnheader', {name:'Situação'})`; `:185` - `within(activeRow).getByText('Ativa')`; `:186` - `within(suspendedRow).getByText('Suspensa')` | PASS |
| C23 | active detail: `Suspender clínica` opens the confirm with the Landing title and description; POST only after `Suspender` | "suspende com confirmação" 1✓ | `tests/pages/plataforma-clinica.test.tsx:222` - `'Clínica ativa.'`; `:225` - `'Suspender clínica?'`; `:228` - exact Landing description; `:231` - `POST).toHaveLength(0)` before confirming; `:237` - `'/api/platform/clinics/c1/suspend'` after | PASS |
| C24 | suspended detail: badge, `Suspensa em <data> por <e-mail>.`, reactivate → POST; invite disabled with notice, no resend | "clínica suspensa" 1✓ | `plataforma-clinica.test.tsx:249` - `findByText(\`Suspensa em ${since} por dono@vitta.app.\`)`; `:251` - `getAllByText('Suspensa').length).toBeGreaterThanOrEqual(1)`; `:260` - no `Reenviar convite` on the pending row; `:264` - notice text; `:268` - `Convidar admin` `toBeDisabled()`; `:274` - `'/api/platform/clinics/c1/reactivate'`; `:276` - no `alertdialog` | PASS (finding 5) |
| C25 | `@still-void/ui` adoption | `npm run check:sv` at c04faa9 → "OK — adoção do @still-void/ui v2 completa.", exit 0 | - | PASS |
| C26 | via the UI: suspend and reactivate a clinic created in the test; list shows `Suspensa` then `Ativa` (both configs) | dev: `NODE_USE_ENV_PROXY=1 npx playwright test -c playwright.local.config.ts plataforma-suspensao plataforma` at c04faa9 → 9 passed, including `plataforma.spec.ts:51 › suspende e reativa pela tela` ✓. prod: AUTHOR-REPORTED (the spec is in `playwright.prod.config.ts:29` testMatch) | `e2e/plataforma.spec.ts` (test at `:51`): `getByRole('alertdialog').getByRole('button',{name:'Suspender'})`; `getByText(/^Suspensa em .+ por /)` visible; `Convidar admin` `toBeDisabled()`; list row `getByText('Suspensa')` visible; after `Reativar clínica`, `'Clínica ativa.'`; list row `getByText('Ativa', {exact:true})` visible | PASS (prod half author-reported) |
| C27 | admin of a suspended clinic sees the staff message at login; after reactivation, logs in (dev) | same run: `plataforma-suspensao.spec.ts:21` ✓ (10.5s) | `e2e/plataforma-suspensao.spec.ts:54` - `getByRole('alert').filter({hasText:STAFF_MESSAGE})).toHaveText(STAFF_MESSAGE)`; `:55` - URL `/login`; `:59` - `heading 'Dashboard'` visible after reactivating | PASS |
| C28 | full E2E suites green on both configs | AUTHOR-REPORTED: dev 231 passed, prod 34 passed at c04faa9. Not re-run; commits after the E2E run touch only docs | - | AUTHOR-REPORTED |
| C29 | acesso README (routes, messages, ≤ 60 s, invite blocked); comunicação (no reminders); CONTEXT "Clínica suspensa"; `check:docs` | "suspensão de clínica" 1✓; `npm run check:docs` → "OK (0 aviso(s))", exit 0 | `tests/docs/super-admin-docs.test.ts:154` - `toContain('POST /api/platform/clinics/[id]/suspend')`; `:155-157` - staff message; `:158` - `'≤ 60 s'`; `:159-161` - invite message; `:163` - `toMatch(/\| COM-RN-09 \| Clínica suspensa/)`; `:164` - `'**Clínica suspensa**'` | PASS (finding 7) |

**Level gaps:** none.

- C5–C11 and C13–C17 each have a proof that calls the route handler.
- C18/C19 go through the proxy.
- C21 goes through the cron route.
- C26/C27 go through the browser.

## Swept rows resolving to existing behaviour (re-read at c04faa9)

- **Failure modes: a failed transaction undoes the state and the versions.** Present. `SuspendClinic` runs `saveStatus` and `revokeAllSessions` inside `clinicProvisioning.run` (`src/application/platform/change-clinic-status.ts:42-48`). The Drizzle implementation is `this.db.transaction(...)` (`src/infrastructure/persistence/drizzle/drizzle-clinic-provisioning.ts:17`).
- **Concurrency: atomic version increment.** Present. `sql\`${userAccounts.sessionVersion} + 1\`` (`drizzle-foundation-repositories.ts:219-221`).
- **Data lifecycle: pending tokens are preserved.** Present. The diff does not touch `set-password`, `forgot-password` or any token repository.
- **Dependency failure: revocation stays fail-open with a log.** Present. `staff-revocation.ts:119-122` - `logError('Revogação de sessão: falha ao consultar conta — fail-open (AD-004)', …)`.

## Findings (ranked)

1. **C4 - the proof line matches no test (blocking).** `-t "revoga todas as sessões da clínica"` selects nothing, and vitest exits 0 with "2 skipped". The intended test at `tests/infrastructure/drizzle-user-account-revoke-all.test.ts:50` is named "...Quando **revogar** todas as sessões...". Its assertions (`:58-60`) are correct and pass unfiltered. Fix: change the proof to `-t "revogar todas as sessões da clínica"`, or rename the test. Until then, C4's declared proof is green without running anything.
2. **C6 precision (minor).** "`statusChangedAt/By` atualizados" is asserted with `toBeGreaterThanOrEqual(suspended at)` (`platform-clinic-status.test.ts:141-145`) and with the same `OPERATOR` that suspended (`:139`). A reactivation that left `status_changed_*` untouched would still pass at the route level. The domain test C2 (`clinic.test.ts:278-279`, a distinct actor and a distinct time) does catch it.
3. **Landing row "Login negado" is only partly proven (minor, no check claims it).** "Só as partes preenchidas" - the message with only a phone, or only an e-mail - has no test. The branch is at `src/application/auth/suspended-clinic-message.ts:18-25`. C13 covers both parts, and C14 covers neither.
4. **C18 sampling (minor).** The proxy revocation test covers staff and patient cookies, not partner. The design says the rule applies to equipe, paciente e parceiro. The code is role-agnostic (`staff-revocation.ts:65`), and C13 covers partner at login.
5. **C24 and Landing "Telas" (minor).**
   - The badge assertion is `getAllByText('Suspensa').length >= 1` (`plataforma-clinica.test.tsx:251`). It does not tie the badge to the title.
   - The success toasts `Clínica suspensa` and `Clínica reativada` named in the Landing are asserted by no check.
6. **C11 dead assertion (minor).** `expect(active.isActive).toBe(true)` (`platform-clinic-status.test.ts:313`) reads the in-memory fixture, not stored state, so it cannot fail.
7. **C29 (minor).** The docs test asserts only the `.../suspend` route string. The claim says "rotas", and `.../reactivate` is present in `docs/domains/acesso/README.md:52` but not asserted.
8. **Note, same pattern as B4 finding 7.** In `src/app/api/platform/clinics/[id]/clinic-status-handler.ts:39-42`, `getRepositories` and the 404 `findById` run outside `handleRequest`, so a DB error there escapes the envelope.

## Gate

- `npx vitest run <13 proof files> -t "<30-name alternation>" --reporter=verbose` at c04faa9 - 341 passed, 0 failed, exit 0. 29 of 30 proof lines matched ≥1 ✓ in their own file; **C4's matched 0**.
- `npx vitest run tests/infrastructure/drizzle-user-account-revoke-all.test.ts -t "revoga todas as sessões da clínica"` - 0 run, 2 skipped, exit 0. The same file unfiltered: 2 passed.
- `npm run check:sv` at c04faa9 - OK, exit 0
- `npm run check:docs` at c04faa9 - OK (0 aviso(s)), exit 0
- `NODE_USE_ENV_PROXY=1 npx playwright test -c playwright.local.config.ts plataforma-suspensao plataforma` at c04faa9 (fresh `.next`) - 9 passed, exit 0
- Full E2E dev (231) and build + prod (34) - AUTHOR-REPORTED
- `npm run test:coverage` - AUTHOR-REPORTED (4091 passed, 96.48% statements, 91.49% branches)
