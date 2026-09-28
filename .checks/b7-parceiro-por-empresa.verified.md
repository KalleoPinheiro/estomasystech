# B7 — Parceiro por empresa · Verification

**Verdict**: PASS (11/11 proven)
**Profile**: light (AGENTS.md declares none). Skipped: step 1 (no binding UI source), the Coverage recompute and test-policy verdicts (these run only under standard/ui). Round 2 adds fault injection on the surface the fix created (the new C7/C8 assertion), as the re-verify procedure requires
**Diff range**: origin/main (93b79dc)..a3478eb; round-2 scope = fix diff 677ddd3..a3478eb (only `tests/application/partners.test.ts`) plus the non-PASS verdicts (C7, C8)
**Round**: 2 - scoped (round 1 at 677ddd3: FAIL 9/11)
**Verifier**: independent sub-agent (author != verifier)

## Sources vs checks (narrow comparison, not step 1) · carried from 677ddd3

| Source | Opened | Contradiction | Note |
|---|---|---|---|
| #211 criterion 1 (index `(clinic_id, email)` replaces the global unique) | yes, as literal text given in the brief | none | `drizzle/0046_partners-email-per-clinic.sql:4-5` drops `partners_email_unique` and creates `uq_partners_clinic_email` btree `(clinic_id, email)`. `schema.ts` has the matching `uniqueIndex` |
| #211 criterion 2 (create + edit give "Já existe parceiro com este e-mail", never 500, never another company) | yes | none | covered by C4, C5 (pre-check path, route level), C7, C8 (race path, application level) |
| #211 criterion 3 (two companies both 200; same company 409) | yes | none | C3, C4 |
| `.design/portal-super-admin.md:182` "Parceiro por empresa" | yes | none | index `(clinic_id, email)` plus the literal message: matches the Landing row and C4/C5 |

## Checks · verified at a3478eb

Proof runs (all re-run in full at a3478eb):
- `npx vitest run tests/infrastructure/partners-email-migration.test.ts tests/api/partner-tenant-isolation.test.ts tests/application/partners.test.ts tests/application/rbac-portal.test.ts --reporter=verbose`: 4 files, 31 passed, 0 failed. Every named test is listed individually below.
- `npx playwright test -c pw.verify.config.ts e2e/equipe.spec.ts -g "bloqueia cadastro de parceiro com email já usado"`: 1 passed (chromium, `e2e/equipe.spec.ts:84`, 3.1s). The temporary config was deleted afterwards.
- `npm run check:docs`: `check:docs: OK (0 aviso(s))`, exit 0.

| Check | Claim | Proof run (test that ran) | Evidence | Result |
|---|---|---|---|---|
| C1 | same e-mail in two clinics accepted by the DB | ✓ "Dadas duas clínicas, Quando gravar o mesmo e-mail…" | `tests/infrastructure/partners-email-migration.test.ts:39`: `expect(rows.rows).toEqual([{ clinic_id: 'mig-a' }, { clinic_id: 'mig-b' }])` (pglite, all migrations) | PASS |
| C2 | same clinic twice → 23505 / `uq_partners_clinic_email` | ✓ "Dada a mesma clínica, Quando gravar o e-mail duas vezes…" | `…migration.test.ts:50-53`: `expect(pgFieldsOf(error)).toMatchObject({ code: '23505', constraint: 'uq_partners_clinic_email' })` | PASS |
| C3 | POST same e-mail in A and B → both 200 | ✓ "Dadas duas empresas…as duas respondem 200" | `tests/api/partner-tenant-isolation.test.ts:102-103`: `expect(inA.status).toBe(200); expect(inB.status).toBe(200)` via `route.POST` (route handler) | PASS |
| C4 | POST duplicate in same clinic (uppercase) → 409 + literal | ✓ "Dado e-mail já cadastrado, Quando cadastrar duplicado na mesma empresa…" | `partner-tenant-isolation.test.ts:113` sends `'Parceiro-Duplicado@X.com'`; `:116` `toBe(409)`; `:117` `expect(duplicate.body.error).toBe('Já existe parceiro com este e-mail')` | PASS |
| C5 | PUT to another partner's e-mail, same clinic → 409 + literal | ✓ "Dada edição para e-mail de outro parceiro da mesma empresa…" | `partner-tenant-isolation.test.ts:131-132`: `toBe(409)`, `body.error).toBe('Já existe parceiro com este e-mail')` via `byIdRoute.PUT` | PASS |
| C6 | PUT to e-mail that exists only in another clinic → 200 | ✓ "Dada edição para e-mail que só existe em outra empresa…" | `partner-tenant-isolation.test.ts:146-147`: `toBe(200)`, `body.data.email).toBe('parceiro-so-na-a@x.com')` | PASS |
| C7 | race on create: index violation → `ConflictError` + literal | ✓ "Dada corrida na criação…" | `tests/application/partners.test.ts:168` `await expectDuplicateEmailConflict(new CreatePartner(racing).execute(...))`; helper `:10-17`: settles the promise to `error` (`null` on resolve), then `:15` `expect(error).toBeInstanceOf(ConflictError)` and `:16` `expect((error as Error).message).toBe('Já existe parceiro com este e-mail')` (literal at the assertion). Fault injection (below): M1 ValidationError same message, M2 resolve without throwing, M3 ConflictError other message all turn it red | PASS |
| C8 | race on update: same | ✓ "Dada corrida na edição…" | `partners.test.ts:186` `await expectDuplicateEmailConflict(new UpdatePartner(racing).execute({ id: partner.id, email: 'corrida@x.com' }))`, same helper `:15-16`. M1, M2, M3 all turn it red | PASS |
| C9 | other 23505 / generic error is rethrown, not `ConflictError` | ✓ both `it.each` rows: "outra violação de unicidade", "outra violação: erro genérico" | `partners.test.ts:214-215`: `expect(caught).toBe(error); expect(caught).not.toBeInstanceOf(ConflictError)`. Cases at `:196` (`partners_pkey` 23505) and `:198` (generic `Error`). Lines refreshed; assertion unchanged by the fix | PASS |
| C10 | UI shows the literal and keeps the form open | ✓ `e2e/equipe.spec.ts:84` passed | `e2e/equipe.spec.ts:94`: `expect(page.getByText("Já existe parceiro com este e-mail")).toBeVisible()`; `:95` heading "Novo parceiro" visible | PASS |
| C11 | domain doc records the rule (per company, 409) | check:docs OK + grep | `docs/domains/equipe-parceiros/README.md:28` (EQP-RN-05: "único **dentro da empresa**… responde 409 `Já existe parceiro com este e-mail`") | PASS |

