# Layout mobile-first verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: app `46026ba..4fba7e6` (`claude/layout-mobile-first`) · lib `19ea056..75a66e0` (`origin/main`, the commit the published `@still-void/ui@3.4.0` was built from: `npm view @still-void/ui@3.4.0 gitHead` = `75a66e03…`). Fix diff for this round: app `ba9089d..4fba7e6` (round 3 verified at `ba9089d`; its report was committed in `29d517e` together with test changes it never saw, so those are in scope here too) · lib `e361dfb..75a66e0`
**Round**: 4 - scoped
**Verifier**: independent sub-agent (author != verifier)

Summary: every proof was re-run at app `4fba7e6` and lib `75a66e0`, and all passed. Lib: 9 of 9 named
tests. App Vitest: 21 of 21 named tests, plus the whole `staff-faturamento.test.tsx` file (32 of 32).
App Playwright: **110 of 110, with `--retries=0`**. Round 3 failed on door 3 only, and door 3 is now met:

- `package.json:29` declares `"@still-void/ui": "^3.4.0"`.
- The lockfile resolves `3.4.0` from `registry.npmjs.org`. Its integrity matches `npm view @still-void/ui@3.4.0 dist.integrity` byte for byte.
- `node_modules/@still-void/ui/package.json` reports `3.4.0`.
- `npm view @still-void/ui version` returns `3.4.0` (`latest`).
- The new check C35 proves the range and the installed version. I made it fail both ways.

I injected six faults on the surfaces this round touched, and all six were caught:

- the stacked `AmountCell` with mixed children;
- a wider patient column;
- a payment line allowed to wrap;
- the new document-render assertion;
- C35 twice.

Two notes on the brief's premises:

- The brief said the lib was unchanged since round 3. That is not so. Lib `dc74e89` ("keep wrapped stacked labels in flow") landed after round 3's `e361dfb`. It is on `origin/main`, which is what shipped as 3.4.0. So C1–C6 were **re-run at `75a66e0`**, not carried forward.
- The 205-test full E2E suite is **author-reported only**. I ran the two feature specs plus `e2e/export-lgpd.spec.ts`, which this diff touches (2 of 2 passed).

## Binding sources

*Verified at `4fba7e6` for the only interface the fix touched: the Faturamento invoice table, a member of the table set. It is also verified for door 3. Everything else is carried from `ba9089d`: those screens and the plan are unchanged in `ba9089d..4fba7e6`.*

The plan marks no design file as binding. The authority is the plan's `Problem`, its confirmed
`Assumptions` and its `Criteria`, as in every earlier round.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| plan `Problem` + outcome (cards shrink to their content) - carried from `ba9089d` | yes | none | - |
| plan AC 14/15 (table set stacked on the phone, one row per record on the desktop) - Faturamento member, verified at `4fba7e6` | yes - plan.md, `faturamento/page.tsx:55-210`; the seed now has a discount, two payments and a long name. At 375 every labelled cell keeps its content in the value column; at 1440 each row is < 80px and the table fits its container (F1, F2 and F3 were all caught) | none | - |
| plan AC 23 (active tab visible) - carried from `14af395` | yes | none | - |
| user answer: agenda on mobile = compact month + day list - carried from `521a386` | yes | none | - |
| user answer: lib improvements ship as a lib minor and the app bumps to it (door 3) - verified at `4fba7e6` | yes - `package.json:29`, `package-lock.json:3709-3712`, `node_modules/@still-void/ui/package.json:3`, npm registry: `^3.4.0` declared, 3.4.0 installed from the registry, proven by C35 | none | - |
| before screenshots (23 screens × 2) - carried from `521a386` | yes | none | - |

### Per-screen arrangement enumeration (authority: plan criteria)

*The Faturamento and table-set rows were verified at `4fba7e6`. The rest are carried from `ba9089d`, and their proofs were re-run green at `4fba7e6`.*

