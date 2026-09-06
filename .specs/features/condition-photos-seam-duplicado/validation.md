# condition-photos-seam-duplicado Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/condition-photos-seam-duplicado/spec.md`
**Diff range**: `HEAD~1..HEAD` (commit `b621f14`, branch `fix/141-condition-photos-seam-duplicado`)
**Verifier**: independent sub-agent (author ≠ verifier)

This is a **refactor**, not a new feature. The real contract is the
pre-existing, unmodified test suite (`tests/pages/staff-paciente-detail.test.tsx`
§ "Cenário: condition-photos", 20 test cases, part of an 80-test file).
`git show HEAD --stat` confirms zero files under `tests/` are touched by
this diff — only `src/lib/use-condition-photos.ts` (new, 96 lines) and
`src/app/(staff)/pacientes/[id]/condition-photos.tsx` (modified, -85/+14)
plus the spec file itself.

---

## Task Completion

Single-commit refactor; no `tasks.md` present for this feature (spec-only
feature folder). Both stated Success Criteria checked directly:

| Criterion | Status | Notes |
| --- | --- | --- |
| `condition-photos.tsx` no longer imports `useState`/`useEffect` for fetch/state | ✅ Done | Confirmed via diff — component now only destructures `useConditionPhotos(conditionId)` |
| Existing `condition-photos` suite stays 100% green | ✅ Done | `npx vitest run tests/pages/staff-paciente-detail.test.tsx` → `PASS (80) FAIL (0)` |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CONDPH-01: WHEN a condição tem fotos THEN busca/exibe via `useApiQuery` | List sourced from `useApiQuery`, not manual `useState`/`useEffect` | `src/lib/use-condition-photos.ts:32-37` — `useApiQuery<ConditionPhotoDto[]>(...)`; behavior evidenced by `tests/pages/staff-paciente-detail.test.tsx:1667-1687` (2-photo comparison) and `:1606-1614` (empty state) still passing unmodified | ✅ PASS |
| CONDPH-02: WHEN a busca falha THEN `ErrorAlert` com "Tentar novamente" dispara `refresh()` | Retry button triggers `useApiQuery`'s `refresh`, not a version counter | `src/app/(staff)/pacientes/[id]/condition-photos.tsx` (post-diff) — `onRetry={refresh}`; test `tests/pages/staff-paciente-detail.test.tsx:1639-1665` ("Tentar novamente" → `photosCallCount` reaches 2) | ✅ PASS |
| CONDPH-03: WHEN upload ou exclusão têm sucesso THEN lista atualiza via `refresh()` do mesmo `useApiQuery` | Single refetch mechanism after mutation | `src/lib/use-condition-photos.ts:63` (`refresh()` after upload), `:78` (`refresh()` after delete) | ⚠️ Spec-precision gap — see Discrimination Sensor: mutation #2 (dropping the post-upload `refresh()` call) SURVIVED the existing suite. No test in scope asserts that the photo list actually reflects new/removed data after a successful upload or delete; existing tests only assert the network call shape and the toast text. The wiring exists in code but is unverified by any test. |
| CONDPH-04: WHEN upload excede 5 MB THEN bloqueia antes de qualquer chamada de rede | Client-side guard blocks fetch, same as pre-refactor | `src/lib/use-condition-photos.ts:43-46`; test `tests/pages/staff-paciente-detail.test.tsx:1764-1790` (`fetchMock` never called with POST) | ✅ PASS |
| CONDPH-05: WHEN exclusão usa `DELETE /api/photos/[id]` THEN usa `apiFetch` (não `fetch` cru) | Delete goes through `apiFetch` | `src/lib/use-condition-photos.ts:75` — `apiFetch(...DELETE...)`; test `tests/pages/staff-paciente-detail.test.tsx:1824-1851` | ✅ PASS, but **spec overclaim flagged**: `git show HEAD~1:src/app/(staff)/pacientes/[id]/condition-photos.tsx` shows the pre-refactor `remove()` *already* called `apiFetch(...)` for the DELETE — this was never raw `fetch`. CONDPH-05 describes a behavior change that did not occur in this diff; it was already true beforehand. The spec's Goals section conflates it with the real change (moving delete's call site into the new hook), which is a no-op from a "raw fetch → apiFetch" perspective. Not a defect in the refactor, but the spec/requirement text overstates what changed. |

