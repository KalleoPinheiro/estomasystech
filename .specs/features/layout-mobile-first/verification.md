# Layout mobile-first verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: app `46026ba..521a386` (`claude/layout-mobile-first`) · lib `19ea056..3c15474` (`claude/sharp-gauss-meunxe`)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Summary: 32/32 checks have a located assertion and every proof ran green at HEAD (lib 6/6, app
Vitest 3/3, app Playwright 109/109). The verdict is FAIL anyway, for four reasons. (1) The defect the
plan names first, "cards encolhem até o conteúdo", is still there. The staff content column itself
shrinks to its content. C26 compares against a box that shrinks with it, so C26 passes without
proving anything. (2) On first load the active tab of the prontuário sits off-screen, and AC 23
requires it visible. (3) A fault turning the KPI grid into 4 columns survived C13. (4) Sets named
in the plan's own prose have no proof: AC 16 is proven on 1 of 13 tables, AC 30 on 4 of 6
documents, and door 3 is still `^3.3.1`.

## Binding sources

The plan marks no source as binding for the interface. The sources are the user's conversation
(2026-09-23) and the "before" screenshots. No design file or mock exists, so there was nothing to
open for step 1's comparison. The per-screen enumeration below takes the plan's `Problem`,
`Assumptions` (the confirmed ones) and `Criteria` as the authority. The evidence is the
before/after screenshots
(`scratchpad/shots/{before,after}/*.png`, captured at 04:37, before HEAD `521a386` at 04:37:50)
plus live box measurements taken at HEAD by an ad-hoc scratch spec. That spec ran against the real
dev server, and nothing was written into either tree.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| plan `Problem` + outcome ("cards encolhem até o conteúdo"; "no desktop, as telas ganham cabeçalho e espaçamento consistentes") | yes - plan.md; after screenshots triagem/pacientes/prontuário/dashboard | none | staff content column width vs the available width: no check measures it, and it shrinks to content. Measured at HEAD, content column = `main` inner width: `/triagem` 271px of 358 (390) and 271 of 1152 (1440); `/pacientes` 273/358 and 935/1152; `/pacientes/[id]` 704/1152; `/` 741/1152. The triagem numbers repeat the defect the plan quotes ("270 de 340px"). Likely cause: `src/app/(staff)/staff-layout-client.tsx:62` `<div className="flex min-h-screen min-w-0">` is a flex item of `.sv-app-shell` (`display:flex`, lib `style.css:1764`) with no `flex-1`/`w-full`, so it takes its max-content width. It is the same at `46026ba`. |
| plan AC 23 ("keep the active tab fully visible") | yes - plan.md; after screenshot `staff-paciente-detalhe--mobile.png` | none | active tab on first load: measured at 390x844, `[aria-selected=true]` "Anamnese" spans x = -153..-54 (off-screen left). The screenshot shows the strip starting at "feridas (1)". C25 only asserts the "Pacotes" tab after it is clicked. |
| user answer: agenda no celular = mês compacto + lista do dia | yes - plan Assumptions (confirmed) | none | - (C19-C23; screenshot `staff-agenda--mobile.png` matches) |
| user answer: melhorias como minor da lib, app sobe e remove `sv-gap` | yes - plan Assumptions (confirmed) | none | door 3 `^3.4.0` not met (package.json:29 `^3.3.1`). This is expected under open question 1 (`blocks go-live`), but no proof holds it. |
| before screenshots (23 screens × 2) | yes - viewed dashboard, agenda, pacientes, triagem, prontuário, faturamento, portal paciente (after) | none | see per-screen table |

### Per-screen arrangement enumeration (authority: plan criteria)

