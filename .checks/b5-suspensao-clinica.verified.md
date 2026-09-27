# B5 — Suspensão e reativação de clínica Verification

**Verdict**: PASS - 29/29 checks proven. C4's proof now selects the test it names: 1 ✓ in `drizzle-user-account-revoke-all.test.ts`, and its assertions are unchanged. Round-1 minor findings 2, 3, 5, 6 and 7 are closed by new or stronger assertions. The fix weakens no assertion. Findings 4 and 8 are carried as notes and do not block. No check contradicts the source design (carried from round 1).
**Profile**: light (AGENTS.md declares no tlc-implement profile)
**Diff range**: feature `9a6319f..7b85b63`; the fix is `c04faa9..7b85b63` (it touches only `tests/` and `.checks/`, nothing in `src/` or `e2e/`)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

## Scope

- **Verified at 7b85b63:** every Vitest proof, re-run in full in one invocation. Also verified here: `check:docs`, and the fix diff read line by line for weakened assertions.
- **Carried from c04faa9:** `check:sv` (C25), the dev-config B5 E2E specs (C26, C27), the source-design contradiction scan and the Swept re-read. The fix changes nothing in `src/` or `e2e/` (`git diff --stat c04faa9..7b85b63 -- src e2e` is empty), so none of these can have moved.
- **AUTHOR-REPORTED, carried:** full E2E dev (231) and build + prod (34) (C28), the prod half of C26, and `npm run test:coverage` (4091 passed, 96.48% statements, 91.49% branches). The fix adds assertions and one test file, and changes no code under coverage.
- **Not run under `light`:** step 1, the `Coverage` recompute, the `Test policy` verdicts and fault injection.

## Checks (verified at 7b85b63)

One invocation:

`npx vitest run <14 files: the 13 proof files + tests/application/suspended-clinic-message.test.ts> -t "<alternation of all 30 proof names + the 2 new test names>" --reporter=verbose`

- Result: exit 0, **346 passed, 0 failed**, 315 skipped by the filter. There are 0 `×` lines. A grep for `×` also hits the describe name "6 papéis × família", which is not a failure.
- I counted each `(file, name)` proof against the `✓` lines of **its own file**. All 30 proof lines matched ≥1 ✓.