**Status**: ⚠️ 4/5 clean PASS, 1 spec-precision gap (CONDPH-03 undertested by pre-existing suite — not a regression introduced by this diff, but a pre-existing weakness in the "contract" the refactor relies on), 1 spec-overclaim noted (CONDPH-05).

---

## Discrimination Sensor

Scratch method: direct edit + `git checkout -- <file>` per mutation (no other local changes were present; `git status --short` showed only unrelated untracked files before and after each mutation, confirmed clean after each restore).

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/lib/use-condition-photos.ts:43-46` | Removed the 5 MB upload size guard | ✅ Killed — `tests/pages/staff-paciente-detail.test.tsx:1782` ("Imagem excede o limite de 5 MB") failed |
| 2 | `src/lib/use-condition-photos.ts:63` | Removed `refresh()` call after successful upload | ❌ **Survived** — full suite still `PASS (80) FAIL (0)` |
| 3 | `src/lib/use-condition-photos.ts:61` | Swapped upload success toast text `'Foto enviada'` → `'Upload concluído'` | ✅ Killed — `tests/pages/staff-paciente-detail.test.tsx:1761` failed |

**Sensor depth**: lightweight (3 mutations, default tier for a non-P0 refactor)
**Result**: 2/3 killed — ❌ one surviving mutant found

---

## Behavioral-Equivalence Check (replaces new-test coverage check for this refactor)

Diffed `git show HEAD~1:.../condition-photos.tsx` against the new
hook+component pair, line by line:

- **Loading condition**: old gated on `photos === null` (with `listError`
  suppressing it); new gates on `useApiQuery`'s `isLoading` (with
  `listError` still suppressing it first). These are equivalent on **initial**
  load (both null/loading until first settle). They diverge on **refetch**:
  old kept the previous `photos` array visible during a retry/upload/delete
  refetch (its `photos` state is never reset to `null`), while new's
  `isLoading` flips back to `true` on every `refresh()` call (per
  `src/lib/use-api-query.ts:22-23`, `requestKey` changes on `version` bump,
  so `isLoading` is true until the new request settles) — meaning the list
  visually flashes to "Carregando fotos…" during a background refetch,
  which the old code never did. This is a real, if subtle, UX behavior
  difference. **No test in the existing suite observes this transient
  state** (all assertions use `findByText`/`waitFor`, which tolerate an
  intermediate loading render), so it does not fail the "unmodified
  suite stays green" contract, but it is a visible deviation from
  "Comportamento visível idêntico" claimed in the spec's Goals section.
- **Error-suppresses-empty-message logic**: preserved — new code's
  `listError ? null : isLoading ? ... : list.length === 0 ? ... : ...`
  produces the same suppression as old's `photos === null ? (listError ?
  null : loading) : list.length === 0 ? empty : content`.
- **5 MB upload guard**: identical constant (`5 * 1024 * 1024`) and identical
  early-return message, moved verbatim into the hook.
- **Toast messages**: `'Foto enviada'` / `'Foto excluída'` preserved verbatim.
- **Retry wiring**: `onRetry={load}` (old, incremented local `version`) →
  `onRetry={refresh}` (new, `useApiQuery`'s own `refresh`) — functionally
  equivalent trigger, per spec's explicit ask (CONDPH-02).
- **Delete transport**: see CONDPH-05 discussion above — no actual change;
  `apiFetch` was already used for delete pre-refactor.

---

## Code Quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ (no premature unification with `useTriageQueue`, matches spec's Out-of-Scope) |
| Only touched files required for task | ✅ — `use-condition-photos.ts` (new) + `condition-photos.tsx` (modified) + spec.md |
| Matches existing patterns/style | ✅ — mirrors `use-triage-queue.ts` shape closely |
| Tests map to acceptance criteria (spot-check) | ⚠️ CONDPH-03's "list updates after mutation" is asserted only indirectly (via call/toast, not via list content) — see sensor mutation #2 |
| Every test in scope maps to a spec AC/edge case | ✅ — all 20 pre-existing `condition-photos` tests map to CONDPH-01..05 or the two listed Edge Cases |
| Documented project quality/testing guidelines followed | AGENTS.md / project CLAUDE.md — no dedicated guideline file for refactor scope; strong defaults applied |

---

## Edge Cases

- [x] `photos` ainda não resolveu → "Carregando fotos…": handled, `tests/pages/staff-paciente-detail.test.tsx` implicit in every `findByText` flow (no explicit "still loading" assertion exists in old or new suite, consistent with spec calling this "equivalente ao isLoading de useApiQuery" without a dedicated test)
- [x] Erro de carregamento suprime "Carregando fotos…" e "Nenhuma foto registrada.": handled — `tests/pages/staff-paciente-detail.test.tsx:1616-1637`

---

## Gate Check

- **Gate commands run**: `npm run typecheck`, `./node_modules/.bin/biome check .`
- **typecheck**: ✅ pass (`tsc --noEmit`, no output/errors)
- **biome check**: ✅ pass (`Checked 520 files in 577ms. No fixes applied.`)
- **Targeted test run**: `npx vitest run tests/pages/staff-paciente-detail.test.tsx` → `PASS (80) FAIL (0)`, zero files under `tests/` touched by the diff
- **Not run per task instructions** (author already ran and confirmed green this session): `npm run test:coverage`, `npm run test:e2e`

---

## Fix Plans

### Fix 1: CONDPH-03 (upload/delete success refreshes list) is unverified by any test

- **Root cause**: All existing "success" tests for upload/delete assert the
  network call shape (`fetchMock` args) and the toast text, but never
  assert that the rendered list actually changes (new photo appears /
  deleted photo disappears) after the mutation resolves. This predates the
  refactor — the old `version`-counter implementation had the same gap —
  so it is not a regression introduced by this diff, but it means the
  "unmodified test suite" safety net does not actually cover CONDPH-03's
  literal claim.
- **Fix task**: Add an assertion to the existing upload-success test
  (`tests/pages/staff-paciente-detail.test.tsx:1717-1762`) and the
  delete-success test (`:1824-1851`) that the mocked `GET .../photos`
  response changes between the pre- and post-mutation `refresh()` call
  (e.g. return an updated fixture list on the second GET and assert the
  new/removed photo's text appears/disappears), or add a dedicated new
  test. This is a test-suite hardening task, not a fix to the refactor
  itself — the refactor's `refresh()` wiring matches `useTriageQueue`'s
  established pattern.
- **Priority**: Minor (pre-existing test gap, not a defect in this refactor; does not block merge of a refactor whose stated goal is "no test changes")

### Fix 2 (informational, not blocking): Spec overclaim on CONDPH-05

- The spec's CONDPH-05 states delete moves from raw `fetch` to `apiFetch`.
  The pre-refactor code already used `apiFetch` for delete. Recommend
  correcting the spec text (or issue #141's description) to avoid implying
  a behavior change that did not occur, but this does not require any code
  change.

### Fix 3 (informational, not blocking): Loading-flash regression on refetch

- New `isLoading` flips true on every `refresh()`, unlike old code which
  kept the prior list visible during refetch. Spec claims "Comportamento
  visível idêntico". No test guards this either way. Recommend either (a)
  accepting the deviation as acceptable (brief flash, arguably even more
  correct/consistent with `useApiQuery`'s intended semantics), or (b)
  filing a follow-up if product wants the old no-flash behavior preserved.

---

## Requirement Traceability Update

| Requirement ID | Previous Status | New Status |
| --- | --- | --- |
| CONDPH-01 | Pending | ✅ Verified |
| CONDPH-02 | Pending | ✅ Verified |
| CONDPH-03 | Pending | ⚠️ Verified in code, weak test coverage (pre-existing gap) |
| CONDPH-04 | Pending | ✅ Verified |
| CONDPH-05 | Pending | ✅ Verified (code matches claim); spec overclaims novelty of the change |

---

## Summary

**Overall**: ⚠️ Issues (non-blocking) — the refactor itself is correct and
behavior-preserving for everything the existing suite actually exercises;
the issues found are pre-existing test-coverage weaknesses and spec-text
inaccuracies, not defects introduced by this diff.

**Spec-anchored check**: 4/5 ACs cleanly matched; 1 spec-precision gap (CONDPH-03)
**Sensor**: 2/3 mutations killed, 1 survived (CONDPH-03-related)
**Gate**: typecheck ✅, biome ✅, targeted vitest run 80/80 ✅

**What works**: Hook faithfully mirrors `use-triage-queue.ts`'s shape;
loading/error-suppression logic, 5 MB guard, toast text, and retry wiring
are all behaviorally preserved; zero test-file modifications, full
pre-existing suite green.

**Issues found**:
1. Surviving mutant — dropping post-upload `refresh()` doesn't fail any
   test (CONDPH-03 undertested; pre-existing gap, not introduced here).
2. Spec's CONDPH-05 overclaims a fetch→apiFetch change for delete that
   already existed pre-refactor.
3. Subtle loading-flash behavior change on refetch, untested either way.

**Next steps**: Optional test-hardening task (Fix 1) to close the CONDPH-03
gap; correct spec text for CONDPH-05; no code change required to merge this
refactor as-is.

---

## Iteration 2 (independent re-verification)

**Date**: 2026-09-06
**Diff checked**: commit `8591b5b` ("fix: corrige flash de loading e fecha
gap de cobertura pós-refresh (#141)")
**Verifier**: independent, fresh pass (no fixing, targeted re-check only)

| Gap from Iteration 1 | Status |
| --- | --- |
| #1 Surviving mutant (dropped post-upload `refresh()` didn't fail any test) | ✅ Closed — `tests/pages/staff-paciente-detail.test.tsx` upload-success test (renamed, ~line 1717) and delete-success test (~line 1840) now mock the `GET .../photos` response to change after the mutation and assert on rendered content: `findByAltText('Foto de ...')` present / `'Nenhuma foto registrada.'` absent (upload), `findByText('Nenhuma foto registrada.')` present (delete). |
| #2 Spec CONDPH-05 overclaim (fetch→apiFetch on delete) | ✅ Closed — spec.md now states delete "já usava `apiFetch`" pre-refactor and explicitly frames the AC as a preserved invariant, not a diff-introduced change. |
| #3 Real deviation: `isLoading` gate caused loading-flash on refresh | ✅ Closed — `condition-photos.tsx:53` (post-fix) gates on `photos === null` instead of `isLoading`. Confirmed byte-identical gate semantics to pre-refactor original: `git show HEAD~2:'src/app/(staff)/pacientes/[id]/condition-photos.tsx'` shows the same `photos === null` condition (`isLoading` no longer destructured from the hook in the component). |

**Sensor re-check**: Re-applied surviving mutant #2 (removed `refresh();` after
the upload-success toast in `src/lib/use-condition-photos.ts:63`) in a scratch
edit (`git status --short` clean before/after, restored via `git checkout --`).
`npx vitest run tests/pages/staff-paciente-detail.test.tsx` now **fails** —
the upload-success test times out on `findByAltText('Foto de ...')` at
`tests/pages/staff-paciente-detail.test.tsx:1771`, confirming the mutant is
now killed. Tree fully restored (`git status --short` matches pre-check
state).

**Gate check**:
- `npm run typecheck` → ✅ pass, no output/errors
- `./node_modules/.bin/biome check .` → ✅ pass (`Checked 520 files in 1574ms. No fixes applied.`)

**Verdict**: ✅ PASS — all 3 Iteration 1 gaps confirmed closed; no new issues found.
