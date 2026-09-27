# Revisão pré-produção — P1 restantes (#194, #195, #196, #206) Verification

**Verdict**: PASS — 36/37 checks proven locally at `bfe1993`; C21 PENDING-CI (settled by the CI job "E2E (Playwright)" on the pushed head)
**Profile**: light (AGENTS.md declares no tlc-implement profile) — steps 2, 3, 5 run; Coverage recompute / test-policy verdicts not required (Coverage for C28 spot-recomputed anyway); 2 optional faults injected
**Diff range**: `origin/main` `3f3a46efb606c70aa413048ced750c803dbfba53` .. `HEAD` `bfe199303063973a57452f4b22d0fa6c03e1a5d5` (41a46a8, 8927783, ed60e45, 445fdfe, bfe1993)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

No binding UI source (checklist: "sem design de tela vinculante"); step 1 not applicable under `light`. Decisions from #194/#195/#196/#206 taken from the checklist's Sources summary as given.

## Proof run

One invocation, 17 files, `-t` alternation of all 39 named proofs, `--reporter=verbose`:
`npx vitest run tests/lib/auth.test.ts tests/lib/staff-revocation.test.ts tests/api/session-revocation.test.ts tests/api/portal-identity.test.ts tests/api/accounts-provisioning.test.ts tests/architecture/portal-identity.test.ts tests/infrastructure/portal-link-migration.test.ts tests/pages/configuracoes-accounts.test.tsx tests/lib/data-cipher.test.ts tests/infrastructure/clinical-field-encryption.test.ts tests/infrastructure/reencrypt-clinical-data.test.ts tests/api/calendar-gateway-source.test.ts tests/infrastructure/s3-photo-storage.test.ts tests/lib/app-timezone.test.ts tests/api/reminders-run.test.ts tests/infrastructure/photo-storage-selection.test.ts tests/infrastructure/deploy-config.test.ts -t "<39 names>"` → Test Files 17 passed, exit 0; every named test printed individually as `✓`. Each name located with `rg -n` (all hits exist; none matched zero). Extra run for C30's legacy half: `-t "Dado uma credencial conectada e nenhuma allowlist"` → 1 passed.
`npm run check:docs` → `check:docs: OK (0 aviso(s))`, exit 0.
All proof files are added or modified in the diff (`git diff --stat origin/main..HEAD -- tests`), and each exercises code changed in the diff.

## Checks

