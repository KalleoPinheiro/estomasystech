# Feedback visual da conexão do Google Agenda — Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/feedback-conexao-google-calendar/spec.md`
**Diff range**: single commit `1503659e37187b1dd1107c9e1f6064451180c554` on branch `fix/124-feedback-conexao-google-calendar`
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No `tasks.md` present for this feature (spec-only artifact in repo). Assessed directly against `spec.md` P1 story acceptance criteria and Edge Cases.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CALINT-01: clínica conectada mostra e-mail + data | `data.connected===true`, email/connectedAt do `findMostRecent()`, renderizado como "Conectado como X em Y" | `tests/api/calendar-integration-status.test.ts:66-69` — `expect(body.data?.connected).toBe(true); expect(body.data?.email).toBe('agenda@clinica.com'); expect(body.data?.connectedAt).toBe(connectedAt.toISOString())`; UI: `tests/pages/configuracoes-calendar-integration.test.tsx:56-69` — `expect(screen.getByText(/agenda@clinica\.com/)).toBeInTheDocument()` + "Reconectar Google Agenda" present | ✅ PASS |
| CALINT-02: sem conta conectada mostra estado claro | `data.connected===false`, UI shows literal "Nenhuma conta conectada." (never blank/ambiguous) | `tests/api/calendar-integration-status.test.ts:36-40` — `expect(body.data).toEqual({connected:false,email:null,connectedAt:null})`; UI: `tests/pages/configuracoes-calendar-integration.test.tsx:71-80` — `expect(screen.getByText('Nenhuma conta conectada.')).toBeInTheDocument()` + "Conectar Google Agenda" present | ✅ PASS |
| CALINT-03: `?calendar=conectado` shows success toast | toast fired with a specific success description/variant | `tests/pages/configuracoes-calendar-integration.test.tsx:82-98` — `expect(toastMock).toHaveBeenCalledWith({description: 'Google Agenda conectado com sucesso', variant: 'success'})` | ✅ PASS |
| CALINT-04: OAuth callback failures redirect with `reason=<code>` (never raw JSON) + matching allowlisted toast | Each of the 4 failure paths (config missing, invalid state, no refresh token, exchange failure) returns HTTP 307 redirect to `/configuracoes?calendar=erro&reason=<code>`, exact code per branch; page shows exact allowlisted message for that reason | Config missing: `tests/api/calendar-integration-routes.test.ts:298-313` — `expect(response.status).toBe(307); expect(location.searchParams.get('reason')).toBe('nao_configurado')`. Invalid/missing state: `:216-235` and `:237-254` — `reason` = `'fluxo_invalido'`, `expect(await storedCredential()).toBeNull()`. Session-mismatch also asserted at `:315-349` (`reason==='fluxo_invalido'`, no credential saved under either account). No refresh token: `:256-274` — `reason==='sem_credencial'`. Exchange failure (thrown error): `:276-296` — `reason==='falha_conexao'`. Toast side: `tests/pages/configuracoes-calendar-integration.test.tsx:100-115` — asserts exact allowlisted message for `reason=sem_credencial` | ✅ PASS (all 4 failure codes + toast wiring covered with exact reason values) |
| CALINT-05: unknown `reason` shows generic message, never raw value | Generic message shown; raw `reason` string never rendered | `tests/pages/configuracoes-calendar-integration.test.tsx:117-132` — reason=`<script>alert(1)</script>`, `expect(toastMock).toHaveBeenCalledWith({description: 'Não foi possível conectar o Google Agenda. Tente novamente.', variant: 'danger'})` (script string never asserted/rendered) | ✅ PASS |

**Status**: ✅ All 5 CALINT ACs covered with exact spec-defined outcomes (evidence-or-zero satisfied for all).

---

## Edge Cases

| Edge Case | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| super_admin / modo aberto (`clinicId===null`) scoped as "sistema", no cross-clinic leak | Status route resolves account under a system-scoped row when `clinicId` is null, without ever exposing another clinic's credential | **No test found.** Searched `tests/api/calendar-integration-status.test.ts`, `tests/api/calendar-integration-routes.test.ts`, `tests/pages/configuracoes-calendar-integration.test.tsx`, `tests/pages/staff-operations.test.tsx` for `super_admin`, `clinicId: null`, `modo aberto` — zero matches. The status route code (`src/app/api/settings/calendar-integration/route.ts:14`, `guard.session?.clinicId ?? null`) does pass `clinicId` through unconditionally, which is consistent with the existing (#74) repository convention, but this diff adds no regression test proving the new route behaves correctly for `clinicId===null`, nor a test proving cross-clinic non-leakage in that specific mode. | ❌ GAP (NOT covered by this diff — evidence-or-zero) |
| No `calendar` param → no toast at all | `toastMock` never called on plain navigation | `tests/pages/configuracoes-calendar-integration.test.tsx:134-143` — `expect(toastMock).not.toHaveBeenCalled()` | ✅ PASS |

