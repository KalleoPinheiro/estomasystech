# Seam de save de rascunho em Configurações Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/configuracoes-savable-form-seam/spec.md`
**Diff range**: `main..HEAD` (branch `refactor/configuracoes-savable-form-seam`, commits `25baa28`, `543545a`, `b54fcee`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| feat: add `useSavableForm` hook (`25baa28`) | ✅ Done | `src/lib/use-savable-form.ts` + `tests/lib/use-savable-form.test.ts` |
| refactor: `ClinicInfoSection` uses hook (`543545a`) | ✅ Done | `src/app/(staff)/configuracoes/page.tsx` |
| refactor: `ScheduleSection` uses hook (`b54fcee`) | ✅ Done | same file |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CFG-SEAM-01: hook returns `{draft, setDraft, saveError, save}` on mount, no edits | `draft === initialValue`, `saveError === null`, `save` is a function | `tests/lib/use-savable-form.test.ts:34-36` — `expect(result.current.draft).toEqual({ name: 'a' })`; `expect(result.current.saveError).toBeNull()`; `expect(typeof result.current.save).toBe('function')` | ✅ PASS |
| CFG-SEAM-02: `save()` succeeds → toast success, clear `saveError`, call `onSaved()` | PUT sent with draft body; `onSaved` called once; `saveError` null | `tests/lib/use-savable-form.test.ts:61-69` — `expect(fetchMock).toHaveBeenCalledWith('/api/x', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'b' }) }))`; `expect(onSaved).toHaveBeenCalledTimes(1)`; `expect(result.current.saveError).toBeNull()` | ✅ PASS |
| CFG-SEAM-03: `save()` PUT rejects → `saveError` = error message (`err.message` if `Error`, else fallback) | `saveError` equals the envelope's error text (`'Erro simulado'`) | `tests/lib/use-savable-form.test.ts:93` — `await waitFor(() => expect(result.current.saveError).toBe('Erro simulado'))` | ✅ PASS. Note: this exercises the `Error`-instance branch only (via `apiFetch`/`ApiError extends Error`); the non-`Error` fallback branch (`errorFallback`) has no dedicated unit test in this file — covered instead by `tests/pages/staff-operations.test.tsx:722-739` ("erro não padronizado... exibe mensagem padrão") at the integration level for `ScheduleSection`. |
| CFG-SEAM-04: `validate` returns non-null message before network call → set `saveError`, do NOT call API | `saveError === 'inválido'`; `fetchMock` not called | `tests/lib/use-savable-form.test.ts:116-117` — `expect(result.current.saveError).toBe('inválido')`; `expect(fetchMock).not.toHaveBeenCalled()` | ✅ PASS |
| CFG-SEAM-05: `ClinicInfoSection` observable behavior (fields, button, toasts, error text) identical | Same fields/toasts/error rendering as before the refactor | `tests/pages/staff-operations.test.tsx:318-320` (empty state fields); `:355-377` (edit → PUT → `'Dados da clínica salvos'` toast); `:380-406` (PUT rejects → error alert rendered) — unchanged pre-existing assertions, still green against the refactored implementation | ✅ PASS |
| CFG-SEAM-06: `ScheduleSection` observable behavior (day toggle, validation, refresh post-save, toasts) identical | Same day-toggle `aria-pressed`/class, same success/error toasts, same refresh-triggering `onSaved` wiring | `tests/pages/staff-operations.test.tsx:520-531` (toggle day on); `:639-676` (toggle day off); `:534-575` (save success → `'Grade salva — vale imediatamente...'` toast); `:577-615` (save failure → alert); `:722-739` (non-`Error` rejection → fallback message) | ⚠️ Spec-precision gap: the "refresh pós-save" clause is not independently asserted — no test in `tests/pages/staff-operations.test.tsx` checks a second GET to `/api/settings/schedule` (or an equivalent refetch signal) after a successful save; the wiring is visible only via source (`ScheduleSection` passes `onSaved={refresh}` from `useApiQuery`, page.tsx diff) and via CFG-SEAM-02's generic `onSaved` unit test, not a page-level assertion of the refresh side effect. This gap pre-dates the refactor (same absence would apply to the original inline `refresh()` call) — not a regression introduced by this diff. |

**Status**: ⚠️ Spec-precision gap flagged (CFG-SEAM-06's refresh clause) — all 6 ACs otherwise have direct, evidence-backed PASS.

`tests/pages/configuracoes-calendar-integration.test.tsx` was checked and contains no `ClinicInfoSection`/`ScheduleSection`/schedule assertions (it covers only `CalendarIntegrationSection`, correctly out of scope per spec) — it ran clean as part of the gate but contributes no AC evidence.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/lib/use-savable-form.ts:44-47` | Removed early `return` after `setSaveError(validationMessage)` in the `validate` branch (so `save()` would fall through to the network call even when validation fails) | ✅ Killed — CFG-SEAM-04 test failed: `expected null to be 'inválido'` |
| 2 | `src/lib/use-savable-form.ts:53` | Removed `onSaved?.()` call after successful PUT | ✅ Killed — CFG-SEAM-02 test failed: `expected "vi.fn()" to be called 1 times, but got 0 times` |
| 3 | `src/lib/use-savable-form.ts:56` | Removed `setSaveError(message)` in the `catch` branch (kept the toast) | ✅ Killed — CFG-SEAM-03 test failed (`waitFor` timed out, `saveError` never became `'Erro simulado'`) |

**Sensor depth**: lightweight (internal refactor, non-P0)
**Result**: 3/3 killed — PASS ✅

Each mutation was applied via direct `Edit` on the tracked file (working tree was clean going in — no stash needed), verified against `npx vitest run tests/lib/use-savable-form.test.ts`, then reverted with `git checkout -- src/lib/use-savable-form.ts`. Tree confirmed clean (`git status --short` / `git diff --stat` empty for the file) after each revert and at the end.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — hook is a straight extraction of the duplicated logic, no new features |
| Surgical changes | ✅ |
| No scope creep | ✅ — `AccountsSection` and `CalendarIntegrationSection` have zero diff lines (`git diff main..HEAD -- 'src/app/(staff)/configuracoes/page.tsx' | grep 'AccountsSection\|CalendarIntegrationSection'` → no matches) |
| Matches patterns | ✅ — hook follows existing `use-*.ts` client-hook conventions (`'use client'`, `useToast`, `apiFetch`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ for CFG-SEAM-01..05; ⚠️ spec-precision gap for CFG-SEAM-06 refresh clause (see above) |
| Per-layer Coverage Expectation met | ✅ — unit-level 1:1 mapping for CFG-SEAM-01..04 in `use-savable-form.test.ts`; page-level happy+error paths for both sections in `staff-operations.test.tsx` |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — all 4 new unit tests carry explicit `(CFG-SEAM-0N)` tags; page tests are pre-existing, unmodified, and map to CFG-SEAM-05/06 |
| Documented guidelines followed | `docs/still-void-gaps.md` not applicable (no new raw HTML elements introduced); Biome (`biome.json`) — clean; project testing convention (Portuguese Gherkin-style `it` names) — followed |

Files touched (diff surface) exactly match the 4 files named in the task: `src/lib/use-savable-form.ts`, `tests/lib/use-savable-form.test.ts`, `src/app/(staff)/configuracoes/page.tsx`, `.specs/features/configuracoes-savable-form-seam/spec.md`. No other files changed.

---

## Edge Cases

- [x] Edited draft + unmount before save: hook keeps the same no-effects/no-timers shape as the original inline implementation (plain `useState`, no `useEffect`); no new async work introduced. Not independently unit-tested but structurally unchanged from the pre-refactor code, so no regression risk.
- [x] Double-click / rapid double `save()`: no debounce/dedupe was added (per explicit "Out of Scope" / edge-case note) — code path is unchanged from the original (same `try/await/catch` shape, no guard against concurrent calls either before or after).

---

## Gate Check

- **Gate commands**: `npx tsc --noEmit`; `./node_modules/.bin/biome check .`; `npx vitest run tests/lib/use-savable-form.test.ts tests/pages/staff-operations.test.tsx tests/pages/configuracoes-calendar-integration.test.tsx`
- **typecheck**: `TypeScript: No errors found` ✅
- **biome**: `Checked 523 files in 1297ms. No fixes applied.` ✅
- **vitest**: `PASS (93) FAIL (0)` ✅
- **Test count before feature**: not independently re-derived (out of scope of this diff's test files — pre-existing `staff-operations.test.tsx`/`configuracoes-calendar-integration.test.tsx` suites unmodified; 4 new tests added in `use-savable-form.test.ts`)
- **Skipped tests**: none observed
- **Failures**: none

---

## Fix Plans (if issues found)

None required to reach PASS. Optional (non-blocking) improvement:

### Optional: strengthen CFG-SEAM-06 refresh coverage

- **Observation**: no test asserts that `ScheduleSection`'s successful save triggers a refetch of `/api/settings/schedule` (the `onSaved={refresh}` wiring visible only in source, not in an assertion).
- **Suggested fix task**: add a `fetchMock.mock.calls.filter(...)` count assertion (or a "config updates after save" render assertion) in `tests/pages/staff-operations.test.tsx`'s existing "salvar grade... sucesso" test.
- **Priority**: Minor — pre-existing gap, not a regression introduced by this refactor; does not block this feature's PASS since CFG-SEAM-02 already unit-tests the generic `onSaved` call mechanism the hook provides.

---

## Requirement Traceability Update

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CFG-SEAM-01 | P1 | Implementing | ✅ Verified |
| CFG-SEAM-02 | P1 | Implementing | ✅ Verified |
| CFG-SEAM-03 | P1 | Implementing | ✅ Verified |
| CFG-SEAM-04 | P1 | Implementing | ✅ Verified |
| CFG-SEAM-05 | P1 | Implementing | ✅ Verified |
| CFG-SEAM-06 | P1 | Implementing | ✅ Verified (⚠️ spec-precision gap on refresh sub-clause, non-blocking) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 6/6 ACs matched spec outcome directly; 1 spec-precision gap flagged (CFG-SEAM-06 refresh sub-clause not independently asserted, pre-existing, non-regression)
**Sensor**: 3/3 mutations killed
**Gate**: typecheck ✅, biome ✅, vitest 93 passed / 0 failed

**What works**: `useSavableForm` correctly encapsulates draft/saveError/save/validate/onSaved; both `ClinicInfoSection` and `ScheduleSection` were refactored onto it with zero observable-behavior regressions per the unmodified pre-existing page tests; `AccountsSection` and `CalendarIntegrationSection` correctly left untouched per the spec's scope adjustment.

**Issues found**: None blocking. Optional: add an explicit refresh-after-save assertion for `ScheduleSection` (see Fix Plans) — recommended as a follow-up, not required for this feature to pass.

**Next steps**: Merge as-is. Optionally file the refresh-assertion strengthening as a small follow-up task.
