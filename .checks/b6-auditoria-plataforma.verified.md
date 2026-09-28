# B6 — Auditoria de plataforma · Verification

**Verdict**: PASS (C1–C21 proven; C22 gates proven locally except coverage and E2E, which the orchestrator runs separately)
**Profile**: light
**Diff range**: 17beaab..fb83f01 (`7dbba49~1..HEAD`)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

Step 1 is `ui`-only and did not run under `light`. The checklist also records that no binding UI design exists. `.design/portal-super-admin.md` was used only as the checklist's source and was not re-compared.

## Proof run

One batched invocation at HEAD:

`npx vitest run <12 files> --reporter=verbose -t "clinic_id nulo|evento de plataforma|Empresa da auditoria|sem empresa|findAll escopado|save escopado|auditoria escopada|container escopa a auditoria|por empresa|trilha de plataforma|login falho|segundo fator|taxonomia|ação do super_admin numa clínica|formato da trilha|filtros e paginação|só o super_admin|trilha da plataforma|link da trilha|allowlist justificada|sem clínica legada"`
Result: exit 0 · 12 files passed · 30 tests passed, 136 skipped, 0 failed. Every proof name matched at least one test that shows `✓` in the verbose output. No filter matched nothing.

Extra run: `tests/lib/tenant-scope.test.ts -t "fallback legado"` passed 1 of 1. This covers the `src/app` half of C21 (see gaps).

## Checks

