# B4 — Cadastro de clínicas e gestão de admins Verification

**Verdict**: PASS - 37/37 checks proven. C20 is now proven: a `patient` account is seeded and asserted absent. Round-1 findings 2, 3, 5 and 6 are closed. Findings 7 and 8 are carried as notes and do not block. No check contradicts the source design (carried from round 1).
**Profile**: light (AGENTS.md declares no tlc-implement profile)
**Diff range**: feature `7bea366^ (79182ed)..3fb3bbb`; the fix is `cfaece2..3fb3bbb` (it touches only `tests/` and `.checks/`, nothing in `src/` or `e2e/`)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

## Scope of this round

- **Verified at 3fb3bbb:** every Vitest proof in the checklist, re-run in full at the new HEAD. That includes the two C15 proofs the fix added, `com sessão de paciente` and `com sessão de parceiro`. Also verified here: `check:docs`; the re-judgement of C20 and of findings 2, 3, 5 and 6; and refreshed citations in the files the fix touched: `platform-clinics.test.ts`, `platform-clinic-detail.test.ts`, `platform-clinic-admins.test.ts`, `clinic-info-settings.test.ts`, `platform-clinic-overview.test.ts`, `plataforma-clinica.test.tsx`.
- **Carried from 9f791e1/cfaece2:** the source-design contradiction scan, the Swept rows, C34 (`check:sv`; no `src/` or JSX change since then), C35/C36 (E2E; no `src/` or `e2e/` change since then), and the citations in untouched files.
- **Not run under `light`:** step 1 (binding sources, `ui`), the `Coverage` recompute, the `Test policy` verdicts and fault injection (step 4). The checklist has no `Test policy` section.

## Source design (not binding) - contradiction scan · carried from 9f791e1/cfaece2

Round 1 opened `.design/portal-super-admin.md` and read Decisions, Shape › Adds/Changes, Journey 3–6 and Open 1/5. It found no check or Landing row that contradicts the design. The fix changed no check claim: it only added two C15 proof lines that select tests which already existed. So the scan carries.

## Checks

One invocation at 3fb3bbb: `npx vitest run <16 proof files> -t "<alternation of all 46 distinct proof names>" --reporter=verbose` → exit 0, **380 passed, 0 failed**, 374 skipped by the filter. I counted each of the 50 `(file, name)` proof lines against the verbose output, restricted to that file: every one matched ≥1 `✓` line and 0 failure lines. The count per proof is in the "Proof run" column.

