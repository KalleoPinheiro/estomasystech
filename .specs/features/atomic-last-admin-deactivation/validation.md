# Atomic last-admin deactivation (#244) Validation

**Date**: 2026-09-28
**Spec**: `.specs/features/atomic-last-admin-deactivation/spec.md`
**Diff range**: `origin/main..HEAD` (4 commits: 099b925, a442cfc, bf15dbc, e9efb87)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| `findByRoleForUpdate` repository method (interface + Drizzle `.for('update')` + in-memory delegate) | ✅ Done | `src/domain/auth/user-account.ts`, `drizzle-foundation-repositories.ts:264-276`, `in-memory-foundation-repositories.ts:149-152` |
| Platform `ManageClinicAdmins.deactivate()` made atomic (tx + lock + re-check, audit moved to tx-scoped repo) | ✅ Done | `src/application/platform/manage-clinic-admins.ts:173-192` |
| Clinic self-service `PATCH /api/accounts/[id]` `deactivate()` made atomic | ✅ Done | `src/app/api/accounts/[id]/route.ts:79-112` |
| Concurrency integration test (P1 + P2) | ✅ Done | `tests/api/concurrent-admin-deactivation.test.ts` |

---

## Spec-Anchored Acceptance Criteria

### P1: Desativação atômica pela plataforma

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: 2 concurrent `PATCH .../admins/[accountId]` deactivate on 2 different admins, same clinic | exactly one 200, other 400 with exact message `"Não é possível desativar o último administrador ativo da empresa"` | `tests/api/concurrent-admin-deactivation.test.ts:96-102` — `expect(statuses).toEqual([200, 400]); expect(errors).toEqual([LAST_ADMIN_MESSAGE])` | ✅ PASS |
| AC2: after the race, exactly 1 active `company_admin` | count === 1 | `tests/api/concurrent-admin-deactivation.test.ts:103` — `expect(await activeAdminCount(clinicId)).toBe(1)` | ✅ PASS |
| AC3: single deactivation (no race), another admin active → unchanged behavior (200, sessions revoked, audit written) | 200, `active:false`, `sessionVersion` incremented | `tests/api/platform-clinic-admin-actions.test.ts:132-151` — `expect(response.status).toBe(200); expect(after?.sessionVersion).toBe(versionBefore + 1)`; audit write proven separately at `platform-clinic-admin-actions.test.ts:236-261` (`it.each` incl. `'deactivate'` case, asserts `auditEvents.findAll()` contains the event) | ✅ PASS |
| AC4: single deactivation of the last active admin (no race) → 400, same message, nothing changes | 400, exact message, `isActive` stays `true` | `tests/api/platform-clinic-admin-actions.test.ts:153-167` — `expect(response.status).toBe(400); expect(json.error).toBe('Não é possível desativar o último administrador ativo da empresa'); expect((await stored(...))?.isActive).toBe(true)` | ✅ PASS |

### P2: Desativação atômica pela clínica (self-service)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: 2 concurrent `PATCH /api/accounts/[id]` (`active:false`) on 2 different admins, same clinic | exactly one 200, other 400 same message | `tests/api/concurrent-admin-deactivation.test.ts:137-143` — `expect(statuses).toEqual([200, 400]); expect(errors).toEqual([LAST_ADMIN_MESSAGE])` | ✅ PASS |
| AC2: after the race, exactly 1 active `company_admin` | count === 1 | `tests/api/concurrent-admin-deactivation.test.ts:144` — `expect(await activeAdminCount(clinicId)).toBe(1)` | ✅ PASS |
| AC3: `active:false` + `password` in same body → both persist in the same `save`, inside the locked transaction (no regression vs C9) | password hash unchanged + `isActive:true` when audit fails atomically (rollback proof); success-path combined write is exercised by the same `deactivate()` code path | `tests/api/accounts-hierarchy.test.ts:246-264` (C9) — `expect(response.status).toBe(500); expect(after?.isActive).toBe(true); expect(after?.passwordHash).toBe(UNSET_PASSWORD_HASH)` | ✅ PASS — proves atomic rollback of the combined password+deactivate write; C9's target account role (`atendente`) isn't `company_admin`, so it does not exercise the last-admin-lock branch together with a successful combined save — see Spec-precision gap below |

