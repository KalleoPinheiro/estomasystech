# Layout mobile-first verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: app `46026ba..14af395` (`claude/layout-mobile-first`) · lib `19ea056..e361dfb` (`claude/sharp-gauss-meunxe`). Fix diff for this round: app `521a386..14af395`, lib `3c15474..e361dfb`
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Summary: I re-ran every proof at the new heads and all of them are green: lib 6/6 named (9 with the
supporting tab and color tests), app Vitest 17/17 (C9, C15, C30, the C32 repasse test, and the 13
C33 tests), app Playwright 109/109. The code fix works. The staff content column now fills the
available width (358 of 358 at 390, 1152 of 1152 at 1440, on all four screens measured). The active
tab is visible on first load. C13, C24, C25 and C32 now fail under their faults.

The verdict is still FAIL, for three reasons:

1. **C26 still proves nothing about the round-1 defect.** Its new reference, the usable width of
   `main`, shrinks along with the staff wrapper. F2 put the round-1 layout back exactly (triagem
   271px at 390 and at 1440, prontuário 704 of 1152). C26 passed at both viewports anyway.
2. **The C33 proof for "repasses" asserts a different table.** It checks the payout history table.
   C16 and C17 measure the clinic statements table, and that table's empty state has no proof.
3. **Two Test policy rows are still unmet.** The touch rule has no browser case at 1440. The
   arrangement measurement for the content column cannot fail.

## Binding sources

*Verified at app `14af395` for the screens the fix touched: staff shell, prontuário tab strip,
agenda desktop. Other screens carried from `521a386`.*

The plan marks no design file as binding. As in round 1, the authority is the plan's `Problem`, its
confirmed `Assumptions` and its `Criteria`. The evidence is live box measurements at HEAD from a
scratch spec that ran in a discarded worktree against the real dev server.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| plan `Problem` + outcome ("cards encolhem até o conteúdo") | yes - plan.md; re-measured at `14af395` | none | No proof can catch a regression of the staff content column. The fix holds: at `14af395`, wrapper = viewport and `main` usable width = 358 (390) / 1152 (1440) on `/triagem`, `/pacientes`, `/pacientes/[id]` and `/`. But C26 and C23 both measure against `main`, which shrinks with the wrapper. Under F2 (the wrapper back to content width) C26 stayed green while triagem was 271/358 and 271/1152 again (see Faults). |
| plan AC 23 ("keep the active tab fully visible") | yes - plan.md; C25 at `14af395` | none | - (first load now asserted at `e2e/layout-mobile-first.spec.ts:534-535`; F3 killed) |
| user answer: agenda no celular = mês compacto + lista do dia | carried from `521a386` | none | - (the compact breakpoint is 768px by design; `checks.md` Handoff explains it. It does not contradict AC 17-21, which fix only 390x844) |
| user answer: melhorias como minor da lib, app sobe e remove `sv-gap` | yes - `package.json:29` re-read | none | door 3: `package.json:29` still reads `"@still-void/ui": "^3.3.1"` and the installed package is a local 3.3.1-versioned tarball of lib HEAD. Expected under open question 1 (`blocks go-live`), but still open |
| before screenshots (23 screens × 2) | carried from `521a386` | none | see the per-screen table |

### Per-screen arrangement enumeration (authority: plan criteria)

| Screen | What the plan decides about arrangement | Check | Observed at HEAD |
| --- | --- | --- | --- |
| all 23 | no horizontal page scroll, 390 and 1440 | C7 | ok (carried; proof re-run green) |
| 14 staff | one `h1` in `PageHeader`; actions below the title under 40rem | C10, C11 | ok |
| staff content column | fills the available width | C26 (and C23) against `main` usable width | **code ok, proof non-discriminating**: 358/358 and 1152/1152 measured, but F2 survived |
| Dashboard / Faturamento / Relatórios | KPI in 2 columns under 40rem | C13 | ok; F1 (4 columns) now killed on all 3 |
| Agenda | compact grid, filter, day list; chips inside the day cell on desktop | C19-C24 | ok; C24 now places the chip inside `[data-calendar-day]` (F4 killed) |
| Prontuário | tab strip scrolls inside itself; active tab visible on load and after selection | C25 | ok; F3 killed |
| Triagem | empty state fills the column | C26 | fills (358 / 1152); same proof weakness as the content column |
| Documentos | tables in a horizontal scroller; page without lateral scroll | C32 | 5 in the browser; repasse by jsdom structure only |