| Check | Claim | Proof run | Evidence (file:line — assertion) | Result |
|---|---|---|---|---|
| C1 | `clinic_id` nullable, FK kept | ✓ migration test | `tests/infrastructure/audit-platform-migration.test.ts:139` `expect(rows.rows).toEqual([{ clinic_id: null }])`; `:149` `expect(pgCodeOf(error)).toBe('23503')` | PASS |
| C2 | `create` accepts `null`; `' '` is ValidationError | ✓ ×2 | `tests/domain/audit-event.test.ts:46` `expect(event.clinicId).toBeNull()`; `:59-60` `toThrow(new ValidationError('Empresa da auditoria é obrigatória'))` | PASS |
| C3 | no company / override null / no session → `null`; explicit input wins | ✓ | `tests/lib/audit.test.ts:277,278,283` `...toBeNull()` (super_admin session, no session, override `clinicId:null`); `:288-289` `.toBe('clinica-alvo')`; also `:179` | PASS |
| C4 | clinic scope sees only its own events; system scope sees all | ✓ | `tests/infrastructure/drizzle-audit-scope.test.ts:59-60` `toEqual([inA.id])` / `[inB.id]` (platform excluded); `:61-63` system `toEqual([inA,inB,platform].sort())` | PASS |
| C5 | clinic scope: null → clinic; foreign clinic throws and saves nothing | ✓ | `drizzle-audit-scope.test.ts:70` `expect(stored.clinicId).toBe(A)`; `:72-74` `rejects.toThrow('Evento de auditoria de outra empresa')`; `:75` `toHaveLength(1)`; system-scope save of null `:78` | PASS |
| C6 | in-memory repo follows the C4/C5/C9 rules | ✓ | `tests/infrastructure/in-memory-repositories.test.ts:795-797` foreign throws; `:798-801` clinicA `['clinic-a','clinic-a']`; `:815` trail `toHaveLength(2)`; `:819` limit; `:820-822` clinic scope throws | PASS (weak, see gap 2) |
| C7 | container scopes audit | ✓ | `tests/api/audit-platform-trail.test.ts:130` `expect(seenFromX...).not.toContain(inY.id)`; `:131` Y contains. Assembly read directly: `src/infrastructure/container.ts:412` `new DrizzleAuditEventRepository(db, tenant.clinicId)` | PASS |
| C8 | documents/issue gives each company its own number; re-issue is idempotent | ✓ (handler) | `tests/api/documents-issue.test.ts:95-96` `expect(inB...documentNumber).not.toBe(inA...documentNumber)`; `:98-99` `againInA ... toBe(inA...)` | PASS |
| C9 | trail = null or super_admin; period and page; clinic scope throws | ✓ | `drizzle-audit-scope.test.ts:91-95` `toEqual([superNoClinic, superInA, anonymous])` (adminInA excluded, newest first); `:96-98` from/to → `[superInA.id]`; `:99-101` limit 1 offset 1; `:102-104` throws | PASS |
| C10 | failed login → null; admin X and legacy do not see it; platform does | ✓ (handlers) | `audit-platform-trail.test.ts:146` `toBe(401)`; `:150-155` both clinic trails `toEqual([])`; `:156-163` `objectContaining({clinicId:null, clinicName:null, actorRole:'anonymous', detail:'invalid_credentials'})` | PASS |
| C11 | wrong MFA code / taxonomy import → null, platform trail only | ✓ ×2 | `:202-204` `objectContaining({ clinicId: null, actorRole: 'super_admin' })` + `:205-211` X, Y and legacy `toEqual([])`; taxonomy `:226-228` same, `:230-234` legacy `toEqual([])` | PASS (taxonomy checks only the legacy trail; null clinicId implies the rest) |
| C12 | recovery script → null | ✓ | `tests/infrastructure/recover-super-admin.test.ts:229` `toMatchObject({ clinicId: null, actorRole: 'super_admin', ... })` | PASS |
| C13 | super_admin PATCH shows in clinic X's trail and the platform trail, not in Y's | ✓ (handlers) | `audit-platform-trail.test.ts:253-258` X trail `[objectContaining({actorRole:'super_admin'})]`; `:260-266` platform `clinicId: clinicX.id, clinicName: clinicX.name`; `:267` Y `toEqual([])` | PASS |
| C14 | excludes clinic roles; exact DTO keys without patient; newest first | ✓ (handler) | `:284` `not.toContain(byAdmin.id)`; `:289-302` `Object.keys(row).sort()` equals the 10-key list (no `patientId`/`patientName`); `:305` sorted desc; null/null asserted at `:158-159` | PASS |
| C15 | from/to, limit/offset, 0 and 501 → 400 | ✓ (handler) | `:334-336` window `['periodo-2020-01-02…']`; `:339-341` page; `:342` `limit=0 → 400`; `:343` `limit=501 → 400` | PASS |
| C16 | company_admin 403 with message; no cookie 401 | ✓ (handler) | `:348` `toBe(403)`; `:349` `toBe('Seu papel não tem acesso a este recurso')`; `:355` `toBe(401)` | PASS |
| C17 | screen: title, Plataforma / name, labels, empty state, fetch URL | ✓ ×3 | `tests/pages/plataforma-auditoria.test.tsx:65-67` h1; `:71` `'Plataforma'`; `:73-76` `Clínica Sol` row → `Criação`, `Dados da clínica`; `:77-79` `'/api/platform/audit?limit=100&offset=0'`; `:87-89` empty text | PASS |
| C18 | link from /plataforma | ✓ | `tests/pages/plataforma.test.tsx:47-49` `getByRole('link',{name:'Trilha da plataforma'})…toHaveAttribute('href','/plataforma/auditoria')` | PASS |
| C19 | E2E trail row after creating a clinic | exists; run by orchestrator, not re-run | `e2e/plataforma.spec.ts:82` test; `:95` click link; `:97` h1; `:98-99` row with name + `Criação` + cell `Clínica` `toHaveCount(1)`; `:100` `super_admin` | PASS (static); execution pending orchestrator |
| C20 | docs describe the trail; ADR-010; CONTEXT | ✓ + `check:docs` OK | `tests/docs/super-admin-docs.test.ts:175` ACE-RN-10 cites `/plataforma/auditoria`; `:176-183` ACE-RN-31/32, `GET /api/platform/audit`, "aparece nas duas trilhas"; `:187` `**Status:** aceito`; `:189` trail predicate; `:190` CONTEXT | PASS |
| C21 | no new `systemScope()`; no `LEGACY_CLINIC_ID` in src/app or in audit.ts | ✓ ×2 (+1 extra) | `tests/lib/audit.test.ts:297-298` `not.toContain('LEGACY_CLINIC_ID')`/`'legacy-clinic'`; allowlist test passed (`tests/lib/tenant-scope.test.ts` unchanged in diff); `git diff … -- src \| grep '^+.*systemScope'` → no hits; src/app half: `tests/lib/tenant-scope.test.ts:118` `expect(offenders).toEqual([])` + `rg LEGACY_CLINIC_ID src/app` → no hits | PASS (proof mis-cited, gap 1) |
| C22 | gates | typecheck exit 0; lint exit 0 (2 warnings + 1 info, all in files outside the diff); check:sv OK; `test:coverage` / Playwright / build not run by instruction | — | PARTIAL — pending orchestrator |