| Check | Claim | Proof run (name → ✓ hits) | Evidence (file:line - assertion) | Result |
|---|---|---|---|---|
| C1 | 0043 contact cols + `uq_clinics_cnpj`; dup → 23505; null coexists | "recusa o mesmo CNPJ em duas clínicas" 1✓; "CNPJ nulo não conflita" 1✓ | carried from 9f791e1: `tests/infrastructure/clinic-cnpj-unique-migration.test.ts:37-38` - `code).toBe('23505')`, `message).toContain('uq_clinics_cnpj')`; `:48` - two null-CNPJ rows `toEqual` | PASS |
| C2 | `Clinic.create` requires 4 fields with messages; RT optional | "campos obrigatórios na criação" 4✓ | carried: `tests/domain/clinic.test.ts:176-178` - `.toThrow(message)` over `:169-172`; `:165` - `professionalName).toBeNull()` | PASS |
| C3 | CNPJ canonical form; rejects malformed; create + updateInfo | "normaliza o CNPJ" 4✓; "recusa CNPJ malformado" 4✓ | carried: `tests/domain/clinic.test.ts:190-193` - `.cnpj).toBe(canonical)` for create and updateInfo; `:207-210` - `.toThrow('CNPJ inválido: use 14 caracteres (12 letras ou números e 2 dígitos)')` | PASS |
| C4 | contact e-mail trim+lower, invalid msg; phone trim | "normaliza o contato" 1✓ | carried: `tests/domain/clinic.test.ts:220-221`, `:226-230` - `.toThrow('E-mail de contato inválido')` | PASS |
| C5 | `isRegistrationComplete` only with all 4 | "cadastro completo" 2✓ | carried: `tests/domain/clinic.test.ts:235` `toBe(true)`; `:237`, `:239-241` `toBe(false)` | PASS |
| C6 | repo persists contact on create/edit | "contato" (repo file) 1✓ | carried: `tests/infrastructure/drizzle-clinic-repository.test.ts:134-135`, `:148-149` | PASS |
| C7 | POST → 200 `{clinic, admin}`; account w/o password; invite sent | "cria a clínica e convida o primeiro admin" 1✓ | refreshed: `tests/api/platform-clinics.test.ts:118` - `status).toBe(200)`; `:119` - `json.data.clinic).toEqual({…registrationComplete:true…})`; `:133` - `json.data.admin).toEqual({…role:'company_admin',passwordSet:false…})`; `:149` - `passwordHash).toBe(UNSET_PASSWORD_HASH)`; `:150-152` - 1 e-mail, contains `admin@nova.com`, `/definir-senha\?token=/` | PASS |
| C8 | no invite link; delivered true or false | "criação sem link de convite" 1✓ | refreshed: `platform-clinics.test.ts:170` - `delivered).toBe(false)`; `:172-173` - `200` and `JSON.stringify(json)).not.toMatch(/token\|definir-senha\|https?:/)` for both | PASS |
| C9 | invalid/missing required → 400, no clinic **nor account** | "valida os campos obrigatórios" 10✓ | refreshed: `platform-clinics.test.ts:199` - `status).toBe(400)`; `:201` - `clinicCount()).toBe(before)`; **new** `:202` - `expect(await accountsAnywhere(adminEmail)).toEqual([])` (a `systemScope()` lookup across all clinics, `:95-100`) | PASS (round-1 finding 3 closed for C9; see note N1) |
| C10 | dup CNPJ → 400 msg, nothing created; race → one 200 one 400 | "CNPJ repetido" 1✓; "criações concorrentes" 1✓ | refreshed: `platform-clinics.test.ts:216-218` - `400`, `'Já existe clínica com este CNPJ'`, count unchanged; **new** `:219` - `accountsAnywhere('segunda@x.com')).toEqual([])`; `:232` - `statuses.sort()).toEqual([200, 400])`; `:235` - `clinicCount()).toBe(before + 1)`; 23505 path `:254-256` | PASS |
| C11 | account save fails → clinic rolled back | "falha ao gravar a conta desfaz a clínica" 1✓ | refreshed: `platform-clinics.test.ts:275-278` - `500`, count unchanged, `findByCnpj(cnpj)).toBeNull()` | PASS |
| C12 | e-mail failure → 200 delivered:false, both created | "falha no envio do convite" 1✓ | refreshed: `platform-clinics.test.ts:294-298` - `200`, `delivered).toBe(false)`, `findById(…)).not.toBeNull()`, `findAllByEmail('sem-email@x.com')).toHaveLength(1)` | PASS |
| C13 | audit create/clinic + create/account, super_admin, clinic_id new | "auditoria da criação" 1✓ | refreshed: `platform-clinics.test.ts:313-330` - `arrayContaining([objectContaining({action:'create',resourceType:'clinic',…actorRole:'super_admin',clinicId}), objectContaining({…resourceType:'account'…})])` | PASS |
| C14 | GET list sorted, contract, adminStatus rule, legacy incomplete | "lista as clínicas" 1✓; "estado do admin" 5✓ | refreshed: `platform-clinics.test.ts:350` - `200`; `:352-353` - `names).toEqual([...names].sort(localeCompare 'pt-BR'))`; `:355-364` - row `toEqual({id,name,cnpj,registrationComplete:true,adminStatus:'active',createdAt})`; `:368` - `'pending'`; `:369-372` - legacy `{registrationComplete:false, adminStatus:'none'}`; `tests/application/platform-clinic-overview.test.ts:45` - `expect(adminStatusOf(accounts)).toBe(expected)`, with the reporter now printing "Então none/pending/active" | PASS |
| C15 | every new platform route → 403 to clinic staff and portal | "família negada" 151✓; "com sessão de paciente" 73✓; "com sessão de parceiro" 73✓. The 4 new routes (`platform/clinics`, `[id]`, `[id]/admins`, `[id]/admins/[accountId]`) each appear ✓ under both portal names (verbose lines 251-254, 327-330) | carried citation (file untouched): `tests/api/route-guard-conformance.test.ts:332` - `.toBe(403)` (staff, `:320` "família negada"); `:224` / `:249` - `.toBe(403)` for paciente/parceiro (`:211`, `:236`) | PASS (round-1 finding 4 closed: the proof lines now select the portal half) |
| C16 | GET [id] → DTO; unknown → 404 | "detalhe da clínica" 1✓ | `tests/api/platform-clinic-detail.test.ts:78-79` - `200` + `toEqual({…})`; `:97` - `404` (before the insertion; unchanged) | PASS |
| C17 | partial PATCH; empty name → 400; unknown → 404 | "edita o cadastro" 1✓; "nome vazio" 3✓ | `platform-clinic-detail.test.ts:108-115`, `:122` - `toMatchObject`; `:135` - `404`; `:152` - `400` + unchanged (lines before the insertion at `:161`) | PASS |
| C18 | PATCH other clinic's CNPJ → 400 unchanged; own → 200 | "CNPJ de outra clínica" 1✓ | refreshed: `platform-clinic-detail.test.ts:186-187` - `400`, `'Já existe clínica com este CNPJ'`; `:193` - `same.response.status).toBe(200)` | PASS |
| C19 | PATCH audit update/clinic-info, resourceId = clinic_id = [id], super_admin | "auditoria da edição" 1✓ | refreshed: `platform-clinic-detail.test.ts:205` - `objectContaining({action:'update',resourceType:'clinic-info',resourceId:clinic.id,actorRole:'super_admin',clinicId:clinic.id})` | PASS |
| C20 | GET admins → only company_admin of that clinic; atendente/**paciente**/other-clinic excluded; 404 | "lista só os admins da clínica" 1✓ | re-judged at 3fb3bbb: `tests/api/platform-clinic-admins.test.ts:334-336` seed atendente, **`patient`** (`seedAccount(CLINIC_B_ID, 'lista-paciente@b.com', 'patient')`) and the other clinic's admin; `:340` - `status).toBe(200)`; `:342` - `toContain('lista-admin@b.com')`; `:343` - `not.toContain('lista-atendente@b.com')`; **`:344` - `expect(emails).not.toContain('lista-paciente@b.com')`**; `:345` - `not.toContain('lista-admin-a@a.com')`; `:346-351` - `toEqual({id,email,active:true,passwordSet:true})`; `:354-355` - `404`, `'Clínica não encontrada'`. `'patient'` is a real `UserRole` (`src/domain/auth/user-role.ts:6`) | **PASS** (round-1 finding 1 closed) |
| C21 | incomplete → 400 gate msg, no account; complete → 200 | "cadastro incompleto bloqueia o convite" 1✓ | refreshed: `platform-clinic-admins.test.ts:374-378` - `400`, exact gate message, `accountsWithEmail(…)).toEqual([])`; `:382-383` - `200` + 1 account | PASS |
| C22 | resend pending → 200 delivered, e-mail, no link; disabled → 400 | "reenvia o convite" 1✓ | carried (file untouched): `tests/api/platform-clinic-admin-actions.test.ts:109-120`, `:125-128` | PASS |
| C23 | deactivate → active:false, session_version+1; last active → 400 | "desativa o admin" 1✓; "último admin ativo" 1✓ | carried: `platform-clinic-admin-actions.test.ts:142-150`, `:162-166` | PASS |
| C24 | reactivate → 200 active:true | "reativa o admin" 1✓ | carried: `platform-clinic-admin-actions.test.ts:177-179` | PASS |
| C25 | non-admin targets → 404, no clinic → 404, bad action → 400 | "só admin da clínica" 1✓; "ação inválida" 2✓ | carried: `platform-clinic-admin-actions.test.ts:196-197`, `:203-206`, `:211-212`, `:226-227` | PASS |
| C26 | write-ahead audit per action; audit fails → no change | "auditoria das ações" 3✓; "auditoria falhou" 1✓ | carried: `platform-clinic-admin-actions.test.ts:247-259`, `:283-288` | PASS |
| C27 | POST /api/accounts drops clinicId | "clinicId no corpo é ignorado" 1✓ | carried: `tests/api/accounts-provisioning.test.ts:206`, `:211-216` | PASS |
| C28 | PUT clinic-info contact saved/returned; invalid e-mail 400; other clinic CNPJ 400 | "contato da clínica" 1✓; "CNPJ de outra clínica" 1✓ | `tests/api/clinic-info-settings.test.ts:259-262` - `invalid.status).toBe(400)`, `contactPhone).toBe('11 95555-6666')`, `contactEmail).toBe('recepcao@clinicab.com')`; refreshed: `:295-296` - `400`, `'Já existe clínica com este CNPJ'` | PASS |
| C29 | PUT clinic-info atendente → 403 | "Dado papel atendente, Quando tentar salvar" 1✓ | `clinic-info-settings.test.ts:176` - `expect(response.status).toBe(403)` | PASS |
| C30 | /plataforma table, labels, link; empty; error | "lista as clínicas" 1✓; "sem clínicas" 1✓; "erro ao listar" 1✓ | carried (file untouched): `tests/pages/plataforma.test.tsx:108`, `:110-124`, `:137`, `:149-151` | PASS |
| C31 | /nova sends 7 fields → detail; error shown | "cria e abre o detalhe" 1✓; "mostra o erro" 1✓ | carried: `tests/pages/plataforma-nova-clinica.test.tsx:58`, `:61-71`, `:90-93` | PASS |
| C32 | detail edit/admins/invite/resend only pending/confirm deactivate/reactivate/not found | "edita o cadastro" 1✓; "ações dos admins" 1✓; "clínica inexistente" 1✓ | refreshed: `tests/pages/plataforma-clinica.test.tsx:101-106` - PATCH url + body; `:122-124` - no `Reenviar convite` on the active row; **new** `:128-130` - `within(inactiveRow).queryByRole('button',{name:'Reenviar convite'})).toBeNull()`; `:135-139` - resend PATCH on the pending row; `:148` - still 1 PATCH before confirm; `:151-155` - deactivate after confirm; `:164-165` - reactivate; `:178-182` - POST `/admins`; `:193-194` - alert `'Clínica não encontrada'` | PASS (round-1 finding 6 closed) |
| C33 | Settings shows/sends contact | "contato da clínica" (staff-operations) 1✓ | carried: `tests/pages/staff-operations.test.tsx:415`, `:428-431` | PASS |
| C34 | still-void adoption | carried from 9f791e1: `npm run check:sv` exit 0 | the fix touches no `src/` or JSX | PASS (carried) |
| C35 | E2E create via UI | carried from 9f791e1: 1 passed, exit 0 | carried: `e2e/plataforma.spec.ts:39-47` | PASS (carried; the fix touches no `src/` or `e2e/`) |
| C36 | E2E dev + prod with legacy-clinic completed first | carried from 9f791e1: dev 229 passed; build + prod 33 passed | carried: `e2e/global-setup.ts:437` before `:439` | PASS (carried) |
| C37 | acesso docs + CONTEXT + check:docs | "cadastro de clínicas" 1✓; `npm run check:docs` at 3fb3bbb → "OK (0 aviso(s))", exit 0 | carried (file untouched): `tests/docs/super-admin-docs.test.ts:134-144` | PASS |

