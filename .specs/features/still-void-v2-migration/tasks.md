# Migração `@still-void/ui` 1.x → 2.0 + adoção do catálogo — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/still-void-v2-migration/design.md`
**Status**: Done — T1–T30 implementados em 26 commits atômicos (2026-08-22). T9 foi no-op: o shell já estava limpo da feature anterior.

---

## Test Coverage Matrix

> Diretrizes encontradas: `AGENTS.md`, `CLAUDE.md`, `vitest.config.ts` (limiares 90% em linhas/funções/branches/statements), `playwright.config.ts`, `README.md`. O padrão global do usuário é 80% mínimo; o projeto é mais estrito (90%) e **o mais estrito vence**.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Wrapper de UI (`src/components/**`) | unit (jsdom + RTL) | Todo AC da spec que nomeia o componente + todo caso-limite listado; contrato de a11y existente preservado sem afrouxar seletor | `tests/components/*.test.tsx` | `npm test` |
| Página / seção (`src/app/**/*.tsx`) | unit de renderização (jsdom + RTL, `fetch` stubado) | Os cenários já cobertos (feliz + erro + vazio + interação) seguem verdes com os **mesmos** seletores por papel/rótulo; nenhum `getByRole`/`getByLabelText` trocado por `container.querySelector` ou por classe | `tests/pages/*.test.tsx` | `npm test` |
| Tema / CSS (`src/app/globals.css`) | none — build gate + asserção literal | A string de utilitário que a lib emite existe no CSS gerado | — | `npm run build` + `grep` no output |
| Manifesto (`package.json`) | none — build gate | `typecheck` + `build` verdes | — | `npm run typecheck && npm run build` |
| Script de gate (`scripts/*.sh`) | none — auto-verificável | Executa, imprime achados, código de saída correto | — | `bash scripts/check-sv-adoption.sh` |
| Fluxo E2E (`e2e/**`) | e2e | Suítes existentes verdes; nenhum spec novo (não há comportamento novo) | `e2e/*.spec.ts` | `npm run test:e2e` |
| Documentação (`docs/*.md`) | none | Revisão contra a export line da `2.0.1` | — | — |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| unit jsdom de componente/página | **Sim** | `cleanup()` por teste; `fetch` stubado por teste com `vi.stubGlobal` + `vi.unstubAllGlobals()`; zero store compartilhado | `tests/setup.ts:12`, `tests/pages/staff-procedimentos.test.tsx:29` |
| unit/integration de API (PGlite) | Não | Cada arquivo migra o PGlite inteiro no primeiro caso | `vitest.config.ts:14` — **fora do escopo desta feature** |
| e2e Playwright | **Não** | `fullyParallel: false`, `workers: 1` | `playwright.config.ts:28` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após qualquer task com teste unit | `npm test` |
| Full | Fim de fase | `npm run typecheck && npm test && npx eslint <arquivos tocados>` |
| Build | T1, T2 e toda a fase 7 | `npm run typecheck && npm test && npx eslint <arquivos tocados> && NODE_OPTIONS=--max-old-space-size=6144 npm run build` |
| Adoption | T3 em diante | `bash scripts/check-sv-adoption.sh` |
| E2E | Fase 7 apenas | `npm run test:e2e` |

**Baseline medido em `284d6fc` (2026-08-22), antes de qualquer task:**

- `npm test` → **105 arquivos, 1749 testes, 0 falhas**. É o piso: nenhuma task pode reduzir esses números.
- `npm run lint` → **sai com 1**: 1 erro (`complexity` em `src/domain/clinical/image-sanitizer.ts`) e 10 avisos
  (`no-unused-vars` em 6 arquivos de teste). **Dívida pré-existente, fora do escopo desta feature** — nenhum
  dos 7 arquivos é tocado aqui. Por isso o gate usa `npx eslint` nos arquivos da task, e não `npm run lint`
  global: um gate que já nasce vermelho não é gate. Corrigir esses 11 achados é trabalho separado.
  → **Feito depois** (`76ed3d8`): os 11 achados foram zerados e o `npm run lint` global sai com 0. A linha
  `npm run lint` que aparece nos gates de T1 e T30 abaixo passou a ser executável de fato.
- `npm run build` → **OOM no heap padrão do Node** (`Ineffective mark-compacts near heap limit`, ~2 GB).
  Também pré-existente (medido com a ponte Tailwind fora da árvore). Passa com
  `NODE_OPTIONS=--max-old-space-size=6144`. Limite de ambiente, não da migração.
  → **Resolvido depois** (`836d9e8`, AD-007): o pico real é ~2,5 GB e o heap padrão do V8 nesta máquina é
  2.240 MB. O `npm run build` passou a fixar 4 GB, então não precisa mais de `NODE_OPTIONS` na linha de comando.

