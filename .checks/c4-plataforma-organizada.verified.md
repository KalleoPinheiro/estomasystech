# C4 — `/plataforma` organizado Verification

**Verdict**: PASS
**Profile**: light
**Diff range**: af2f650..a3674a7 (round-2 fix diff: 6a32687..a3674a7)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1 (at 6a32687) returned FAIL on C8. The fix at a3674a7 replaces the fixture with a
well-formed `v1.` payload under an unknown key id. The `find()` mutation that survived round 1 is
now killed. All 20 checks are proven.

The fix diff touches three files: `tests/api/platform-clinic-email-status.test.ts` (fixture, 6
lines), `e2e/plataforma.spec.ts` (1 click now goes through the back link) and
`.checks/c4-plataforma-organizada.md` (Coverage row and Landing filename). It does not touch
`src/` or docs.

## Binding sources — carried from 6a32687

| Source | Opened | Contradiction | Uncovered |
|---|---|---|---|
| `.tasks/c4-plataforma-organizada.md` (record of decision) | yes | none | – |
| `.design/canal-por-clinica.md` Decisions "Status na plataforma", "Taxonomia" | yes | none | – |

Step 1 (`ui`) does not apply. Round-1 note 4, which said Landing named `platform-nav.tsx`, is
**resolved at a3674a7**: Landing now says `platform-header.tsx`. The note about the Impact row
(`PlatformClinicDto` vs. the Summary and Detail DTOs) remains informational. It does not
contradict criterion 4.

## Checks

All proofs were re-run in full at a3674a7.
- Vitest, one batched invocation, `--reporter=verbose`: 7 files, 46 passed, 0 failed. Every named test is listed as ✓.
- Playwright, using a temporary config with `executablePath: /opt/pw-browsers/chromium` over `e2e/plataforma.spec.ts` and `e2e/auth.spec.ts`: 22 passed, 0 failed. The temporary config and `test-results/` were deleted afterwards.

Citations were refreshed for the files the fix touched. All other citations are carried from
6a32687; those files are unchanged in the fix diff, so their line numbers still hold.

| Check | Claim | Proof run (a3674a7) | Evidence | Result |
|---|---|---|---|---|
| C1 | nav has exactly Clínicas/Auditoria/Taxonomia, in order, with hrefs | vitest "o topo tem os três links" ✓ | `tests/pages/plataforma-nav.test.tsx:33` `toEqual(['Clínicas','Auditoria','Taxonomia'])`; `:38` hrefs `toEqual(['/plataforma','/plataforma/auditoria','/plataforma/taxonomia'])` (carried) | PASS |
| C2 | `aria-current` only on the current section, 5 paths | vitest `it.each` ×5 ✓ | `plataforma-nav.test.tsx:45-50` table; `:56` `toHaveAttribute('aria-current','page')`; `:58` `not.toHaveAttribute('aria-current')` (carried) | PASS |
| C3 | the list has no "Trilha da plataforma" link | vitest ✓ | `tests/pages/plataforma.test.tsx:49` `queryByRole('link',{name:'Trilha da plataforma'})).not.toBeInTheDocument()` (carried) | PASS |
| C4 | e2e: nav visible, leads to Taxonomia | playwright `plataforma.spec.ts:24` ✓ | `e2e/plataforma.spec.ts:28` `toHaveText(["Clínicas","Auditoria","Taxonomia"])`; `:32` `toHaveURL("/plataforma/taxonomia")`; `:34-37` `aria-current="page"` (verified at a3674a7) | PASS |
| C5 | list `emailChannel` in 4 states | vitest ✓ | `tests/api/platform-clinic-email-status.test.ts:108` `toEqual(NO_CHANNEL)`; `:109-126` untested/ok/failed literal objects with `'2026-10-09T14:30:00.000Z'` (verified at a3674a7) | PASS |
| C6 | detail `emailChannel` (no channel, failed) | vitest ✓ | `…email-status.test.ts:137-145` `status 200`, `toEqual(NO_CHANNEL)`, failed literal (verified at a3674a7) | PASS |
| C7 | neither body has the forbidden keys or values | vitest ✓ | `…email-status.test.ts:156` `not.toContain('"sender"'/'"secretLast4"'/'"lastError"')`; `:164` `not.toContain` SENDER/API_KEY/last 4/PROVIDER_ERROR (verified at a3674a7) | PASS |
| C8 | unreadable key → list and detail `200`, `configured: true`, status does not decrypt | vitest "chave indecifrável" ✓ | `…email-status.test.ts:179` `encryptedSecret: 'v1.deadbeef.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA'`. This matches `V1_PAYLOAD` with an unknown key id, so `decrypt` throws (`data-cipher.ts:133-137`). `:186-189` `status).toBe(200)` ×2, `configured).toBe(true)` ×2. The `find()` mutant is killed (see Faults) (verified at a3674a7) | **PASS** (round 1: FAIL) |
| C9 | `findStatus` reads only the scoped clinic and refuses the system scope | vitest ×2 ✓ | `tests/infrastructure/drizzle-clinic-channel-repository.test.ts:132` `toEqual({provider:'resend',lastStatus:'failed',lastStatusAt:testedAt})` under a rotated cipher; `:144-149` `.toBeNull()`; `:150-153` `rejects.toThrow('Canal de comunicação exige escopo de clínica')` (carried) | PASS |
| C10 | 4 list rows show the 4 labels | vitest ✓ | `plataforma.test.tsx:240-245` table of the 4 labels; `:248` `within(row).getByText(label)` (carried) | PASS |
| C11 | detail: badge, "Provedor: Resend", "Último teste: …" | vitest ✓ | `tests/pages/plataforma-clinica.test.tsx:404` `'E-mail: falhando'`; `:405` `'Provedor: Resend'`; `:407-409` `` `Último teste: ${formatDateTime(...)}` `` (carried) | PASS |
| C12 | "Nunca testado"; no channel → "sem canal" / "Provedor: —" | vitest ✓ | `plataforma-clinica.test.tsx:427-429`, `:436-438` (carried) | PASS |
| C13 | e2e: new clinic shows "E-mail: sem canal" | playwright `plataforma.spec.ts:51` ✓ | `e2e/plataforma.spec.ts:81` `row.getByText("E-mail: sem canal")).toBeVisible()` (verified at a3674a7) | PASS |
| C14 | criterion 5 text, literal, plus the button | vitest ✓ | `tests/pages/plataforma-taxonomia.test.tsx:53-55` `textContent ===` literal; `:58` button `toBeEnabled()` (carried) | PASS |
| C15 | ConfirmAction title; cancel makes no API call | vitest ✓ | `…taxonomia.test.tsx:67` title literal; `:73` `fetchMock).not.toHaveBeenCalled()` (carried) | PASS |
| C16 | one POST; shows 7/5/6/9 | vitest ✓ | `…taxonomia.test.tsx:87-90` the four labels; `:91` `toHaveBeenCalledTimes(1)`; `:92-93` URL and `method:'POST'` (carried) | PASS |
| C17 | failure → ErrorAlert with the message, button re-enabled | vitest ✓ | `…taxonomia.test.tsx:105-107` `toHaveTextContent('Catálogo indisponível')`; `:108` `toBeEnabled()` (carried) | PASS |
| C18 | pending → disabled + "Carregando…" | vitest ✓ | `…taxonomia.test.tsx:126` `toBeDisabled()`; `:128` `getByText('Carregando…')` (carried) | PASS |
| C19 | denied roles → 307 `/` or `/portal`; anonymous → `/login` | vitest proxy ×6 ✓ | `tests/proxy.test.ts:468-473` table; `:483` `status).toBe(307)`; `:484` `location).toBe(location)`; `:493-494` (carried) | PASS |
| C20 | e2e: import through the screen, counts shown | playwright `plataforma.spec.ts:40` ✓ | `e2e/plataforma.spec.ts:47` `getByText(new RegExp(`^${label}: \\d+$`))).toBeVisible()` ×4 (verified at a3674a7) | PASS |

