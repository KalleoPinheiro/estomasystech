# C1 — Canal de e-mail por clínica Verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 1ac6494..9a89210 (HEAD of `feature/fervent-fermat-e31skh`); round-2 fix diff 1fc2c68..9a89210 touches only `tests/infrastructure/email-gateway-scope.test.ts`
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

## Binding sources (carried from 1fc2c68)

Step 1 does not run under `light`. The checklist marks no source as binding for an interface, and the feature has no UI.

## Proof runs (verified at 9a89210)

Round 2 re-ran every proof at 9a89210 using the same batched invocation and alternation. Result: 5 files, **19 passed, 13 skipped (unmatched), 0 failed**, with each named proof listed individually as passed. The C11 grep chain exited 0 and `check:docs` reported `OK (0 aviso(s))`. Round 1's details follow for reference.

### Round 1 (at 1fc2c68)

- One Vitest invocation over the 5 proof files with the alternation
  `-t "cifra a chave|isolamento|canal da clínica|sem canal|plataforma|intercaladas|não decifra|produção sem credenciais|Dado produção, Quando send|Canal da clínica no banco"`:
  5 files, **19 passed, 13 skipped (unmatched), 0 failed**. Every named proof appears individually as `✓`. No filter matched zero tests.
- Unfiltered run of the same 5 files: 32 passed, 0 failed.
- C11: `grep -q '\*\*Status:\*\* aceito' docs/adr/011-… && grep -q '011-canal-de-comunicacao-por-clinica' docs/adr/004-…` returned exit 0. `npm run check:docs` returned `OK (0 aviso(s))`, exit 0.
- Diff provenance (`git diff --stat 1ac6494..HEAD`): `clinic-channels-migration.test.ts` (+93), `drizzle-clinic-channel-repository.test.ts` (+97) and `email-gateway-scope.test.ts` (+164) are new. `resend-email-gateway.test.ts` (52 lines changed) rewrote the "produção sem credenciais" test. `email-gateway.test.ts` (26 lines changed) did not touch the C10 test at :68, which is allowed because the checklist marks C10 as existing behaviour kept.

## Checks

C1–C3 and C9–C11 citations are carried from 1fc2c68, because their files are unchanged in 1fc2c68..9a89210. C4–C8 citations are refreshed at 9a89210. All 11 proofs re-ran green at 9a89210.

| Check | Claim | Proof run | Evidence | Result |
|---|---|---|---|---|
| C1 | save `re_abc123XYZ9` → ciphertext ≠ key, `secret_last4='XYZ9'`, find returns original | batch `-t "cifra a chave"`: 2 ✓ | `tests/infrastructure/drizzle-clinic-channel-repository.test.ts:47-49` - `expect(row.encryptedSecret).not.toBe('re_abc123XYZ9')`, `.not.toContain('re_abc123XYZ9')`, `expect(row.secretLast4).toBe('XYZ9')`; `:51` - `expect(found?.apiKey).toBe('re_abc123XYZ9')`. Upsert (Swept idempotency): `:62` `toHaveLength(1)`, `:63` `toBe('re_segunda0002')` | PASS |
| C2 | 2nd `(clinic_id, channel)` → 23505 `uq_…`; channel/provider/last_status out of set → 23514 | file run: 4 ✓ | `tests/infrastructure/clinic-channels-migration.test.ts:150-153` - `toMatchObject({ code: '23505', constraint: 'uq_clinic_channels_clinic_channel' })`; `:157-162` `{ code: '23514', constraint: 'clinic_channels_channel_check' }`; `:172-175` `… 'clinic_channels_provider_check'`; `:181-188` `… 'clinic_channels_last_status_check'`. DDL is in `drizzle/0047_clinic-channels.sql` | PASS |
| C3 | scope A with B's channel → `find` null; system scope → `find` throws | batch `-t "isolamento"`: 3 ✓ | `drizzle-clinic-channel-repository.test.ts:73` - `expect(await fromA.find('email')).toBeNull()`; `:82-84` - `rejects.toThrow('Canal de comunicação exige escopo de clínica')` (also `save` at `:85-87`) | PASS |
| C4 | `getRepositories(clinicScope(A)).email.send` → POST Resend with `Bearer <A key>`, `from=<A sender>`; `isEnabled()` true | batch `-t "canal da clínica"`: 1 ✓ | `tests/infrastructure/email-gateway-scope.test.ts:78` - `expect(await email.isEnabled()).toBe(true)`; `:80` - URL `'https://api.resend.com/emails'`; `:81` - `expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')`; `:82-87` - `toEqual([{ auth: 'Bearer re_chave_da_A', from: \`Clínica <contato@${CLINIC_A_ID}.test>\` }])` (verified at 9a89210) | PASS |
| C5 | B without channel, platform env set → `isEnabled()` false, no `fetch` | batch `-t "sem canal"`: 1 ✓ | `email-gateway-scope.test.ts:91-92` stubs `RESEND_API_KEY`/`EMAIL_FROM`; `:98` - `expect(await email.isEnabled()).toBe(false)`; `:99` - `expect(fetchMock).not.toHaveBeenCalled()` | PASS |
| C6 | `systemScope()` with platform env → platform key; without → `isEnabled()` false | batch `-t "plataforma"`: 2 ✓ (+3 in resend file, same word) | `email-gateway-scope.test.ts:109-115` - `isEnabled()` `toBe(true)` and `toEqual([{ auth: 'Bearer re_da_plataforma', from: 'VittaFlow <no-reply@vitta.test>' }])`; `:121` - `expect(await email.isEnabled()).toBe(false)`. The negative case relies on `vitest.config.mts:39-40` blanking `RESEND_API_KEY`/`EMAIL_FROM`, so it is deterministic | PASS |
| C7 | two clinics with different channels send with their own key, interleaved, same process | batch `-t "intercaladas"`: 1 ✓ | `email-gateway-scope.test.ts:131-132` - concurrent pair captured right after `Promise.all`; `:137-140` - `expect([...concurrent].sort()).toEqual(['Bearer re_chave_da_A','Bearer re_chave_da_B'])` (each clinic with its own key, in any order); `:141-145` - `sentWith(fetchMock).slice(2)…toEqual(['Bearer re_chave_da_B','Bearer re_chave_da_A'])` (the sequential B→A pair asserted exactly; together the two assertions pin the total at 4 calls) (verified at 9a89210) | PASS |
| C8 | undecryptable secret → `isEnabled()` false + `logError` with the clinic id, no key, no ciphertext | batch `-t "não decifra"`: 1 ✓ | `email-gateway-scope.test.ts:160` - `isEnabled()` `toBe(false)`; `:163` no `fetch`; `:164` `errorLog` called; `:166` `toContain(CLINIC_A_ID)`; `:167` `.not.toContain('re_chave_secreta_A')`; `:168` `.not.toContain(row.encryptedSecret)`. Code path: `src/infrastructure/container.ts:332` `logError(...)` → `src/lib/log-error.ts:101` `console.error` | PASS |
| C9 | `NODE_ENV=production` without `RESEND_API_KEY` → `platformEmailGateway()` does not throw, `isEnabled()` false | batch `-t "produção sem credenciais"`: 1 ✓ | `tests/infrastructure/resend-email-gateway.test.ts` (scenario "canal da plataforma", rewritten in the diff) - `vi.stubEnv('NODE_ENV','production')`, `const gateway = platformEmailGateway()` (does not throw), `expect(gateway).toBeInstanceOf(NullEmailGateway)`, `expect(await gateway.isEnabled()).toBe(false)`. Source: `src/infrastructure/email/resend-email-gateway.ts:76-79` | PASS |
| C10 | in production the null gateway log has no password link (existing behaviour) | batch `-t "Dado produção, Quando send"`: 1 ✓ | `tests/infrastructure/email-gateway.test.ts:73` - `expect(logged).not.toContain('definir-senha')`; `:75-77` - `toBe('[e-mail desativado] Para pe***@clinica.com — Defina sua senha')` (test unchanged in the diff, as the checklist allows) | PASS |
| C11 | ADR-011 exists with status `aceito`; ADR-004 points to it | grep chain exit 0; `check:docs` OK | `docs/adr/011-canal-de-comunicacao-por-clinica.md:11` - `- **Status:** aceito (...)`; `docs/adr/004-remocao-google-oauth-autenticacao.md:88` - `[ADR-011](./011-canal-de-comunicacao-por-clinica.md)` | PASS |