---

## Execution Plan

### Phase 1: Fundação (sequencial)
```
T1 → T2 → T3
```

> **Reordenação registrada (2026-08-22):** o plano original punha a ponte Tailwind antes do bump.
> Não funciona — a `1.1.0` instalada não emite `bg-sv-surface` (os componentes shadcn são da
> linha 2.x), então o gate empírico da ponte não teria como passar na própria task. Bump virou
> T1 e ponte virou T2, cada uma auto-verificável no seu gate.

### Phase 2: Wrappers de `src/components/**`
```
T3 ──┬→ T4 [P]
     ├→ T6 [P]
     ├→ T7 [P]
     └→ T8 [P]
T3 ──→ T5
```

### Phase 3: Shell, portal e login
```
T5 ──┬→ T9  [P]
     ├→ T10 [P]
     ├→ T11 [P]
     ├→ T12 [P]
     └→ T13 [P]
```

### Phase 4: Staff — operação diária
```
T5 ──┬→ T14 [P]
     ├→ T15 [P]
     ├→ T16 [P]
     └→ T17 [P]
```

### Phase 5: Staff — gestão
```
T5 ──┬→ T18 [P]
     ├→ T19 [P]
     ├→ T20 [P]
     ├→ T21 [P]
     └→ T22 [P]
```

### Phase 6: Prontuário do paciente
```
T5 ──┬→ T23 [P]
     ├→ T24 [P]
     ├→ T25 [P]
     └→ T26 [P]
```

### Phase 7: Fechamento (sequencial)
```
T27 → T28 → T29 → T30
```

---

## Task Breakdown

### T1: Subir para `@still-void/ui@^2.0.1` e eliminar o import bare

**What**: Bump da dependência e reapontamento dos 5 imports do entry point removido.
**Where**: `package.json`, `package-lock.json`, `src/app/(staff)/staff-nav.tsx`, `src/components/brand-logo.tsx`, `src/components/load-more-button.tsx`, `src/components/logout-button.tsx`, `src/components/modal.tsx`
**Depends on**: None
**Reuses**: tabela de mapeamento de `docs/migration-v1-to-v2.md`
**Requirement**: SV2-01, SV2-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `package.json` declara `"@still-void/ui": "^2.0.1"`; `node_modules/@still-void/ui/package.json` reporta `version` iniciando em `2.`
- [ ] `headerClasses` (3 arquivos), `logo`/`logoClasses` (1) e `categoryPill` (1) importados de `@still-void/ui/react`
- [ ] `grep -rn 'from "@still-void/ui"' src` retorna vazio
- [ ] `react`/`react-dom` satisfazem o peer `>=18` (já em 19.2.4 — nenhuma instalação nova)
- [ ] `ReadingProgress` como **tipo** não é usado em lugar nenhum (único símbolo renomeado na v2) — confirmado por `grep`
- [ ] Gate: `npm run typecheck && npm run lint && npm run build && npm test`
- [ ] Contagem de testes: baseline preservada, zero deleções

**Tests**: none (build gate — nenhuma mudança de comportamento)
**Gate**: build
**Commit**: `chore(deps): sobe @still-void/ui para 2.x e migra os imports do entry point removido` (`d917d72`)

---

### T2: Instalar a ponte Tailwind dos componentes shadcn

**What**: Fazer os utilitários que `Button`/`Card`/`Input`/`Alert`/`Badge` da lib emitem existirem no CSS gerado.
**Where**: `src/app/globals.css`
**Depends on**: T1
**Reuses**: bloco `@theme` existente (`src/app/globals.css:23`)
**Requirement**: SV2-03 (habilita SV2-04..08)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `@source "../../node_modules/@still-void/ui/dist"` presente (o Tailwind v4 não varre `node_modules` por respeitar o `.gitignore`)
- [ ] `@theme` define, cada uma derivada de um `--sv-*`: `--color-sv-bg`, `--color-sv-surface`, `--color-sv-surface-2`, `--color-sv-text`, `--color-sv-text-2`, `--color-sv-text-3`, `--color-sv-border`, `--color-sv-signal-cyan`, `--color-background`, `--color-ring`, `--color-destructive`, `--color-destructive-foreground`
- [ ] `@theme` define também `--color-surface-2`, `--color-accent-soft`, `--color-accent-strong` para o app (cobrem `teal-50/100` e `hover:bg-teal-800`, que hoje não têm nome semântico)
- [ ] Os `@import` de `@still-void/ui/theme.css` e `@still-void/ui/style.css` seguem byte-idênticos
- [ ] **Gate empírico**: após o build, `grep -rl "bg-sv-surface" $(find .next -name "*.css")` retorna ao menos um arquivo, e a regra gerada é `.bg-sv-surface{background-color:var(--color-sv-surface)}` com `--color-sv-surface` definido no mesmo arquivo. Se falhar, o `@source` está errado — corrigir antes de commitar. (O Turbopack emite o CSS em `.next/static/chunks/`, não em `.next/static/css/`.)
- [ ] Gate: `npm run typecheck && npm run lint && npm run build && npm test`
- [ ] Contagem de testes: baseline atual preservada, zero deleções

