# B2 — Segundo fator do super_admin · Verification

**Verdict**: PASS (34/35 proven independently; C35 accepted as author-reported, not re-run)
**Profile**: light
**Diff range**: ca3c931..459d8f0
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Verified at `459d8f0`.

## Steps not run under `light`

- Step 1 (binding sources against the checks, `ui` only): not run. There is no binding screen design; the Landing decides the screen texts.
- Step 4 (fault injection, `standard`/`ui`): not run.
- The Coverage join was not recomputed and there are no Test policy verdicts; neither is required under `light`. I did check level gaps and sampling gaps (see Findings).

## Design sanity check (narrow, `.design/portal-super-admin.md` B2)

| Design decision | Checks | Contradiction |
|---|---|---|
| Decision "Segundo fator": TOTP RFC 6238, SHA-1, 6 digits, 30 s, window ±1; secret encrypted with the ADR-006 key; `last_used_step` blocks reuse | C1, C2, C3, C4 (`period=30`, `algorithm=SHA1`, `digits=6`), C20 (`totpSecret` `v1.` payload, differs from the key) | none |
| Decision "Login com segundo fator": pending HMAC token (`AUTH_SECRET`, 5 min, purpose `mfa`), then `verify` issues the session; no factor means enrollment is required before any session | C6 (TTL `5*60*1000`), C7 (domain separation), C8, C9, C11, C20; Landing payload `p: "mfa"`, key `HMAC(AUTH_SECRET, …)` | none |
| Decision "Códigos de recuperação": 10 single-use codes, scrypt hash, shown once; using one allows re-enrolling | C5, C20, C21, C24, C25, C26, C27 | none |
| Owner decision 2026-09-27: a recovery code opens no session and forces re-enrollment | C24 (`cookie` null, `mfaEnrollmentRequired`), C26, C30 | none |
| Changes `POST /api/auth/login` returns `{ mfaRequired, pendingToken }` or `mfaEnrollmentRequired` | C8, C9 (exact `toEqual`, no `Set-Cookie`) | none |
| Journey 1, 2, 11 | 1: C9/C20 plus `tests/api/bootstrap-route.test.ts` "primeiro login exige cadastrar o segundo fator" (ran, passed); 2: C8/C11/C34; 11: C24/C26 | none |
| Open 3 (key as text plus an `otpauth://` link, no QR) | C4, C18, C29 (`queryByRole('img')` absent) | none |

Note (not a Decision contradiction): Shape › Adds (design line 118) lists "cadastro do segundo fator" among the screens in `src/app/plataforma/`. The checklist puts it inside `/login` and records that as a rejected alternative. The reason given is that the `platform` family requires a session, and the Decision "cadastro obrigatório antes da sessão" makes a page under `/plataforma` unreachable at enrollment time. The checklist follows the Decision over the Shape line. It is recorded in the Landing, so the owner can confirm it.

## Checks

Batch command: `npx vitest run tests/domain/totp.test.ts tests/lib/mfa-recovery-codes.test.ts tests/lib/mfa-pending-token.test.ts tests/api/mfa-login.test.ts tests/proxy.test.ts tests/api/auth-routes.test.ts tests/pages/login.test.tsx tests/infrastructure/mfa-migration.test.ts tests/docs/super-admin-docs.test.ts tests/api/bootstrap-route.test.ts --reporter=verbose`. Result: 10 files, 143 tests passed, 0 failed. Every named test below appears individually as `✓` in the verbose output.

