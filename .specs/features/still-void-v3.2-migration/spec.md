# Migração `@still-void/ui` 3.1.0 → 3.2.0 — Specification

## Problem Statement

A `3.2.0` do `@still-void/ui` (publicada 2026-08-26, `CHANGELOG.md` do pacote)
fecha, em um único release, as 6 lacunas abertas em `docs/still-void-gaps.md`
contra a `3.1.0`: `pagination`, `progress`, `separator`, `data-chart`,
`icon-set-gaps` e `dialog-close-label`. O EstomaSysTech tem workaround local
marcado (`sv-gap: <slug>`) para 4 delas; as outras 2 (`progress`,
`dialog-close-label`) são `sv-gap-doc-only` — necessidade real já coberta por
outro workaround, ou configuração já adaptada sem marcação própria.
Atualizar a dependência sem portar os call sites deixa a dívida documentada
"tecnicamente fechada pela lib" mas presente no código — o próprio cenário que
AD-005 existe para impedir.

## Goals

- [ ] `@still-void/ui` atualizado para `3.2.0` em `package.json`/lockfile/`node_modules`.
- [ ] Cada um dos 6 slugs de `docs/still-void-gaps.md` fechado: código migrado
      para o artefato correspondente da lib (quando há call site) ou nota de
      resolução (quando é `doc-only`), seção removida do corpo ativo do doc e
      arquivada em histórico.
- [ ] `npm run check:sv` (checagem 7 — par código/doc) permanece verde: nenhum
      `sv-gap: pagination|separator|data-chart|icon-set-gaps` sobra no código
      sem seção correspondente, e nenhuma seção ativa sobra sem marcação.
- [ ] Gate completo (`typecheck`, `build`, `test`, `test:e2e`, `check:sv`) verde
      no fim da migração.

## Out of Scope

Fronteira herdada de AD-014 (port, não redesign) e reafirmada aqui porque a
3.2.0 abre espaço para excesso de escopo:

| Feature | Reason |
| --- | --- |
| Paginação numerada (índice de página, total de páginas) em faturamento/pacientes/auditoria | Os 3 call sites de `LoadMoreButton` usam cursor (`hasMore`/`loadMore`), sem contagem de páginas no backend. Adotar `Pagination` é troca de markup por trás do mesmo comportamento "carregar mais"; UI de índice numerado é feature de produto nova, decisão do usuário (AD-003/AD-014) |
| `Progress` como componente novo em UI que hoje não tem barra de progresso | O único "call site" de `progress` no gaps.md é `doc-only`, subsumido por `data-chart` — não há um segundo workaround próprio para portar. Introduzir `Progress` nos scores PUSH/DET do `HealingChart` sem um call site marcado seria adotar um padrão que o app não tinha (fora da fronteira AD-014) |
| Grid (`ChartGrid`) ou eixos com ticks múltiplos no `HealingChart` | O gráfico atual não tem linhas de grade nem eixo com múltiplos ticks — só uma linha de base e dois rótulos de data nas extremidades. Adicionar grade é mudança visual nova, não port do que existe |
| Qualquer padrão da lib que o app não usa hoje (`Tabs`, `Tooltip`, `DropdownMenu`, `AlertDialog`, `Badge`, `ThemeToggle`) | Reafirmação direta de AD-014 |
| Paridade pixel-a-pixel de todo elemento do `HealingChart` (marcadores de ponto, rótulos de série) | A lib não expõe primitivo de marcador de dado nem de legenda livre — o próprio `CHANGELOG.md` da 3.2.0 diz que mapear valor de domínio para pixel "stays application logic". Círculos de dado e textos de série (`áreaMax mm²`, `dor /10`, datas min/max) continuam desenhados à mão |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| `LoadMoreButton` vira `Pagination > PaginationContent > PaginationItem > PaginationNext label="Carregar mais" onClick={onClick}` | Sim, sem `href` (renderiza `<button>`) | `PaginationNext` aceita `label` que define tanto o `aria-label` quanto o texto visível — reproduz o texto atual e ganha `<nav aria-label="pagination">` semântico. Confirmado lendo `dist/react/index.js` (accessible name = `aria-label`, então `getByRole("button", {name:"Carregar mais"})` sobrevive sem mudança) | y |
| `HealingChart`: `ChartContainer` substitui o `<svg>` manual; `ChartLine` substitui as 3 `<polyline>`; `ChartAxis` (ticks vazio) substitui a `<line>` de base. Círculos de dado e todo `<text>` continuam manuais, filhos diretos de `ChartContainer` | Port parcial — só o que a lib cobre | Confirmado no `dist/react/index.js`: `ChartContainer` sempre define `role="img"` e espalha `...props` (então `aria-label` passado sobrevive); `ChartLine`/`ChartAxis` não têm equivalente para marcador de ponto nem `strokeDasharray` na série de dor — a série de dor precisa de uma classe CSS própria (`healing-chart__pain-line`) para repor `stroke-width:1.5;stroke-dasharray:4 3` via CSS (presentation attributes SVG perdem para CSS de maior especificidade) | y |
| `login/page.tsx`: `Separator decorative={false}` substitui os dois `<span className="h-px flex-1 ...">`; o texto "ou" continua como nó de texto irmão fora do `Separator` (não vira `aria-label` dele) | Sim | Preserva `getByText("ou")` nos 3 testes de `tests/pages/login.test.tsx` sem mudança; `decorative={false}` expõe `role="separator"`, correto porque o divisor carrega significado real (dois métodos de login distintos) | y |
| Ícones: `📷`/`⛔`/`⏳` viram `<Icon name="camera"|"blocked"|"pending" />` **sem** prop `label` (decorativo) | Sim | Todo `<Icon>` do app hoje ao lado de texto que já anuncia o significado é decorativo (`alert-triangle` em 3 call sites existentes, `chevron-*`) — mesmo padrão aqui, texto adjacente ("Fotos de pacientes aguardando triagem", "lote vencido", "lotes vencem") já é auto-suficiente. Preserva as 4 asserções de teste por regex parcial sem o emoji | y |
| `Modal`: `showCloseButton` volta ao default (`true`) + `closeLabel="Fechar"`; `DialogClose`/`Icon` manuais são removidos | Sim | Fecha `dialog-close-label` como o pacote pretendia; AD-015 é superseded por uma nova decisão registrada em `.specs/STATE.md` | y |
| Nome acessível do botão nativo de fechar vem de um `<span className="sv-sr-only">{closeLabel}</span>` filho, não de `aria-label` | Consequência técnica, não decisão | Confirmado lendo `dist/react/client/index.js` — `getByLabelText("Fechar")` (que só resolve `aria-label`/`<label>`) para de casar; os 17 usos em 8 arquivos de teste (`tests/components/modal.test.tsx` e os 7 arquivos `tests/pages/staff-*.test.tsx`) precisam virar `getByRole("button", { name: "Fechar" })` / `getAllByRole` | y |
| Seções fechadas de `docs/still-void-gaps.md` são removidas do corpo com cabeçalho `### \`slug\`` (que o gate `check:sv` lê) e arquivadas numa seção de histórico com cabeçalho `#### slug` (fora do regex do gate) | Sim, análogo ao padrão já usado em `docs/backlog-design-system.md` (blockquote "RESOLVIDO") | `scripts/check-sv-adoption.sh` casa literalmente `^### \`slug\`` para extrair `doc_slugs`; manter o cabeçalho de nível 3 depois de remover a marcação do código quebraria a checagem 7 (doc sem código). `backlog-design-system.md` não é lido pelo gate, então seu padrão de blockquote inline não se aplica ao arquivo certo aqui — a forma tem que evitar o regex, não só adicionar uma nota | y |

**Open questions:** nenhuma — todas resolvidas acima.

---

## User Stories

### P1: Fechar as 4 lacunas com call site marcado ⭐ MVP

**User Story**: Como time do EstomaSysTech, quero que `pagination`, `separator`,
`data-chart` e `icon-set-gaps` usem os artefatos da `3.2.0` no lugar dos
workarounds locais, para que a dívida documentada em `docs/still-void-gaps.md`
deixe de existir no código.

**Why P1**: são as 4 lacunas com `sv-gap: <slug>` real no código — é o núcleo
do pedido ("adaptar o sistema para usar os artefatos já adaptados").

**Acceptance Criteria**:

1. WHEN `src/components/load-more-button.tsx` renderiza com `visible=true` THEN o DOM SHALL conter um `<nav aria-label="pagination">` contendo um botão com nome acessível "Carregar mais" que, ao clique, chama `onClick`
2. WHEN `src/app/login/page.tsx` renderiza com `providers.google && providers.password` THEN o DOM SHALL conter um elemento com `role="separator"` entre os dois métodos de login, e o texto "ou" SHALL continuar presente e recuperável por `getByText("ou")`
3. WHEN `HealingChart` renderiza com dados suficientes (≥2 pontos medidos) THEN o SVG raiz SHALL manter `role="img"` e `aria-label="Gráfico de evolução da condição"`, as 3 séries (área/score/dor) SHALL renderizar via `ChartLine`, e a linha de base SHALL renderizar via `ChartAxis`
4. WHEN `src/app/(staff)/page.tsx` renderiza a fila de triagem THEN o glifo `📷` SHALL ser substituído por `<Icon name="camera" />` mantendo o texto "Fotos de pacientes aguardando triagem (N)" inalterado
5. WHEN `src/app/(staff)/materiais/page.tsx` renderiza o banner de validade THEN os glifos `⛔`/`⏳` SHALL ser substituídos por `<Icon name="blocked" />`/`<Icon name="pending" />` mantendo os textos "lote(s) vencido(s)"/"lote(s) vence(m)" inalterados
6. WHEN `npm run check:sv` roda após a migração THEN a checagem `[7]` (par código/doc) SHALL reportar 0 achados