## Landing rows vs. diff

- Repository scoped in the container: `src/infrastructure/container.ts:412`. ✓
- `save` throws on a foreign clinic: `clinicIdForSave` in `src/domain/audit/audit-event-repository.ts` is shared by the Drizzle and in-memory repos. ✓
- `findPlatformTrail` refuses clinic scope: Drizzle and in-memory both check `this.clinicId !== null` and throw `PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE`. ✓
- `AuditEventFilter.clinicId` removed; `/api/audit` no longer passes it. ✓
- `resolveActor` has no `LEGACY_CLINIC_ID`: `src/lib/audit.ts` returns `actorOverride` as-is or `session?.clinicId ?? null`; `input.clinicId` still takes precedence. `AuditActorOverride.clinicId` is required (`string | null`), so `undefined` cannot reach `AuditEvent.create`. ✓
- `documents/issue` uses `writeScope(guard.session)`. ✓
- `/api/platform/audit` uses `sessionScope`, adds no new `systemScope()`, and its zod limits (1..500, default 100, offset ≥ 0) match the contract. ✓
- Script B3 changed only the repository constructor (`new DrizzleAuditEventRepository(db, null)`), not the audit call. ✓
- Migration 0045 is a single `DROP NOT NULL`; the schema keeps `.references(clinics.id)`. ✓
- Labels are extracted to `src/lib/audit-labels.ts` (adds `clinic`, `clinic-status`, `account-recovery`), and `/auditoria` imports them. ✓
- Call sites passing `clinicId` into audit (login, mfa-route, set-password) all use `systemScope()` repositories, so the new foreign-clinic throw cannot fire there. The B4/B5 platform routes pass the target clinic with `clinicScope(target)`.

## Test policy rows / Coverage join / Faults injected

`light` profile: the Coverage recompute, test-policy verdicts and fault injection (steps 3b and 4) did not run. There is no `## Test policy` section.

## Gaps (ranked)

1. **C22 incomplete here**: `test:coverage` (≥90%), Playwright (both configs) and `build` were not run by the verifier, by instruction. PASS depends on the orchestrator's run, and C19 execution depends on it too.
2. **C6 weak**: the in-memory trail test uses `arrayContaining` plus a length, so order (newest first) is not asserted, and `offset` is not tested (only `limit`). The claim "same rules as C9" is only partly proven.
3. **C21 proof mis-cited**: the `src/app` half of the claim is proven by `tenant-scope.test.ts` "fallback legado", not by either named proof. It passes, but the checklist's Proof line should name it.
4. **Landing UI elements with no check** (low; no binding design): the back link `Clínicas`, the column headers (`Quando`/`Clínica`/`Ator`/`Ação`/`Recurso`/`Detalhe`), `Carregar mais`, and the new labels `Situação da clínica`/`Recuperação de conta`. The unnamed test `plataforma-auditoria.test.tsx:92` covers the from/to params and the clinic-id fallback.
5. **C11 taxonomy (minor)**: the only negative check is on the legacy-clinic trail. The positive `clinicId: null` assertion makes the X/Y absence follow logically.

## Gate

- `npx vitest run` (batched proofs): 30 passed, 0 failed
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0 (2 warnings, 1 info, none in diff files)
- `npm run check:sv`: OK
- `npm run check:docs`: OK (0 warnings)
- `test:coverage`, `build`, Playwright: not run (orchestrator)
