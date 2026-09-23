# Portal responsivo em viewport mobile - verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 780f92c..fe3471a
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Verified at `fe3471a`. The verifier did not write this code. Proofs were run by the verifier at
`HEAD` with `playwright.local.config.ts` (same config as `playwright.config.ts`, only the local
Chromium `executablePath` differs) and `--retries=0`.

## Binding sources

Profile `light`: step 1 does not run. Issue #127 acceptance criteria 1-6 are carried in `checks.md`
(C1-C8 cite them); no design artifact is marked binding.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | paciente, 390x844 e 375x667, `scrollWidth <= largura + 2` | `CI=1 npx playwright test -c playwright.local.config.ts e2e/portal-responsivo.spec.ts e2e/portal-paciente.spec.ts e2e/portal-parceiro.spec.ts --retries=0` - 10 passed; `paciente ... (390x844)` and `(375x667)` at `:169` ran and passed | `e2e/portal-responsivo.spec.ts:55` - `expect(scrollWidth, ...).toBeLessThanOrEqual(width + 2)`, called for "visão inicial" at `:182` | PASS |
| C2 | same with Remarcar, Cancelar, Agendar retorno, consentimento aceito, prévia da foto open | same run, `paciente` tests at `:169` | `e2e/portal-responsivo.spec.ts:55` via `expectMobileFriendly` at `:190` (remarcar), `:194` (cancelar), `:201` (agendar retorno), `:207` (consentimento aceito / Revogar), `:215` (prévia da foto) | PASS |
| C3 | parceiro recolhido e expandido, ambos viewports, `scrollWidth <= largura + 2` | same run; `parceiro ... (390x844)` and `(375x667)` at `:218` passed | `e2e/portal-responsivo.spec.ts:55` via `:248` (lista) and `:253` (evolução do indicado) | PASS |
| C4 | every visible `button, a[href], input, select, textarea` >= 44x44, failure names the control | same run, all 4 mobile tests | `e2e/portal-responsivo.spec.ts:85` - `expect(tooSmall, ...).toEqual([])` over selector at `:66`, filter rejecting width or height below `min` at `:83`, `MIN_TOUCH_TARGET_PX = 44` at `:45`; fault F2 output listed controls by name (`<button> Confirmar presença`, `<a> VittaFlow`, ...) | PASS |
| C5 | desktop 1280x720, `Button size="sm"` stays 36px | same run; `desktop com ponteiro fino ...` at `:259` passed | `e2e/portal-responsivo.spec.ts:281` - `expect(box!.height).toBe(36)` | PASS |
| C6 | existing portal specs stay green | same run; 5 tests in `portal-paciente.spec.ts` (`:14`, `:71`, `:100`) and `portal-parceiro.spec.ts` (`:9`, `:54`) passed | `e2e/portal-paciente.spec.ts:50` - `expect(appointmentItem.getByText("Confirmada")).toBeVisible()`; `e2e/portal-parceiro.spec.ts:46` - `expect(page.getByText(notReferred.fullName)).not.toBeVisible()` | PASS |
| C7 | no raw element/colour; `sv-gap: touch-target-size` has a section | `npm run check:sv` exit 0; `npm run check:docs` exit 0 ("0 aviso(s)") | markers `src/app/globals.css:112` (`sv-gap: layout-grid-min-content`) and `:121` (`sv-gap: touch-target-size`); sections `docs/still-void-gaps.md:47` and `:59`; rule uses only `var(--sv-space-*)` tokens | PASS |
| C8 | typecheck, lint, test:coverage green | `npm run typecheck` exit 0; `npm run lint` exit 0 (1 pre-existing info, not in diff); `npm run test:coverage` exit 0 | 209 files / 3378 tests passed; Statements 96.56%, Branches 92.04%, Functions 96.07%, Lines 96.83% (>= 90%) | PASS |

All named tests exist (`rg -n` hits at `e2e/portal-responsivo.spec.ts:169`, `:218`, `:259`) and
each appears individually as passed in the run output. The new spec is part of the diff
(`e2e/portal-responsivo.spec.ts`, new file), so C1-C5 are not proven by untouched tests.

## Swept existing

- authorization: existing - confirmed. `docs/domains/portal/README.md:24-25` defines POR-RN-01/02,
  and `src/app/api/portal/patient/waitlist/route.ts:34` calls
  `requirePortalSession(request, 'patient')`. The diff touches no route or session code.
- state transitions: C2 - the open panels and accepted consent are measured (`:190`-`:215`).
- Every other row is `n/a` (approved policy). The diff is CSS, one wrapper `div` and docs, so none of
  them is contradicted.

## Faults injected

Not owed under `light`, but run anyway. Each fault was applied in place to `src/app/globals.css`
from a backup copy, and the file was restored afterwards. `git status --porcelain` was empty before
and after each fault. `AGENTS.md`, which `next dev` rewrote, was restored with `git checkout`.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1: `minmax(0, 1fr)` -> `1fr` (fix reverted) | `src/app/globals.css:118` | yes - both `paciente` tests fail at `:55`, scrollWidth 537 (390) / 539 (375) |
| F2: removed the whole `@media (width < 40rem), (pointer: coarse)` touch block | `src/app/globals.css:128-138` | yes - all 4 mobile tests fail at `:85`, naming each undersized control |
| F3: `@media (width < 40rem), (pointer: coarse)` -> `@media all` (desktop leak) | `src/app/globals.css:128` | yes - `desktop` test fails at `:281`, Expected 36, Received 44 |

## Observations (non-blocking)

1. **Precision (C1).** C1 lists "retorno recomendado", "histórico" and "faturas" among the states it
   measures. The spec seeds a follow-up and an invoice, and seeds no past appointment. It never
   asserts that those sections show their data: "Histórico de consultas" renders its empty state,
   and the invoice row and recall card are never checked for visibility. `scrollWidth` covers the
   whole document, so these sections are measured if they render. If their data silently failed
   to load, the proof would still pass. Consider asserting the invoice description and the recall
   reason before the measurement at `:182`.
2. **C3 is a guard only.** Under F1 (grid fix reverted), both `parceiro` tests still passed. The
   partner view does not overflow even without the fix, so C3 guards against regressions and does
   not prove the fix. This is consistent with the checks, which claim only no overflow.
3. **Cosmetic.** `e2e/portal-responsivo.spec.ts:241-242` (`addAssessment` calls in the partner
   test) are indented at 2 spaces inside a 6-space block. Biome does not cover `e2e/`
   (`biome.json` `files.includes`), so no gate catches it.

## Gate

`CI=1 npx playwright test -c playwright.local.config.ts e2e/portal-responsivo.spec.ts e2e/portal-paciente.spec.ts e2e/portal-parceiro.spec.ts --retries=0` - 10 passed, 0 failed
`npm run test:coverage` - 3378 passed, 0 failed