**Tests**: none (build gate + asserção literal no CSS emitido)
**Gate**: build
**Commit**: `chore(ui): ponte Tailwind para os utilitários dos componentes shadcn do Still Void`

---

### T3: Criar o gate executável de adoção

**What**: Um script que transforma os critérios "zero ocorrências" da spec em verificação automática.
**Where**: `scripts/check-sv-adoption.sh` (novo)
**Depends on**: T2
**Reuses**: os padrões de `grep` do inventário registrado em `design.md`
**Requirement**: SV2-09, SV2-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Checa e reporta `arquivo:linha` para: (a) import bare `@still-void/ui`; (b) `<button` cru sem `// sv-gap:` na linha anterior; (c) `<input` de tipo textual sem `// sv-gap:`; (d) utilitário `(slate|teal|amber|emerald|sky)-[0-9]{2,3}`; (e) `--color-slate-*`/`--color-teal-*` sobrevivente em `globals.css`; (f) símbolo client-only (`Dialog`, `Select`, `DropdownMenu`, `Tabs`, `Tooltip`, `useTheme`, `copyToClipboard`, `ThemeProvider`) importado em arquivo sem `"use client"`
- [ ] Sai com 0 quando limpo, 1 quando há achado
- [ ] **Baseline registrado**: nesta task o script sai com **1** e o total de achados por categoria é anotado no cabeçalho do próprio script como linha de partida. Sair 0 aqui significaria que o script não está checando nada
- [ ] Adicionado a `package.json` como `"check:sv": "bash scripts/check-sv-adoption.sh"`
- [ ] Gate: `npm run typecheck && npm run lint && npm test` + `bash scripts/check-sv-adoption.sh` executa sem erro de sintaxe

**Tests**: none (script auto-verificável — o baseline é a asserção)
**Gate**: full + adoption
**Commit**: `chore(ui): gate executável de adoção do Still Void`

---

### T4: `ErrorAlert` sobre `Alert` da lib [P]

**What**: Trocar o workaround `Callout kind="warn"` + override de CSS var pelo `Alert` real da v2.
**Where**: `src/components/feedback.tsx`, `tests/components/feedback.test.tsx`
**Depends on**: T3
**Reuses**: `Alert`, `AlertDescription` de `@still-void/ui/react`
**Requirement**: SV2-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `ErrorAlert` renderiza `Alert` + `AlertDescription`; a constante `DANGER_CALLOUT` e o import de `Callout` somem
- [ ] Preserva `role="alert"` e o texto da mensagem — asserção por papel, não por classe
- [ ] `LoadingIndicator` e `EmptyState` inalterados em comportamento; `EmptyState` passa a usar `text-ink-3` (já é o token — só confirmar)
- [ ] Teste cobre: mensagem exibida · `role="alert"` presente · mensagem vazia não quebra a renderização
- [ ] Gate: `npm test`
- [ ] Contagem de testes: ≥ a de `tests/components/feedback.test.tsx` hoje, zero deleções

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(ui): ErrorAlert usa Alert do Still Void v2`

---

### T5: `Modal` sobre `Dialog` da lib

**What**: Trocar o focus trap / backdrop / Escape manuais pelo `Dialog` da Radix exportado pela lib, mantendo a API pública `Modal({title,onClose,children})`.
**Where**: `src/components/modal.tsx`, `tests/components/modal.test.tsx`, `tests/setup.ts` (só se a Radix exigir polyfill)
**Depends on**: T3
**Reuses**: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` de `@still-void/ui/react/client`
**Requirement**: SV2-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `Modal` é `Dialog` controlado: `open` fixo em `true` (o call site já monta/desmonta), `onOpenChange={(o) => { if (!o) onClose(); }}`
- [ ] `FOCUSABLE_SELECTOR`, o `useEffect` de keydown e o `useRef` do diálogo são removidos — a Radix assume
- [ ] A API pública e os ~10 call sites ficam intactos (`grep` por `<Modal` mostra a mesma contagem)
- [ ] `tests/components/modal.test.tsx` passa **sem afrouxar asserção**: `role="dialog"`, `aria-modal="true"`, rótulo acessível = `title`, foco inicial dentro, `Escape` → `onClose`, clique no backdrop → `onClose`, clique no conteúdo → **não** chama `onClose`, foco retorna ao gatilho
- [ ] Se a Radix exigir API ausente no jsdom (`ResizeObserver`, `PointerEvent`, `scrollIntoView`), o polyfill entra em `tests/setup.ts` com comentário explicando — **nunca** relaxando o teste
- [ ] Gate: `npm test`
- [ ] Contagem de testes: ≥ a de `tests/components/modal.test.tsx` hoje, zero deleções

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(ui): Modal passa a usar Dialog do Still Void v2`

---

### T6: `LoadMoreButton` sobre `Button` [P]

**What**: Trocar `categoryPill({interactive:true})` pelo `Button` da lib.
**Where**: `src/components/load-more-button.tsx`, `tests/components/load-more-button.test.tsx`
**Depends on**: T3
**Reuses**: `Button` de `@still-void/ui/react`
**Requirement**: SV2-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Usa `<Button variant="outline" size="sm">`; import de `categoryPill` removido
- [ ] `visible={false}` continua renderizando nada; `onClick` chamado 1× por clique; nome acessível segue `Carregar mais`
- [ ] Gate: `npm test`
- [ ] Contagem de testes: ≥ 3 (a suíte atual), zero deleções

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(ui): LoadMoreButton usa Button do Still Void v2`