| Screen | What the plan decides about arrangement | Check | Observed at HEAD |
| --- | --- | --- | --- |
| all 23 | no horizontal page scroll, 390 and 1440 | C7 | ok |
| 14 staff | one `h1` inside `PageHeader`; actions below the title under 40rem | C10, C11 (3 screens) | ok. At desktop the action's x position depends on the shrunk column (Pacientes button ends at x≈1220, not at the content edge): **uncovered**, same root cause as row 1 |
| staff content column | cards/panels fill the column; consistent spacing on desktop | **none** (C26 is relative to the header, which shrinks with the column) | **fails**: see Binding sources row 1 |
| Dashboard / Faturamento / Relatórios | KPI in 2 columns under 40rem | C13 | real layout is 2 columns (tops `[136,136,234,234]`), but the proof also passes with 4 (F4 survived) |
| Dashboard | Retornos row: text then actions on their own line | C27 | ok (screenshot) |
| Agenda | 7-col compact grid → filter below month nav → day list below grid; chips only on desktop | C19-C24 | ok; C24 does not locate the chip inside a day cell |
| Prontuário | tab strip scrolls inside itself; active tab visible; panels fill width | C25, C26 | **active tab off-screen on load (uncovered)**; panel = 704 of 1152 on desktop |
| Triagem | empty state fills the column | C26 | **fails**: 271 of 358 / 1152 |
| 13 tables | stacked under 40rem, table at 1440 | C16, C17 | ok |
| Login / Esqueci / Definir | card ≥16px from each edge | C28 | ok |
| Portal paciente | Confirmar not over the date; one icon in the notice; headline-size greeting | C29-C31 | ok (screenshot) |
| Documentos | tables inside a horizontal scroller | C32 | ok for 4. Recibo and repasse are named in plan `Observable` and not exercised |

## Checks

Proof runs at HEAD:

- lib: `npx vitest run tests/layout-css-contract.test.ts tests/ui-table.test.tsx tests/table-css-contract.test.ts tests/release-contract.test.ts -t "<6 names>"`. 6 passed, each listed by name. `git diff --exit-code origin/main -- src/tokens/colors.ts src/css/theme.css` exited 0 (origin/main = `19ea056`).
- app Vitest: `npx vitest run tests/components/page-header.test.tsx tests/app/color-bridge.test.ts tests/components/portal-layout.test.tsx -t "<3 names>"`. 3 passed, each listed.
- app Playwright: `npx playwright test -c playwright.shots.config.ts e2e/layout-mobile-first.spec.ts e2e/layout-tabelas.spec.ts --retries=0 --reporter=list`. **109 passed, 0 failed, 3.6 min**, exit 0. Each test is listed individually. 109 = 23×2 (C7, C8) + 14 (C10) + 3+1+3+1 (C11-C14) + 6 (C19-C24) + 1+2+1+1+2+1 (C25-C29, C31, C32) + 13×2 (C16, C17) + 1 (C18).
- All test files are new or extended in the diff ranges (lib `tests/{layout-css-contract,release-contract}.test.ts` are new; `ui-table`/`table-css-contract` are extended; app `e2e/layout-*.spec.ts`, `tests/app/color-bridge.test.ts` and `tests/components/page-header.test.tsx` are new; `portal-layout.test.tsx` is extended).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `.sv-layout` `minmax(0, 1fr)` | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:85` - `expect(declIn(body, 'grid-template-columns')).toBe('minmax(0, 1fr)')` | PASS |
| C2 | 44px `min-height` on `.sv-btn`/`.sv-field` under touch media | lib vitest, pass | `still-void/tests/layout-css-contract.test.ts:95-98` - `for (['.sv-btn','.sv-field']) … toBe(TOUCH_TARGET)` (TOUCH_TARGET = `calc(var(--sv-space-10) + var(--sv-space-1))`, line 79) | PASS |
| C3 | `stack` → `sv-table--stack`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:283` - `toHaveClass('sv-table','sv-table--stack')`; `:285` - `not.toHaveClass('sv-table--stack')` | PASS |
| C4 | `label` → `data-label`, absent without | lib vitest, pass | `still-void/tests/ui-table.test.tsx:303` - `toHaveAttribute('data-label','Nome')`; `:314` - `not.toHaveAttribute('data-label')` | PASS |
| C5 | stack rules only under `(width < 40rem)`; head clipped, not `display:none`; `::before attr(data-label)` | lib vitest, pass | `still-void/tests/table-css-contract.test.ts:209` - `expect(outside).not.toMatch(/\.sv-table--stack/)`; `:219-220` - `not.toMatch(/display:\s*none/)`, `toMatch(/clip-path:\s*inset\(50%\)/)`; `:224` - `toMatch(/content:\s*attr\(data-label\)/)` | PASS |
| C6 | minor changeset; no color value changed | lib vitest + git diff, pass | `still-void/tests/release-contract.test.ts:17` - `toMatch(/^---\s*\n"@still-void\/ui":\s*minor\s*\n---/)`; `git diff --exit-code` exit 0. Precision gap: the proof does not cover the `--sv-*` color properties in `style.css` that the claim names. A manual check (`git diff 19ea056..HEAD -- src/css/style.css` has no `--sv-*:` definition lines) found them clean | PASS |
| C7 | no page scroll, 23 pages × 2 viewports | e2e, 23 tests pass | `e2e/layout-mobile-first.spec.ts:222-225` - `expect(await scrollWidth(target)).toBeLessThanOrEqual(viewport.width + 2)` | PASS |
| C8 | ≥44×44 controls in `main`, label for checkbox/radio | e2e, 23 pass | `e2e/layout-mobile-first.spec.ts:236` - `expect(await tooSmallControls(target)).toEqual([])`; label rule `:199-200` | PASS |
| C9 | one `h1` + actions group | vitest, pass | `tests/components/page-header.test.tsx:21` - `toHaveLength(1)`; `:27-30` - actions `toContainElement(button)`, `not.toContainElement(h1)` | PASS |
| C10 | one `h1`, inside `[data-page-header]`, 14 staff pages | e2e, 14 pass | `e2e/layout-mobile-first.spec.ts:247-248` - `toHaveCount(1)` on `h1` and on `[data-page-header] h1` | PASS |
| C11 | actions top ≥ `h1` bottom, right ≤ 390 | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:268-269` - `actions.y >= title.y + title.height`; `actions.x + width <= 390` | PASS |
| C12 | e-mail on one line, ellipsis, `title` | e2e, pass | `e2e/layout-mobile-first.spec.ts:290-292` - `height <= lineHeight*1.5`; `textOverflow === 'ellipsis'`; `title === text` | PASS |
| C13 | KPI 2 columns at 390 | e2e, 3 pass | `e2e/layout-mobile-first.spec.ts:312-313` - `boxes[0].top === boxes[1].top`; `left` differ. It only compares the first two cards, so it cannot tell 2 columns from 3 or 4. Fault F4 (`repeat(4, …)`) survived. Precision gap | FAIL - proof does not prove the column count |
| C14 | back link icon/text centers within 4px | e2e, pass | `e2e/layout-mobile-first.spec.ts:333` - `Math.abs(icon - text) <= 4` | PASS |
| C15 | `@theme` bridge identical to `46026ba`; `check:sv` green | vitest pass; `npm run check:sv` exit 0 | `tests/app/color-bridge.test.ts:58` - `expect(colorBridge()).toEqual(BASELINE)`. I diffed the `@theme` block against `git show 46026ba:src/app/globals.css`: identical. Precision gap vs AC 13: no proof shows that every `text-/bg-/border-*` utility keeps its token (a token swap would pass). A manual per-file scan of the changed `.tsx` found only removals moved into `PageHeader` and a new `mobile-month.tsx` that reuses `bg-accent-ink text-white` from `calendar-grid.tsx` | PASS |
| C16 | 13 tables stacked at 375 | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:233` - `toHaveClass(/sv-table--stack/)`; `:257-259` - `theadHeight <= 1`, `badLabels` `[]`, `offscreen` 0 | PASS |
| C17 | 13 tables at 1440, head visible, rows < 80px | e2e, 13 pass | `e2e/layout-tabelas.spec.ts:274-275` - `theadHeight > 0`; `tallRows === 0` | PASS |
| C18 | Pacientes empty message at both viewports | e2e, pass | `e2e/layout-tabelas.spec.ts:285-286` - `getByText("Nenhum paciente encontrado")` visible; `main table` count 0 (the message is the same as `46026ba:src/app/(staff)/pacientes/page.tsx:159`) | PASS |
| C19 | 7 day columns ≥44×44 inside 390 | e2e, pass | `e2e/layout-mobile-first.spec.ts:377-383` - 7 boxes, 7 distinct lefts, `right <= 390`, `w,h >= 44` | PASS |
| C20 | dot marker, no chip in cell | e2e, pass | `e2e/layout-mobile-first.spec.ts:393` - `data-has-appointments="true"`; `:395` - `day.locator("button")` count 0; `:397` - text matches `/^\d{1,2}$/` | PASS |
| C21 | today selected on load; tapped day lists time/patient/procedure/status below grid | e2e, pass | `e2e/layout-mobile-first.spec.ts:408` - `aria-pressed="true"` on today. It sits inside an `if` at `:407`, so the assertion is skipped whenever the first rendered month differs (precision gap). `:413-417` - time, patient, procedure, "Agendada" visible; `:423` - `listTop >= gridBottom` | PASS |
| C22 | empty day message | e2e, pass | `e2e/layout-mobile-first.spec.ts:435` - `getByText("Nenhuma consulta neste dia.")` visible (position below the grid is not asserted here; C21:423 covers the same list) | PASS |
| C23 | filter below month nav, full content width ±2 | e2e, pass | `e2e/layout-mobile-first.spec.ts:446-447` - `filter.y >= nav.y+nav.height`; `abs(filter.width - header.width) <= 2` | PASS |
| C24 | desktop chip inside day cell | e2e, pass | `e2e/layout-mobile-first.spec.ts:456` - `[data-mobile-month]` count 0; `:460` - chip button visible. Precision gap: the assertion does not place the chip inside the day cell | PASS |
| C25 | tablist scrolls inside; no page scroll; Pacotes visible after selection | e2e, pass | `e2e/layout-mobile-first.spec.ts:475-476` - `scroll > client`, page `<= 392`; `:479-480` - tab `x >= 0`, `right <= 390`. See Binding sources: AC 23's "active tab visible" fails on first load (Anamnese at x -153..-54) and no check covers it | PASS |
| C26 | Anamnese panel and Triagem empty state = `main` content width ±2, both viewports | e2e, 2 pass | `e2e/layout-mobile-first.spec.ts:493-495` - `abs(box.width - [data-page-header].width) <= 2`. The reference is the header. Header, `main` content and card all shrink together (triagem 271 = 271 = 271), so the assertion holds while the plan's defect reproduces: 271 of 358px at 390 and 271 of 1152px at 1440 | FAIL - vacuous reference, AC 24 intent not met |
| C27 | Retornos: name/reason not clipped, actions below | e2e, pass | `e2e/layout-mobile-first.spec.ts:522-523` - `clipped === false`; `below === true` | PASS |
| C28 | public cards ≥16px from edges | e2e, pass | `e2e/layout-mobile-first.spec.ts:535-536` - `card.x >= 16`; `390 - right >= 16` | PASS |
| C29 | Confirmar/date disjoint | e2e, pass | `e2e/layout-mobile-first.spec.ts:559-564` - `expect(disjoint).toBe(true)` | PASS |
| C30 | one `svg` in the emergency notice | vitest, pass | `tests/components/portal-layout.test.tsx:71` - `expect(notice?.querySelectorAll('svg')).toHaveLength(1)` | PASS |
| C31 | greeting = headline at 390, display at 1440 | e2e, pass | `e2e/layout-mobile-first.spec.ts:573-588` - `sizes.actual === computed(var(--sv-text-2xl))` at 390 and `var(--sv-text-4xl)` at 1440 (headline = 1.75rem per lib DESIGN.md:197) | PASS |
| C32 | 4 document pages: tables in a scroller, no page scroll | e2e, pass | `e2e/layout-mobile-first.spec.ts:604` - `scrollWidth <= 392`; `:612` - `unwrapped === 0` | PASS |