| Check | Proof name → ✓ hits in own file | Result |
|---|---|---|
| C1 | "estado da clínica no banco" 1 | PASS (citations carried, file untouched) |
| C2 | "estado da clínica" 2 | PASS (carried) |
| C3 | "estado" 1 | PASS (carried) |
| **C4** | **"Quando revogar todas as sessões da clínica A" 1** - `✓ ... Dadas contas em duas clínicas, Quando revogar todas as sessões da clínica A, Então só as contas de A sobem a versão` | **PASS** - `tests/infrastructure/drizzle-user-account-revoke-all.test.ts:58` `versionOf('rv-a', a1.id)).toBe(1)`, `:59` `toBe(2)` (the pre-revoked account also gets +1), `:60` other clinic `toBe(0)` |
| C5 | "suspende a clínica" 1 | PASS (lines above the fix's first hunk are unchanged) |
| C6 | "reativa a clínica" 1 | PASS - see re-judged table |
| C7 | "repetir é idempotente" 1 | PASS (assertions unchanged; lines shifted by +7) |
| C8 | "clínica inexistente" 2 | PASS |
| C9 | "auditoria da suspensão" 1; "auditoria falhou" 1 | PASS |
| C10 | "estado na lista e no detalhe" 1 | PASS |
| C11 | "clínica suspensa na gestão de admins" 1 | PASS - see re-judged table |
| C12 | "família negada" 157; "com sessão de paciente" 75; "com sessão de parceiro" 75 | PASS (file untouched) |
| C13 | "equipe de clínica suspensa" 3; "portal de clínica suspensa" 3; "senha errada não revela" 1 | PASS (file untouched) |
| C14 | "sem contato" 1 | PASS |
| C15 | "e-mail em clínica ativa e suspensa" 1 | PASS |
| C16 | "auditoria do login negado" 1 | PASS |
| C17 | "reativada entra de novo" 1 | PASS |
| C18 | "suspensão da clínica revoga" 1 | PASS (file untouched) |
| C19 | "estado da clínica na consulta" 1 | PASS |
| C20 | "ignora clínica suspensa" 1 | PASS (file untouched) |
| C21 | "clínica suspensa com consulta amanhã" 1 | PASS (file untouched) |
| C22 | "situação da clínica" 1 | PASS (file untouched) |
| C23 | "suspende com confirmação" 1 | PASS - plus the new toast assertion (below) |
| C24 | "clínica suspensa" 1 | PASS - see re-judged table |
| C25 | `npm run check:sv` | PASS - carried from c04faa9 |
| C26 | `e2e/plataforma.spec.ts -g "suspende e reativa pela tela"` | PASS - dev carried from c04faa9; prod half AUTHOR-REPORTED |
| C27 | `e2e/plataforma-suspensao.spec.ts -g "login de clínica suspensa"` | PASS - carried from c04faa9 |
| C28 | full E2E, both configs | AUTHOR-REPORTED, carried (no `src/`/`e2e/` change) |
| C29 | "suspensão de clínica" 1; `npm run check:docs` OK (0 aviso(s)), exit 0 | PASS - see re-judged table |

The new file `tests/application/suspended-clinic-message.test.ts` is not a proof line, but it ran in the same invocation: 4 ✓ (3 `it.each` rows plus the staff row).

## Round-1 findings re-judged

| # | Round-1 finding | Fix (c04faa9..7b85b63) | Evidence at 7b85b63 | Verdict |
|---|---|---|---|---|
| 1 | C4 proof matched no test (blocking) | Proof line changed to `-t "Quando revogar todas as sessões da clínica A"`. The check text is unchanged and the test file is untouched | 1 ✓ in its own file (quoted above). The second test in the file ("Dado repositório sem clínica...") stays `↓`. It is not part of the claim | **Closed** |
| 2 | C6: `at` `>=` and same operator, so an untouched `status_changed_*` would pass | Reactivates with a different super_admin, and requires a strictly later time | `tests/api/platform-clinic-status.test.ts:142` - `cookieHeaderFor('super_admin', 'recuperado@vitta.app', null)`; `:148` - `statusChangedBy: 'recuperado@vitta.app'`; `:150` - `Date.parse(json.data.statusChangedAt)).toBeGreaterThan(Date.parse(suspended...statusChangedAt))`. A 5 ms wait at `:137` keeps `>` from being flaky | **Closed** |
| 3 | Landing "só as partes preenchidas" (only a phone, or only an e-mail) had no test | New unit test | `tests/application/suspended-clinic-message.test.ts:9-12` - phone only → `'... Fale com o responsável pela clínica: telefone 11 3333-4444.'`; `:14-17` - e-mail only → `'...: e-mail c@x.com.'`; `:24` - `suspendedClinicMessage('partner', clinic)).toBe(expected)`; `:31-37` - staff with both contacts → `SUSPENDED_CLINIC_MESSAGE`. Expected values are literal at the assertion | **Closed** (it exercises only `partner`; `patient` takes the same branch at login, C13) |
| 4 | C18 samples staff and patient cookies, not partner | None - kept, with a reason in § Handoff | Code is role-agnostic (`staff-revocation.ts:65`, carried); C13 covers partner at login | **Carried as note** (accepted, non-blocking) |
| 5 | C24 badge not tied to the title; the toasts in the Landing were unasserted | Badge scoped to the title's container; both toasts asserted | `tests/pages/plataforma-clinica.test.tsx:252-254` - `getByRole('heading', {level:1, name:'Clínica Um'})`, then `within(title.parentElement).getByText('Suspensa')`; `:239` - `findByText('Clínica suspensa')` after suspending (C23 test); `:280` - `findByText('Clínica reativada')` after reactivating. `'Clínica suspensa'` as an exact text node exists only as the toast (`src/app/plataforma/clinicas/[id]/clinic-status-section.tsx:15`), so `:239` cannot match the invite notice | **Closed** |
| 6 | C11 dead assertion `active.isActive` read the fixture | Reads the stored account | `tests/api/platform-clinic-status.test.ts:320-323` - `(await repositories(clinicId)).userAccounts.findById(active.id))?.isActive).toBe(true)` | **Closed** |
| 7 | C29 asserted only the `.../suspend` route | Adds `.../reactivate` | `tests/docs/super-admin-docs.test.ts:155` - `acesso).toContain('\`.../reactivate\`')`. It matches `docs/domains/acesso/README.md:52` (ACE-RN-27). This is not a false hit on ACE-RN-25's `` `reactivate` `` at `:50`: that one has no `.../` prefix | **Closed** |
| 8 | `clinic-status-handler.ts:39-42` - `getRepositories` and the 404 lookup run outside `handleRequest` | None - kept (same pattern as B4 routes) | `src/` unchanged | **Carried as note** (non-blocking) |

**No assertion was weakened.** In the fix diff, every removed assertion line is replaced by a stricter one:

- `OPERATOR` → a distinct operator
- `toBeGreaterThanOrEqual` → `toBeGreaterThan`
- the fixture read → a DB read
- `getAllByText(...).length >= 1` → a single match scoped to the title

Everything else in the diff is an addition: `:239`, `:280`, `super-admin-docs:155`, and the new file. The only non-assertion changes are the optional `cookie` parameter on the `change` helper (default `SUPER_ADMIN`, so every other caller is unchanged) and the 5 ms wait.

## Findings (none blocking)

1. **Carried note - C18 partner (round-1 #4):** proxy revocation is not proven separately for a `partner` cookie. The author accepted this with a reason. The code path is shared.
2. **Carried note - handler envelope (round-1 #8):** in `src/app/api/platform/clinics/[id]/clinic-status-handler.ts:39-42`, a DB error during `getRepositories`/`findById` escapes `handleRequest`. This is the same pattern as B4 finding 7.

## Gate

- `npx vitest run <14 files> -t "<32-name alternation>" --reporter=verbose` at 7b85b63 - 346 passed, 0 failed, exit 0. All 30 proof lines matched ≥1 ✓ in their own file (C4: 1)
- `npm run check:docs` at 7b85b63 - OK (0 aviso(s)), exit 0
- `npm run check:sv` - carried from c04faa9 (exit 0)
- `NODE_USE_ENV_PROXY=1 npx playwright test -c playwright.local.config.ts plataforma-suspensao plataforma` - carried from c04faa9 (9 passed)
- Full E2E dev (231) and build + prod (34) - AUTHOR-REPORTED at c04faa9, carried (the fix touches no `src/` or `e2e/`)
- `npm run test:coverage` - AUTHOR-REPORTED in round 1, not re-run (the fix adds assertions and one test file only)
