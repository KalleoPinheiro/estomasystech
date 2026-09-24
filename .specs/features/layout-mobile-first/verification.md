# Layout mobile-first verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: app `46026ba..ba9089d` (`claude/layout-mobile-first`) · lib `19ea056..e361dfb` (`claude/sharp-gauss-meunxe`). Fix diff for this round: app `14af395..ba9089d`. The lib has not changed since round 2
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Summary: I re-ran every proof at the new heads. All of them pass: lib 9 of 9 named tests (the 6
checks plus 3 supporting tests), app Vitest 20 of 20 named tests, and app Playwright 110 of 110.
All 34 checks now have a proof that can fail. All five faults I injected this round were caught,
including the round-2 surviving mutant F2: C26 and C23 now fail when the staff content column
shrinks to its content. Every round-2 finding about the code or the tests is closed:

- C26 and C23 now pass and can fail.
- C33 now proves the repasses table.
- Both Test policy rows that were unmet are now met.
- AC 30 repasse is now measured in the browser.

The verdict is still FAIL for one reason, and the build cannot fix it. **Door 3 is not met.**
`package.json:29` still reads `"@still-void/ui": "^3.3.1"`, but the plan's literal shape is
`^3.4.0`. The `checks.md` Coverage row says C15 and C8 cover door 3. They do not: neither one reads
the version range, and the installed package is a local tarball that still reports version `3.3.1`.
This is open question 1 (`blocks go-live`). Only the user can close it, by approving publication of
`@still-void/ui@3.4.0` and then the version bump. This is round 3, so it goes to the user.

## Binding sources

*Checked at app `ba9089d` for the only interface-relevant change: none. The fix diff touches only
tests, `checks.md` and this report, not `src/`. The screen enumeration is carried from `14af395`.
The content-column row was measured again under F2.*

The plan marks no design file as binding. As in rounds 1 and 2, the authority is the plan's
`Problem`, its confirmed `Assumptions` and its `Criteria`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| plan `Problem` + outcome ("cards encolhem até o conteúdo") | yes - plan.md; F2 re-measured at `ba9089d` | none | - (C26 and C23 now use viewport − rail − `main` padding as the reference. With F2 applied, C26 is off by 87.5px at 390 and 310.8px at 1440, and C23 by 7.08px) |
| plan AC 23 (active tab visible) - carried from `14af395` | yes | none | - |
| user answer: agenda on mobile = compact month + day list - carried from `521a386` | yes | none | - |
| user answer: lib improvements ship as a lib minor, the app bumps to it and removes the `sv-gap` workarounds | yes - `package.json:29` and `src/app/globals.css:107-124` re-read | none | door 3: `package.json:29` still reads `^3.3.1` (plan Landing step 4 and door 3 require `^3.4.0`). This is open question 1, `blocks go-live`. The `sv-gap` workaround that remains is narrowed to text links and documented in `docs/still-void-gaps.md:46-56` |
| before screenshots (23 screens × 2) - carried from `521a386` | yes | none | - |

### Per-screen arrangement enumeration (authority: plan criteria)

| Screen | What the plan decides about arrangement | Check | Observed at HEAD |
| --- | --- | --- | --- |
| all 23 | no horizontal page scroll at 390 and 1440 | C7 | proof re-run green (23 tests × 2 viewports) |
| 14 staff screens | one `h1` inside `PageHeader`; actions below the title under 40rem | C10, C11 | green |
| staff content column | fills the available width | C26, C23 against viewport − rail − padding | green; F2 killed |
| Dashboard / Faturamento / Relatórios | KPIs in 2 columns under 40rem | C13 | green (F1 killed in round 2; file unchanged) |
| Agenda | compact grid, filter, day list; chips inside the day cell on desktop | C19-C24 | green |
| Prontuário | tab strip scrolls inside itself; active tab visible | C25 | green |
| Triagem | empty state fills the column | C26 | green; F2 killed |
| Documentos (6) | tables in a horizontal scroller; page does not scroll sideways | C32 | all 6 in the browser; the repasse probe showed 1 table, inside `.sv-table-container`, with `scrollWidth` 390 |

## Checks