**Spec-precision gap**: no test asserts the **successful** combined write (`active:false` + `password` both persisted together for a `company_admin` target going through the new locked `deactivate()` path). C9 proves the atomic-rollback direction (failure case) but not the atomic-commit direction for an admin target specifically. This is a pre-existing test (not modified by this diff) and the combined-save code (`route.ts:91-107`) is identical logic to before #244 for the success path, so risk is low — flagging per evidence-or-zero, not blocking.

**Status**: ✅ All 8 ACs covered with exact spec-defined outcomes; 1 minor spec-precision gap noted (P2 AC3 success-path combined-write for an admin target specifically).

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/infrastructure/persistence/drizzle/drizzle-foundation-repositories.ts:272` | Removed `.for('update')` from `findByRoleForUpdate` (no row lock) | ❌ Survived (3/3 runs) — see note below |
| 2 | `src/domain/auth/account-management.ts:51` | Flipped `otherActiveAdmins.length === 0` → `> 0` | ✅ Killed — 7 tests failed across `platform-clinic-admin-actions.test.ts`, `accounts-hierarchy.test.ts`, `concurrent-admin-deactivation.test.ts` |
| 3 | `src/application/platform/manage-clinic-admins.ts:184` | Removed `await audit(auditEvents)` inside `deactivate()` | ✅ Killed — `platform-clinic-admin-actions.test.ts` "grava a auditoria" (deactivate case) and "auditoria falhou" case both failed (200/400 instead of expected) |

**Sensor depth**: lightweight (3 mutations, proportional to a concurrency-correctness fix, not a payment/auth-boundary path)
**Result**: 2/3 killed — mutant 1 survived deterministically across 3 runs.

**Honest note on mutant 1**: with `.for('update')` removed, `tests/api/concurrent-admin-deactivation.test.ts` still passed 3/3 times (exactly 1×200/1×400, exactly 1 active admin). This is consistent with the task brief's own caveat: PGlite is a single embedded connection with an exclusive-operation mutex, so the two `Promise.all` requests' queries may already be serialized by PGlite itself regardless of the SQL-level row lock, making the race window this test targets hard to observe without the lock. The test is not proven to discriminate on lock presence specifically — it discriminates on the final invariant (never zero/two active admins) but that invariant currently holds even without `FOR UPDATE` in this PGlite-backed harness. This is a genuine test-strength gap worth a fix task (e.g., an isolated unit-level test that stubs the repository to prove `findByRoleForUpdate` is actually called before `assertCanDeactivate`, or documents the PGlite limitation), but it does not indicate the feature itself is broken in production Postgres — `.for('update')` is present in the shipped code and matches the pre-existing `findByIdForUpdate` pattern.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — new method + two `deactivate()` rewrites, nothing extraneous |
| Surgical changes | ✅ — no unrelated refactors; `RecordAdminActionAudit` signature change is the minimum needed to move the audit write inside the tx (documented rationale in code comment re: PGlite mutex deadlock) |
| No scope creep | ✅ — `reactivate`/`invite`/`resend-invite` untouched, matching spec's Out of Scope table |
| Matches existing patterns | ✅ — `findByRoleForUpdate` mirrors `findByIdForUpdate` (`drizzle-invoice-repository.ts:157-164`, used by `invoice-adjustments.ts`, `pay-invoice.ts`, `cancel-invoice.ts`) and `recover-super-admin.ts:78`'s `.for('update')` usage |
| Spec-anchored outcome check (asserted values match spec) | ✅ (see AC table above; 1 spec-precision gap flagged, not a failure) |
| Per-layer Coverage Expectation met | ✅ — domain rule (`assertCanDeactivate`) has 1:1 AC coverage via existing + new tests; both routes cover happy, last-admin-400, non-admin-404 (unchanged), and audit-failure-500 paths |
| Every test maps to a spec requirement | ✅ — no unclaimed tests found in the new file |
| Documented guidelines followed | ✅ — AGENTS.md tenant-scope rule respected (`clinicScope`/`writeScope`/`systemScope` used correctly in test helpers); no raw `{ clinicId }` construction found |

---

## Edge Cases

- [x] Audit fails inside locked transaction → account unchanged + 500 — covered unmodified by `accounts-hierarchy.test.ts:246-264` (C9) and `platform-clinic-admin-actions.test.ts:263-289`
- [x] Non-admin target unaffected — platform route: `find()` filters to `company_admin` before any lock, 404 unchanged (`platform-clinic-admin-actions.test.ts:182-213`). Clinic route: `assertCanDeactivate` short-circuits the last-admin check for non-`company_admin` targets (`account-management.ts:44`), though the new `deactivate()` now unconditionally acquires the `findByRoleForUpdate` lock even for non-admin targets (e.g. an `atendente`) — functionally harmless (extra query, same outcome), confirmed by C9 using an `atendente` target through the new code path successfully
- [x] Reactivate needs no lock — `apply()`/`applyChange()` reactivate branches untouched, no `transactions.run`/lock call added (`manage-clinic-admins.ts:158-161`, `route.ts:115-144`)

---

## Gate Check

- **Gate commands**: `./node_modules/.bin/tsc --noEmit`; `./node_modules/.bin/biome check` (diff-touched files); `./node_modules/.bin/vitest run tests/api/concurrent-admin-deactivation.test.ts tests/api/platform-clinic-admin-actions.test.ts tests/api/platform-clinic-admins.test.ts tests/api/accounts-hierarchy.test.ts tests/api/accounts-provisioning.test.ts`
- **tsc**: ✅ clean, no errors
- **biome**: ✅ "Checked 7 files in 50ms. No fixes applied." — no new errors in diff-touched files
- **vitest (scoped)**: ✅ 5 test files, 52/52 passed
- **Pre-existing unrelated failure**: `tests/domain/role-hierarchy.test.ts` + `tests/application/create-account.test.ts` (8 failures under full `test:coverage`) — confirmed via `git diff origin/main -- src/domain/auth/role-hierarchy.ts tests/domain/role-hierarchy.test.ts tests/application/create-account.test.ts` producing **zero diff** (byte-identical to `origin/main`); inherited from merged PR #256 (commit `11dad2f`, unrelated issue #253). Not attributed to this feature.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| LASTADMIN-01 | Pending | ✅ Verified |
| LASTADMIN-02 | Pending | ✅ Verified |
| LASTADMIN-03 | Pending | ✅ Verified |
| LASTADMIN-04 | Pending | ✅ Verified (with spec-precision gap noted on the success-path combined-write assertion) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 8/8 ACs matched spec-defined outcomes; 1 spec-precision gap flagged (non-blocking)
**Sensor**: 2/3 mutations killed; 1 survived (see honest note — likely a PGlite serialization artifact, not evidence the fix is wrong, but the test's discrimination on lock presence specifically is unproven)
**Gate**: tsc clean, biome clean, 52/52 scoped tests passed; 8 pre-existing failures confirmed out of scope

**What works**: Both routes now lock `company_admin` rows via `SELECT ... FOR UPDATE` inside the same transaction that re-checks `assertCanDeactivate` and writes the deactivation + audit, closing the TOCTOU race from #244. Pattern matches the repo's existing `findByIdForUpdate` convention. All acceptance criteria for P1 and P2 are met with exact spec-defined outcomes (status codes, message text, admin count).

**Issues found**:
1. (Minor, non-blocking) Discrimination sensor mutant 1 (removing `.for('update')`) survived 3/3 runs against the new concurrency test — the PGlite harness's own connection serialization may be masking the lock's specific contribution. Suggested fix task: add a narrower unit/integration check that proves `findByRoleForUpdate` (not `findByRole`) is the method actually invoked in the locked path, so a future accidental revert to `findByRole` is caught even if PGlite happens to serialize the race away.
2. (Spec-precision gap, non-blocking) No test explicitly asserts the successful combined `active:false` + `password` write for a `company_admin` target through the new locked path (only the failure/rollback direction is proven, via a non-admin target in C9).

**Next steps**: Both issues are minor/non-blocking — feature can ship. Optionally file the two fix-task suggestions above as follow-up test-hardening work.
