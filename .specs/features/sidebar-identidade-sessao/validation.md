# Identidade de sessão na sidebar — Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/sidebar-identidade-sessao/spec.md`
**Diff range**: `5acdc4f` (single commit on `fix/126-sidebar-identidade-sessao`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No `tasks.md` present in the feature folder (only `spec.md` + this report). Implementation is a single commit touching route, DTO, role-label helper, component, and two test files — consistent with the spec's scope. Treated as one completed unit.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SIDEBAR-01: `clinicId` válido → mostra `clinics.name` | `clinicLabel === 'Clínica B (teste)'` (real seeded clinic name) | `tests/api/auth-identity.test.ts:52` — `expect(body.data?.clinicLabel).toBe('Clínica B (teste)')`; also `tests/pages/staff-layout-client.test.tsx:29-40` renders `'Clínica EstomaSysTech Ltda'` | ✅ PASS |
| SIDEBAR-02: `clinicId === null` → "Conta de sistema" | `clinicLabel === 'Conta de sistema'` (exact string) | `tests/api/auth-identity.test.ts:72` — `expect(body.data?.clinicLabel).toBe('Conta de sistema')`; component: `tests/pages/staff-layout-client.test.tsx:47-51` | ✅ PASS |
| SIDEBAR-03: sessão existe → mostra e-mail (`subject`) + rótulo legível do `role` | `account.email === subject`, `account.roleLabel` = mapped label | `tests/api/auth-identity.test.ts:53-56` — `expect(body.data?.account).toEqual({ email: 'ana@clinica.com', roleLabel: 'Admin de Empresa' })`; component: `tests/pages/staff-layout-client.test.tsx:33-40` — `expect(screen.getByText('ana@clinica.com · Admin de Empresa')).toBeInTheDocument()` | ✅ PASS (see note below on "próximo ao botão de logout") |
| SIDEBAR-04: `clinics.findById(clinicId)` retorna `null` → "Clínica não encontrada" | `clinicLabel === 'Clínica não encontrada'` (exact string) | `tests/api/auth-identity.test.ts:93` — `expect(body.data?.clinicLabel).toBe('Clínica não encontrada')` | ✅ PASS |

**Status**: ✅ All 4 numbered ACs covered with exact spec-defined outcomes.

**Note (not a blocking gap):** SIDEBAR-03 says the email/role should render "próximo ao botão de logout" (near the logout button). In `src/app/(staff)/staff-layout-client.tsx:55-63`, `<SidebarIdentity />` sits at the top of the panel and `<LogoutButton />` at the bottom (`justify-between`) — same panel, but visually opposite ends, not adjacent. This is a layout/visual judgment call better suited to UAT than a unit assertion; flagged as a spec-precision note, not scored as a gap.

---

## Edge Cases

| Edge case (spec.md) | `file:line` + assertion | Result |
| --- | --- | --- |
| Sessão `null` (modo aberto, `ESTOMASYSTECH_ALLOW_OPEN_MODE=true`) → "Conta de sistema", sem quebrar | `tests/api/auth-identity.test.ts:96-111` — `expect(body.data?.clinicLabel).toBe('Conta de sistema')`, `expect(body.data?.account).toBeNull()` | ✅ PASS |
| `role` fora do mapa de rótulos conhecidos → cai para exibir o valor bruto do `role` | — no citation found | ❌ GAP — NOT COVERED |

**Evidence for the gap:** `grep -rn "role-labels" tests/` returns no matches — `src/lib/auth/role-labels.ts` has zero direct tests. The route tests (`tests/api/auth-identity.test.ts`) only exercise the 4 mapped roles (`company_admin`, `super_admin`, `atendente`, implicitly `profissional` via the map but never asserted). `STAFF_ROLE_LABELS[role] ?? role` fallback branch (`src/lib/auth/role-labels.ts:12`) is never exercised by any test — evidence-or-zero rule applies: NOT covered.

---

## Discrimination Sensor

Sensor run in the real working tree with `git checkout -- <file>` restore after each mutation (repo was clean before/after; verified via `git status --short`).

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/app/api/auth/identity/route.ts:28` | Flipped `session.clinicId === null` → `session.clinicId !== null` | ✅ Killed (3 tests failed) |
| 2 | `src/app/api/auth/identity/route.ts:39` | `clinic ? clinic.name : 'Clínica não encontrada'` → always `'Clínica não encontrada'` | ✅ Killed (1 test failed) |
| 3 | `src/app/api/auth/identity/route.ts:8` | `SYSTEM_ACCOUNT_LABEL = 'Conta de sistema'` → `'Conta de sistema (mutated)'` | ✅ Killed (2 tests failed) |

**Sensor depth**: lightweight (default feature, not P0/critical-path)
**Result**: 3/3 killed — PASS ✅

Working tree confirmed restored to original state after each mutation and at the end (`git status --short` shows only pre-existing unrelated untracked files: `.impeccable/`, `.playwright-mcp/`, `login-screenshot.png`).

---

## Payload / Conjunction Check

`SidebarIdentityDto { clinicLabel: string; account: { email: string; roleLabel: string } | null }`.

- Route tests assert on actual field values, not just HTTP status: `tests/api/auth-identity.test.ts:52,53-56,72,73-76,93,109-110` all assert `body.data?.clinicLabel` / `body.data?.account` content, not merely `response.status === 200`.
- Component tests assert on rendered text derived from those fields, not just "no crash": `tests/pages/staff-layout-client.test.tsx:33-40` (`'Clínica EstomaSysTech Ltda'` and `'ana@clinica.com · Admin de Empresa'`), `:47-51` (`'Conta de sistema'`), `:56-64` (account null → no `·` separator rendered, via `screen.queryByText(/·/)).not.toBeInTheDocument()`), `:66-78` (no leftover hardcoded `'Clínica de Estomaterapia'` string).
- **Result**: ✅ Conjunction check passes — no test in scope is a shallow "200 OK" or "renders without throwing" assertion; all target concrete field/text values.

---

## Gate Check

- **Gate commands**: `npm run typecheck`, `./node_modules/.bin/biome check tests/api/auth-identity.test.ts tests/pages/staff-layout-client.test.tsx src/app/api/auth/identity/route.ts src/lib/auth/role-labels.ts src/lib/dto.ts "src/app/(staff)/staff-layout-client.tsx"`, `npx vitest run tests/api/auth-identity.test.ts tests/pages/staff-layout-client.test.tsx`
- **typecheck**: ✅ pass (`tsc --noEmit`, no output/errors)
- **biome**: ✅ pass (`Checked 6 files in 29ms. No fixes applied.`)
- **vitest**: ✅ pass — `PASS (10) FAIL (0)` (6 tests in `auth-identity.test.ts` + 4 in `staff-layout-client.test.tsx`)
- **Skipped tests**: none
- **Failures**: none

Full `npm run test:coverage` (90% global gate) and `npm run test:e2e` were **not** run by this Verifier — out of the scope explicitly assigned (route/component-level gate commands only). Recommend running the full coverage gate before merge, since the uncovered fallback branch in `role-labels.ts` may show up there too.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — DTO + tiny helper + route + extracted component, no extra abstraction |
| Surgical changes | ✅ — only the 6 files declared in scope, no unrelated edits |
| No scope creep | ✅ — no clinic-switcher UI, no role-label reuse elsewhere (explicitly deferred per spec's YAGNI note) |
| Matches existing patterns | ✅ — mirrors existing `requireStaffSession` + `useApiQuery` pattern used by `FollowUpsCard`/`LowStockCard`/`TriageQueue` per spec's own rationale |
| Spec-anchored outcome check (asserted values match spec) | ✅ for the 4 numbered ACs; ❌ for 1 of 2 edge cases (role fallback untested) |
| Per-layer coverage (domain 1:1 ACs; routes happy+edge+error) | ⚠️ Route covers happy path + 2 defined edge branches (null clinicId, findById-null) + 401 unauthenticated, but misses the role-fallback edge case explicitly listed in spec.md |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — all 10 tests trace to an AC, edge case, or the "Não sobra nenhum texto fixo" success criterion |
| Documented guidelines followed | AGENTS.md (Biome, 90% coverage gate) — followed for the checks run; full coverage gate not verified here |

---

## Summary

**Overall**: ⚠️ Issues (not a clean PASS — one spec-listed edge case has zero test evidence)

**Spec-anchored check**: 4/4 numbered ACs matched spec outcome exactly. 1/2 edge cases covered (the "role fora do mapa" edge case has no `file:line` citation → NOT covered per evidence-or-zero).

**Sensor**: 3/3 mutations killed.

**Gate**: typecheck ✅, biome ✅, vitest (scoped) 10/10 ✅. Full `test:coverage`/`test:e2e` not run by this Verifier.

**What works**: All 4 formal ACs (SIDEBAR-01..04) are precisely tested at both route and component layers with exact expected values, not vague assertions. The route logic is well-discriminated by tests (3/3 injected mutants killed). No shallow "200 OK"-only or "doesn't crash"-only tests found.

**Issues found**:
1. **Untested edge case**: `role` fora do mapa conhecido → fallback pro valor bruto (`STAFF_ROLE_LABELS[role] ?? role` in `src/lib/auth/role-labels.ts:12`) has no test anywhere in the diff. Fix: add one unit test (either directly on `staffRoleLabel()` or via the route with a session role — e.g. `'partner'` or `'patient'`, which exist in `UserRole` but aren't in `STAFF_ROLE_LABELS` — asserting `roleLabel` equals the raw role string).

**Next steps**: Add the missing edge-case test, then re-run this Verifier's gate + sensor once more before treating the feature as fully done. Given the fix is a single small test addition with no production-code risk, this does not block merge on its own but should be tracked as a fix task per spec's own edge-case enumeration.

---

## Requirement Traceability Update

| Requirement ID | Previous Status | New Status |
| --- | --- | --- |
| SIDEBAR-01 | Pending | ✅ Verified |
| SIDEBAR-02 | Pending | ✅ Verified |
| SIDEBAR-03 | Pending | ✅ Verified |
| SIDEBAR-04 | Pending | ✅ Verified |
| Edge case: modo aberto sem sessão | Pending | ✅ Verified |
| Edge case: role fora do mapa | Pending | ❌ Needs Fix (no test evidence) |