*Verified at app `ba9089d` / lib `e361dfb`. Every proof was re-run in full at these heads.
Citations were refreshed for the files the fix touched: `e2e/layout-mobile-first.spec.ts`,
`tests/app/color-bridge.test.ts` and the new `tests/pages/payout-tables-empty.test.tsx`. Every other
citation is carried from `14af395`, and its file is unchanged in `14af395..ba9089d`.*

Proof runs:

- **lib**: `npx vitest run tests/layout-css-contract.test.ts tests/ui-table.test.tsx tests/table-css-contract.test.ts tests/release-contract.test.ts -t "<6 check names>|tab triggers reach 44px|no literal color inside|pointer-fine desktop keeps"`. 9 passed, each listed by name.
  - `git diff --exit-code 19ea056 -- src/tokens/colors.ts src/css/theme.css` exit 0 (`origin/main` = `19ea056`).
- **app Vitest**: one call over 14 files with a 20-name `-t` alternation. 20 passed, each listed by name. That covers C9, the two C15 tests, C30, the C32 jsdom test, and the 15 C33 tests (13 existing plus the 2 new payout-table tests).
- **app Playwright**: `npx playwright test -c playwright.shots.config.ts e2e/layout-mobile-first.spec.ts e2e/layout-tabelas.spec.ts --retries=0 --reporter=list`. **110 passed, 0 failed, 3.5 min**, exit 0, each test listed.
  - Hits per `-g` name: `sem scroll lateral` 23+1, `alvos de toque` 23, `um h1 por página` 14, `ações abaixo do título` 3, `KPIs em 2 colunas` 3, `empilhada no celular` 13, `tabela no desktop` 13, `painéis na largura` 2.
  - Every other name had exactly 1 hit, including the new `desktop com mouse mantém a altura da lib`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `.sv-layout` `minmax(0, 1fr)` | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:85` - `expect(declIn(body, 'grid-template-columns')).toBe('minmax(0, 1fr)')` (carried; lib unchanged) | PASS |
| C2 | 44px `min-height` on `.sv-btn`/`.sv-field` under touch media | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:95-98` - `… toBe(TOUCH_TARGET)` for both selectors | PASS |
| C3 | `stack` → `sv-table--stack`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:283` `toHaveClass('sv-table','sv-table--stack')`; `:285` `not.toHaveClass('sv-table--stack')` | PASS |
| C4 | `label` → `data-label`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:303` `toHaveAttribute('data-label','Nome')`; `:314` `not.toHaveAttribute('data-label')` | PASS |
| C5 | stack rules only under `(width < 40rem)` | lib vitest, pass | `still-void/tests/table-css-contract.test.ts:209` `expect(outside).not.toMatch(/\.sv-table--stack/)`; `:224` `toMatch(/content:\s*attr\(data-label\)/)` | PASS |
| C6 | minor changeset; no color value changed | lib vitest + git diff, pass | `still-void/tests/release-contract.test.ts:17` - `toMatch(/^---\s*\n"@still-void\/ui":\s*minor\s*\n---/)`; git diff exit 0; `layout-css-contract.test.ts:152-157` shows no literal color in the new media blocks | PASS |
| C7 | no page scroll, 23 pages × 2 viewports | e2e, 23 tests pass | `e2e/layout-mobile-first.spec.ts:251` - `toBeLessThanOrEqual(viewport.width + 2)` in a `for (const viewport of [MOBILE, DESKTOP])` loop (`:244`) | PASS |
| C8 | controls in `main` are at least 44×44 | e2e, 23 pass | `e2e/layout-mobile-first.spec.ts:262` - `expect(await tooSmallControls(target), …).toEqual([])` | PASS |
| C9 | one `h1` + an actions group | vitest, pass | `tests/components/page-header.test.tsx:21` `toHaveLength(1)`; `:27-30` the actions contain the button and not the `h1` | PASS |
| C10 | one `h1` inside `[data-page-header]`, 14 pages | e2e, 14 pass | `e2e/layout-mobile-first.spec.ts:273-274` - `toHaveCount(1)` on `h1` and on `[data-page-header] h1` | PASS |
| C11 | actions below the title, right edge ≤ 390 | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:294` `actions!.y >= title!.y + title!.height`; `:295` `actions!.x + width <= MOBILE.width` | PASS |
| C12 | sidebar e-mail on one line, ellipsis, `title` | e2e, pass | `e2e/layout-mobile-first.spec.ts:316-317` - `height <= lineHeight * 1.5`; `overflow === "ellipsis"` | PASS |
| C13 | KPIs in 2 columns | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:341` - `Math.abs(width - layout.half) <= 2` for every card; `:343` `layout.tops[0]` equals `layout.tops[1]` | PASS |
| C14 | back-link icon and text centers ≤ 4px apart | e2e, pass | `e2e/layout-mobile-first.spec.ts:363` - `Math.abs(centers.icon - centers.text) <= 4` | PASS |
| C15 | `@theme` bridge identical to `46026ba`; every color utility uses a bridge name; `check:sv` green | vitest 2 pass; `check:sv` exit 0 | `tests/app/color-bridge.test.ts:58` - `expect(colorBridge()).toEqual(BASELINE)`; `:103` - `expect([...unknown]).toEqual([])` (new scan; F-d killed). Supplementary diff: `46026ba..HEAD` removes no color utility in `src/**/*.tsx`. Net additions are all bridge names (`text-ink-3`, `bg-accent-ink`, `bg-accent-soft`, `text-accent-ink`, `divide-border`, `text-white`, `bg-transparent`), in the new `agenda/mobile-month.tsx` and in reflowed markup | PASS |
| C16 | 13 tables stacked at 375 | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:233` `toHaveClass(/sv-table--stack/)`; `:257-259` `theadHeight <= 1`, `badLabels` `[]`, `offscreen` 0 | PASS |
| C17 | 13 tables at 1440 | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:274-275` - `theadHeight > 0`; `tallRows === 0` | PASS |
| C18 | Pacientes empty state at both viewports | e2e, pass | `e2e/layout-tabelas.spec.ts:285-286` - `getByText("Nenhum paciente encontrado")` visible; `main table` count 0 | PASS |
| C19 | 7 day columns, each ≥ 44px, inside 390 | e2e, pass | `e2e/layout-mobile-first.spec.ts:490` `expect(boxes).toHaveLength(7)`; `:494-495` `box.w`/`box.h` `toBeGreaterThanOrEqual(MIN_TOUCH_PX)` | PASS |
| C20 | dot marker, no chip in the cell | e2e, pass | `e2e/layout-mobile-first.spec.ts:506` `toHaveAttribute("data-has-appointments", "true")`; `:508` `day.locator("button")` `toHaveCount(0)` | PASS |
| C21 | today selected on load; the tapped day lists below the grid | e2e, pass | `e2e/layout-mobile-first.spec.ts:521` `"aria-pressed"` on today, unconditional; `:537` `expect(listTop).toBeGreaterThanOrEqual(gridBottom)` | PASS |
| C22 | empty-day message | e2e, pass | `e2e/layout-mobile-first.spec.ts:549` - `[data-day-list]` `getByText("Nenhuma consulta neste dia.")` `toBeVisible()` | PASS |
| C23 | filter below the month nav, content-column width ±2 | e2e, pass | `e2e/layout-mobile-first.spec.ts:560` - `Math.abs(filter!.width - (await contentWidth(page))) <= 2`. The reference (`:194-210`) is `documentElement.clientWidth − rail − main padding`, which does not depend on the column. F2 killed it (7.08 > 2) | PASS |
| C24 | desktop chip inside its day cell | e2e, pass | `e2e/layout-mobile-first.spec.ts:575` - `[data-calendar-day="${dayKey}"]` `.locator(chip)` `toHaveCount(1)` | PASS |
| C25 | tablist scrolls inside itself; active tab visible on load and after selection | e2e, pass | `e2e/layout-mobile-first.spec.ts:589` `scroll > client`; `:594-595` Anamnese inside 0..390; `:598-599` Pacotes | PASS |
| C26 | Anamnese panel and Triagem empty state = the independent content width ±2, both viewports | e2e, 2 pass | `e2e/layout-mobile-first.spec.ts:614` - `Math.abs(box!.width - width) <= 2`, where `width = contentWidth(page)` (`:613`) is independent of the column. **F2 killed** at 390 (`/triagem` off by 87.5) and at 1440 (`/pacientes/[id]` off by 310.8) | PASS |
| C27 | Retornos not clipped, actions below | e2e, pass | `e2e/layout-mobile-first.spec.ts:641-642` - `clipped` `toBe(false)`; `below` `toBe(true)` | PASS |
| C28 | public cards ≥ 16px from the edges | e2e, pass | `e2e/layout-mobile-first.spec.ts:654` `expect(card!.x, url).toBeGreaterThanOrEqual(16)`; `:655` the right margin is at least 16, for all 3 URLs | PASS |
| C29 | Confirmar and the date are disjoint | e2e, pass | `e2e/layout-mobile-first.spec.ts:683` - `expect(disjoint).toBe(true)` | PASS |
| C30 | one `svg` in the emergency notice | vitest, pass | `tests/components/portal-layout.test.tsx:71` - `querySelectorAll('svg')).toHaveLength(1)` | PASS |
| C31 | greeting at the headline step at 390, display at 1440 | e2e, pass | `e2e/layout-mobile-first.spec.ts:707` - `expect(sizes.actual).toBe(sizes.expected)` | PASS |
| C32 | 6 documents in the browser (repasse via `page.route`): tables in a scroller, no page scroll; repasse jsdom structure | e2e pass + vitest pass | `e2e/layout-mobile-first.spec.ts:726` `scrollWidth <= MOBILE.width + 2`; `:734` `expect(unwrapped, url).toBe(0)`, now over `mockPayoutReceipt(page)` (`:722`, route at `:466`). A probe at HEAD confirmed that the mocked repasse page renders (1 table, inside `.sv-table-container`, `scrollWidth` 390). F-e killed on `/documentos/repasse/po-layout`. jsdom: `tests/pages/documento-repasse.test.tsx:215` `tables.length > 0`; `:219` `closest('.sv-table-container')` `not.toBeNull()` | PASS |
| C33 | each of the 13 tables shows its existing empty message | vitest, 15 pass | **repasses, now on the measured tables:** `tests/pages/payout-tables-empty.test.tsx:20-23` `getByText('Nenhum profissional cadastrado.')` `toBeInTheDocument()` + `querySelector('table')` `toBeNull()` (`ClinicStatementsTable`, `payout-tables.tsx:242`); `:28-29` `'Nenhuma sessão.'` (`PayoutItemsTable`, `payout-tables.tsx:31`). F-c killed both. The other 12 are carried with their files unchanged: pacientes `staff-pacientes-list.test.tsx:108`; parceiros `staff-operations.test.tsx:1883`; profissionais `:2535-2537`; auditoria `:101`; contas `:952`; procedimentos `staff-procedimentos.test.tsx:150-152`; materiais `staff-materiais.test.tsx:189`; faturamento `staff-faturamento.test.tsx:177`; relatórios receita `staff-relatorios.test.tsx:166`; produção `:244`; feriados `schedule-availability-ui.test.tsx:115`; prontuário `staff-paciente-detail.test.tsx:1254`; history `staff-repasses.test.tsx:180` | PASS |
| C34 | at 1440 with a fine pointer, a default `Button` keeps the `--sv-space-10` height (< 44) | e2e, pass | `e2e/layout-mobile-first.spec.ts:758` `expect(sizes.base).toBeLessThan(44)`; `:759` `expect(sizes.height).toBe(sizes.base)`. F-b killed it (expected 40, received 44) | PASS |