**Edge case coverage: 1/2 matched.**

---

## Discrimination Sensor

Performed directly on the real tracked files (no uncommitted changes existed beforehand for these files), each mutation reverted via `git checkout --` immediately after observing the failure; `git status --short` was clean before and after all three mutations (only pre-existing untracked scratch files `.impeccable/`, `.playwright-mcp/`, `login-screenshot.png` present throughout, unrelated to this feature).

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/app/api/integrations/google-calendar/callback/route.ts:100` | Changed `'sem_credencial'` literal to `'falha_conexao'` in the no-refresh-token branch | ✅ Killed — `tests/api/calendar-integration-routes.test.ts:272` failed (`expected 'falha_conexao' to be 'sem_credencial'`) |
| 2 | `src/app/api/integrations/google-calendar/callback/route.ts:99` | Flipped null-check `if (!tokens.refresh_token)` → `if (tokens.refresh_token)` | ✅ Killed — 2 tests failed: `tests/api/calendar-integration-routes.test.ts:195` (credential not persisted) and `:272` (wrong reason surfaced) |
| 3 | `src/app/api/settings/calendar-integration/route.ts:16-23` | Made status route always return `{connected:false, email:null, connectedAt:null}` regardless of `findMostRecent()` result | ✅ Killed — `tests/api/calendar-integration-status.test.ts:67` failed (`expected false to be true`) |

**Sensor depth**: lightweight (3 targeted mutations, default tier for non-P0 feature)
**Result**: 3/3 killed — ✅ PASS

---

## Payload/Conjunction Check

- `CalendarIntegrationStatusDto` (`connected`/`email`/`connectedAt`): tests assert the full object shape via `toEqual` for the disconnected case (`tests/api/calendar-integration-status.test.ts:36-40`) and individual exact field values for the connected case (`:67-69`, including `connectedAt` matched against the literal ISO string of the fixture date, not just truthiness). ✅ Values, not just status/truthiness.
- Redirect URL `calendar`/`reason` params: tests parse `location` with `new URL(...)` and assert exact `searchParams.get('calendar')` / `get('reason')` values per branch (`tests/api/calendar-integration-routes.test.ts:230-233, 251-252, 270-272, 294-295, 311-312, 335-340`), not just HTTP status. ✅ Values asserted.

---

## Gate Check

- **Gate commands**: `npm run typecheck`, `./node_modules/.bin/biome check .`, `npx vitest run tests/api/calendar-integration-routes.test.ts tests/api/calendar-integration-status.test.ts tests/pages/configuracoes-calendar-integration.test.tsx tests/pages/staff-operations.test.tsx`
- **typecheck**: ✅ clean, no errors
- **biome check**: ✅ "Checked 519 files in 556ms. No fixes applied."
- **vitest (targeted)**: ✅ 107 passed, 0 failed
- Full `test:coverage` and `test:e2e` explicitly out of scope for this verification per task instructions (already run green by author this session).

---

## Code Quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ — no disconnect/revoke button added (correctly out of scope) |
| No abstractions for single-use code | ✅ |
| Only touched files required for task | ✅ — scope matches the commit's stated files |
| Matches existing patterns | ✅ — mirrors `LOGIN_ERROR_MESSAGES` allowlist pattern from `src/app/login/page.tsx`, same `useApiQuery`/`useToast` conventions as `ClinicInfoSection` |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see AC table above |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — all new/modified assertions trace to CALINT-01..05 or the "no toast" edge case; `staff-operations.test.tsx` changes are test-fixture plumbing (mock the new fetch call) with no new claims |
| Documented guidelines followed | Biome (project) — clean; no dedicated testing guideline file cited beyond AGENTS.md's 90% coverage gate (out of scope here) |

---

## Requirement Traceability Update

| Requirement ID | Previous Status | New Status |
| --- | --- | --- |
| CALINT-01 | Pending | ✅ Verified |
| CALINT-02 | Pending | ✅ Verified |
| CALINT-03 | Pending | ✅ Verified |
| CALINT-04 | Pending | ✅ Verified |
| CALINT-05 | Pending | ✅ Verified |
| Edge case: super_admin/modo aberto scoping | Pending | ❌ Needs Fix (no test evidence) |
| Edge case: no `calendar` param → no toast | Pending | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues (one gap; all 5 primary ACs and the gate are otherwise solid)

**Spec-anchored check**: 5/5 CALINT ACs matched spec outcome; 1/2 Edge Cases matched
**Sensor**: 3/3 mutations killed
**Gate**: typecheck ✅, biome ✅, 107/107 targeted tests ✅

**What works**: All five P1 acceptance criteria (connected/disconnected display, success toast, all 4 OAuth failure→redirect→toast paths, unknown-reason generic fallback) are covered with tests asserting exact spec-defined values, not just presence. The discrimination sensor confirms the tests actually catch regressions in the reason-literal mapping, the refresh-token guard, and the status route's connected/disconnected branching. `typecheck`, `biome check`, and the full targeted test suite are green.

**Issues found**:
1. The super_admin/modo aberto ("as sistema", `clinicId===null`) scoping edge case from spec.md has zero test coverage in this diff. The implementation plausibly inherits correct behavior from the pre-existing #74 repository convention (`getRepositories({clinicId: guard.session?.clinicId ?? null})` in `src/app/api/settings/calendar-integration/route.ts:14`), but nothing in this commit proves the new status route behaves correctly (or non-leaking) for that session shape. **Fix**: add a test to `tests/api/calendar-integration-status.test.ts` using a `super_admin`/open-mode cookie (clinicId null) asserting the status resolves to the system-scoped row and does not leak any specific clinic's credential.

**Next steps**: Add the missing super_admin/open-mode test (Minor severity — the underlying repository logic is pre-existing and tested elsewhere per #74, so this is a coverage gap rather than a demonstrated behavior bug). Given it's a single missing test rather than a functional defect, a fix-task round-trip is optional at the author's/orchestrator's discretion, but should be logged before closing #124 if strict CALINT edge-case coverage is required.

---

## Iteration 2 — Independent Re-Verification (2026-09-06)

**Fix commit**: `afa671c` ("test(calendar): cobre escopo super_admin/sistema no status da conexão (#124)")

**Gap re-check**: The iteration-1 gap ("super_admin/modo aberto scoping edge case has zero test coverage") is **closed**.

1. **Spec correction verified accurate**: `spec.md`'s edge case now states status resolves via `googleAccounts.findMostRecent()` with no clinic filter (AD-017), citing `tenant-scope.ts:12-13`. Confirmed directly against `src/infrastructure/persistence/drizzle/tenant-scope.ts:12-16`: `withTenant` returns `extra` alone (no `eq(table.clinicId, ...)`) when `clinicId === null`. The original wording's "isolated system bucket, no leak" framing was indeed wrong; the corrected wording ("system role does not filter by clinic — intentional cross-clinic access per AD-017, not a leak") matches actual code behavior exactly.
2. **New test evidence**: `tests/api/calendar-integration-status.test.ts` (new `it` block, immediately before the 401 test) — clears `google_accounts` via `DELETE`, saves one system-scoped account (`clinicId: null`, email `root@estomasystech.com`, fixed `connectedAt`), calls `GET` with `cookieHeaderFor('super_admin', 'root@estomasystech.com', null)`, and asserts exact values: `response.status===200`, `body.data?.connected===true`, `body.data?.email==='root@estomasystech.com'`, `body.data?.connectedAt===connectedAt.toISOString()`. This exercises `clinicId === null` directly and asserts exact field values, not just truthiness — evidence-or-zero satisfied.
3. **Test run**: `npx vitest run tests/api/calendar-integration-status.test.ts` → 6/6 passed. Re-ran a second time (full file, not isolated) → 6/6 passed again, no flakiness or order-dependency introduced by the new test's `DELETE FROM google_accounts` against the other 5 tests in the file.

**Requirement traceability update**: Edge case "super_admin/modo aberto scoping" — Needs Fix → ✅ Verified.

**Verdict**: ✅ **PASS**. Gap closed with exact-value test evidence; spec correction is factually accurate against `tenant-scope.ts`; no regressions/flakiness in the surrounding test file across two consecutive runs.
