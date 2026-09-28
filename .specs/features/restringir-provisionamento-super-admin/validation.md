# Restringir provisionamento do super_admin — Validation

**Date**: 2026-09-28
**Spec**: `.specs/features/restringir-provisionamento-super-admin/spec.md`
**Diff range**: `origin/main..HEAD` (branch `fix/253-provisionamento-super-admin`, 3 commits: `77db782` spec, `cfd4bae` impl+tests, `945cd35` docs)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No formal `tasks.md` (Medium auto-sizing, per spec's Implementation Note). Work is scoped to the spec's 3 commits.

| Commit | Status | Notes |
| --- | --- | --- |
| `77db782` spec.md | ✅ Done | Spec-only commit |
| `cfd4bae` domain + lib + tests | ✅ Done | `role-hierarchy.ts`, `account-manager.ts`, 3 test files |
| `945cd35` docs | ✅ Done | ADR-007, ACE-RN-05 |

---

## Spec-Anchored Acceptance Criteria

### P1: Matriz de provisionamento reflete o ADR-007

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| WHEN `canProvision('super_admin','company_admin')` THEN `true` | `true` | `src/domain/auth/role-hierarchy.ts:18` — `super_admin: ['company_admin']`; asserted at `tests/domain/role-hierarchy.test.ts:62` — `expect(canProvision(actor, target)).toBe(expected)` for `actor='super_admin', target='company_admin'`, `EXPECTED.super_admin.company_admin = true` (`tests/domain/role-hierarchy.test.ts:9`) | ✅ PASS |
| WHEN `canProvision('super_admin', target)` for `target` in atendente/profissional/patient/partner/super_admin THEN `false` | `false` for all 5 | `tests/domain/role-hierarchy.test.ts:62`, matrix rows `tests/domain/role-hierarchy.test.ts:8,10-13` — `EXPECTED.super_admin = { super_admin:false, atendente:false, profissional:false, patient:false, partner:false }`; also `create-account.test.ts:30-49` — `it.each(['atendente','profissional','patient','partner'])` rejects with `ProvisioningDeniedError`, `repo.findAll()` has length 0 | ✅ PASS |
| WHEN other `PROVISIONING_MATRIX` rows evaluated THEN unchanged | Same as before | `src/domain/auth/role-hierarchy.ts:19-46` (company_admin/atendente/profissional/patient/partner rows byte-identical to origin/main per `git diff` — only the `super_admin` line and comment changed); confirmed by `tests/domain/role-hierarchy.test.ts:62` full 36-pair sweep passing | ✅ PASS |

### P1: Modo aberto de `/api/accounts/[id]` alinhado a `company_admin`

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| WHEN `accountManager(null)` THEN `{ role: 'company_admin', subject: null }` | exact object | `src/lib/auth/account-manager.ts:13`; asserted at `tests/lib/account-manager.test.ts:15-18` — `expect(accountManager(null)).toEqual({ role: 'company_admin', subject: null })` | ✅ PASS |
| WHEN `accountManager(session)` with real session THEN `{ role: session.role, subject: session.subject }` unchanged | pass-through | `src/lib/auth/account-manager.ts:12`; asserted at `tests/lib/account-manager.test.ts:25-28` — `expect(accountManager(session('atendente','atendente@x.com'))).toEqual({ role: 'atendente', subject: 'atendente@x.com' })` | ✅ PASS |

### P2: Documentação viva reflete a regra

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| WHEN `docs/domains/acesso/README.md` read THEN ACE-RN-05 states super_admin only registers company_admin, via platform | explicit statement | `docs/domains/acesso/README.md:30` — row now reads "O Super Admin só cadastra `company_admin`, pela plataforma (...) — não cria atendente, profissional, paciente nem parceiro de clínica (ADR-007, #253)"; gated by `tests/docs/super-admin-docs.test.ts:55` — `expect(acesso).toMatch(/\| \`super_admin\` \| só a plataforma/)` (pre-existing assertion, unaffected) | ✅ PASS |
| WHEN ADR-007 "Um único super_admin" section read THEN same affirmation | explicit statement | `docs/adr/007-super-admin-operador-da-plataforma.md:57-58` — "O `super_admin` também só cadastra `company_admin`: `PROVISIONING_MATRIX.super_admin` tem só essa linha, coerente com o alcance da opção B (#253)." | ✅ PASS |
| WHEN `npm run check:docs` and `tests/docs/super-admin-docs.test.ts` run THEN both stay green | 0 failures | `check:docs: OK (0 aviso(s))` (ran); `tests/docs/super-admin-docs.test.ts` — 1 file, all passing in targeted vitest run below | ✅ PASS |

**Status**: ✅ All ACs covered, no spec-precision gaps.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/domain/auth/role-hierarchy.ts:18` | `super_admin: ['company_admin']` → `super_admin: ['company_admin', 'atendente']` | ✅ Killed — `tests/domain/role-hierarchy.test.ts` fails: "Dado ator super_admin e alvo atendente... expected true to be false" |
| 2 | `src/lib/auth/account-manager.ts:13` | `{ role: 'company_admin', subject: null }` → `{ role: 'super_admin', subject: null }` | ✅ Killed — `tests/lib/account-manager.test.ts` fails: "expected { role: 'super_admin', ... } to deeply equal { role: 'company_admin', ... }" |

Both mutations applied via `Edit`, run against their targeted test file, confirmed failure, then reverted with `git checkout --`. `git status --short` confirmed a clean tree after each revert and at the end of the sensor pass.

**Sensor depth**: lightweight (2 targeted mutations on the new/changed logic; feature is not P0/critical-path — it's domain-logic-only, unreachable from a real session today per spec's own scope note)
**Result**: 2/2 killed — PASS ✅

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — 2 production files touched, 1 line changed in each (plus JSDoc) |
| Surgical changes | ✅ — no unrelated refactors |
| No scope creep | ✅ — `POST /api/accounts` explicitly left untouched per spec's Out of Scope |
| Matches patterns | ✅ — JSDoc style, test structure (`describe`/`it` Gherkin-style naming) consistent with existing files |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — domain (`role-hierarchy.test.ts`) has full 36-pair matrix; lib (`account-manager.test.ts`) covers both null and real-session branches; application layer (`create-account.test.ts`) adds explicit rejection cases for the 4 forbidden targets |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — all new/changed assertions map to PROV-01..04; the `create-account.test.ts` duplicate-email test change (`super_admin`→`company_admin` actor) is an unrelated-scenario fixture fix required by the matrix narrowing (an actor that can no longer provision `patient`/`partner` can't be used as the duplicate-email test's actor), not scope creep |
| Documented guidelines followed | ✅ — AGENTS.md (Biome, no ESLint), coding-style.md (immutability — array literal replaced wholesale, not mutated) |

---

## Edge Cases

- [x] Future route reusing `canProvision` for `super_admin`→operational-role fails closed: covered by the matrix change itself + full 36-pair sweep (`tests/domain/role-hierarchy.test.ts:58-65`) and by `create-account.test.ts:30-49`'s explicit rejection cases.
- [x] `PLATFORM_ACCOUNT_MANAGER` / `canProvision('super_admin','company_admin')` still `true`, no regression in `tests/api/platform-clinics.test.ts` and `tests/api/platform-clinic-admin-actions.test.ts`: both pass in the targeted run (132/132 total across the 7 files).
- [x] `visibleAccounts('super_admin', accounts)` behavior change: confirmed by code read (`src/domain/auth/account-management.ts:63` — `accounts.filter((account) => canProvision(role, account.role))`, now transitively filters to only `company_admin` for a `super_admin` actor) and by grep — no test in `tests/domain/account-management.test.ts` exercises `visibleAccounts('super_admin', ...)`, consistent with the spec's own note that this path has no real consumer today and no pre-existing test depends on the old value. Not a gap: spec does not require new coverage here, only that no old test breaks.

---

## Gate Check

- **Gate commands**: `npm run typecheck`, `npm run lint` (via `./node_modules/.bin/biome check` directly — `npm run lint`'s stdout is swallowed by an unrelated harness wrapper that tries to parse it as ESLint JSON and fails; the underlying `biome check` was run directly to get real output), `npm run check:sv`, `npm run check:docs`, targeted `npx vitest run` on 7 files.
- **typecheck**: 0 errors.
- **lint (biome check)**: "Checked 796 files... Found 2 warnings. Found 1 info." — all 3 findings are in `tests/docs/structure.test.ts`, `tests/infrastructure/deploy-config.test.ts`, `tests/infrastructure/drizzle-clinical-inventory.test.ts`. Confirmed via `git diff origin/main..HEAD --name-only` that none of these 3 files are touched by this branch, and via `git log origin/main -1 -- <files>` that they exist unmodified on `origin/main` (pre-existing, out of scope). Effectively green for this feature's files.
- **check:sv**: "OK — adoção do @still-void/ui v2 completa." (no `<button>`/`<input>`/etc. involved — this diff has no UI components).
- **check:docs**: "check:docs: OK (0 aviso(s))".
- **Targeted vitest**: `tests/domain/role-hierarchy.test.ts tests/lib/account-manager.test.ts tests/application/create-account.test.ts tests/domain/account-management.test.ts tests/api/platform-clinics.test.ts tests/api/platform-clinic-admin-actions.test.ts tests/docs/super-admin-docs.test.ts` → **PASS (132) FAIL (0)**.
- **Full `npm run test:coverage`**: not re-run by this Verifier (per task instructions, trusted from the prior clean run — 4138 passed, ~96% coverage — reported before this validation started).
- **Test count before feature**: `tests/lib/account-manager.test.ts` did not exist on `origin/main` (new file, +2 tests). `tests/domain/role-hierarchy.test.ts` test count unchanged (still 36 matrix cases + 3 scenario tests — only expected *values* changed for 4 of the 36). `tests/application/create-account.test.ts` +4 tests (`it.each` over 4 forbidden roles).
- **Test count after feature**: +6 new tests net (2 in account-manager, 4 in create-account); 0 deleted.
- **Delta**: +6 new tests, 0 removed, 0 weakened assertions.
- **Skipped tests**: none.
- **Failures**: none.

---

## Fix Plans

None — no gaps found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| PROV-01 | Implementado | ✅ Verified |
| PROV-02 | Implementado | ✅ Verified |
| PROV-03 | Implementado | ✅ Verified |
| PROV-04 | Implementado | ✅ Verified |
| DOC-01 | Implementado | ✅ Verified |
| DOC-02 | Implementado | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 8/8 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 2/2 mutations killed
**Gate**: typecheck ✅, lint ✅ (2 pre-existing, out-of-scope findings unrelated to this diff), check:sv ✅, check:docs ✅, targeted vitest 132/132 ✅

**What works**: `PROVISIONING_MATRIX.super_admin` correctly narrowed to `['company_admin']` with full 36-pair regression coverage; `accountManager(null)` correctly aligned to `company_admin`, matching `POST /api/accounts`'s open-mode behavior, with both the null-session and real-session branches covered; both ADR-007 and ACE-RN-05 explicitly state the restriction; platform routes (`platform-clinics`, `platform-clinic-admin-actions`) show no regression; duplicate-email test fixture correctly migrated off the now-narrower `super_admin` actor to `company_admin` without losing its original assertion intent; both discrimination-sensor mutations were killed by the existing tests, confirming real regression-detection power, not just coverage-by-presence.

**Issues found**: none.

**Next steps**: none — feature ready to merge as-is.