## Coverage

*Recomputed at `ba9089d` for the rows the fix touched: table empty states, documents, AC 24 panels,
staff content column, touch rule × context, AC 13 utilities, and Landing doors. The other rows are
carried from `14af395` and marked as such; their proofs were re-run green.*

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| page set × viewport (46) - carried from `14af395` | plan Observable | C7, 23 tests × 2 viewports | - |
| page set, touch (23) - carried | plan Observable | C8, 23 tests | - |
| staff pages with `PageHeader` (14) - carried | plan Observable | C10, 14 tests | - |
| KPI groups (3) - carried | AC 11 | C13 ×3 | - |
| table set, stacked + desktop (13) - carried | plan Observable | C16 ×13, C17 ×13 | - |
| table set, empty state (13 tables; repasses has 3 empty branches) - verified at `ba9089d` | AC 16 + `payout-tables.tsx` empty branches | 12 tables via C33 (+ C18 in the browser for pacientes). Repasses: statements `payout-tables-empty.test.tsx:20` · items `:28` · history `staff-repasses.test.tsx:180` | - |
| document pages (6) - verified at `ba9089d` | AC 30 + plan Observable | atestado, consentimento, relatório, plano de cuidados, recibo, repasse: C32 in the browser (`:726`, `:734`); repasse also jsdom `:219` | - |
| AC 24 panels (2 × 2 viewports) - verified at `ba9089d` | AC 24 + plan Problem | prontuário and triagem at 390 and 1440: C26 `:614` against the column-independent reference; F2 killed at both viewports | - |
| staff content column = available width - verified at `ba9089d` | plan Problem | held through C26 (prontuário, triagem) and C23 (agenda), all against viewport − rail − padding; F2 killed all three tests | - |
| touch rule, selector × context (3) - verified at `ba9089d` | AC 2 + checks row | `.sv-btn` narrow/touch C2 + C8 · `.sv-field` narrow/touch C2 + C8 · `.sv-btn` desktop fine pointer C34 (F-b killed) | - |
| AC 13 color utilities - verified at `ba9089d` | AC 13 | name-level: C15 `:103` (F-d killed); bridge: C15 `:58`; supplementary diff shows no existing color utility changed | - |
| agenda mobile states (4) and viewports (2) - carried | AC 17-22 | C20 C21 C22 · C19 C24 | - |
| `Table stack`, `TableCell label` - carried | lib API | C3 C5 · C4 | - |
| Landing doors (4) - verified at `ba9089d` | plan Landing + one-way doors table | 1: C3 C4 C5 · 2: C2 C34 · 4: C9 C10 | door 3 (`"@still-void/ui": "^3.4.0"`): `package.json:29` reads `^3.3.1`, and `node_modules/@still-void/ui/package.json:3` reads `3.3.1`. The `checks.md` Coverage row attributes door 3 to C15 (`check:sv`) and C8, but neither reads the dependency range. Blocked on open question 1 (`blocks go-live`) |