## Checks

*Verified at app `14af395` / lib `e361dfb`. Every proof was re-run in full. Citations were
refreshed for `e2e/layout-mobile-first.spec.ts` and `still-void/tests/layout-css-contract.test.ts`.*

Proof runs:

- lib: `npx vitest run tests/layout-css-contract.test.ts tests/ui-table.test.tsx tests/table-css-contract.test.ts tests/release-contract.test.ts -t "<6 check names>|tab triggers reach 44px|no literal color inside|pointer-fine desktop keeps"`. 9 passed (the 6 check tests plus 3 supporting tests), each listed by name. `git diff --exit-code origin/main -- src/tokens/colors.ts src/css/theme.css` exit 0 (origin/main = `19ea056`).
- app Vitest: one call over 13 files with a 17-name `-t` alternation: 17 passed, each listed by name. That is C9, C15, C30, `tabela do comprovante dentro de contêiner com rolagem` (C32) and all 13 C33 names.
- app Playwright: `npx playwright test -c playwright.shots.config.ts e2e/layout-mobile-first.spec.ts e2e/layout-tabelas.spec.ts --retries=0 --reporter=list`. **109 passed, 0 failed, 3.6 min**, exit 0, each test listed.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `.sv-layout` `minmax(0, 1fr)` | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:85` - `expect(declIn(body, 'grid-template-columns')).toBe('minmax(0, 1fr)')` | PASS |
| C2 | 44px `min-height` on `.sv-btn`/`.sv-field` under touch media | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:95-98` - `… toBe(TOUCH_TARGET)` for both selectors | PASS |
| C3 | `stack` → `sv-table--stack`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:283` `toHaveClass('sv-table','sv-table--stack')`; `:285` `not.toHaveClass('sv-table--stack')` | PASS |
| C4 | `label` → `data-label`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:303` `toHaveAttribute('data-label','Nome')`; `:314` `not.toHaveAttribute('data-label')` | PASS |
| C5 | stack rules only under `(width < 40rem)` | lib vitest, pass | `still-void/tests/table-css-contract.test.ts:209` `expect(outside).not.toMatch(/\.sv-table--stack/)`; `:219-220`; `:224` `toMatch(/content:\s*attr\(data-label\)/)` | PASS |
| C6 | minor changeset; no color value changed | lib vitest + git diff, pass | `still-void/tests/release-contract.test.ts:17` - `toMatch(/^---\s*\n"@still-void\/ui":\s*minor\s*\n---/)`; git diff exit 0. The new `layout-css-contract.test.ts:152-157` (`not.toMatch(/#[0-9a-fA-F]{3,8}\b\|oklch\(\|rgba?\(\|hsla?\(/)`) narrows the round-1 precision gap on the new media blocks. `git diff 19ea056..e361dfb -- src/css/style.css` has no `--sv-*` definition line | PASS |
| C7 | no page scroll, 23 × 2 | e2e, 46 pass | `e2e/layout-mobile-first.spec.ts:237` - `toBeLessThanOrEqual(viewport.width + 2)` | PASS |
| C8 | ≥44×44 controls in `main` | e2e, 23 pass | `e2e/layout-mobile-first.spec.ts:248` - `expect(await tooSmallControls(target), …).toEqual([])` | PASS |
| C9 | one `h1` + actions group | vitest, pass | `tests/components/page-header.test.tsx:21` `toHaveLength(1)`; `:27-30` actions contain the button, not the `h1` | PASS |
| C10 | one `h1` inside `[data-page-header]`, 14 pages | e2e, 14 pass | `e2e/layout-mobile-first.spec.ts:259-260` - `toHaveCount(1)` on `h1` and on `[data-page-header] h1` | PASS |
| C11 | actions below the title, right ≤ 390 | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:281-282` - `actions!.y >= title!.y + title!.height`; `actions!.x + width <= MOBILE.width` | PASS |
| C12 | sidebar e-mail on one line, ellipsis, `title` | e2e, pass | `e2e/layout-mobile-first.spec.ts:302-304` - `height <= lineHeight * 1.5`; `overflow === "ellipsis"`; `title === text` | PASS |
| C13 | KPI 2 columns: each card = half the grid ±2, first two share the row | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:327` - `expect(Math.abs(width - layout.half)).toBeLessThanOrEqual(2)` for every card; `:329` - `expect(layout.tops[0]).toBe(layout.tops[1])`. F1 killed on all 3 (card 92.5px off half) | PASS |
| C14 | back link icon/text centers ≤ 4px | e2e, pass | `e2e/layout-mobile-first.spec.ts:349` - `Math.abs(centers.icon - centers.text) <= 4` | PASS |
| C15 | `@theme` bridge identical to `46026ba`; `check:sv` green | vitest pass; `check:sv` exit 0 | `tests/app/color-bridge.test.ts:58` - `expect(colorBridge()).toEqual(BASELINE)`. Precision gap carried: no proof of utility-level token identity (AC 13) | PASS |
| C16 | 13 tables stacked at 375 | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:233` `toHaveClass(/sv-table--stack/)`; `:257-259` `theadHeight <= 1`, `badLabels` `[]`, `offscreen` 0 | PASS |
| C17 | 13 tables at 1440 | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:274-275` - `theadHeight > 0`; `tallRows === 0` | PASS |
| C18 | Pacientes empty at both viewports | e2e, pass | `e2e/layout-tabelas.spec.ts:285-286` - `getByText("Nenhum paciente encontrado")` visible; `main table` count 0 | PASS |
| C19 | 7 day columns ≥44 inside 390 | e2e, pass | `e2e/layout-mobile-first.spec.ts:430-435` - `toHaveLength(7)`, 7 distinct lefts, `box.right <= MOBILE.width`, `w,h >= MIN_TOUCH_PX` | PASS |
| C20 | dot marker, no chip in cell | e2e, pass | `e2e/layout-mobile-first.spec.ts:446` `data-has-appointments="true"`; `:448` `day.locator("button")` count 0 | PASS |
| C21 | today selected on load; tapped day lists the appointment below the grid | e2e, pass | `e2e/layout-mobile-first.spec.ts:459-462` - `[data-mobile-month] [data-day="${today}"]` `toHaveAttribute("aria-pressed","true")`, now unconditional (round-1 precision gap closed); `:477` `listTop >= gridBottom` | PASS |
| C22 | empty day message | e2e, pass | `e2e/layout-mobile-first.spec.ts:489` - `getByText("Nenhuma consulta neste dia.")` visible | PASS |
| C23 | filter below month nav, content-column width ±2 | e2e, pass | `e2e/layout-mobile-first.spec.ts:500` - `abs(filter.width - contentWidth(page)) <= 2`. Precision note: the same shrinking reference as C26 (`main` usable width) | PASS |
| C24 | desktop chip inside its day cell | e2e, pass | `e2e/layout-mobile-first.spec.ts:515` - `expect(page.locator('[data-calendar-day="${dayKey}"]').locator(chip)).toHaveCount(1)`. F4 killed | PASS |
| C25 | tablist scrolls inside; active tab visible on load; Pacotes visible after selection | e2e, pass | `e2e/layout-mobile-first.spec.ts:530` `scroll > client`; `:534-535` Anamnese `x >= 0`, `right <= 390`; `:538-539` Pacotes. F3 killed (Anamnese x = -174.9) | PASS |
| C26 | Anamnese panel and Triagem empty state = `main` usable width ±2, both viewports | e2e, 2 pass | `e2e/layout-mobile-first.spec.ts:553-554` - `abs(box.width - contentWidth(page)) <= 2`. **F2 survived**: with the staff wrapper shrunk to content (round-1 layout), `main` usable width shrank to 271 (triagem 390 and 1440) and 704 (prontuário 1440), and the panel shrank with it. The reference is still relative to the thing that shrinks, so the proof cannot fail on the defect the plan names | FAIL - surviving mutant; the proof does not discriminate AC 24's intent |
| C27 | Retornos not clipped, actions below | e2e, pass | `e2e/layout-mobile-first.spec.ts:581-582` - `clipped === false`; `below === true` | PASS |
| C28 | public cards ≥16px from edges | e2e, pass | `e2e/layout-mobile-first.spec.ts:594-595` | PASS |
| C29 | Confirmar and date disjoint | e2e, pass | `e2e/layout-mobile-first.spec.ts:623` - `expect(disjoint).toBe(true)` | PASS |
| C30 | one `svg` in the emergency notice | vitest, pass | `tests/components/portal-layout.test.tsx:71` - `querySelectorAll('svg')).toHaveLength(1)` | PASS |
| C31 | greeting headline at 390, display at 1440 | e2e, pass | `e2e/layout-mobile-first.spec.ts:647` - `expect(sizes.actual).toBe(sizes.expected)` | PASS |
| C32 | 5 documents in the browser: tables in a scroller, no page scroll; repasse table inside `.sv-table-container` | e2e pass + vitest pass | `e2e/layout-mobile-first.spec.ts:665` `scrollWidth <= 392`; `:673` `expect(unwrapped, url).toBe(0)` (now includes `receiptUrl`, F5 killed on the recibo); `tests/pages/documento-repasse.test.tsx:219` - `expect(table.closest('.sv-table-container')).not.toBeNull()`. Level note: repasse's "page without horizontal scroll" half of AC 30 is not measured in a browser (see Coverage) | PASS |
| C33 | each of the 13 tables shows its existing empty message | vitest, 13 pass | pacientes `staff-pacientes-list.test.tsx:108` ("Nenhum paciente cadastrado."); parceiros `staff-operations.test.tsx:1883`; profissionais `:2535-2537`; auditoria `:101`; contas `:952`; procedimentos `staff-procedimentos.test.tsx:150-152`; materiais `staff-materiais.test.tsx:189`; faturamento `staff-faturamento.test.tsx:177`; relatórios receita `staff-relatorios.test.tsx:166`; relatórios produção `:244`; feriados `schedule-availability-ui.test.tsx:115`; prontuário `staff-paciente-detail.test.tsx:1254` ("Nenhuma avaliação registrada.", reached through the empty branch after a fetch error); **repasses `staff-repasses.test.tsx:181` asserts "Nenhum repasse registrado ainda.", the empty state of `PayoutHistoryTable`**. The repasses table that C16/C17 measure (header "Regra") is `ClinicStatementsTable`, and its empty state `"Nenhum profissional cadastrado."` (`src/app/(staff)/repasses/payout-tables.tsx:242`) has no assertion anywhere (`rg` finds only the longer profissionais-page string). All 15 messages are byte-identical at `46026ba` and HEAD (`git grep -c -F`) | FAIL - repasses member proven on a different table; the measured table's empty state is unasserted |