---

### T7: `LogoutButton` sobre `Button` [P]

**What**: Trocar `headerClasses.link` pelo `Button` da lib.
**Where**: `src/components/logout-button.tsx`, `tests/components/logout-button.test.tsx`
**Depends on**: T3
**Reuses**: `Button` de `@still-void/ui/react`
**Requirement**: SV2-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Usa `<Button variant="ghost" size="sm">`; import de `headerClasses` removido
- [ ] Continua fazendo `POST /api/auth/logout` e então `router.push("/login")` + `router.refresh()`, nessa ordem
- [ ] Gate: `npm test`
- [ ] Contagem de testes: ≥ a atual, zero deleções

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(ui): LogoutButton usa Button do Still Void v2`

---

### T8: `BrandLogo` e `DocumentFrame` [P]

**What**: `BrandLogo` só troca de path de import; `DocumentFrame` troca seus 2 botões por `Button` e a paleta por token.
**Where**: `src/components/brand-logo.tsx`, `src/components/document-frame.tsx`, `tests/components/document-frame.test.tsx`
**Depends on**: T3
**Reuses**: `Button` de `@still-void/ui/react`; receita `logo()` de `@still-void/ui/react`
**Requirement**: SV2-02, SV2-04, SV2-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `BrandLogo` importa de `@still-void/ui/react`; o comentário que justifica o wrapper (`next/link` vs `<a>` do `<Logo>`) permanece e continua verdadeiro
- [ ] `DocumentFrame`: "← Voltar" vira `<Button variant="link">`, "Imprimir / salvar PDF" vira `<Button>`
- [ ] `text-slate-900`/`border-slate-300`/`border-slate-800`/`text-teal-700`/`bg-teal-700` → tokens semânticos. **Exceção documentada**: a moldura A4 é para impressão em papel — se algum valor precisar continuar preto/branco absoluto no `print:`, fica com `black`/`white` literais e um comentário dizendo por quê (cor neutra é permitida pelo AC SV2-12.4)
- [ ] `window.print()` e `window.history.back()` seguem sendo chamados uma vez por clique
- [ ] Gate: `npm test`
- [ ] Contagem de testes: ≥ a atual, zero deleções

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(ui): BrandLogo e DocumentFrame no catálogo v2`

---

### T9: Shell staff e portal [P]

**What**: Layouts e navegação: import path + botões + tokens.
**Where**: `src/app/portal/layout.tsx`, `src/app/(staff)/layout.tsx`, `src/app/(staff)/staff-nav.tsx`, `src/app/layout.tsx`
**Depends on**: T5
**Reuses**: `Header`, `Layout`, `Sidebar`, `SidebarSection` (já em uso), `Button`
**Requirement**: SV2-02, SV2-04, SV2-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `staff-nav.tsx` importa `headerClasses` de `@still-void/ui/react`; qualquer `<button>` cru vira `Button`
- [ ] Zero utilitário `slate-*`/`teal-*` nos 4 arquivos
- [ ] Layouts são excluídos da cobertura (`vitest.config.ts:76`) — a verificação é `npm run build` verde + a suíte de páginas que renderiza dentro deles
- [ ] Gate: `npm run typecheck && npm run lint && npm test`

**Tests**: none (layouts excluídos da cobertura por decisão pré-existente; cobertos por E2E na fase 7)
**Gate**: full
**Commit**: `refactor(ui): shell staff/portal no catálogo v2`

---

### T10: Portal — página raiz e progresso de condição [P]