## Test policy rows

*Re-judged at `ba9089d`: the two rows that were unmet in round 2, plus the arrangement row, whose
spec the fix touched. The other two rows are carried from `14af395` because their files are
unchanged.*

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Regra de CSS da lib (media query) | `still-void/src/css/style.css` | CSS text contract + browser measurement, one case per viewport | yes - text contract C1 C2 C5 (+ supporting tests for tabs, pointer-fine and literal colors); browser at 390 C8 and at 1440 fine pointer C34 (F-b killed); tabs start-alignment C25 |
| Componente da lib com prop (carried) | `still-void/src/components/ui/table.tsx` | jsdom, prop present and absent | yes - C3, C4 |
| Página/arranjo do app | `src/app/**` pages, `staff-layout-client.tsx` | Playwright box measurement per page and viewport | yes - C26 and C23 now measure against a reference independent of the column; F2 killed at 390 and 1440 |
| `PageHeader` (carried) | `src/components/page-header.tsx` | component test with and without actions | yes |

Swept `existing` (authorization): carried from `521a386`. The fix diff `14af395..ba9089d` touches
no `src/` file.

## Faults injected

*Verified at app `ba9089d`.*

Isolation:

- I ran `git worktree add <scratchpad>/wt HEAD` and symlinked `node_modules` into it.
- The dev server ran from the scratch worktree. To make that work I added `turbopack: { root: "/" }` to the scratch copy of `next.config.ts`; Turbopack refuses a `node_modules` symlink that points outside its root. I did not touch the real `node_modules`.
- The proof assertions were left unmodified. Each fault was reverted before the next one.