| Screen | What the plan decides about arrangement | Check | Observed at HEAD |
| --- | --- | --- | --- |
| all 23 | no horizontal page scroll at 390 and 1440 | C7 | green (23 tests × 2 viewports) |
| 14 staff screens | one `h1` inside `PageHeader`; actions below the title under 40rem | C10, C11 | green |
| staff content column | fills the available width | C26, C23 | green (F2 killed in round 3; `staff-layout-client.tsx` unchanged since) |
| Dashboard / Faturamento / Relatórios | KPIs in 2 columns under 40rem | C13 | green |
| Faturamento invoice table | stacked label/value pairs at 375; one row per record, not wider than its container, at 1440 | C16, C17 | green with the richer seed; F1 (C16), F2 and F3 (C17) killed |
| Agenda | compact grid, filter, day list; chips inside the day cell on desktop | C19-C24 | green |
| Prontuário | tab strip scrolls inside itself; active tab visible | C25 | green |
| Documentos (6) | tables in a horizontal scroller; the page does not scroll sideways; the document actually rendered | C32 | green; F5 killed (the repasse document failed to render and the new assertion at `:727` caught it) |

## Checks

*Verified at app `4fba7e6` and lib `75a66e0`. Every proof was re-run in full at these heads. I
refreshed citations for these files: `e2e/layout-tabelas.spec.ts`, `e2e/layout-mobile-first.spec.ts`
(from `:722` down, +2 lines), `tests/app/still-void-version.test.ts`,
`tests/pages/staff-faturamento.test.tsx`, and the lib tests. The C7–C14 and C19–C31 citations sit in
`e2e/layout-mobile-first.spec.ts` above line 722, which is unchanged, so their line numbers still
hold at HEAD.*

Proof runs:

- **lib** (worktree at `origin/main` `75a66e0`): `npx vitest run tests/layout-css-contract.test.ts tests/ui-table.test.tsx tests/table-css-contract.test.ts tests/release-contract.test.ts -t "<6 check names>|tab triggers reach 44px|no literal color inside|pointer-fine desktop keeps"` gave **9 passed**, each listed by name.
  - `git diff --exit-code 19ea056 -- src/tokens/colors.ts src/css/theme.css` exited 0.
  - The installed tarball's `dist/style.css` carries the `grid-column: 2` stacked-cell rule from `dc74e89`.
- **app Vitest**: one call over 15 files with a 21-name `-t` alternation gave **21 passed, 318 skipped**, each named test listed. That covers C9, C15 (2 tests), C30, the C32 jsdom test, C33 (15 tests) and C35.
  - The full `tests/pages/staff-faturamento.test.tsx` file passed 32 of 32. That includes the edited `:292-295` value-cell test.
- **app Playwright**: `npx playwright test -c playwright.shots.config.ts e2e/layout-mobile-first.spec.ts e2e/layout-tabelas.spec.ts --retries=0 --reporter=list` gave **110 passed, 0 failed, 3.7 min**, exit 0.
  - Hits per name: `sem scroll lateral` 23+1, `alvos de toque` 23, `um h1 por página` 14, `ações abaixo do título` 3, `KPIs em 2 colunas` 3, `empilhada no celular` 13, `tabela no desktop` 13, `painéis na largura` 2.
  - Every other name had exactly 1 hit, including `empilhada no celular: faturamento` (`:258`) and `tabela no desktop: faturamento` (`:301`).