**Where**: `src/app/portal/page.tsx`, `src/app/portal/condition-progress.tsx`, `tests/pages/portal.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `CardHeader`, `CardTitle`, `CardContent`
**Requirement**: SV2-08, SV2-12

**Done when**:
- [ ] Divs-cartão (`rounded-xl border border-slate-200 bg-white p-6`) viram `Card`/`CardContent`
- [ ] Zero utilitário `slate-*`/`teal-*` nos 2 arquivos
- [ ] Os cenários de `portal.test.tsx` que tocam esses 2 módulos seguem verdes com os mesmos seletores por papel/texto
- [ ] Gate: `npm test`
- [ ] Contagem de testes: baseline de `tests/pages/portal.test.tsx` preservada

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(portal): página raiz e progresso de condição no catálogo v2`

---

### T11: Portal — visão do paciente e consentimento [P]

**Where**: `src/app/portal/patient-view.tsx`, `src/app/portal/consent-card.tsx`, `tests/pages/portal.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `Alert`, `Button`, `Hero` (já em uso)
**Requirement**: SV2-04, SV2-06, SV2-08, SV2-13

**Done when**:
- [ ] Os avisos `amber-*` (pendência de retorno, consentimento a vencer) viram `Alert` ou `Card` com token `warning`; os blocos `emerald-*` (consentimento em dia) viram token `success`
- [ ] Zero utilitário `amber|emerald|sky|slate|teal-[0-9]{2,3}` nos 2 arquivos
- [ ] Os cenários de `portal.test.tsx` desses módulos seguem verdes com os mesmos seletores
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(portal): visão do paciente e consentimento no catálogo v2`

---

### T12: Portal — visão do parceiro e auto-agendamento [P]

**Where**: `src/app/portal/partner-view.tsx`, `src/app/portal/schedule-return.tsx`, `tests/pages/portal.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `Button`, `Input`
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12

**Done when**:
- [ ] Os 3 `<button>` e os campos de `schedule-return.tsx` viram `Button`/`Input`; a const local de classe de input é deletada
- [ ] `<select>` de horário (se houver) permanece nativo com `// sv-gap: native-select`
- [ ] Zero utilitário de paleta crua nos 2 arquivos
- [ ] Os cenários de auto-agendamento de `portal.test.tsx` seguem verdes
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(portal): visão do parceiro e auto-agendamento no catálogo v2`

---

### T13: Login [P]

**Where**: `src/app/login/page.tsx`, `tests/pages/login.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `Input`, `Button`, `Alert`
**Requirement**: SV2-04, SV2-05, SV2-06, SV2-08, SV2-12

**Done when**:
- [ ] Campo de senha vira `Input type="password"`, submit vira `Button`, cartão vira `Card`, erro vira `Alert`
- [ ] Rótulo continua associado ao campo — `getByLabelText` do teste atual funciona sem mudança
- [ ] Zero utilitário de paleta crua
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(login): tela de login no catálogo v2`

---

### T14: Staff — dashboard [P]

**Where**: `src/app/(staff)/page.tsx`, `tests/pages/staff-dashboard.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `Button`, `Hero` (já em uso)
**Requirement**: SV2-04, SV2-08, SV2-13

**Done when**:
- [ ] 4 `<button>` → `Button`; cartões de indicador → `Card`; `emerald/amber` → `success`/`warning`
- [ ] Zero utilitário de paleta crua
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): dashboard no catálogo v2`

---

### T15: Staff — agenda [P]

**Where**: `src/app/(staff)/agenda/page.tsx`, `agenda/appointment-form.tsx`, `agenda/calendar-grid.tsx`, `agenda/appointment-detail.tsx`, `tests/pages/staff-agenda.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `Button`, `Input`
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12, SV2-13

**Done when**:
- [ ] 8 `<button>` → `Button`; campos → `Input`; `<select>` de procedimento/profissional fica nativo com `// sv-gap: native-select`
- [ ] A célula clicável da grade (`calendar-grid.tsx`) — se for uma superfície de agendamento e não um botão visual — fica `<button>` cru com `// sv-gap: grid-cell-button` e justificativa
- [ ] Zero utilitário de paleta crua nos 4 arquivos
- [ ] Todos os cenários de `staff-agenda.test.tsx` verdes com os mesmos seletores
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): agenda no catálogo v2`

---

### T16: Staff — procedimentos [P]

**Where**: `src/app/(staff)/procedimentos/page.tsx`, `tests/pages/staff-procedimentos.test.tsx`
**Depends on**: T5
**Reuses**: `Card`, `Button`, `Input`
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12

**Done when**:
- [ ] 8 `<button>` → `Button`; a const `inputClass` local é deletada em favor de `Input`
- [ ] A tabela permanece HTML nativo com `// sv-gap: table`; o contêiner externo vira `Card`
- [ ] Zero utilitário de paleta crua
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): catálogo de procedimentos no v2`

---

### T17: Staff — materiais [P]

**Where**: `src/app/(staff)/materiais/page.tsx`, `tests/pages/staff-materiais.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12, SV2-13