Clean-up:

- Baseline porcelain before: app ` M AGENTS.md` (the `next dev` block the brief says to expect), lib empty.
- After `git worktree remove --force`, both are byte-identical to the baseline (`diff` empty). `git worktree list` shows only the main tree.
- No dev server is left running.

| Mutation | Location | Killed |
| --- | --- | --- |
| F2 (round-2 survivor): remove `w-full` and `flex-1` from the staff wrapper, in the source | `src/app/(staff)/staff-layout-client.tsx:62` | yes - `painéis na largura do conteúdo (390)` failed at `:614` (`/triagem 390`, 87.5 > 2); `(1440)` failed (`/pacientes/[id] 1440`, 310.8 > 2); `agenda: filtro em largura total` failed at `:560` (7.08 > 2). As a control, C34 stayed green under the same fault |
| F-b: `page.addStyleTag(".sv-btn { min-height: 44px !important }")` in C34, the touch rule leaking to desktop (scratch spec copy) | C34 surface, `/pacientes` at 1440 | yes - `desktop com mouse mantém a altura da lib` failed at `:759` (expected 40, received 44) |
| F-c: empty messages changed ("Nenhum profissional encontrado." / "Sem sessões.") | `src/app/(staff)/repasses/payout-tables.tsx:242`, `:31` | yes - both `payout-tables-empty.test.tsx` tests failed |
| F-d: raw palette class `text-red-500` added to the staff wrapper | `src/app/(staff)/staff-layout-client.tsx:62` | yes - `todo utilitário de cor do app usa um nome da ponte @theme` failed, listing `red-500 (app/(staff)/staff-layout-client.tsx)` |
| F-e: `overflow-x: visible !important` on `.overflow-x-auto, .sv-table-container`, only on `/documentos/repasse/*` (new C32 member) | repasse document page | yes - `documentos sem scroll lateral` failed at `:734` for `/documentos/repasse/po-layout` (`unwrapped` 1) |