## Coverage

*Recomputed at `14af395` for the rows the fix touched: KPI groups, table empty states, documents,
AC 23/24 panels, staff content column. The rest are carried from `521a386` and marked as such.*

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| page set × viewport (46) - carried from `521a386` | plan Observable | C7, 46 tests (re-run green) | - |
| page set, touch (23) - carried | plan Observable | C8, 23 tests | - |
| staff pages with `PageHeader` (14) - carried | plan Observable | C10, 14 tests | - |
| KPI groups (3) × 2 columns - verified at `14af395` | AC 11 | Dashboard, Faturamento, Relatórios: C13 `:327` per card; F1 killed on all 3 | - |
| table set, stacked + desktop (13) - carried | plan Observable | C16 ×13, C17 ×13 | - |
| table set, empty state (13) - verified at `14af395` | AC 16 + plan Observable ("repasses (tabelas de repasse)") | 12 members asserted by C33 (+ C18 in the browser for pacientes). Repasses: the history table only (`staff-repasses.test.tsx:181`) | repasses: `ClinicStatementsTable` empty ("Nenhum profissional cadastrado.", `payout-tables.tsx:242`), the table C16/C17 measure; also `PayoutItemsTable` ("Nenhuma sessão.", `payout-tables.tsx:31`) |
| document pages (6) - verified at `14af395` | AC 30 + plan Observable | atestado, consentimento, relatório, plano de cuidados, recibo: C32 in the browser (container `overflowX === auto` + page scroll) · repasse: C32 jsdom structure | repasse: "page itself without horizontal scroll" at 390x844 has no browser proof (level gap; the checks give the seeding constraint as the reason) |
| AC 23 active-tab visibility (2 states) - verified at `14af395` | AC 23 | first load C25 `:534-535` (F3 killed) · after selection C25 `:538-539` | - |
| AC 24 panels (2 × 2 viewports) - verified at `14af395` | AC 24 + plan Problem | prontuário and triagem at 390 and 1440: C26 `:554` against `main` usable width. Measured values meet the intent: 358 = 358 and 1152 = 1152 | all 4: the reference shrinks with the column, so no member is discriminated from the round-1 defect (F2 survived with triagem 271/358 and 271/1152, prontuário 704/1152) |
| staff content column = available width (4 screens × 2) - verified at `14af395` | plan Problem ("cards encolhem até o conteúdo") | no check measures `main` against viewport − sidebar − padding | all 8 (code measured correct; no proof holds it) |
| agenda mobile states (4) - verified at `14af395` (C21 touched) | AC 18-20 | today selected C21 (now unconditional) · day with appointment C21 · empty day C22 · dot C20 | - |
| agenda viewports (2) - verified at `14af395` (C24 touched) | AC 17, 22 | C19 · C24 (chip inside the cell) | - |
| `Table stack`, `TableCell label`, touch rule selectors - carried | lib API | C3 C5 · C4 · C2 | - |
| Landing doors (4) - verified at `14af395` | plan Landing | 1: C3 C4 C5 · 2: C2 · 4: C9 C10 | door 3: `package.json:29` `^3.3.1`, not `^3.4.0` (open question 1, `blocks go-live`) |
| AC 13 color utilities - carried | AC 13 | bridge C15; utilities checked by manual scan only | utility → token identity (precision gap) |