## Round-1 gaps

| Gap | Status at a3674a7 |
|---|---|
| 1. C8 proof did not discriminate | **fixed**: mutant killed (below) |
| 2. Subpage "Clínicas" back link had no test | **fixed**: `e2e/plataforma.spec.ts:104` `page.getByRole("main").getByRole("link",{name:"Clínicas"}).click()`, followed by `:106` `row.getByText("Suspensa")).toBeVisible()` on the list. The "suspende e reativa pela tela" test passed. |
| 3. Coverage row credited "ok" to C11 | **fixed**: the row now reads "ok C5/C10 (o detalhe usa o mesmo `emailChannelLabel`) · failed C5/C6/C10/C11", which matches the proofs |
| 4. Landing filename | **fixed**: `platform-header.tsx` |

## Extra scrutiny — carried from 6a32687

The fix diff touches no `src/` or docs, so these verdicts stand:
- No leak of `sender`, `secretLast4`, `lastError` or the key from either GET.
- Changed existing tests were not weakened beyond the decided behaviour change.
- No raw UI elements, raw colours or `biome-ignore`.
- Cognitive complexity is clean.
- `docs/domains/acesso/README.md` is updated (ACE-RN-36, ACE-RN-37).

## Swept rows marked "existing" — carried from 6a32687

| Row | Present |
|---|---|
| idempotency | `src/application/taxonomy/import-taxonomy-catalog.ts:46-48` |
| authorization (`/api/platform` is in the `platform` family) | `src/lib/auth/route-family.ts:24`, `:158` |

## Faults injected (verified at a3674a7)

Faults are not required under `light`. This one was re-run on the surface the fix created. It ran in a scratch worktree at a3674a7, which was removed afterwards. The real tree's porcelain matched the baseline afterwards.

| Mutation | Location | Killed |
|---|---|---|
| `clinicChannels.findStatus('email')` → `clinicChannels.find('email')` in both GET routes | `src/app/api/platform/clinics/route.ts`, `src/app/api/platform/clinics/[id]/route.ts` | **yes**: "chave indecifrável…" fails (1 failed, 3 passed). Round 1: survived. |

## Gate

| Gate | Result | Source |
|---|---|---|
| `npm run typecheck` | exit 0 | verified at a3674a7 |
| `npm run check:docs` | OK, 0 warnings | verified at a3674a7 (the checklist `.md` changed) |
| `npx biome lint` on the fix's test file | clean | verified at a3674a7 |
| `npm run lint` | exit 0; 2 warnings and 1 info, all in files outside the diff | carried from 6a32687 (the fix touches no linted source beyond the file above) |
| `npm run check:sv` | OK | carried from 6a32687 (the fix touches no JSX) |
| Vitest proofs | 46 passed, 0 failed (7 files) | verified at a3674a7 |
| Playwright (`plataforma.spec.ts` + `auth.spec.ts`) | 22 passed, 0 failed | verified at a3674a7 |
| `npm run test:coverage` | **not re-run** by the verifier; the author reports 305 files, 4306 tests, 96.57% statements | – |