| Check | Claim | Proof run | Evidence | Result |
|---|---|---|---|---|
| C1 | token carries `sv`; missing `sv` = 0 | `auth.test.ts:52` ✓ | `tests/lib/auth.test.ts:62` `expect(verifySessionToken(SECRET, withVersion)?.sessionVersion).toBe(4)`; `:75` legacy payload `...sessionVersion).toBe(0)` | PASS |
| C2 | version differs → revoked; equal → valid | `staff-revocation.test.ts:77` ✓ | `tests/lib/staff-revocation.test.ts:82-87` sv 2 vs account 3 `.toBe(true)`; `:88-93` sv 3 `.toBe(false)` | PASS |
| C3 | inactive `patient`/`partner` revoked | `staff-revocation.test.ts:60` ✓ | `:73` `expect(await isSessionRevoked(portal('patient'), lookup)).toBe(true)`; `:74` same for `partner`. Proxy calls `isSessionRevoked` with no role filter (`src/proxy.ts:161`) | PASS |
| C4 | cache keyed by clinic | `staff-revocation.test.ts:100` ✓ | `:111-116` clinica-a `true`, clinica-b `false`; `:117` `expect(lookup).toHaveBeenCalledTimes(2)` | PASS |
| C5 | unknown subject stays valid | `staff-revocation.test.ts:120` ✓ | `:123-132` lookup `null`, role `patient`, sv 7 → `.toBe(false)` | PASS |
| C6 | logout bumps version, old token → 401 at proxy | `session-revocation.test.ts:97` ✓ | `tests/api/session-revocation.test.ts:111` `expect(await versionOf(account.id)).toBe(1)`; `:113` `expect(await proxyStatus(cookie)).toBe(401)` — crosses real logout route + `proxy()` | PASS |
| C7 | set-password via link bumps version | `session-revocation.test.ts:118` ✓ | `:146` `versionOf(...)).toBe(1)`; `:147` `proxyStatus(cookie)).toBe(401)` (real forgot-password + set-password routes) | PASS |
| C8 | PATCH password / deactivation bump version | `:151` ✓, `:171` ✓ | `:166-167` `toBe(1)` + `proxyStatus(cookie)).toBe(401)`; `:185-186` `patch(false)).status).toBe(200)` + `versionOf).toBe(1)`; reactivate keeps 1 (`:188`) | PASS |
| C9 | `save` does not overwrite `session_version` | `:191` ✓ | `:200` `expect(stored?.sessionVersion).toBe(1)` after stale save (pglite, Drizzle repo; `set` excludes the column per `drizzle-foundation-repositories.ts:122-128`, increments atomic at `:186`, `:194`) | PASS |
| C10 | login mints current version | `:82` ✓ | `:92` `expect(session?.sessionVersion).toBe(2)` after two `revokeSessions` via real login route | PASS |
| C11 | reused email never exposes B | `portal-identity.test.ts:92` ✓ | `tests/api/portal-identity.test.ts:107` `expect(body.data.patient.id).toBe(patientA)`; `:109` `not.toContain('Bruna Outra Pessoa')` (real `GET /api/portal/patient`) | PASS |
| C12 | email correction keeps access | `:112` ✓ | `:125-126` `status).toBe(200)`, `patient.id).toBe(patientId)` | PASS |
| C13 | partner resolved by link | `:129` ✓ | `:163` `toContain('Indicada Do Antigo')`; `:164` `not.toContain('Indicado Do Novo')` (real `GET /api/portal/partner`) | PASS |
| C14 | unlinked account → 404 | `:167` ✓ | `:181` `expect(status).toBe(404)` | PASS |
| C15 | POST /api/accounts patient w/o patientId / partner w/o partnerId → 400 | `accounts-provisioning.test.ts:142` ✓ | `tests/api/accounts-provisioning.test.ts:153` `patient.response.status).toBe(400)`; `:155` `partner.response.status).toBe(400)` (+ error text `:154`, `:156`) | PASS |
| C16 | other clinic / missing / second link → 400 | `:159` ✓ | `:185` otherClinic `toBe(400)`; `:187` missing `toBe(400)`; `:190-191` second `toBe(400)`, `'Este paciente já tem acesso ao portal'` | PASS |
| C17 | portal never calls `findByEmail` | `architecture/portal-identity.test.ts:18` ✓ | `tests/architecture/portal-identity.test.ts:24` `expect(offenders).toEqual([])` over `src/app/api/portal` + `src/application/portal`, allowlist = `portal-identity.ts` (only `accounts.findByEmail(`, `:34`) | PASS |
| C18 | migration backfills by email, same clinic, case-insensitive; other stays orphan | `portal-link-migration.test.ts:93` ✓ | `tests/infrastructure/portal-link-migration.test.ts:104-109` `toEqual([{acc-ana→pat-1}, {acc-carlos→par-1}, {acc-orfa: null}, {acc-staff: null}])` — real `0040` SQL applied on PGlite | PASS |
| C19 | orphan report lists unlinked patient/partner | `:113` ✓ | `:116-124` `expect(orphans).toEqual([{ id: 'acc-orfa', ..., role: 'patient' }])` | PASS |
| C20 | form requires patient and sends `patientId` | `configuracoes-accounts.test.tsx:85` ✓ | `tests/pages/configuracoes-accounts.test.tsx:95-99` error text + `expect(posted).toHaveLength(0)`; `:109-113` `toMatchObject({ email: 'cuidadora@x.com', role: 'patient', patientId: 'pac-1' })` | PASS |
| C21 | portal E2E pass with linked accounts | not run (port shared with another Playwright run) | Static: `e2e/portal-paciente.spec.ts:34/36`, `:85/87`, `:120/122` and `e2e/portal-parceiro.spec.ts:41/43`, `:59/61` — `linkPortalAccount(...)` immediately precedes each `addCookies([sessionCookie(...)])`; helper `e2e/support/api.ts:437-446` POSTs `/api/accounts` with `patientId`/`partnerId` | PENDING-CI |
| C22 | v1 format, round trip | `data-cipher.test.ts:10` ✓ | `tests/lib/data-cipher.test.ts:14-16` `toMatch(/^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/)`; `:19` `decrypt(payload)).toBe('Alergia a látex')` | PASS |
| C23 | rotation reads previous, writes current | `:23` ✓ | `:28` `rotated.decrypt(stored)).toBe('Diabetes tipo 2')`; `:31` `rewritten.split('.')[1]).toBe(dataKeyId(KEY_2))` | PASS |
| C24 | legacy `iv.tag.ct` (sha256 AUTH_SECRET) read | `:39` ✓ | `:43` `cipher.decrypt(legacy)).toBe('SOAP antigo')` (legacy made by `encryptSecret(..., AUTH)`) | PASS |
| C25 | AUTH_SECRET rotation doesn't affect data | `:50` ✓ | `:61` `afterRotation.decrypt(stored)).toBe('Evolução')` with new AUTH_SECRET, same DATA_ENCRYPTION_KEY | PASS |
| C26 | plaintext passthrough; unknown id throws | `:64` ✓, `:74` ✓ | `:67-68` for `'Paciente estável'`, `'v1. retorno em 7 dias'`, `'a.b.c'` `decrypt(text)).toBe(text)`; `:77-79` `toThrow(\`chave desconhecida (id ${dataKeyId(KEY_2)})\`)` | PASS |
| C27 | production w/o key → error; key < 32 → error | `:91` ✓ | `:92-94` `toThrow(/DATA_ENCRYPTION_KEY ausente/)`; `:95-100` `toThrow(/menos de 32 caracteres/)`. Assembly read directly: `container.ts:207` `dataCipherFromEnv()` inside `currentDataCipher()`, used at `:327` by `getRepositories` | PASS |
| C28 | 21 clinical columns stored ciphertext, read back plain | `clinical-field-encryption.test.ts:300` ✓ | `tests/infrastructure/clinical-field-encryption.test.ts:304` `expect(columns).toHaveLength(21)`; `:310-311` raw column `toMatch(V1)` + `not.toContain('HIV')`; `:313-315` `readBack` `toEqual(... SECRET_TEXT)`. Member list recomputed from the `cases` (`:85…:292`): patients.notes, appointments.notes, waitlist_entries.notes, anamneses×5, evolution_notes×4, clinical_conditions.notes, condition_assessments×3, condition_photos.patient_note, care_plan_diagnoses×2, outcome_evaluations.notes, intervention_records.notes = 21 / 11 tables, matches Coverage row and `reencrypt-clinical-data.ts` target list | PASS |
| C29 | reencrypt to current key; second run no-op | `reencrypt-clinical-data.test.ts:80` ✓, `:112` ✓ | `tests/infrastructure/reencrypt-clinical-data.test.ts:91-92` loop `cipher.isCurrent(notes[id])).toBe(true)` for claro/antiga/atual; `:96` current value unchanged; `:117` `Object.values(counts).every((n) => n === 0)).toBe(true)`; `:118` rows `toEqual(snapshot)` | PASS |
| C30 | Google refresh token uses data key (legacy still read) | `calendar-gateway-source.test.ts:64` ✓ (+ `:44` ✓, extra run) | `tests/api/calendar-gateway-source.test.ts:78` `resolved.constructor.name).toBe('GoogleCalendarGateway')` with token from `currentDataCipher().encrypt(...)`; legacy half: `:61` same assertion with `encryptSecret(...)` (test `:44`, not named in the proof) | PASS (weak: see gaps) |
| C31 | S3 upload sends SSE per `S3_SSE` (default AES256; `provider` omits) | `s3-photo-storage.test.ts:128` ✓ | `tests/infrastructure/s3-photo-storage.test.ts:139` `ServerSideEncryption).toBe('AES256')`; `:141` `not.toHaveProperty('ServerSideEncryption')`; `:144-152` env table `[undefined→'AES256'], ['aws:kms'→'aws:kms'], ['provider'→null]` | PASS |
| C32 | UTC process + APP_TIMEZONE aligns TZ, check passes | `app-timezone.test.ts:52` ✓ | `tests/lib/app-timezone.test.ts:59` `alignProcessTimeZone()).not.toThrow()`; `:61` `processTimeZone()).toBe('America/Sao_Paulo')` | PASS |
| C33 | GET /api/reminders/run w/o Bearer → 401; with Bearer runs | `reminders-run.test.ts:18` ✓ | `tests/api/reminders-run.test.ts:21` `(await get()).status).toBe(401)`; `:34-35` `response.status).toBe(200)`, `body.success).toBe(true)` (real route `GET`) | PASS |
| C34 | on Vercel w/o S3, write/read/remove throw; assembly doesn't | `photo-storage-selection.test.ts:12` ✓ | `tests/infrastructure/photo-storage-selection.test.ts:18-23` `write` `rejects.toThrow(VERCEL_REQUIRES_S3_MESSAGE)`, `read`/`remove` `rejects.toThrow('PHOTO_STORAGE=s3')`; `:16` `buildPhotoStorage('clinica-a')` returns without throwing | PASS |
| C35 | `vercel.json` schedules `/api/reminders/run` | `deploy-config.test.ts:107` ✓ | `tests/infrastructure/deploy-config.test.ts:112-117` `config.crons).toEqual([{ path: '/api/reminders/run', schedule: /^\d+ \d+ \* \* \*$/ }])` | PASS |
| C36 | runbook sections + links | `deploy-config.test.ts:142` ✓; `npm run check:docs` exit 0 | `:144-157` 9 headings (perguntas abertas, Vercel+Supabase, VPS+compose, TLS, migrações, backup/restore, segredos/rotação, cron, primeiro acesso) `toContain(section)`; `:160-161` `docs/README.md` / `AGENTS.md` `toContain('...producao.md)')` | PASS |
| C37 | compose and CI define `DATA_ENCRYPTION_KEY` | `deploy-config.test.ts:120` ✓ | `:122-124` compose `toMatch(/^ {6}DATA_ENCRYPTION_KEY: \$\{DATA_ENCRYPTION_KEY:\?/m)`; `:130-132` `.github/workflows/ci.yml` `toMatch(/^ {10}DATA_ENCRYPTION_KEY: build-only$/m)` | PASS |