## Test policy rows

*Re-judged at `14af395`: the two unmet rows, plus the arrangement row whose files the fix touched.
The component-prop and `PageHeader` rows are carried from `521a386` because their files are unchanged.*

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Regra de CSS da lib (media query) | `still-void/src/css/style.css` | CSS text contract + browser measurement, one case per viewport | no - the fix added text assertions (`justify-content` `:114`, no literal color `:152-157`), but the touch rule still has a browser case only at 390 (C8). No browser case at 1440 or pointer-fine shows the rule stays off. The `.sv-tabs__list` start-alignment has its browser case at 390 (C25) |
| Componente da lib com prop (carried) | `still-void/src/components/ui/table.tsx` | jsdom, prop present and absent | yes - C3, C4 |
| Página/arranjo do app | `src/app/**` pages, `staff-layout-client.tsx` | Playwright box measurement per page and viewport | no - C26 and C23 measure against `main` usable width, which shrinks with the column the fix changed. F2 survived, so the arrangement "panel fills the content column" is still not held by a proof that can fail |
| `PageHeader` (carried) | `src/components/page-header.tsx` | component test with and without actions | yes |

Swept `existing` (authorization), carried from `521a386`: the fix touched neither `src/proxy.ts` nor `src/lib/auth/request-session.ts`.