| Check | Claim | Proof run | Evidence | Result |
|---|---|---|---|---|
| C1 | RFC 6238 SHA-1 vectors, last 6 digits | batch ✓ "vetores do RFC 6238" | `tests/domain/totp.test.ts:17-28` - 6 vectors (59 … 20000000000); `expect(totpCode(RFC_SECRET, totpStep(seconds*1000))).toBe(eightDigits.slice(-6))` | PASS |
| C2 | accepts −1/0/+1, refuses ±2 | batch ✓ "janela de ±1 passo" | `totp.test.ts:35-43` - `.toBe(step + delta)` for [-1,0,1]; `.toBeNull()` for [-2,2] | PASS |
| C3 | refuses step ≤ last_used_step | batch ✓ "não aceita passo já usado" | `totp.test.ts:51` `verifyTotp(…, code, now, step)).toBeNull()`; `:52-54` earlier step null; `:55` `.toBe(step)` when last=step-1 | PASS |
| C4 | literal otpauth URI, email encoded | batch ✓ "otpauth" | `totp.test.ts:59-61` - `.toBe('otpauth://totp/VittaFlow:dono%2Bops%40vitta.test?secret=…&issuer=VittaFlow&algorithm=SHA1&digits=6&period=30')` | PASS |
| C5 | 10 distinct `xxxxx-xxxxx`, `scrypt$`, normalization | batch ✓ "gera 10 códigos", ✓ "normaliza" | `tests/lib/mfa-recovery-codes.test.ts:12-13` `toHaveLength(10)`, `new Set(codes).size).toBe(10)`; `:15` `/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/`; `:18` `/^scrypt\$/`; `:29-31` uppercase/space/no-hyphen normalize, then match id `'b'` | PASS |
| C6 | 5 min TTL; expired/tampered/other secret/no `mfa.` prefix → null | batch ✓ "validade de 5 minutos", ✓ "recusa adulterado" | `tests/lib/mfa-pending-token.test.ts:20` `MFA_PENDING_TTL_MS).toBe(5*60*1000)`; `:21-26` valid at TTL-1; `:27-29` null at TTL; `:51-53` forged payload null; `:54` `'outro-segredo'` null; `:55-57` `${payload}.${signature}` (no prefix) null | PASS |
| C7 | session cookie ≠ pending token, both ways | batch ✓ "separação de domínio" | `mfa-pending-token.test.ts:96-99` - `verifyMfaPendingToken(SECRET, session)` null, `mfa.${session}` null, `verifySessionToken(SECRET, pending)` null, `pending.slice(4)` null | PASS |
| C8 | with factor → 200 `{mfaRequired, pendingToken}`, no Set-Cookie | batch ✓ "com fator, o login pede o código" | `tests/api/mfa-login.test.ts:175-180` - `status).toBe(200)`; `body.data).toEqual({ mfaRequired: true, pendingToken: stringMatching(/^mfa\./) })`; `cookie).toBeNull()` (handler `loginRoute.POST`) | PASS |
| C9 | without factor → 200 `{mfaEnrollmentRequired, pendingToken}`, no Set-Cookie | batch ✓ "sem fator, o login exige o cadastro" | `mfa-login.test.ts:164-168` - 200; `mfaEnrollmentRequired).toBe(true)`; `mfaRequired).toBeUndefined()`; `pendingToken).toMatch(/^mfa\./)`; `cookie).toBeNull()` | PASS |
| C10 | other roles still get the session directly | batch ✓ auth-routes "cria sessão" | Named proof `tests/api/auth-routes.test.ts:168-169` asserts only `status 200` and `data.ok true`. It checks no cookie, and the diff never touched the file. What settles the claim is `mfa-login.test.ts:614-615`: `data).toEqual({ ok: true })` and `sessionOf(result.cookie)?.role).toBe('company_admin')` (ran ✓ "recebe a sessão direto, sem segundo fator") | PASS (see finding 1) |
| C11 | correct TOTP → 200 plus a super_admin cookie with the account's sv | batch ✓ "código correto emite a sessão" | `mfa-login.test.ts:199-205` - 200; `data).toEqual({ ok: true })`; `session?.role).toBe('super_admin')`; `clinicId).toBeNull()`; `sessionVersion).toBe(await versionOf())` | PASS |
| C12 | same code twice → second 401 `Código inválido` | batch ✓ "código reusado" | `mfa-login.test.ts:220-223` - `first.status 200`; `second.status).toBe(401)`; `second.body.error).toBe('Código inválido')` | PASS |
| C13 | wrong code → 401 `Código inválido`, no cookie, audit `mfa_invalid_code` | batch ✓ "código errado" | `mfa-login.test.ts:234-242` - 401; `'Código inválido'`; `cookie).toBeNull()`; audit query `detail = 'mfa_invalid_code'` → `actorRole).toBe('super_admin')` | PASS |
| C14 | 6th verify per account per minute → 429 even with the right code | batch ✓ "limite por conta" | `mfa-login.test.ts:248-251` 5× 401; a 6th with a new token and the right `codeNow(secret)` (each request from a distinct IP, `:63-70`); `:258-260` `status).toBe(429)`, `'Muitas tentativas, aguarde um minuto'`, no cookie | PASS |
| C15 | pending token missing/tampered/expired/wrong stage/inactive/stale sv → 401 expiry message | batch ✓ "token pendente inválido" | `mfa-login.test.ts:299-314` - table [ausente, adulterado, expirado, etapa errada, recuperação com token de confirmação, sv antigo] → `status, reason).toBe(401)`, `error, reason).toBe(EXPIRED)`; `:326-327` inactive account → 401 EXPIRED | PASS |
| C16 | body missing both/both present/code not 6 digits → 400 with the Landing message | batch ✓ "valida o corpo" | `mfa-login.test.ts:332-345` - 5 bodies (none, both, `12345`, `12345a`, numeric) → `.toBe(400)`, `.toBe('Informe o código de 6 dígitos ou um código de recuperação')` | PASS |
| C17 | MFA routes public in the proxy: no session and any role pass | batch ✓ ×2 (enroll, verify) "rotas de segundo fator são públicas" | `tests/proxy.test.ts:183` `isNext(await proxy(request(path)))).toBe(true)`; `:184-191` same for `super_admin`, `company_admin`, `patient` | PASS (see finding 2) |
| C18 | enroll → 200 `{secret base32 32, otpauthUri, pendingToken}`; nothing written | batch ✓ "cadastro devolve a chave" | `mfa-login.test.ts:370-377` - 200; `secret).toMatch(/^[A-Z2-7]{32}$/)`; `otpauthUri).toBe(\`otpauth://totp/VittaFlow:dono%40vitta.test?secret=${secret}&issuer=VittaFlow&algorithm=SHA1&digits=6&period=30\`)`; `pendingToken /^mfa\./`; `select().from(userMfa)).toHaveLength(0)` | PASS |
| C19 | enroll with a verify/confirm token → 401 | batch ✓ "cadastro só com token de cadastro" | `mfa-login.test.ts:397-402` - `[verifyToken, freshConfirm, confirmToken]` → `.toBe(401)`, `.toBe(EXPIRED)`; empty token → 401 | PASS |
| C20 | confirm → 200 plus 10 codes and a cookie; encrypted secret, last_used_step; 10 hashes | batch ✓ "confirmar o cadastro" | `mfa-login.test.ts:417-430` - 200; `recoveryCodes).toHaveLength(10)`; `sessionOf(cookie)?.sessionVersion).toBe(before + 1)`; `totpSecret).not.toContain(secret)` and `/^v1\./`; `lastUsedStep).toBe(totpStep(clock))`; `codes).toHaveLength(10)`; every `codeHash.startsWith('scrypt$')` | PASS |
| C21 | codes only at confirmation; DB holds only hashes; confirm-token replay → 401 | batch ✓ "códigos exibidos uma única vez" | `mfa-login.test.ts:443` `codeHash.includes(code)).toBe(false)`; `:450-452` replay `.toBe(401)`, `EXPIRED`, cookie null | PASS (see finding 3) |
| C22 | confirm with a wrong code → 401 `Código inválido`, nothing written | batch ✓ "confirmação com código errado" | `mfa-login.test.ts:463-467` - 401; `'Código inválido'`; `userMfa` and `mfaRecoveryCodes` `.toHaveLength(0)` | PASS |
| C23 | confirming revokes earlier sessions and pending tokens (sv+1) | batch ✓ "confirmar revoga o que havia antes" | `mfa-login.test.ts:483` `versionOf()).toBe(before + 1)`; `:484-485` old pending token → `.toBe(401)` | PASS (see finding 4) |
| C24 | valid recovery code → 200 `{mfaEnrollmentRequired, pendingToken}`, no cookie; code marked used | batch ✓ "código de recuperação leva ao recadastro" | `mfa-login.test.ts:497-509` - 200; `data).toEqual({ mfaEnrollmentRequired: true, pendingToken: /^mfa\./ })`; `cookie).toBeNull()`; `used_at IS NOT NULL` → `toHaveLength(1)`; the returned token enrolls → 200 | PASS |
| C25 | used or unknown recovery code → 401 `Código de recuperação inválido` | batch ✓ "código de recuperação usado" | `mfa-login.test.ts:527-531` - first 200; `[again, unknown]` → `.toBe(401)`, `.toBe('Código de recuperação inválido')` | PASS |
| C26 | old factor stays valid until the new one is confirmed; then the old factor and codes are gone | batch ✓ "recadastro troca fator e códigos" | `mfa-login.test.ts:548` `stillOld.status).toBe(200)`; `:555` confirmed 200; `:562` old TOTP `.toBe(401)`; `:567` old recovery `.toBe(401)`; `:572` new code 200; `:574` `mfaRecoveryCodes).toHaveLength(10)` | PASS |
| C27 | concurrent same recovery code → one 200, one 401 | batch ✓ "concorrência no código de recuperação" | `mfa-login.test.ts:579-591` - `Promise.all` of 2 verifies → `statuses.sort()).toEqual([200, 401])` | PASS |
| C28 | `/login`: `mfaRequired` shows `Código do autenticador`; submit calls verify and goes to `/plataforma` | batch ✓ "etapa do código" | `tests/pages/login.test.tsx:284` `findByLabelText('Código do autenticador')`; `:290` `push).toHaveBeenCalledWith('/plataforma')`; `calls.at(-1)).toEqual({ url: '/api/auth/mfa/verify', body: { pendingToken, code: '123456' } })` | PASS |
| C29 | enrollment shows the key as text and an `otpauth://` link, no QR; confirm shows 10 codes; `Continuar` goes to `/plataforma` | batch ✓ "cadastro do segundo fator" | `login.test.tsx:338-346` key text, link `href` = the otpauth URI, `queryByRole('img')).not.toBeInTheDocument()`; `:356` `li).toHaveLength(10)`; `push` not called before `:366` `Continuar` → `toHaveBeenCalledWith('/plataforma')` | PASS |
| C30 | "Usar um código de recuperação" swaps the field; a valid code opens enrollment | batch ✓ "código de recuperação" | `login.test.tsx:388` click on the button; `:396` `findByText('Cadastre o app autenticador')`; `:400-402` verify body `{ pendingToken: 'mfa.p.s', recoveryCode: 'abcde-fgh2k' }`; enroll with the returned token | PASS |
| C31 | only `@still-void/ui` on the new screen | `npm run check:sv` exit 0 ("OK — adoção do @still-void/ui v2 completa") | Every rule shows ✓. `src/app/login/mfa-steps.tsx` uses token classes only (`text-ink-3`, `text-accent-ink`) and no `sv-gap` | PASS |
| C32 | migration 0042: tables and Landing columns, FK to `user_accounts` | batch ✓ "cria as tabelas do segundo fator" | `tests/infrastructure/mfa-migration.test.ts:32-42` `shape).toEqual([... 9 columns with types/nullability ...])`; `:53-56` FKs → `user_accounts` for both; `:65` user_mfa PK `account_id` | PASS |
| C33 | ADR-008, acesso README and CONTEXT record it; check:docs passes | batch ✓ "segundo fator"; `npm run check:docs` exit 0 ("OK (0 aviso(s))") | `tests/docs/super-admin-docs.test.ts:81` `'recadastro obrigatório'`; `:82` `ACE-RN-18 \| Super Admin entra em duas etapas`; `:85` `ACE-RN-20 \| Código de recuperação válido não abre sessão`; `:89` CONTEXT `**Recovery code**` | PASS |
| C34 | super_admin logs in via `/login` with password + TOTP and lands on `/plataforma` | `CI=1 npx playwright test -c playwright.local.config.ts e2e/auth.spec.ts -g "Super Admin entra e termina em /plataforma"` exit 0: `✓ 1 [chromium] › e2e/auth.spec.ts:41:7 … (1.8s)`, 1 passed (global-setup ran with the MFA enrollment) | `e2e/auth.spec.ts:44-45` fills `Código do autenticador` with `nextTotpCode()` and clicks `Verificar`; `:46` heading `Plataforma` visible; `:47` `toHaveURL("/plataforma")` | PASS |
| C35 | full E2E in both configs, super_admin through the 2nd factor in global-setup | NOT re-run by the verifier. Author reports dev config 228 passed; `npm run build` + prod config 26 passed at HEAD | Partial independent evidence: the C34 run executed `e2e/global-setup.ts` (`loginSuperAdmin`: login → `mfaEnrollmentRequired` → enroll → verify) on the dev config. `e2e/global-setup.prod.ts` delegates to the same `runGlobalSetup` | AUTHOR-REPORTED |

