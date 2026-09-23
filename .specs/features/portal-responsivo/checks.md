# Portal responsivo em viewport mobile - checks

Profile: light
Source: [issue #127](https://github.com/KalleoPinheiro/vitta-flow/issues/127)

## Intent

O portal (`/portal`) é a única superfície do app voltada a paciente e parceiro, e provavelmente é
aberto no celular, mas nenhum spec o abre em viewport estreita. A medição em 375/390 px mostra
que o layout não transborda, porém quase todo controle fica abaixo de 44 px de alvo de toque: o
`Button size="sm"` da `@still-void/ui@3.3.1` mede 36 px, o default 40 px, o `Input` 40 px (32 px
no campo de observação da foto, que força `h-8`) e o link da marca no `Header` ~24 px.

Correção: uma única regra CSS em `src/app/globals.css`, escopada à classe `portal-shell` que o
`src/app/portal/layout.tsx` passa a pôr em volta de `Header` + `Layout`, ativa só em
`(width < 40rem), (pointer: coarse)`. Ela dá `min-height`/`min-width` de
`calc(var(--sv-space-10) + var(--sv-space-1))` (= 44 px, a mesma conta do `.sv-btn--lg` da lib)
a `.sv-btn`, `.sv-field` e `a[href]`. É workaround de ausência na lib (não há tamanho de toque
em `Button`/`Input`), então leva `sv-gap: touch-target-size` e seção em
`docs/still-void-gaps.md` (AD-005). Desktop com mouse não muda. Spec novo
`e2e/portal-responsivo.spec.ts` prova os critérios 1-3 da issue.

Achado durante o build (C1 falhou antes da correção): a visão do paciente **transborda** — em
390 px a página tinha `scrollWidth` 535. Causa: `.sv-layout` usa `grid-template-columns: 1fr`
(= `minmax(auto, 1fr)`), e a coluna cresce até o min-content do conteúdo. Corrigido na mesma
regra escopada com `minmax(0, 1fr)`, marcado `sv-gap: layout-grid-min-content`.

Decisões tomadas aqui (reversíveis, revistas no diff):

- Regra CSS escopada em vez de `className="min-h-11"` em cada um dos ~20 call sites: um ponto
  só, token `--sv-*` (critério 4), e cobre controles novos do portal sem lembrar de marcá-los.
- Diálogo de confirmação (`ConfirmAction`, renderizado em portal fora de `.portal-shell` e
  compartilhado com a equipe) fica **fora**: a issue lista as telas, não os modais, e mexer no
  modal muda telas de staff. Registrado como pergunta aberta no PR.
- `SessionExpired` e a visão "equipe logada no portal" não estão na lista da issue; ficam fora.

## Checks

### S1 - Portal mobile · 5 files · ~40 KB · ~10k

**C1** - Em 390x844 e 375x667, o portal do **paciente** (consentimento pendente, próxima consulta
com Confirmar/Remarcar/Cancelar, retorno recomendado, lista de espera, evolução com gráfico,
histórico, faturas) tem `document.documentElement.scrollWidth <= largura + 2` (issue AC 1, 2)
Proof: `npx playwright test e2e/portal-responsivo.spec.ts -g "paciente"`

**C2** - O mesmo vale com os painéis abertos: Remarcar (campo de data + horários), Cancelar
consulta (motivo), Agendar retorno (procedimento + dia) e, após aceitar o termo, envio de foto
com prévia (Enviar/Cancelar) e Revogar consentimento (issue AC 1, 2)
Proof: `npx playwright test e2e/portal-responsivo.spec.ts -g "paciente"`

**C3** - Em 390x844 e 375x667, o portal do **parceiro**, recolhido e com o paciente indicado
expandido (consultas + evolução), tem `scrollWidth <= largura + 2` (issue AC 1, 2)
Proof: `npx playwright test e2e/portal-responsivo.spec.ts -g "parceiro"`

**C4** - Em cada estado de C1-C3, todo `button`, `a[href]`, `input`, `select` e `textarea`
visível na página tem caixa >= 44x44 px, e o spec falha nomeando o controle que não tem (issue AC 3)
Proof: `npx playwright test e2e/portal-responsivo.spec.ts`

**C5** - Em viewport desktop (1280x720, ponteiro fino) o `Button size="sm"` do portal mantém
36 px de altura - a regra não vaza para o desktop (issue AC 5)
Proof: `npx playwright test e2e/portal-responsivo.spec.ts -g "desktop"`

**C6** - Specs existentes do portal seguem verdes (issue AC 5)
Proof: `npx playwright test e2e/portal-paciente.spec.ts e2e/portal-parceiro.spec.ts`

**C7** - A correção não usa elemento cru nem cor crua, e o marcador `sv-gap: touch-target-size`
tem seção correspondente em `docs/still-void-gaps.md` (issue AC 4)
Proof: `npm run check:sv && npm run check:docs`

**C8** - Gates do projeto verdes (issue AC 6)
Proof: `npm run typecheck && npm run lint && npm run test:coverage`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| viewports (2) | 390x844 C1 C3 C4 · 375x667 C1 C3 C4 | - |
| papéis do portal (2) | paciente C1 C2 · parceiro C3 | - |
| telas da issue (6) | progresso da condição C1 C3 · consentimento C1 C2 · agendar retorno C1 C2 · alterar consulta C1 C2 · lista de espera C1 · visão do parceiro C3 | - |
| tipos de controle (5) | button C4 · a[href] C4 · input C4 · select C4 · textarea C4 | - |

- Claims naming a viewport or pixel value: C1-C5 - each proof sets the viewport and measures in a real browser

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| CSS de layout e marcação | one at the boundary (browser real, E2E) | cada tela e estado listados, nos 2 viewports |

Evidence:

- `src/app/globals.css`: regra de apresentação, sem ramo de lógica -> só é observável renderizada
- closest analogue in the repo: `e2e/responsive-tables.spec.ts`, mesma medida de `scrollWidth` e de alvo de toque

## Swept

- validation: n/a - nenhuma entrada nova; os formulários existentes não mudam
- failure modes: n/a - só apresentação; nenhum caminho de erro novo
- idempotency: n/a - sem escrita nova
- authorization: existing - sessão paciente/parceiro via cookie assinado, POR-RN-01/02
- concurrency: n/a - sem estado compartilhado novo
- data lifecycle: n/a - nenhum dado persistido novo
- dependency failure: n/a - nenhuma dependência nova
- state transitions: C2 - painéis abertos e consentimento aceito são medidos também
- observability: n/a - mudança só de apresentação

## Handoff

- S1 = ~10k (5 arquivos, ~40 KB / 4), bem abaixo de 150k - um builder