## Coverage

Recomputed from the plan's `Observable`/`Criteria`/`Landing` (the authority for these sets), not
from the checks' own table.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| page set × viewport (46) | plan Observable (23) × 2 | `PAGE_SET` at `e2e/layout-mobile-first.spec.ts:116-161` has the same 23; C7 ran 23 tests × 2 viewports | - |
| page set, touch (23) | plan Observable | C8, 23 tests | - |
| staff pages with `PageHeader` (14) | page set minus public/portal/docs; `grep PageHeader src/app` = 14 files; no stray `h1` under `(staff)` | C10, 14 tests | - |
| KPI groups (3) × "2 columns" | AC 11 | C13 runs all 3, but the assertion cannot fail on 3-4 columns (F4 survived) | Dashboard, Faturamento, Relatórios: column count unproven |
| table set, stacked + desktop (13) | plan Observable | C16 ×13, C17 ×13 (all ran) | - |
| table set, empty state (13) | AC 16 ("IF **a table in the table set** has no rows") | C18 covers pacientes only | parceiros, profissionais, procedimentos, materiais, faturamento, auditoria, relatórios produção, relatórios receita, repasses, configurações contas, configurações feriados, prontuário estomias e feridas (12) |
| public screens (3) | AC 26 | C28 ×3 | - |
| document pages (6) | AC 30 + plan Observable ("`/documentos/recibo` e `/documentos/repasse` … entram pelo AC 30") | C32: atestado, consentimento, relatório, plano de cuidados | recibo, repasse |
| AC 24 panels (2 × 2 viewports) | AC 24 | C26 measures against the shrink-wrapped header | triagem 390 (271/358), triagem 1440 (271/1152), prontuário 1440 (704/1152) |
| AC 23 active-tab visibility (2 states) | AC 23 | after selection: C25 | first load: unproven, and fails in the browser (x -153..-54) |
| agenda mobile states (4) | AC 18-20 | today selected C21 (conditional, `:407`) · day with appointment C21 · empty day C22 · dot C20 | - |
| agenda viewports (2) | AC 17, 22 | C19 · C24 | - |
| `Table stack` (2), `TableCell label` (2), touch rule selectors (2) | lib API / door 1-2 | C3 C5 · C4 · C2 | - |
| Landing doors (4) | plan Landing | 1: C3 C4 C5 · 2: C2 · 4: C9 C10 | door 3 (`"@still-void/ui": "^3.4.0"`): `package.json:29` still reads `^3.3.1`. Blocked on open question 1 (`blocks go-live`); C15/C8 run against a locally installed tarball and prove nothing about the declared range |
| AC 13 color utilities in `src/**/*.tsx` | AC 13 | bridge: C15. Utilities: no proof (a token swap passes `check:sv`); a manual scan found them clean | utility → token identity |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Regra de CSS da lib (media query) | `still-void/src/css/style.css` | CSS text contract + browser measurement, one case per viewport | no - `.sv-layout` (C1 + C7 at 390/1440) and `sv-table--stack` (C5 + C16 at 375, C17 at 1440) are met. The touch rule has the text contract (C2) and a browser case at 390 only (C8). No browser case at 1440/pointer-fine shows the rule stays off |
| Componente da lib com prop | `still-void/src/components/ui/table.tsx` | jsdom, prop present and absent | yes - C3 (`:283`/`:285`), C4 (`:303`/`:314`) |
| Página/arranjo do app | `src/app/**` pages | Playwright box measurement per page and declared viewport | no - C26's measurement uses a reference box that shrinks with what it measures, so the arrangement it names (panel fills the column) is not measured; content column width is measured on no page |
| `PageHeader` | `src/components/page-header.tsx` | component test with and without actions | yes - `tests/components/page-header.test.tsx:12` and `:34` (all 3 tests pass) |

