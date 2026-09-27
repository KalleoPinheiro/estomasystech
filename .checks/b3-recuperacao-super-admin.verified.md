# B3 — Recuperação de emergência do super_admin · Verification

**Verdict**: FAIL (one check, C25, proven for only half of its claim; everything else proven)
**Profile**: light (AGENTS.md declares none)
**Diff range**: 4affac7..cd06c6d (HEAD)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Steps that did not run under `light`: step 1 (binding-interface comparison; there is no UI in this feature anyway), the Coverage recompute, Test policy verdicts (the checklist has no `## Test policy` section) and fault injection (step 4).

## Binding sources

| Source | Opened | Contradiction | Uncovered |
|---|---|---|---|
| `.design/portal-super-admin.md` Decision "Recuperação total" (l.175), Journey 12 (l.48), B3 row (l.157) | yes | Design says "auditoria de plataforma". The checklist writes to `legacy-clinic` through the login path, recording the owner's decision of 2026-09-27 (deferred to B6). That is a renegotiated decision, so it is not counted as a contradiction. | none: script, fator/códigos, e-mail opcional, `session_version + 1`, auditoria, link and runbook each have a check |
| Interface | n/a: no screen in this block | - | - |

## Checks

Proof run for C1–C24 (except C22's second proof): one invocation,
`npx vitest run tests/infrastructure/recover-super-admin.test.ts tests/api/recover-super-admin.test.ts tests/infrastructure/deploy-config.test.ts tests/docs/super-admin-docs.test.ts --reporter=verbose`
→ 4 files, 37 passed, 0 failed. Every named test below appeared individually as passed.

| Check | Claim | Proof run | Evidence (file:line — assertion) | Result |
|---|---|---|---|---|
| C1 | removes `user_mfa` and all `mfa_recovery_codes` | "remove o segundo fator e os códigos" ✓ | `tests/infrastructure/recover-super-admin.test.ts:155-156`: `expect(await factorRows()).toHaveLength(0)`; `expect(await codeRows()).toHaveLength(0)` | PASS |
| C2 | `session_version` +1 exactly | "derruba as sessões (vira 4)" ✓ | `:162`: `expect((await superAdmin()).sessionVersion).toBe(4)` (seed 3, `:40`) | PASS |
| C3 | old password fails, hash = `UNSET_PASSWORD_HASH` | "invalida a senha antiga" ✓ | `:169-172`: `expect(account.passwordHash).toBe(UNSET_PASSWORD_HASH)`; `expect(await verifyPassword(OLD_PASSWORD, …)).toBe(false)` | PASS |
| C4 | new e-mail normalized, otherwise unchanged | "troca o e-mail (normalizado); sem ele, mantém" ✓ | `:178`: `.email).toBe('novo.dono@vitta.test')` from `'  Novo.Dono@Vitta.TEST '`; `:182` unchanged without flag; `:186`: same e-mail → `plan.newEmail).toBeNull()` | PASS |
| C5 | `<APP_URL>/definir-senha?token=`, `reset`, 1 h; old invite/reset used | "emite o link de 1 hora e invalida os anteriores" ✓ | `:195`: `result.link.startsWith(prefix)`; `:197-198`: `expiresAt … toBe(NOW + RESET_TTL_MS)`, `RESET_TTL_MS).toBe(60*60*1000)`; `:203-207`: `toMatchObject({ purpose: 'reset', secretHash: hashAuthTokenSecret(secret) … })`; `:208-209`: `tok-invite`/`tok-reset` `usedAt).not.toBeNull()`; `:214` re-run gives a new link | PASS |
| C6 | audit `update`/`account-recovery`, actor `super_admin`/`script:recover-super-admin`, detail, legacy-clinic, no e-mail | "audita pelo caminho do login" ✓ | `:227-234`: `toMatchObject({ clinicId: LEGACY_CLINIC_ID, actorRole: 'super_admin', actorId: 'script:recover-super-admin', action: 'update', resourceId: SA_ID })`; `:235`: `JSON.stringify(event)).not.toContain('vitta.test')`; `:237-240` both `detail` values. `resourceType` is fixed by the `auditRows` filter (`:114`) | PASS |
| C7 | no super_admin → message, nothing written | "recusa sem super_admin e nada é gravado" ✓ | `:244`: `rejects.toThrow(NO_SUPER_ADMIN_MESSAGE)` (constant = Landing text, `recover-super-admin.ts:22-23`); `:245`: `auditRows()).toHaveLength(0)` | PASS (only the audit table is asserted. With no account there is nothing else FK-writable, so this is acceptable.) |
| C8 | e-mail in use → message; state intact | "e-mail em uso" ✓ | `:251-254`: `toThrow('O e-mail admin@clinica.test já é usado por outra conta. Nada foi alterado.')`; `expect(await snapshot()).toEqual(before)` (snapshot = e-mail, hash, sv, active, factors, codes, unused tokens, audit) | PASS |
| C9 | invalid e-mail → `Email inválido`, nothing written | "e-mail inválido" ✓ | `:260-263`: `toThrow('Email inválido')`; `snapshot()).toEqual(before)` | PASS |
| C10 | failure mid-transaction → nothing changes | "falha no meio desfaz tudo" ✓ | `:269-278`: audit repo rejects (last write, after deletes/update/token insert) → `toThrow('auditoria fora do ar')`; `snapshot()).toEqual(before)`. Code: every write sits in `db.transaction` (`recover-super-admin.ts:187`) with `SELECT … FOR UPDATE` (`:70`) | PASS. Only the last step's failure is injected. Earlier steps rely on the same transaction, so they are structurally covered. |
| C11 | inactive → active | "reativa a conta" ✓ | `:284-285`: `plan.wasInactive).toBe(true)`; `superAdmin()).active).toBe(true)` | PASS |
| C12 | dry run writes nothing, returns plan | "a simulação não altera nada e devolve o plano" ✓ | `:295-304`: `expect(result).toEqual({ applied: false, plan: { accountId, currentEmail, newEmail: 'n@vitta.test', hadFactor: true, wasInactive: false } })`; `:305`: `snapshot()).toEqual(before)`. Code returns before `applyRecovery` (`recover-super-admin.ts:190`) | PASS |
| C13 | `--confirmar` prints link + 1 h, exit 0 | "cli aplica com --confirmar" ✓ | `:339-345`: `code).toBe(0)`; `out).toContain('vale 1 hora')`; `out).toMatch(/https:\/\/clinica…\/definir-senha\?token=[\w-]{20,}/)`; `err).toBe('')` | PASS |
| C14 | no `--confirmar` → dry-run message, exit 0 | "cli simula sem --confirmar" ✓ | `:353-356`: `code).toBe(0)`; `out).toContain(DRY_RUN_MESSAGE)` (constant = Landing literal, `recover-super-admin.ts:26-27`); `out).not.toContain('definir-senha')`; snapshot equal | PASS |
| C15 | unknown flag → usage on stderr, 2, DB untouched | "cli recusa flag desconhecida" ✓ | `:362-368`: for `--sim`, positional, `--novo-email` without value: `code).toBe(2)`, `err).toContain('Uso: npm run admin:recover')`, `opened).toBe(false)`; snapshot equal | PASS |
| C16 | `APP_URL` missing / non-loopback http → 2 before DB | "cli exige APP_URL segura" ✓ | `:372-381`: `{}`, `http://clinica…`, `não é url` → `code).toBe(2)`, `err).toContain('APP_URL')`, `opened).toBe(false)`; `:386` `http://localhost:3000` → 0 | PASS |
| C17 | preconditions → stderr, 2 | "cli pré-condição sai 2" ✓ | `:391`: `toMatchObject({ code: 2, err: NO_SUPER_ADMIN_MESSAGE })`; `:398-399`: `code).toBe(2)`, `toContain('já é usado por outra conta')`; `:402`: `{ code: 2, err: 'Email inválido' }` | PASS |
| C18 | unexpected failure → `Falha: nada foi alterado…`, 1 | "cli falha inesperada sai 1" ✓ | `:411-413`: `code).toBe(1)`; `err).toContain(ROLLED_BACK_MESSAGE)` (= `'Falha: nada foi alterado (transação desfeita).'`, `recover-super-admin.ts:24-25`); snapshot equal; `:418-419` DB offline → 1 | PASS |
| C19 | `admin:recover` → `tsx scripts/recover-super-admin.ts` | `deploy-config.test.ts` "admin:recover: …" ✓ | `tests/infrastructure/deploy-config.test.ts:177`: `expect(scripts['admin:recover']).toBe('tsx scripts/recover-super-admin.ts')` | PASS |
| C20 | recover → set-password → login 200 `{mfaEnrollmentRequired, pendingToken}` without Set-Cookie | "perdeu tudo" ✓ | `tests/api/recover-super-admin.test.ts:153`: set-password `status).toBe(200)`; `:159`: old login `toBe(401)`; `:165-168`: `status).toBe(200)`, `mfaEnrollmentRequired).toBe(true)`, `pendingToken).toMatch(/^mfa\./)`, `cookie).toBeNull()`. Real route handlers, not a lower layer | PASS |
| C21 | pre-recovery cookie stops working (old `sv`) | "sessão anterior cai" ✓ | `:174`: `revoked(before)).toBe(false)`; `:178` after recover (same e-mail) `toBe(true)` | PASS |
| C22 | runbook section, flags, exit codes, 1 h; ADR-009 accepted amends ADR-004; acesso README cites it | `super-admin-docs.test.ts` "recuperação de emergência" ✓; `npm run check:docs` → `check:docs: OK (0 aviso(s))`, exit 0 | `tests/docs/super-admin-docs.test.ts:105-106`: `toMatch(/\*\*Status:\*\* aceito/)`, `toMatch(/\*\*Emenda:\*\* \[ADR-004\]/)`; `:110-120`: `'## 10. Recuperação de emergência do Super Admin'`, `--novo-email=…`, `` '`--confirmar`' ``, `'**1 hora**'`, `` | `0` | `` / `` `2` `` / `` `1` ``; `:122-123` acesso README ACE-RN-21 + ADR link. ADR-004 not in the diff (untouched) | PASS |
| C23 | system session with an e-mail other than the system account's → revoked | "sessão com o e-mail antigo cai" ✓ | `tests/api/recover-super-admin.test.ts:186-188`: old e-mail with the **current** `sv` → `revoked(...)).toBe(true)`. This isolates the e-mail branch | PASS |
| C24 | same e-mail+sv → valid; no system account → valid | "sessão de sistema vigente" ✓ | `:193-195` `toBe(false)`; `:197-201` uppercased e-mail `toBe(false)`; `:209` after deleting the account `revoked(systemSession('qualquer@…', 9))).toBe(false)` | PASS |
| C25 | platform E2E runs with the real super_admin **in both configs** | Not run locally (browser mismatch, per brief). Taken from GitHub CI, PR #237 head `cd06c6d`: check run 108657876785 "E2E (Playwright)" = success; 108657876700 "Build de produção + E2E (next start)" = success (fetched through the GitHub API). | `e2e/plataforma.spec.ts:12`: `test.use({ storageState: SUPER_ADMIN_STORAGE_STATE_PATH })`, written by `e2e/global-setup.ts:412` from `loginSuperAdmin()` (`:174-195`: real `/api/auth/login` → `mfa/enroll` → `mfa/verify` with TOTP). Forged `sessionCookie` import removed; `:36-41` logout test logs in through the UI with password + `nextTotpCode()`; `:17`, `:25` assertions. **But `playwright.prod.config.ts` `testMatch` = `csp-producao, auth, agenda, pacientes, portal-paciente` and does not include `plataforma.spec.ts`, and prod uses `global-setup.prod.ts`.** | **PARTIAL → not proven as written.** Dev config: proven (CI). Prod config: the second proof never runs the platform spec. It only shows that the prod subset did not regress. |

## Swept rows resolving to existing code

| Row | Constraint cited | Found |
|---|---|---|
| authorization: no new route | no `src/app` change | `git diff --stat 4affac7..HEAD -- src/app` is empty ✓ |
| concurrency: `SELECT … FOR UPDATE` + `sv + 1` | lock + increment | `recover-super-admin.ts:70` `.for('update')`; `:140` `sql\`${sessionVersion} + 1\`` ✓ |
| idempotency: re-run issues a new link, invalidates previous | - | test `:212-217` ✓ |
| dependency failure: DB down → 1 | - | test `:415-419` ✓ |

## Scrutiny requested by the orchestrator

- **Rollback (C10).** All writes go through `tx` inside `db.transaction` (`recover-super-admin.ts:187-193`), and the audit repo is built on `tx` (`:163`). An injected audit failure leaves the snapshot identical. ✓
- **Dry run writes nothing (C12).** It returns at `:190` before `applyRecovery`. Only reads plus a row lock run, and the snapshot is identical. ✓
- **Revocation change (C23/C24).** `staff-revocation.ts:49-51`: only `clinicId === null` takes the new path, and the clinic path (`:52-55`) is unchanged. With no system account, `systemAccountStatus` returns `null` (`:68`), which keeps the deny-list semantics (`isSessionRevoked` `:100-102`). ✓ Observation: the branch is keyed on `clinicId === null`, not on `role`. A non-super_admin cookie with a null `clinicId` (a pre-multi-tenancy token, since `parsePayload` defaults a missing `clinicId` to null) is now compared against the system account and revoked if its e-mail differs. This is stricter than before, not weaker. E2E forged cookies default to `legacy-clinic` (`e2e/support/session-token.ts`), so they are unaffected.
- **Secret leakage.** The raw reset secret exists only in the returned `link` and is printed once on stdout (`:254`). The DB stores only its hash. The audit row carries no e-mail and no token (test `:235`). stdout also prints the current and new e-mail: that is PII to the operator, not a secret. On unexpected failure, stderr prints `error.stack` (`:296`). A Drizzle query error can embed query params (e-mails, the token **hash**), but never the raw secret, because the secret is not passed to any query and the link is built only after all writes. Nothing beyond the link leaks. Minor: `ROLLED_BACK_MESSAGE` ("transação desfeita") is also printed when `openDb` fails before any transaction exists. The wording is inaccurate but harmless.

## Faults injected

Not run: profile `light`.

## Gate

`npx vitest run <4 files> --reporter=verbose`: 37 passed, 0 failed. `npm run check:docs`: OK, 0 warnings. E2E: CI evidence only (2 jobs, success at `cd06c6d`).

## Gaps (ranked)

1. **C25, prod half unproven.** The claim says "nas duas configs", but `playwright.prod.config.ts` never runs `e2e/plataforma.spec.ts`, so the second proof cannot settle it. Fix one of two ways: narrow C25 to the dev config (the owner must agree to the renegotiation), or add `plataforma.spec.ts` to the prod `testMatch` and confirm `global-setup.prod.ts` writes `SUPER_ADMIN_STORAGE_STATE_PATH`. It currently has no super_admin login of its own; grep for `super`/`SuperAdmin` found nothing.
2. (observation, not failing) The revocation branch keys on `clinicId === null` rather than `role === 'super_admin'`. This is stricter for legacy null-clinic tokens, and the ADR-009 note does not mention it.
3. (observation, not failing) C7 "nada gravado" asserts only the audit table, and C10 injects only the last-step failure. Both are acceptable given the single transaction.
4. (cosmetic) The stderr "transação desfeita" message is printed when the DB never opened.