**Level gaps:** none. C7–C29 each have a proof that calls the route handler (carried; the fix only added handler-level assertions).

## Round-1 findings, re-judged at 3fb3bbb

| # | Round-1 finding | Status | Evidence |
|---|---|---|---|
| 1 | C20: no `paciente` seeded | **closed** | `tests/api/platform-clinic-admins.test.ts:335` seeds `'patient'`; `:344` - `expect(emails).not.toContain('lista-paciente@b.com')` |
| 2 | Landing "Editar não obriga cadastro completo" has no route-level test | **closed** | PATCH: `tests/api/platform-clinic-detail.test.ts:161-175` sends `{contactEmail:null, contactPhone:''}` and asserts `status).toBe(200)` and `toMatchObject({contactEmail:null, contactPhone:null, registrationComplete:false})` (ran ✓, verbose line 374). PUT: `tests/api/clinic-info-settings.test.ts:264-270` - `put({contactEmail:null})` → `cleared.status).toBe(200)`, `contactEmail).toBeNull()`, phone kept. Residual (not blocking): the PUT side exercises only `null`, not `''`, and does not assert the registration state. Still no check *claims* this Landing row. |
| 3 | C9/C10 "nem conta" asserted only via clinic count | **closed** | `tests/api/platform-clinics.test.ts:202` and `:219` - `accountsAnywhere(…)).toEqual([])` over `systemScope()` (`:95-100`). See N1 |
| 4 | C15 proof lines didn't select portal tests | **closed** (checklist change) | the new proof lines select 73✓ each, including the 4 new routes |
| 5 | overview test name printed `[object Object]` | **closed** | `tests/application/platform-clinic-overview.test.ts:18-41` reorders the tuple to `[label, expected, accounts]`; `:43-45`; the reporter now prints "Então none" / "Então pending" / "Então active" |
| 6 | C32: inactive row not asserted to lack `Reenviar convite` | **closed** | `tests/pages/plataforma-clinica.test.tsx:128-130` |
| 7 | lookups outside `handleRequest` in `[accountId]` route | **carried, not changed** - author: same pattern as the B1 route on `main` | carried from 9f791e1: `src/app/api/platform/clinics/[id]/admins/[accountId]/route.ts` (no `src/` change in the fix) |
| 8 | truncated `.next/dev/types/validator.ts` after a dev E2E run | **carried, environment** | carried from 9f791e1; untracked/gitignored, not a source defect |