**Done when**:
- [ ] 6 `<button>` → `Button`; campos → `Input`; tabela com `// sv-gap: table`; `amber` de estoque baixo → token `warning`
- [ ] Zero utilitário de paleta crua
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): inventário de materiais no v2`

---

### T18: Staff — faturamento [P]

**Where**: `src/app/(staff)/faturamento/page.tsx`, `faturamento/invoice-form.tsx`, `tests/pages/staff-faturamento.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12, SV2-13

**Done when**:
- [ ] 8 `<button>` → `Button`; campos → `Input`; `emerald` de "pago" → token `success`
- [ ] Zero utilitário de paleta crua nos 2 arquivos
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): faturamento no catálogo v2`

---

### T19: Staff — parceiros e profissionais [P]

**Where**: `src/app/(staff)/parceiros/page.tsx`, `src/app/(staff)/profissionais/page.tsx`, `tests/pages/staff-operations.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12

**Done when**:
- [ ] 8 `<button>` → `Button`; campos → `Input`; tabelas com `// sv-gap: table`
- [ ] Zero utilitário de paleta crua nos 2 arquivos
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): parceiros e profissionais no catálogo v2`

---

### T20: Staff — configurações e auditoria [P]

**Where**: `src/app/(staff)/configuracoes/page.tsx`, `src/app/(staff)/auditoria/page.tsx`, `tests/pages/staff-operations.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12, SV2-13

**Done when**:
- [ ] 5 `<button>` → `Button`; campos → `Input`; `<input type="checkbox">` fica nativo com `// sv-gap: checkbox`
- [ ] Zero utilitário de paleta crua nos 2 arquivos
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): configurações e auditoria no catálogo v2`

---

### T21: Staff — relatórios [P]

**Where**: `src/app/(staff)/relatorios/page.tsx`, `tests/pages/staff-relatorios.test.tsx`
**Depends on**: T5
**Requirement**: SV2-08, SV2-11, SV2-12, SV2-13

**Done when**:
- [ ] Cartões de indicador → `Card`; tabela com `// sv-gap: table`; `emerald/amber` → tokens semânticos
- [ ] Zero utilitário de paleta crua
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): relatórios no catálogo v2`

---

### T22: Staff — lista de pacientes e formulário [P]

**Where**: `src/app/(staff)/pacientes/page.tsx`, `pacientes/patient-form.tsx`, `tests/pages/staff-pacientes-list.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12

**Done when**:
- [ ] 4 `<button>` → `Button`; os 4 campos de texto/data de `patient-form.tsx` → `Input`; `inputClass` deletada
- [ ] `<select>` de parceiro e `<textarea>` de observações ficam nativos, com `// sv-gap: native-select` e `// sv-gap: textarea`, herdando o estilo tokenizado
- [ ] `getByLabelText` dos testes continua funcionando — o `<label>` que envolve o campo é preservado
- [ ] Zero utilitário de paleta crua nos 2 arquivos
- [ ] Gate: `npm test`

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(staff): lista e formulário de pacientes no catálogo v2`

---

### T23: Prontuário — página do paciente [P]

**Where**: `src/app/(staff)/pacientes/[id]/page.tsx`, `tests/pages/staff-paciente-detail.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-08, SV2-12

**Done when**: `<button>` → `Button`; seções → `Card`; zero paleta crua; `npm test` verde
**Tests**: unit · **Gate**: quick
**Commit**: `refactor(clinical): página do prontuário no catálogo v2`

---

### T24: Prontuário — anamnese e condições [P]

**Where**: `src/app/(staff)/pacientes/[id]/anamnesis-section.tsx`, `conditions-section.tsx`, `tests/pages/staff-paciente-detail.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12

**Done when**: 8 `<button>` → `Button`; campos → `Input`; `<textarea>` com `// sv-gap: textarea`; zero paleta crua; `npm test` verde
**Tests**: unit · **Gate**: quick
**Commit**: `refactor(clinical): anamnese e condições no catálogo v2`

---

### T25: Prontuário — planos de cuidado e evoluções [P]