## Gate

*Verified at app `ba9089d` / lib `e361dfb`.*

- app `npm run typecheck`: exit 0
- app `npm run lint` (Biome): exit 0, 641 files, 1 info
- app `npm run check:sv`: exit 0 ("adoção do @still-void/ui v2 completa")
- app `npm run check:docs`: exit 0 (0 warnings)
- app Playwright (the two feature specs): 110 passed, 0 failed
- app Vitest (the check proofs): 20 passed, 0 failed
- lib `npx vitest run`: 77 files, 1516 passed, 0 failed
- lib `npm run typecheck`: exit 0
- app `npm run test:coverage`: not re-run this round (outside the brief's gate list)

## Ranked gaps

1. **Door 3 unmet: open question 1, escalate to the user.** `package.json:29` reads
   `"@still-void/ui": "^3.3.1"`. The plan's one-way door 3 and Landing step 4 require `^3.4.0`,
   and the plan says the app PR closes only after publication. The `checks.md` Coverage row
   "Landing doors" says C15 (`check:sv`) and C8 cover door 3. Neither reads the range, so that row
   overstates its coverage. To close it: the user approves publishing `@still-void/ui@3.4.0`, the
   app bumps to `^3.4.0` and reinstalls from the registry, and then a check or gate asserts the
   range.
2. **C32 does not require the document to render (low weight).** `e2e/layout-mobile-first.spec.ts:727-734`
   counts unwrapped tables, but nothing asserts that each document rendered at least one table. A
   page that errored (for example a changed repasse API shape that breaks the `page.route` mock)
   would pass trivially. At HEAD the probe confirmed that the repasse page renders 1 table, and F-e
   was killed, so the gap is only a future risk.
3. **`checks.md` header count is stale (cosmetic).** The line says "32 checks em 4 fatias", but the
   file now defines C1-C34.
4. **Precision note, C33 "at both viewports".** 12 of 13 empty states are proven in jsdom only
   (pacientes is proven in the browser by C18). The empty branches render an `EmptyState` in place
   of the `<table>`, so the viewport-scoped `.sv-table--stack` rules cannot reach them. I accept
   that reasoning, and it does not fail the check.

Round-2 gaps now closed:

- C26 surviving mutant (F2 killed, including C23).
- C33 repasses proven on the wrong table (statements and items tables asserted; F-c killed).
- Both unmet Test policy rows (C34 with F-b killed; arrangement with F2 killed).
- AC 30 repasse level gap (browser, F-e killed).
- The C15 utility-level precision gap (scan with F-d killed, plus a diff showing no existing color utility changed).