## Faults injected

*Verified at app `14af395`.* Isolation: `git worktree add <scratchpad>/wt-app HEAD`, with
`node_modules` symlinked. The only edits were in the scratch copy: a `test.beforeEach` that runs
`page.addInitScript(process.env.FAULT)` in the spec, and `webServer.cwd` in the config. The
assertions were unmodified. The dev server ran from the real tree. Baseline porcelain: app
` M AGENTS.md` (the `next dev` agent-rules block the brief says to expect), lib empty. After
removing the worktree, both are byte-identical to the baseline. `git worktree list` shows only the
main trees.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 KPI grid `repeat(4, minmax(0,1fr))` at 390 (the round-1 surviving mutant, run against the new C13) | `[data-kpi-grid]` (`src/app/(staff)/page.tsx` et al.) | yes - `KPIs em 2 colunas` failed on dashboard, faturamento and relatórios (`e2e/layout-mobile-first.spec.ts:327`, 92.5 > 2) |
| F2 staff wrapper back to content width (`flex: 0 1 auto; width: auto`, which is the effect of removing `w-full flex-1`) | `.sv-app-shell > div`, `src/app/(staff)/staff-layout-client.tsx:62` | **no** - `painéis na largura do conteúdo (390)` and `(1440)` both passed. A separate measurement under the same fault confirmed it took effect: `/triagem` wrapper 303 / `main` usable 271 at 390, wrapper 559 / `main` 271 at 1440, `/pacientes/[id]` 704 of the 1152 available |
| F3 tab strip `justify-content: center` (reverts lib `e361dfb`) | `.sv-tabs__list`, `still-void/src/css/style.css:1593` | yes - `prontuário: abas rolam dentro de si` failed at `:534` (Anamnese x = -174.9) |
| F4 appointment chip moved out of its day cell (DOM script) | `[data-calendar-day] button`, `src/app/(staff)/agenda/calendar-grid.tsx:138` | yes - `agenda: chips no desktop` failed at `:515` (count 0, expected 1) after `:514` saw the chip visible |
| F5 `overflow-x: visible` on `.overflow-x-auto, .sv-table-container`, only on `/documentos/recibo/*` | recibo document page | yes - `documentos sem scroll lateral` failed at `:673` for the recibo URL (`unwrapped` 1) |