Status-code claims (C3–C6) are all proven at the route boundary (`route.POST` / `byIdRoute.PUT` → `handleRequest`). The race path (C7/C8) has no route-level proof. The checklist names no status for it, and `handleRequest` maps `ConflictError` → 409 (`src/lib/api-response.ts:48`). The class is now asserted (`toBeInstanceOf(ConflictError)`), which is what separates 409 from 400 on that path.

## Fault injection on the fix's new surface · verified at a3478eb

Throwaway `git worktree add --detach` at a3478eb in the session scratchpad (outside the repo tree; `node_modules` symlinked), mutating only `src/application/partners/partner-email.ts` `savePartner` (`:37-39`), running `npx vitest run tests/application/partners.test.ts -t "corrida na"`. Worktree removed afterwards (`git worktree list` shows only the main tree).

| Mutant | Change | Result (C7, C8) | Failure message |
|---|---|---|---|
| M1 | `new ValidationError(DUPLICATE_PARTNER_EMAIL_MESSAGE)` (the round-1 gap: same text, 400) | 2 failed | `expected ValidationError: Já existe parceiro com e… to be an instance of ConflictError` |
| M2 | `if (isUniqueViolation(error, PARTNER_EMAIL_INDEX)) return;` (resolves without throwing) | 2 failed | `expected null to be an instance of ConflictError` |
| M3 | `new ConflictError('Já existe parceiro com o e-mail x@y')` (right class, wrong text) | 2 failed | `expected 'Já existe parceiro com o e-mail x@y' to be 'Já existe parceiro com este e-mail'` |

Unmutated at a3478eb: both tests pass (proof run above).

## Swept rows citing existing behaviour (checked against code) · carried from 677ddd3

| Row | Constraint cited | Found |
|---|---|---|
| validation | `validatePersonContact` normalizes; route zod `.email('Email inválido')` → 400 | `src/domain/shared/person-validation.ts:15` `trim().toLowerCase()`; `src/app/api/partners/route.ts:13`, `[id]/route.ts:12`; ZodError → 400 at `api-response.ts` `handleRequest` |
| authorization | `requireStaffSession` + `writeScope`/`sessionScope` in the routes | `route.ts` GET `sessionScope`, POST `writeScope`; `[id]/route.ts` PUT `writeScope`. All call `requireStaffSession` |
| dependency failure | an unmapped DB error becomes 500 through `handleRequest` | `api-response.ts`: `fail('Erro interno do servidor', 500)` for non-Domain, non-Zod errors |
| data lifecycle | an inactive partner still holds the e-mail | `drizzle-partner-repository.ts:49-61` `findByEmail` has no `active` filter |

## Adversarial read (no additional defects) · carried from 677ddd3 (fix touched only a test file)

- Tenant scoping: `findByEmail` uses `withTenant(partners, this.clinicId, eq(email, email.trim().toLowerCase()))` (`drizzle-partner-repository.ts:49-61`). The pre-check never sees another clinic's rows, so the message cannot reveal them, and the message itself is constant (no e-mail, no company).
- The only writers of `partners` are `CreatePartner` and `UpdatePartner` via `savePartner` (grep of `new CreatePartner|new UpdatePartner|partners.save|insert(partners)`). No other path can hit the index unhandled.
- Driver field name: production uses `node-postgres` (`db.ts:71`), which exposes `constraint`, the field `isUniqueViolation` reads. pglite matches (C2 proves the field on pglite).
- Upsert `onConflictDoUpdate({ target: partners.id })`: a conflict on `uq_partners_clinic_email` is not the conflict target, so it still raises 23505 and is caught.
- Migration/snapshot: `0046_snapshot.prevId` equals the `0045_snapshot.id` (`cc57133e…`). The `partners` table has `uniqueConstraints: {}` plus the unique btree `uq_partners_clinic_email(clinic_id,email)`. All other tables are identical to 0045. The journal has entry idx 46, tag `0046_partners-email-per-clinic`, matching the SQL filename. `npx drizzle-kit check`: "Everything's fine".

## Gaps · verified at a3478eb

None blocking.

- Round-1 gap 1 (C7/C8 class unasserted): closed. The helper asserts `toBeInstanceOf(ConflictError)` and M1 proves it bites. The same helper also replaced the out-of-checklist pattern at `partners.test.ts:47` and `:84`.
- Round-1 gap 2 (message from the source constant): closed. `:16` asserts the literal string; the test file no longer imports `DUPLICATE_PARTNER_EMAIL_MESSAGE`.

## Gate · verified at a3478eb (drizzle-kit carried from 677ddd3)

- vitest (4 files): 31 passed, 0 failed
- playwright `e2e/equipe.spec.ts:84`: 1 passed
- `npm run check:docs`: OK (0 aviso(s))
- `npx drizzle-kit check`: OK (carried from 677ddd3; the fix touched no schema or migration)