## Swept rows resolving to existing behaviour · carried from 9f791e1/cfaece2

Round 1 found all four present: idempotency (C22 via `IssueAuthToken.replaceUnused`), concurrency (B1 C20 tests), data lifecycle (`deactivate()` keeps the account) and authorization (C29). The fix touches no `src/`.

## Findings (ranked, none blocking)

1. **N1 - Precision, C9 (new, minor):** in the two rows `adminEmail ausente` / `adminEmail inválido` (`tests/api/platform-clinics.test.ts:186-187`), the spread `{ adminEmail, ...overrides }` (`:196`) replaces the generated address. The new `accountsAnywhere(adminEmail)` check at `:202` then looks up an address that was never sent, so it holds trivially for those two rows. The other 8 rows are meaningful. The structural guarantee is unchanged: the account is written only inside the clinic transaction.
2. **Residual of finding 2 (minor):** `PUT /api/settings/clinic-info` clearing is proven only for `contactEmail: null` (`clinic-info-settings.test.ts:264-270`). `''` and the "Cadastro incompleto" state after a clear are not asserted on that route. The PATCH route covers both.
3. **Finding 7 (carried, not changed by the author):** in `src/app/api/platform/clinics/[id]/admins/[accountId]/route.ts`, `getRepositories` and the `findById`/`find` lookups run outside `handleRequest`, so a DB error there escapes the envelope. The author says this matches the B1 route on `main`.
4. **Finding 8 (carried, environment):** a dev-server E2E run can leave `.next/dev/types/validator.ts` truncated, and the next build then fails its type check. The file is untracked, so this is not a source defect.

## Gate

- `npx vitest run <16 proof files> -t "<46-name alternation>" --reporter=verbose` at 3fb3bbb - 380 passed, 0 failed, exit 0; all 50 proof lines matched ≥1 ✓ in their own file
- `npm run check:docs` at 3fb3bbb - OK (0 aviso(s)), exit 0
- `npm run check:sv` - carried from 9f791e1 (exit 0)
- E2E dev (229 passed) and build + prod (33 passed) - carried from 9f791e1 (the fix touches no `src/` or `e2e/`)
- `npm run test:coverage` - AUTHOR-REPORTED in round 1, not re-run (the fix adds assertions only)