Level check: every status/route claim (C6, C8, C11, C14, C15, C16, C33) is proven through the real route handler (and, for C6–C8, through `proxy()`); no level gap.

## Swept rows resolving to existing behaviour

| Row | Cited constraint | Found |
|---|---|---|
| dependency failure: revocation fail-open with log (AD-004) | `src/lib/auth/staff-revocation.ts:88-90` `catch` → `logError('... fail-open (AD-004)')` | yes |
| authorization: portal account creation keeps existing provisioning matrix | `tests/api/accounts-provisioning.test.ts` existing RBAC scenarios (same file, 401 path at `:135-137`) | yes |
| observability: `logError` existing | `src/lib/log-error` imported by `staff-revocation.ts:1`, `app-timezone.ts` | yes |

## Test policy rows

No `## Test policy` section in the checklist (profile `light`) — not judged.

## Faults injected (optional under light, scratch worktree at HEAD, removed after)

| Mutation | Location | Killed |
|---|---|---|
| version comparison `status.sessionVersion !== (session.sessionVersion ?? 0)` → `false` | `src/lib/auth/staff-revocation.ts:86` | yes — C2 `version mismatch revokes` fails `expected false to be true` |
| removed `await userAccounts.revokeSessions(account.id)` from logout | `src/app/api/auth/logout/route.ts:57` | yes — C6 `logout revokes previous token` fails `expected +0 to be 1` |

Real tree `git status --porcelain` identical before and after (only pre-existing untracked `playwright.tmp-*.config.ts`).

## Gaps (non-blocking)

1. C21 not run locally — PENDING-CI on "E2E (Playwright)". Static setup is correct in both portal specs (and the other portal-forging specs touched in the diff also link, except `e2e/auth.spec.ts:102/112`, which relies on C5 "unknown subject stays valid" and only asserts the redirect).
2. C30 is weak: the only assertion is `resolved.constructor.name === 'GoogleCalendarGateway'` — it proves decryption did not fail, not that the decrypted refresh token equals `'refresh-token-v1'`; the "legado ainda lido" half rests on a test (`:44`) the proof line does not name.
3. C31 proves the constructor argument and the env parsing separately; the seam `container.ts:310` passing `config.serverSideEncryption` into `S3PhotoStorage` is verified only by reading, no test crosses it.
4. C27 proves `dataCipherFromEnv`; that `getRepositories` throws in production is by reading `container.ts:207/327`, not by a test through `getRepositories`.

## Gate

`npx vitest run <17 files> -t "<39 names>"` - 17 files passed, 39 named tests passed individually, 0 failed; `npm run check:docs` - OK.