**Where**: `src/app/(staff)/pacientes/[id]/care-plans-section.tsx`, `evolutions-section.tsx`, `tests/pages/staff-paciente-care-plans.test.tsx`, `tests/pages/staff-paciente-detail.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12, SV2-13

**Done when**: 16 `<button>` → `Button`; campos → `Input`; `emerald` do SAE → token `success`; `<textarea>`/`<select>` marcados; zero paleta crua; `npm test` verde
**Tests**: unit · **Gate**: quick
**Commit**: `refactor(clinical): planos de cuidado e evoluções no catálogo v2`

---

### T26: Prontuário — pacotes e fotos de condição [P]

**Where**: `src/app/(staff)/pacientes/[id]/packages-section.tsx`, `condition-photos.tsx`, `tests/pages/staff-paciente-detail.test.tsx`
**Depends on**: T5
**Requirement**: SV2-04, SV2-05, SV2-08, SV2-11, SV2-12

**Done when**: `<button>` → `Button`; `<input type="file">` fica nativo com `// sv-gap: file-input`; zero paleta crua; `npm test` verde
**Tests**: unit · **Gate**: quick
**Commit**: `refactor(clinical): pacotes e fotos de condição no catálogo v2`

---

### T27: Documentos imprimíveis

**Where**: `src/app/documentos/layout.tsx` e as 4 páginas sob `src/app/documentos/**`
**Depends on**: T26 (última task de conteúdo)
**Reuses**: `DocumentFrame` (já migrado em T8)
**Requirement**: SV2-04, SV2-08, SV2-12

**Done when**:
- [ ] Zero utilitário de paleta crua; cor neutra literal permitida só onde o alvo é papel, com comentário
- [ ] `src/app/documentos/**` é excluído da cobertura (`vitest.config.ts:80`) — verificação é `npm run build` verde + `e2e/documentos.spec.ts` na fase 7
- [ ] Gate: `npm run typecheck && npm run lint && npm test`

**Tests**: none (excluído da cobertura por decisão pré-existente; coberto por `e2e/documentos.spec.ts` em T30)
**Gate**: full
**Commit**: `refactor(docs): documentos imprimíveis no catálogo v2`

---

### T28: Remover o vocabulário de apelido do `@theme`

**What**: Apagar as sobrescritas `--color-slate-*` e `--color-teal-*`, agora sem consumidor.
**Where**: `src/app/globals.css`
**Depends on**: T27
**Requirement**: SV2-12

**Done when**:
- [ ] Nenhum `--color-slate-*` nem `--color-teal-*` em `globals.css`
- [ ] O comentário longo que explicava a sobrescrita é removido junto (deixou de ser verdade)
- [ ] `bash scripts/check-sv-adoption.sh` sai com **0** — este é o momento em que o baseline de T3 chega a zero
- [ ] Gate: `npm run typecheck && npm run lint && npm run build && npm test`

**Tests**: none (build gate + gate de adoção)
**Gate**: build + adoption
**Commit**: `refactor(ui): remove o vocabulário de apelido slate/teal do tema`

---

### T29: Documento de lacunas do catálogo

**What**: O arquivo pedido — componentes que o EstomaSysTech precisa e a `@still-void/ui@2.0.1` não tem.
**Where**: `docs/still-void-gaps.md` (novo), `README.md` (um link)
**Depends on**: T28
**Requirement**: SV2-10, SV2-11

**Done when**:
- [ ] Uma seção por lacuna, com: `slug` (igual ao usado em `// sv-gap:`), nome proposto, motivo, nº de call sites, arquivos de exemplo, workaround em vigor, esboço de API sugerida
- [ ] Cobre no mínimo: `textarea`, `native-select`, `label`/`field`, `table`, `checkbox`, `radio-group`, `pagination`, `progress`, `separator`, `alert-dialog`, `file-input`, `data-chart`
- [ ] Cada entrada declara **"ausente em 2.0.1"** e é conferível contra a export line dos dois entry points
- [ ] `alert-dialog` registra explicitamente a divergência: anunciado em `docs/design-system.md` da lib e com `@radix-ui/react-alert-dialog` em `dependencies`, mas ausente da export line
- [ ] Todo `// sv-gap: <slug>` presente em `src/` tem seção correspondente, e vice-versa — verificado pelo próprio script de T3
- [ ] Gate: `npm run typecheck && npm run lint && npm test` + `bash scripts/check-sv-adoption.sh`

**Tests**: none (documentação)
**Gate**: full + adoption
**Commit**: `docs: lacunas do catálogo @still-void/ui para backlog da lib`

---

### T30: Fechamento — E2E, decisões de projeto e handoff

**What**: Prova de fim a fim e registro das convenções novas.
**Where**: `.specs/STATE.md`, `.specs/features/still-void-v2-migration/spec.md` (coluna Status), `README.md`
**Depends on**: T29
**Requirement**: SV2-01..13 (fechamento de rastreabilidade)