## Gate

*Verified at app `14af395` / lib `e361dfb`.*

- app `npm run typecheck`: exit 0
- app `npm run lint` (Biome): exit 0, 640 files, 1 info
- app `npm run check:sv`: exit 0 ("adoção do @still-void/ui v2 completa")
- app `npm run check:docs`: exit 0 (0 warnings)
- app Playwright (the two feature specs): 109 passed, 0 failed
- app Vitest (the check proofs): 17 passed, 0 failed
- lib `npx vitest run`: 77 files, 1516 passed, 0 failed
- lib `npm run typecheck`: exit 0
- app `npm run test:coverage`: not re-run this round

## Ranked gaps

1. **C26 surviving mutant (F2).** The proof's reference (`main` usable width, from the
   `contentWidth` helper at `e2e/layout-mobile-first.spec.ts:189-196`) shrinks together with the
   staff wrapper. Reverting the column fix leaves C26 green while the plan's first-listed defect is
   back (triagem 271 of 358 / 1152). The code is correct at HEAD (358/358, 1152/1152 on
   `/triagem`, `/pacientes`, `/pacientes/[id]`, `/`), but no proof holds it. An independent
   reference would close this, e.g. `main` width = viewport − sidebar width, or the wrapper width =
   viewport. C23 (`:500`) shares the same reference. Location: `e2e/layout-mobile-first.spec.ts:553-554`;
   subject `src/app/(staff)/staff-layout-client.tsx:62`.
2. **C33 repasses member proven on the wrong table.** `tests/pages/staff-repasses.test.tsx:181`
   asserts the history table's empty state. The table-set repasses table (`ClinicStatementsTable`,
   header "Regra", measured by C16/C17) has an empty branch at
   `src/app/(staff)/repasses/payout-tables.tsx:241-242` that no test asserts. `PayoutItemsTable`'s
   empty branch (`:31`) has no assertion either.
3. **Test policy, arrangement row unmet.** Same root cause as gap 1.
4. **Test policy, lib CSS row unmet.** The touch rule has no browser case at 1440 or pointer-fine.
   Only the text contract `still-void/tests/layout-css-contract.test.ts:128-132` covers it.
5. **AC 30 repasse level gap.** The page-level "no horizontal scroll" is not measured in a
   browser. Only the container structure is proven, in jsdom (`tests/pages/documento-repasse.test.tsx:219`).
6. **Door 3.** `package.json:29` still reads `^3.3.1`. This is expected until `@still-void/ui@3.4.0`
   is published (open question 1, `blocks go-live`).
7. **Precision gaps, lower weight.** C15/AC 13 has no utility-level token-identity proof. C33
   proves AC 16 "at both viewports" in jsdom, except pacientes, which C18 covers in the browser.

Round-1 gaps now closed: the content column shrinking (code fixed; the proof gap stays, see 1),
the active tab off-screen on load (C25, F3 killed), the C13 surviving mutant (F1 killed), AC 16 on
1 of 13 (now 12 of 13 fully), AC 30 recibo (C32, F5 killed), the conditional C21 assertion, and
C24's chip placement (F4 killed).