Swept `existing` re-read: authorization. `src/proxy.ts:47` redirects to `/login` and
`src/lib/auth/request-session.ts:10` defines `getRequestSession`. Both are present.

## Faults injected

Isolation: `git worktree add` scratch copies of both repos. App E2E faults were CSS injected with
`context.addInitScript` into copies of the real specs, kept in the scratchpad and run against the
real dev server; the assertions were unmodified. I confirmed in a separate probe that the F4
injection took effect (4 KPI cards on one row: tops all 136, lefts 16/109/201/294). Baseline
porcelain: lib empty, app empty. After: lib empty. App shows only ` M AGENTS.md`, the `next dev`
agent-rules block the brief says to expect (10 added lines between
`BEGIN/END:nextjs-agent-rules`); no fault leaked. Both worktrees are removed.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 `.sv-layout` `minmax(0, 1fr)` → `1fr` | `still-void/src/css/style.css:338` | yes - C1 `sv-layout usa minmax(0, 1fr)` failed |
| F2 `data-label={label}` → `data-label={undefined}` | `still-void/src/components/ui/table.tsx:83` | yes - C4 `label vira data-label` failed |
| F3 rename `data-page-header-actions` attribute | `src/components/page-header.tsx:43` | yes - C9 `um h1 e o grupo de ações` failed |
| F4 KPI grid `repeat(4, minmax(0,1fr))` at 390 (injected CSS) | `[data-kpi-grid]` (`src/app/(staff)/page.tsx:110` et al.) | no - C13 `KPIs em 2 colunas` passed on dashboard, faturamento and relatórios |
| F5 stacked `thead` made visible (`position:static`, no clip) | `.sv-table--stack .sv-table__head` | yes - C16 `empilhada no celular: pacientes` failed (`theadHeight` 59.1 > 1) |