- **touched spec outside the feature**: `e2e/export-lgpd.spec.ts` gave 2 passed.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `.sv-layout` `minmax(0, 1fr)` | lib vitest at `75a66e0`, pass | `still-void/tests/layout-css-contract.test.ts:85` - `expect(declIn(body as string, 'grid-template-columns')).toBe('minmax(0, 1fr)')` | PASS |
| C2 | 44px `min-height` on `.sv-btn`/`.sv-field` under touch media | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:98` - `expect(declIn(body as string, 'min-height')).toBe(TOUCH_TARGET)` for both selectors | PASS |
| C3 | `stack` → `sv-table--stack`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:283` `toHaveClass('sv-table', 'sv-table--stack')`; `:285` `not.toHaveClass('sv-table--stack')` | PASS |
| C4 | `label` → `data-label`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:303` `toHaveAttribute('data-label', 'Nome')`; `:314` `not.toHaveAttribute('data-label')` | PASS |
| C5 | stack rules only under `(width < 40rem)` | lib vitest, pass | `still-void/tests/table-css-contract.test.ts:209` `expect(outside).not.toMatch(/\.sv-table--stack/)`; `:228-230` the labelled cell is `display: grid`, children `grid-column: 2`, label `grid-column: 1` (changed in `dc74e89`; label in flow) | PASS |
| C6 | minor release; no color value changed | lib vitest + git diff, pass | `still-void/tests/release-contract.test.ts:26` - `expect(before.lastIndexOf('### Minor Changes')).toBeGreaterThan(before.lastIndexOf('### Patch Changes'))`. At `75a66e0` the changeset has been consumed into `CHANGELOG.md` `## 3.4.0 / ### Minor Changes`. `git diff 19ea056` on the color files exits 0 | PASS |
| C35 | `package.json` declares `^3.4.0`; the installed version is >= 3.4.0 | vitest, pass | `tests/app/still-void-version.test.ts:27` `expect(range).toBe('^3.4.0')`; `:30` `expect(atLeast(installed, [3, 4, 0])).toBe(true)`. Independently: `package.json:29`, `package-lock.json:3710-3712` (registry `ui-3.4.0.tgz`, integrity equal to the registry's), and `node_modules/@still-void/ui/package.json:3` all read `3.4.0`. F6a and F6b killed | PASS |
| C7 | no page scroll, 23 pages × 2 viewports | e2e, 23 tests pass | `e2e/layout-mobile-first.spec.ts:251` - `toBeLessThanOrEqual(viewport.width + 2)` in a `for (const viewport of [MOBILE, DESKTOP])` loop (`:244`) | PASS |
| C8 | controls in `main` are at least 44×44 | e2e, 23 pass | `e2e/layout-mobile-first.spec.ts:262` - `expect(await tooSmallControls(target), …).toEqual([])` | PASS |
| C9 | one `h1` + an actions group | vitest, pass | `tests/components/page-header.test.tsx:21` `toHaveLength(1)`; `:27-30` the actions contain the button and not the `h1` | PASS |
| C10 | one `h1` inside `[data-page-header]`, 14 pages | e2e, 14 pass | `e2e/layout-mobile-first.spec.ts:273-274` - `toHaveCount(1)` on `h1` and on `[data-page-header] h1` | PASS |
| C11 | actions below the title, right edge ≤ 390 | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:294` `actions!.y >= title!.y + title!.height`; `:295` `actions!.x + width <= MOBILE.width` | PASS |
| C12 | sidebar e-mail on one line, ellipsis, `title` | e2e, pass | `e2e/layout-mobile-first.spec.ts:316-317` - `height <= lineHeight * 1.5`; `overflow === "ellipsis"` | PASS |
| C13 | KPIs in 2 columns | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:341` - `Math.abs(width - layout.half) <= 2` for every card; `:343` `layout.tops[0]` equals `layout.tops[1]` | PASS |
| C14 | back-link icon and text centers ≤ 4px apart | e2e, pass | `e2e/layout-mobile-first.spec.ts:363` - `Math.abs(centers.icon - centers.text) <= 4` | PASS |
| C15 | `@theme` bridge identical to `46026ba`; every color utility uses a bridge name; `check:sv` green | vitest 2 pass; `check:sv` exit 0 | `tests/app/color-bridge.test.ts:58` - `expect(colorBridge()).toEqual(BASELINE)`; `:103` - `expect([...unknown]).toEqual([])` (new scan; F-d killed). Supplementary diff: `46026ba..HEAD` removes no color utility in `src/**/*.tsx`. Net additions are all bridge names (`text-ink-3`, `bg-accent-ink`, `bg-accent-soft`, `text-accent-ink`, `divide-border`, `text-white`, `bg-transparent`), in the new `agenda/mobile-month.tsx` and in reflowed markup | PASS |
| C16 | 13 tables stacked at 375 | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:262` `toHaveClass(/sv-table--stack/)`; `:294-297` `theadHeight <= 1`, `badLabels` `[]`, `offscreen` 0, `overlapped` 0. `overlapped` (`:279-290`) is now a range over all of the cell's content: `left < box.left + 30%`, `bottom > box.bottom + 1`, or a label `::before` that is `position: absolute`. The Faturamento seed (`:117-155`) has a discount, two payments and a long name. F1 killed it | PASS |
| C17 | 13 tables at 1440; one `tr` < 80px per record; the table is not wider than its container | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:314` `theadHeight > 0`; `:315` `expect(report.tallRows).toBe(0)` (rows `>= 80`, `:310-312`); `:316` `expect(report.overflow).toBeLessThanOrEqual(1)`, where `overflow` = table width − `parentElement.clientWidth` (`:308`). F2 (overflow 98.7) and F3 (2 tall rows) killed | PASS |
| C18 | Pacientes empty state at both viewports | e2e, pass | `e2e/layout-tabelas.spec.ts:326-327` - `getByText("Nenhum paciente encontrado")` visible; `main table` count 0 | PASS |
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
| C32 | 6 documents in the browser (repasse via `page.route`): each renders, tables in a scroller, no page scroll; repasse jsdom structure | e2e pass + vitest pass | `e2e/layout-mobile-first.spec.ts:727` `getByRole("button", { name: "Imprimir / salvar PDF" })` `toBeVisible()` (added in `29d517e`; closes round-3 gap 2); `:728` `scrollWidth <= MOBILE.width + 2`; `:736` `expect(unwrapped, url).toBe(0)`, over `mockPayoutReceipt(page)` (`:722`, route at `:466`). F5 killed. jsdom: `tests/pages/documento-repasse.test.tsx:219` `closest('.sv-table-container')` `not.toBeNull()` | PASS |
| C33 | each of the 13 tables shows its existing empty message | vitest, 15 pass | **repasses, now on the measured tables:** `tests/pages/payout-tables-empty.test.tsx:20-23` `getByText('Nenhum profissional cadastrado.')` `toBeInTheDocument()` + `querySelector('table')` `toBeNull()` (`ClinicStatementsTable`, `payout-tables.tsx:242`); `:28-29` `'Nenhuma sessão.'` (`PayoutItemsTable`, `payout-tables.tsx:31`). F-c killed both. The other 12 are carried with their files unchanged: pacientes `staff-pacientes-list.test.tsx:108`; parceiros `staff-operations.test.tsx:1883`; profissionais `:2535-2537`; auditoria `:101`; contas `:952`; procedimentos `staff-procedimentos.test.tsx:150-152`; materiais `staff-materiais.test.tsx:189`; faturamento `staff-faturamento.test.tsx:177`; relatórios receita `staff-relatorios.test.tsx:166`; produção `:244`; feriados `schedule-availability-ui.test.tsx:115`; prontuário `staff-paciente-detail.test.tsx:1254`; history `staff-repasses.test.tsx:180` | PASS |
| C34 | at 1440 with a fine pointer, a default `Button` keeps the `--sv-space-10` height (< 44) | e2e, pass | `e2e/layout-mobile-first.spec.ts:760` `expect(sizes.base).toBeLessThan(44)`; `:761` `expect(sizes.height).toBe(sizes.base)` (F-b killed in round 3; the assertion is unchanged, only shifted by 2 lines) | PASS |

## Coverage

*The table-set rows (Faturamento member) and Landing doors were recomputed at `4fba7e6`, as was the
lib-rule row (lib `dc74e89`). The other rows are carried from `ba9089d` and marked as such. Their
proofs were re-run green at `4fba7e6`.*

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| page set × viewport (46) - carried from `ba9089d` | plan Observable | C7, 23 tests × 2 viewports | - |
| page set, touch (23) - carried | plan Observable | C8, 23 tests | - |
| staff pages with `PageHeader` (14) - carried | plan Observable | C10, 14 tests | - |
| KPI groups (3) - carried | AC 11 | C13 ×3 | - |
| table set, stacked + desktop (13) - verified at `4fba7e6` | plan Observable (AC 14/15) + the `TABLE_SET` loop | C16 ×13, C17 ×13 (all 13 hit by name in the run); C17's new `overflow` bound runs over all 13 | - |
| Faturamento invoice cells that render mixed or multi-line content (4) - verified at `4fba7e6` | `faturamento/page.tsx`: `AmountCell` (struck-through original + net + "falta" balance), `PaymentsCell` (one `li` per payment), actions (Receber / Desconto / Cancelar), long patient name | seeded by `layout-tabelas.spec.ts:117-155` (discount → struck-through amount; two `pay_partial` → 2 payments + balance; long `fullName`; pending → 3 actions). Stacked: C16 `:297` (F1 killed). Desktop: C17 `:315` (F3 killed) and `:316` (F2 killed) | - |
| table set, empty state (13) - carried from `ba9089d` | AC 16 | C33 (+ C18 in the browser for pacientes); `staff-faturamento.test.tsx:177` unchanged by the fix | - |
| document pages (6) - verified at `4fba7e6` | AC 30 | all 6 via C32 `:727` (renders), `:728`, `:736`; repasse jsdom `:219` | - |
| AC 24 panels (2 × 2) and staff content column - carried from `ba9089d` | AC 24 + plan Problem | C26 `:614`, C23 `:560` | - |
| touch rule, selector × context (3) - verified at `4fba7e6` / lib `75a66e0` | AC 2 + checks row | `.sv-btn` and `.sv-field` narrow/touch C2 + C8 · `.sv-btn` desktop fine pointer C34 | - |
| AC 13 color utilities - carried from `ba9089d` (proof re-run) | AC 13 | C15 `:58`, `:103`; `check:sv` exit 0 at `4fba7e6` | - |
| agenda mobile states (4) and viewports (2) - carried | AC 17-22 | C20 C21 C22 · C19 C24 | - |
| `Table stack`, `TableCell label` - verified at lib `75a66e0` | lib API | C3 C5 · C4 | - |
| Landing doors (4) - verified at `4fba7e6` | plan Landing + one-way doors table | 1: C3 C4 C5 · 2: C2 C34 · 3: C35 (`still-void-version.test.ts:27`, `:30`; F6a and F6b killed) · 4: C9 C10 | - |

## Test policy rows

*The two rows that classify files changed in this round were re-judged at `4fba7e6` and lib
`75a66e0`. Those files are `faturamento/page.tsx` and the lib's `style.css`. The other two rows are
carried from `ba9089d` because their files are unchanged.*

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Regra de CSS da lib (media query) | `still-void/src/css/style.css` (changed in `dc74e89`) | CSS text contract + browser measurement, one case per viewport | yes - text contract C1 C2 C5 at `75a66e0` (C5 now asserts the grid label-in-flow rule); in the browser, C16 at 375 measures the stacked geometry (`labelOutOfFlow`, content left and bottom) and C34 covers 1440 with a fine pointer |
| Componente da lib com prop (carried) | `still-void/src/components/ui/table.tsx` | jsdom, prop present and absent | yes - C3, C4 |
| Página/arranjo do app | `src/app/**` pages incl. `faturamento/page.tsx` | Playwright box measurement per page and viewport | yes - Faturamento is measured at 375 (C16), 1440 (C17), 390 and 1440 (C7), and 390 (C8, C11, C13); F1, F2 and F3 were killed on the changed markup |
| `PageHeader` (carried) | `src/components/page-header.tsx` | component test with and without actions | yes |

Swept `existing` (authorization): carried from `521a386`. The only `src/` file in `ba9089d..4fba7e6`
is `faturamento/page.tsx`, and that change is markup and classes only. It touches no route,
guard or fetch.

## Faults injected

*Verified at app `4fba7e6`.*

How the faults were run:

- Baseline porcelain before: empty. I first reverted the `next dev` block in `AGENTS.md`, as the brief says.
- F1, F2, F3 and F5 were applied to the real tree only after the HEAD Playwright run finished. Each was run with the narrowest `-g` filter and reverted with `git checkout -- <file>` before the next. None ran concurrently with the HEAD run.
- F6a and F6b ran in a scratch `git worktree` at HEAD. Its own `node_modules` directory symlinked each real package except `@still-void/ui`, so the real `node_modules` was never touched.
- The proof assertions were left unmodified.

Clean-up:

- After each fault, and at the end, `git status --short` was empty in both repos (after `git checkout -- AGENTS.md`).
- Both scratch worktrees (app and lib) were removed, and `git worktree list` shows only the main trees.
- `node_modules/@still-void/ui/package.json` still reads `3.4.0`.
- No dev server was left running.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1: `AmountCell` wrapper `<span>` → fragment (mixed children: loose text + spans in the stacked cell) | `src/app/(staff)/faturamento/page.tsx:59`, `:71` | yes - `empilhada no celular: faturamento` failed at `layout-tabelas.spec.ts:297` (`overlapped` expected 0, received 1); the desktop test stayed green (control) |
| F2: patient column `sm:min-w-44` → `sm:min-w-72` | `faturamento/page.tsx:135` | yes - `tabela no desktop: faturamento` failed at `:316` (`overflow` expected <= 1, received 98.69); the phone test stayed green (control) |
| F3: payment `li` loses `sm:whitespace-nowrap` (two-payment seed) | `faturamento/page.tsx:91` | yes - `tabela no desktop: faturamento` failed at `:315` (`tallRows` expected 0, received 2) |
| F5: the repasse document fetches `/api/commission-payouts-x/…`, so the page renders an error instead of the document (new C32 render assertion, `29d517e`) | `src/app/documentos/repasse/[payoutId]/page.tsx:133` | yes - `documentos sem scroll lateral` failed at `layout-mobile-first.spec.ts:727` (the `Imprimir / salvar PDF` button was not found for `/documentos/repasse/po-layout`) |
| F6a: `package.json` range `^3.4.0` → `^3.3.1` (scratch worktree) | `package.json:29` | yes - C35 failed at `still-void-version.test.ts:27` (expected `'^3.4.0'`, received `'^3.3.1'`) |
| F6b: the installed `@still-void/ui` reports `3.3.1` (scratch `node_modules` stub) | `node_modules/@still-void/ui/package.json` | yes - C35 failed at `:30` (expected false to be true) |

## Gate

*Verified at app `4fba7e6` / lib `75a66e0`.*

- app `npm run typecheck`: exit 0
- app `npm run lint` (Biome): exit 0, 642 files, 1 info
- app `npm run check:sv`: exit 0 ("adoção do @still-void/ui v2 completa")
- app `npm run check:docs`: exit 0 (0 warnings)
- app Playwright (the two feature specs, `--retries=0`): 110 passed, 0 failed
- app Playwright `e2e/export-lgpd.spec.ts`: 2 passed
- app Vitest (the check proofs): 21 passed; `staff-faturamento.test.tsx`: 32 of 32 passed
- lib Vitest (the check proofs + supporting tests, at `75a66e0`): 9 passed; the four files at `dc74e89`: 71 of 71
- app full E2E suite (205 tests, `--retries=0`): author-reported, not re-run by the Verifier
- app `npm run test:coverage`: not re-run this round (outside the brief's gate list)

## Ranked gaps

None that fail the feature.

1. **Precision note, carried: C33 "at both viewports".** 12 of the 13 empty states are proven in
   jsdom only. The empty branches render an `EmptyState` in place of the `<table>`, so the
   viewport-scoped stack rules cannot reach them. I accept this, as in round 3.
2. **Lib head in the brief was stale (process note).** The lib moved from `e361dfb` to `dc74e89`
   after round 3, and that change is what shipped in 3.4.0. This round re-ran C1–C6 at `75a66e0`
   rather than carrying them.

Round-3 gaps now closed:

- Door 3: C35 added, `^3.4.0` declared and installed from the registry; F6a and F6b killed.
- C32 render assertion: `:727`, F5 killed.
- The stale count in the `checks.md` header now reads "35 checks".