**Independent Test**: rodar `npm test -- load-more-button healing-chart` e `npm test -- login staff-dashboard staff-materiais` com as suítes atualizadas; `npm run check:sv` verde.

---

### P1: Fechar `dialog-close-label` e `progress` (doc-only) ⭐ MVP

**User Story**: Como time do EstomaSysTech, quero que o `Modal` use `closeLabel`
nativo em vez do botão de fechar próprio, para eliminar o workaround que
existia só por causa do nome acessível hardcoded em inglês.

**Why P1**: fecha a última lacuna de acessibilidade pt-BR pendente na família
`Dialog`; `progress` fecha junto por ser subsumida em `data-chart` (nenhuma
ação de código própria, só nota no doc).

**Acceptance Criteria**:

1. WHEN `Modal` renderiza THEN `DialogContent` SHALL receber `closeLabel="Fechar"` e NÃO SHALL receber `showCloseButton={false}`; o `DialogClose`/`Icon` manuais SHALL ser removidos de `src/components/modal.tsx`
2. WHEN qualquer teste consulta o botão de fechar do `Modal` THEN a consulta SHALL usar `getByRole("button", { name: "Fechar" })` (ou `getAllByRole` / dentro de `waitFor`), não `getByLabelText("Fechar")`
3. WHEN `docs/still-void-gaps.md` é atualizado THEN as seções `dialog-close-label` e `progress` SHALL sair do corpo ativo (sem `### \`slug\`` restante) e SHALL constar no histórico de lacunas fechadas
4. WHEN `.specs/STATE.md` é atualizado THEN uma nova entrada de decisão SHALL registrar que AD-015 foi superseded e por quê

**Independent Test**: `npm test -- modal` e os 7 arquivos `tests/pages/staff-*.test.tsx` que tocam `Modal` passam; `grep -rn 'getByLabelText("Fechar")' tests` retorna vazio.

---

## Edge Cases

- WHEN `LoadMoreButton` recebe `visible=false` THEN o componente SHALL continuar retornando `null` (comportamento inalterado, já coberto por teste existente)
- WHEN a série de dor (`painSeries`) do `HealingChart` tem pontos suficientes THEN a linha SHALL continuar tracejada (`stroke-dasharray: 4 3`) e mais fina (`stroke-width: 1.5`) que as outras duas séries, via classe CSS própria — `ChartLine` não expõe essas props
- WHEN nenhuma seção de `docs/still-void-gaps.md` permanece aberta THEN o cabeçalho do documento SHALL refletir "Status: Fechado" em vez de "Aberto", sem apagar o histórico

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SV32-01 | P1: 4 lacunas com call site | T2 | Implemented |
| SV32-02 | P1: 4 lacunas com call site | T3 | Implemented |
| SV32-03 | P1: 4 lacunas com call site | T5 | Implemented |
| SV32-04 | P1: 4 lacunas com call site | T4 | Implemented |
| SV32-05 | P1: 4 lacunas com call site | T4 | Implemented |
| SV32-06 | P1: 4 lacunas com call site | T8 | Implemented |
| SV32-07 | P1: dialog-close-label/progress | T6+T7 | Implemented |
| SV32-08 | P1: dialog-close-label/progress | T7 | Implemented |
| SV32-09 | P1: dialog-close-label/progress | T8 | Implemented |
| SV32-10 | P1: dialog-close-label/progress | T9 | Implemented |
| SV32-11 | Goals: versão da dependência | T1 | Implemented |
| SV32-12 | Goals: gate completo | T10 | Implemented |

**ID format:** `SV32-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, 12 mapeados, 0 unmapped. Gate completo (T10) verde: `typecheck`/`build`/`test` (1817/1817)/`check:sv` (0 achados). Status final ("Verified" por item) aguarda o veredito do Verifier independente — ver `validation.md`.

---

## Success Criteria

- [ ] `package.json` aponta `^3.2.0`; `node_modules/@still-void/ui/package.json` resolve `3.2.0`
- [ ] `docs/still-void-gaps.md` sem seções ativas (`### \`slug\``) — as 6 arquivadas em histórico
- [ ] `npm run typecheck && npm run build && npm test && npm run test:e2e && npm run check:sv` todos verdes
- [ ] Zero ocorrência de `sv-gap: pagination|separator|data-chart|icon-set-gaps` no código