**11 / 11 proven.**

## Swept rows resolving to "existing" (carried from 1fc2c68)

- dependency failure: `ResendEmailGateway.send` throws on non-2xx with a 10 s timeout. Confirmed in `src/infrastructure/email/resend-email-gateway.ts:15` (`REQUEST_TIMEOUT_MS = 10_000`), `:41` (`signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)`) and `:43-46` (`if (!response.ok) … throw new Error(\`Resend API ${response.status}: …\`)`). The constraint is present.
- One-way doors spot-checked against code: the repository rejects `clinicId === null` (`drizzle-clinic-channel-repository.ts` `requireClinic`, message `'Canal de comunicação exige escopo de clínica'`); `EMAIL_PROVIDER_GATEWAYS: Record<EmailProvider, …>` (`resend-email-gateway.ts:64-69`); port `isEnabled(): Promise<boolean>` (`src/application/ports/email-gateway.ts`); `LazyEmailGateway` lives in the same file.

## Faults injected (carried from 1fc2c68)

Step 4 does not run under `light`.

## Gate (verified at 9a89210)

- `npm run -s typecheck`: exit 0, no errors.
- `npm run -s lint`: exit 0, with 2 warnings and 1 info. They are at `tests/infrastructure/deploy-config.test.ts:134`, `tests/infrastructure/drizzle-clinical-inventory.test.ts:40` and `tests/docs/structure.test.ts:72`. None of those files is in `git diff --name-only 1ac6494..HEAD`, so all three predate this change.
- Full coverage suite: not run, as instructed. The author reports 295 files and 4162 tests passing.
- Working tree after verification: clean apart from this report (untracked).
- In round 2, typecheck and lint gave the same results: typecheck exited 0, and lint again showed the same 2 warnings and 1 info, all in files outside the diff.

## Findings

No open findings at 9a89210.

### Resolved in round 2 (re-judged at 9a89210)

1. **F1 (low, precision gap), resolved.** C4 now asserts the HTTP method at the scope level: `tests/infrastructure/email-gateway-scope.test.ts:81` `expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')`. The claim's word "POST" is now asserted inside its own proof.
2. **F2 (low, test robustness), resolved.** C7 no longer depends on which concurrent send reaches `fetch` first. The pair is captured at `:132` and compared after sorting at `:137-140`. The deterministic sequential pair `b1`→`a2` is still asserted exactly at `:141-145`. The claim still holds: each clinic sends with its own key, the sends interleave, and they run in the same process.