**Done when**:
- [ ] `npm run test:e2e` verde — 17 specs, sem spec novo e sem spec pulado. **Exceção assumida em T30**:
      fechou com 60/64, as 4 falhas medidas como pré-existentes contra o baseline `d917d72` (ver
      `validation.md`). Exceção encerrada em 2026-08-22 pela feature `e2e-consentimento-verdes`: 64/64.
- [ ] `AD-005` (convenção `// sv-gap:`) e `AD-006` (todo utilitário de cor resolve para um `--sv-*`) anexados a `.specs/STATE.md` `## Decisions`
- [ ] Handoff de `.specs/STATE.md` atualizado
- [ ] Tabela de rastreabilidade da spec com todos os 13 IDs em `Verified`
- [ ] Gate: `npm run typecheck && npm run lint && npm run build && npm test && npm run test:e2e && bash scripts/check-sv-adoption.sh`

**Tests**: e2e
**Gate**: build + e2e + adoption
**Commit**: `chore(specs): fecha a migração para @still-void/ui v2`

---

## Task Granularity Check

| Task | Escopo | Status |
| --- | --- | --- |
| T1 | 1 manifesto + 5 linhas de import | ✅ |
| T2 | 1 arquivo (`globals.css`) | ✅ |
| T3 | 1 script | ✅ |
| T4, T6, T7 | 1 componente cada | ✅ |
| T5 | 1 componente (reescrita de miolo) | ✅ |
| T8 | 2 componentes coesos (ambos "moldura da marca/documento") | ⚠️ OK — coesos, 1 arquivo de teste tocado |
| T9 | 4 arquivos de shell, sem lógica | ⚠️ OK — coesos, verificados pelo build |
| T10–T13 | 1–2 arquivos por unidade testável | ✅ |
| T14, T16, T17, T21, T23 | 1 página cada | ✅ |
| T15 | 4 arquivos, mas **1** arquivo de teste (`staff-agenda.test.tsx`) e um único fluxo | ⚠️ OK — dividir quebraria o gate |
| T18–T20, T22, T24–T26 | 2 arquivos coesos, 1 fluxo | ⚠️ OK |
| T27 | 5 arquivos de documento, sem lógica | ⚠️ OK — mesmo molde, mesma verificação |
| T28–T30 | 1 arquivo / 1 doc / 1 fechamento | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | raiz da fase 1 | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4, T6, T7, T8 | T3 | T3 → {T4,T6,T7,T8} `[P]` | ✅ |
| T5 | T3 | T3 → T5 | ✅ |
| T9–T13 | T5 | T5 → {T9..T13} `[P]` | ✅ |
| T14–T17 | T5 | T5 → {T14..T17} `[P]` | ✅ |
| T18–T22 | T5 | T5 → {T18..T22} `[P]` | ✅ |
| T23–T26 | T5 | T5 → {T23..T26} `[P]` | ✅ |
| T27 | T26 | T27 raiz da fase 7 | ✅ |
| T28 | T27 | T27 → T28 | ✅ |
| T29 | T28 | T28 → T29 | ✅ |
| T30 | T29 | T29 → T30 | ✅ |

> Todas as tasks `[P]` da mesma fase tocam arquivos-fonte disjuntos. **T10, T11 e T12 escrevem no mesmo arquivo de teste** (`tests/pages/portal.test.tsx`), e **T19, T20** também (`staff-operations.test.tsx`), assim como **T23–T26** (`staff-paciente-detail.test.tsx`): `[P]` aqui significa *ordem livre*, não escrita simultânea. Dentro de uma fase, um único worker as executa em sequência — sem conflito de escrita.

## Test Co-location Validation

| Task | Camada tocada | Matriz exige | Task declara | Status |
| --- | --- | --- | --- | --- |
| T1 | Manifesto | none (build gate) | none | ✅ |
| T2 | Tema/CSS | none (build gate) | none | ✅ |
| T3 | Script de gate | none (auto-verificável) | none | ✅ |
| T4–T8 | Wrapper de UI | unit | unit | ✅ |
| T9 | Shell/layout — excluído da cobertura (`vitest.config.ts:76`) | none | none | ✅ |
| T10–T26 | Página/seção | unit | unit | ✅ |
| T27 | `documentos/**` — excluído da cobertura (`vitest.config.ts:80`) | none | none | ✅ |
| T28 | Tema/CSS | none (build gate) | none | ✅ |
| T29 | Documentação | none | none | ✅ |
| T30 | Fluxo E2E | e2e | e2e | ✅ |

> **Sem deferimento de teste.** As duas tasks com `Tests: none` que tocam `.tsx` (T9, T27) o fazem por exclusão de cobertura **pré-existente** no `vitest.config.ts`, não por decisão desta feature; ambas são cobertas por E2E em T30 e pelo `build` no gate da própria task.