## Findings (ranked; none blocks the verdict)

1. **C10 proof pointer is weak and predates the feature.** `tests/api/auth-routes.test.ts:168-169` asserts only `status 200` and `data.ok === true`. It checks neither the `Set-Cookie` nor the role, and the diff never touched the file. The real proof is `tests/api/mfa-login.test.ts:614-615` (`company_admin` session from the cookie). Fix: repoint the C10 proof.
2. **C17 sampling gap.** The claim covers "any role", but the test covers only `super_admin`, `company_admin` and `patient` (`tests/proxy.test.ts:184-188`); `atendente`, `profissional` and `partner` are untested. The risk is low because `PUBLIC_PATHS` does not depend on role (`src/lib/auth/access-policy.ts:33-36`).
3. **C21 has a weak plaintext-at-rest assertion.** `tests/api/mfa-login.test.ts:443` looks for the hyphenated plaintext inside `codeHash`, so plaintext stored normalized (without the hyphen) would pass. `:428-430` (`every codeHash startsWith('scrypt$')`) covers the claim, and so do `tests/lib/mfa-recovery-codes.test.ts:18-19`.
4. **C23: a previous session cookie is never shown to fail.** The test asserts `session_version + 1` (`mfa-login.test.ts:483`) and rejects an old pending token (`:485`). No pre-existing session cookie is checked for rejection. The revocation relies on the existing sv mechanism (ADR-005), and the claim names that mechanism in parentheses.
5. **C35 not independently re-run** (author-reported; see the row).
6. Note: the design's Shape line 118 places the enrollment screen under `src/app/plataforma/`, and the checklist places it in `/login`. This follows the Decision "cadastro antes da sessão" and is recorded in the Landing. It does not contradict a Decision, but the owner may want to confirm it.

## Gate

- vitest batch (10 files): 143 passed, 0 failed
- `npm run check:sv`: exit 0
- `npm run check:docs`: exit 0 (0 warnings)
- playwright (local config) C34: 1 passed
- `AGENTS.md` was rewritten by `next dev` during the E2E run and restored with `git checkout AGENTS.md`. The tree is clean apart from this report.

## Após a verificação (nota do autor, não do Verifier)

- Lacuna 1: prova do C10 passou a apontar para `tests/api/mfa-login.test.ts -t "recebe a sessão direto, sem segundo fator"` (lê papel `company_admin` do cookie).
- Lacuna 2: C17 agora varre os 6 papéis em `tests/proxy.test.ts`.
- Lacuna 3: o teste de C21 também recusa o código sem hífen dentro do hash.
- Lacuna 4 (C23 sem cookie antigo recusado) fica como está: a revogação da sessão pela `session_version` é o mecanismo do ADR-005, já provado em `tests/api/session-revocation.test.ts`.
- `npx vitest run tests/api/mfa-login.test.ts tests/proxy.test.ts` - 79 passed, 0 failed.