## Gate

- app `npm run typecheck`: exit 0
- app `npm run lint` (Biome): exit 0, 640 files, 1 info, no errors
- app `npm run check:sv`: exit 0 ("adoção do @still-void/ui v2 completa")
- app `npm run check:docs`: exit 0 (0 warnings)
- app Playwright (the two feature specs): 109 passed, 0 failed
- lib `npx vitest run`: 77 files, 1515 passed, 0 failed
- lib `npm run typecheck`: exit 0
- app `npm run test:coverage`: not re-run (the orchestrator reports 96.21%)

## Ranked gaps

1. The staff content column shrinks to its content, the Problem's first-listed defect ("cards
   encolhem até o conteúdo"). C26 is vacuous because its reference (`[data-page-header]`) shrinks
   too. Checks: C26, and uncovered arrangement. Location:
   `src/app/(staff)/staff-layout-client.tsx:62` (flex item without `flex-1`/`w-full` inside
   `.sv-app-shell`). Proof: `e2e/layout-mobile-first.spec.ts:493-495`.
2. AC 23: the active tab is off-screen on the prontuário's first load (x -153..-54 at 390). No
   check covers it. C25 covers only the state after clicking. Location:
   `e2e/layout-mobile-first.spec.ts:477-480`; tab strip in `src/app/(staff)/pacientes/[id]/page.tsx`.
3. C13 surviving mutant (F4): the assertion compares only the first two cards. Location:
   `e2e/layout-mobile-first.spec.ts:305-313`.
4. AC 16 proven on 1 of 13 tables (C18, pacientes only). Location: `e2e/layout-tabelas.spec.ts:280-288`.
5. AC 30 misses recibo and repasse, which the plan's Observable names (C32). Location:
   `e2e/layout-mobile-first.spec.ts:596-601`.
6. Door 3 is unmet: `package.json:29` still reads `^3.3.1`, not `^3.4.0`. This is expected until
   `@still-void/ui@3.4.0` is published (open question 1, blocks go-live), but it stays open.
7. Test policy, lib CSS row: the touch rule has no browser case at 1440/pointer-fine.
8. Precision gaps, lower weight. C21's today-selected assertion is conditional
   (`e2e/layout-mobile-first.spec.ts:407`). C24 does not place the chip inside the day cell
   (`:457-460`). C6's proof does not cover `style.css` color properties. C15/AC 13 has no proof
   of utility-level token identity.
