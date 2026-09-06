# SummaryCard Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/dashboard-summary-card/spec.md`
**Diff range**: `d3a4e0d..a469a06` (single commit `a469a06`, branch `fix/140-dashboard-cards-raso`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| `SummaryCard` component created (`src/components/summary-card.tsx`) | ✅ Done | 125 lines, state machine + header override props |
| `FollowUpsCard`, `LowStockCard`, `TriageQueue` delegate to `SummaryCard` | ✅ Done | `src/app/(staff)/page.tsx` |
| Existing test suite unmodified | ✅ Done | `git show HEAD --stat` shows zero files under `tests/` touched |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SUMCARD-01: WHEN a card has `error` THEN `SummaryCard` renders `ErrorAlert` with `onRetry` | `ErrorAlert` shown, retry calls the fetch/refresh fn | `src/components/summary-card.tsx:91,114-115`; behavior confirmed by `tests/pages/staff-dashboard.test.tsx` scenario "erro de API por card (DASH-01)... clicar em 'Tentar novamente'" (test asserts refetch happens) | ✅ PASS |
| SUMCARD-02: WHEN `isLoading` (no error) THEN renders `LoadingIndicator` | `LoadingIndicator` shown | `src/components/summary-card.tsx:90,116-117`; covered by existing loading-state assertions in the same test file | ✅ PASS |
| SUMCARD-03: WHEN no error/loading and empty THEN `EmptyState`, EXCEPT `hideWhenEmpty` renders `null` | `EmptyState` for `FollowUpsCard`/`LowStockCard`; `null` (nothing, not even `<Card>`) for `TriageQueue` | `src/components/summary-card.tsx:92,118-119` (empty→`EmptyState`); `:92` (`hideWhenEmpty` + empty → `null`); matches `git show HEAD~1:...page.tsx` original `if (!queue \|\| queue.length === 0) return null;` | ✅ PASS |
| SUMCARD-04: WHEN card has data THEN renders `children` inside `<Card>` | data branch renders children within `<Card>` | `src/components/summary-card.tsx:93-104,107-124` | ✅ PASS |
| SUMCARD-05: WHEN the 3 cards are refactored THEN `tests/pages/staff-dashboard.test.tsx` stays 100% green, unmodified | 44/44 tests pass, zero assertion changes | `npx vitest run tests/pages/staff-dashboard.test.tsx` → `PASS (44) FAIL (0)`; `git show HEAD --stat` shows no `tests/` file in the diff | ✅ PASS |

**Status**: ✅ All ACs covered

**Structural fidelity spot-checks** (line-by-line diff of `git show HEAD~1:src/app/\(staff\)/page.tsx` vs `HEAD`):
- `TriageQueue` header (`h3`, `text-warning`, `mb-2 flex items-center justify-between`) preserved via `titleTag="h3"` + `headerClassName="mb-2 flex items-center justify-between"` overrides (`page.tsx:361-363`), vs. defaults `h2`/`mb-4` for the other two cards (`summary-card.tsx:41-42`).
- `FollowUpsCard`/`LowStockCard` original code always rendered `<Card>` unconditionally with the ternary inside it — `SummaryCard`'s non-`hideWhenEmpty` branch (`summary-card.tsx:107-124`) preserves this: `<Card>` always renders, loading/error/empty/data all render inside it.
- `TriageQueue`'s original loading/error branches returned bare components with no `<Card>` wrapper — `SummaryCard`'s `hideWhenEmpty` branch (`summary-card.tsx:90-91`) preserves this exactly (bare return).
- `FollowUpsCard`'s `{followUps && (<ul>...)}` null-guard preserved verbatim (`page.tsx:230`) — safe against `followUps === null` during loading, since it's evaluated by the caller before `SummaryCard` decides the branch.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/components/summary-card.tsx:90-91` | Swapped `hideWhenEmpty` early-return order — check `error` before `isLoading` (was `isLoading` before `error`) | ❌ Survived → coverage gap |
| 2 | `src/app/(staff)/page.tsx:361-363` | Removed `titleTag`/`headerClassName` overrides at `TriageQueue` call site, forcing `SummaryCard` defaults (`h2`, `mb-4`) instead of `h3`/`mb-2` | ❌ Survived → coverage gap |
| 3 | `src/components/summary-card.tsx:90-91` | Made `hideWhenEmpty` loading/error branches always wrap in `<Card className={cardClassName}>` (was bare) | ❌ Survived → coverage gap |
| 4 | `src/app/(staff)/page.tsx:230-232` | Removed `followUps &&` null-guard, forced `followUps!.slice(...)` | ✅ Killed — component crashes during loading state, 3+ test failures |

**Sensor depth**: lightweight (4 manual mutations, default tier)
**Result**: 1/4 killed, 3/4 survived — ❌ FAIL (coverage gaps, not regressions)

**Analysis**: None of the 3 surviving mutants change *current* observable behavior since `TriageQueue` never has simultaneous `error`+`isLoading` in practice, and the existing suite never asserts DOM structure (heading tag, wrapper presence) beyond text content. These are pre-existing coverage gaps in `staff-dashboard.test.tsx`, not regressions introduced by this refactor — the refactor's own behavior is byte-for-byte equivalent to the pre-refactor code (confirmed by line-by-line diff above). Per SUMCARD-05 and the spec's explicit instruction not to modify the test suite, these gaps are flagged for a future task, not blocking this refactor's merge.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ (only `page.tsx` + new `summary-card.tsx`) |
| No scope creep | ✅ (header unification explicitly out of scope, and correctly not attempted) |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ All 5 ACs matched spec-defined outcome |
| Every test maps to a spec requirement | ✅ (no new tests added; existing suite is the contract) |
| Documented guidelines followed | AGENTS.md (Biome, `@still-void/ui` gate) — both green |

---

## Edge Cases

- [x] `TriageQueue` empty (no error, no loading) → renders nothing, not even `<Card>` — preserved via `hideWhenEmpty`.
- [x] `FollowUpsCard`/`LowStockCard` empty → `<Card>` renders with `EmptyState` inside, does not disappear.

---

## Gate Check

- **Gate commands**: `npx vitest run tests/pages/staff-dashboard.test.tsx`, `npm run typecheck`, `./node_modules/.bin/biome check .`
- **Result**: vitest 44 passed / 0 failed; typecheck clean (no output = pass); biome — "Checked 521 files in 577ms. No fixes applied."
- **Test count before/after feature**: 44 / 44 (unchanged, as required by SUMCARD-05)
- **Skipped tests**: none
- **Failures**: none
- Not run per instructions: `npm run test:coverage`, `npm run test:e2e` (already run and confirmed green by the author this session)

---

## Fix Plans (if issues found)

### Fix 1: `hideWhenEmpty` branch order has no regression test
- **Root cause**: `TriageQueue` never exercises `error` and `isLoading` simultaneously in the test suite, so branch-order is unverified.
- **Fix task**: Add a test case (or documented rationale for skipping, since the real API layer never returns both simultaneously) asserting `isLoading` takes precedence over `error` in `hideWhenEmpty` mode.
- **Priority**: Minor (not a behavior change from this refactor; pre-existing gap surfaced by the sensor).

### Fix 2: Heading tag/spacing overrides for `TriageQueue` are unverified
- **Root cause**: No test asserts the rendered `<h3>` tag or `mb-2` spacing class for `TriageQueue`'s header.
- **Fix task**: Add an assertion (e.g. `screen.getByRole('heading', { level: 3 })` scoped to the triage banner) to lock in the visual differentiation the spec explicitly calls out as intentional.
- **Priority**: Minor.

### Fix 3: `<Card>`-wrapper absence in `hideWhenEmpty` loading/error is unverified
- **Root cause**: No test checks that TriageQueue's loading/error states render "bare" (no `<Card>`/`role="region"` chrome).
- **Fix task**: Add a DOM-structure assertion (e.g. `container.querySelector('.border-warning')` absent during loading) for this state.
- **Priority**: Minor.

None of these are regressions — they are pre-existing gaps in `staff-dashboard.test.tsx` that predate this refactor and are outside its explicit scope (spec says "não reescrever" the test suite).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| SUMCARD-01 | Pending | ✅ Verified |
| SUMCARD-02 | Pending | ✅ Verified |
| SUMCARD-03 | Pending | ✅ Verified |
| SUMCARD-04 | Pending | ✅ Verified |
| SUMCARD-05 | Pending | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (refactor itself is correct and behaviorally equivalent; sensor exposed pre-existing test-suite coverage gaps, not new bugs)

**Spec-anchored check**: 5/5 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 1/4 mutations killed, 3/4 survived (all 3 survivors are pre-existing gaps in structural/branch-order assertions, not regressions from this diff)
**Gate**: 3/3 passed (vitest 44/44, typecheck, biome)

**What works**: All 5 ACs verified against exact spec-defined outcomes via line-by-line diff against the pre-refactor code. `hideWhenEmpty` bare-rendering, header overrides (`h3`/`mb-2` for TriageQueue vs `h2`/`mb-4` default), the always-wrapped `<Card>` for FollowUpsCard/LowStockCard, and the `followUps &&` null-guard are all byte-for-byte preserved. Zero test files modified; all 44 pre-existing tests pass unchanged.

**Issues found**: 3 coverage gaps in `tests/pages/staff-dashboard.test.tsx` (branch order, heading/spacing overrides, Card-wrapper absence) that the sensor surfaced — none caused by this refactor, all pre-existing since the original triplicated code had the same untested behaviors.

**Next steps**: Merge is safe (refactor is behaviorally inert). Recommend filing the 3 fix tasks above as a follow-up issue to close the sensor-identified coverage gaps, per this pipeline's "surviving mutants → fix tasks" rule — but do not block this PR since the gaps are inherited, not introduced.
