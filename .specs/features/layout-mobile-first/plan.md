# Layout mobile-first de todas as páginas

Sources:

- conversa (2026-09-23) - pedido do usuário: usar a skill `impeccable` para melhorar o layout de todas as páginas atuais, mobile first, só com componentes do `@still-void/ui`, melhorando a lib quando preciso, testando no navegador, **sem alterar cores**
- conversa (2026-09-23, respostas do usuário) - melhorias da lib saem numa **release minor do `@still-void/ui`** (não como workaround `sv-gap` no app); agenda no celular = **mês compacto + lista do dia**
- screenshots de antes (`e2e/zz-shots.spec.ts`, temporário) - 23 telas × 390x844 e 1440x900, capturadas em `main` @ `46026ba`; é daqui que saem os defeitos do Problem
- `docs/still-void-gaps.md` § Lacunas abertas - `layout-grid-min-content` e `touch-target-size`, hoje contornados só no portal
- skill `impeccable` 4.1.1 - modo **Operate** (app em tarefa), comandos `adapt` → `layout` → `polish`; refinamento preserva o mundo visual existente (cores, tipografia, bordas, `sv-gradient-border`)

## Problem

O VittaFlow foi montado para desktop e só o portal foi conferido no celular. Nas telas da equipe
e nas telas públicas, em 390px de largura, hoje:

- **Tabelas escondem colunas.** Pacientes, faturamento, parceiros, profissionais, procedimentos,
  materiais, auditoria, repasses, relatórios e contas da equipe rolam de lado dentro do card: em
  390px a coluna **Ações** e a **Situação** ficam fora da tela, e o nome do paciente quebra em três
  linhas. Quem usa o celular não vê o botão que precisa.
- **A agenda mensal corta 4 dos 7 dias** e o filtro de profissional fica fora da tela.
- **Cards encolhem até o conteúdo.** A anamnese no prontuário ocupa ~250px numa área de 1150px no
  desktop e o card de triagem vazio ocupa 270 de 340px no celular.
- **As abas do prontuário estouram a largura**: "Evoluções (SOAP)", "Plano de Cuidados" e
  "Pacotes" ficam fora da tela, sem indicação de que existem.
- **Linhas de lista esmagam o texto principal**: em "Retornos pendentes" o nome da paciente vira
  "M" e o motivo vira "R." porque as três ações disputam a mesma linha.
- **O card de login fica encostado na borda esquerda** (x=3px) em 390px.
- **No portal**, o botão "Confirmar presença" sobrepõe a data da consulta, o aviso de emergência
  mostra dois ícones, e o "Olá, Maria!" usa o tamanho de display da lib, empurrando o conteúdo
  útil para baixo da primeira dobra.
- **Cada página monta o próprio cabeçalho** (19 `<h1>` com classes repetidas à mão): o botão de
  ação às vezes fica ao lado, às vezes abaixo, e o espaçamento muda de tela para tela.

Parte disso é da lib: `.sv-layout` usa `1fr` (cresce até o conteúdo), `.sv-btn`/`.sv-field` medem
36-40px (abaixo dos 44px de toque) e a `Table` não tem forma empilhada para tela estreita. O app
contorna os dois primeiros só no portal (`sv-gap`); o terceiro não tem solução em lugar nenhum.

Não há métrica de uso por dispositivo no repositório; a fonte não dá números. A evidência é a
dos screenshots.

Quando isto sair: toda tela funciona numa mão, em 390px, sem rolar de lado e sem ação escondida;
no desktop, as telas ganham cabeçalho e espaçamento consistentes, sem mudar nenhuma cor.

## Out of scope

| Excluded | Why |
| --- | --- |
| Mudar cores, tokens de cor ou o accent | pedido explícito do usuário; AD-006 |
| Redesenho visual (novo mundo, nova tipografia, novas fontes) | é refinamento: a skill `impeccable` exige preservar o mundo incumbente |
| Tema escuro | `data-theme="light"` fixo é decisão anterior (fora de escopo desde a #127) |
| Layout de impressão dos documentos (A4) | é o artefato clínico-legal; só a visão de tela em 390px entra |
| Nova navegação (bottom nav, command palette) | muda arquitetura de informação; o drawer atual da lib já resolve o mobile |
| Novas funcionalidades, cópia nova ou mudança de fluxo | refinamento preserva comportamento e texto |
| Diálogos de confirmação (`ConfirmAction`) com 44px só no portal | passa a valer em todo o app pela regra da lib (S1), sem tratamento especial |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde entram as melhorias da lib | release minor do `@still-void/ui` (3.4.0), o app sobe para ela e remove os `sv-gap` do portal | resposta do usuário | y |
| Agenda no celular | grade de 7 colunas compacta + lista das consultas do dia escolhido abaixo | resposta do usuário | y |
| Profile de verificação | `ui` | a feature é só tela; `light` não compara arranjo por tela | n |
| Breakpoint mobile-first | base = celular; `sm` = 40rem (640px) para empilhar/desempilhar; `lg` = 64rem para o rail da sidebar (já é o da lib) | três pontos bastam (skill `adapt`); 40rem é o mesmo corte que o portal já usa | n |
| Tabelas no celular | abaixo de 40rem cada linha vira um bloco com rótulo + valor por célula e as ações numa linha própria; acima, a tabela atual | preserva a mesma informação e ordem; a skill `adapt` recomenda exatamente isso | n |
| Alvo de toque em todo o app | a regra `(width < 40rem), (pointer: coarse)` sai do portal e vai para `.sv-btn`/`.sv-field` na lib; links de texto em `main` ganham a mesma altura no app | uma regra só, em vez de duas | n |
| Abas do prontuário | trocar as abas feitas à mão pelo `Tabs` da lib, com a lista rolando dentro de si no celular | a lib já tem o componente; AD-014 classifica adotar padrão novo como feature, e esta é uma | n |
| Cabeçalho de página | componente de app `PageHeader` (título, contexto opcional, ações) usado nas 19 telas | hoje são 19 cópias divergentes; é composição de primitivos da lib, não um primitivo novo | n |
| Tamanho do título de saudação do portal | cai para o degrau `headline` da lib abaixo de 40rem | o `display` foi pensado para página editorial; no celular empurra o conteúdo | n |
| Cor de estado nos KPIs | inalterada | pedido explícito | y |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | blocks go-live | Publicar o `@still-void/ui@3.4.0` no npm (merge do PR da lib + merge do PR de release do Changesets) precisa do seu ok para cada passo | o app não pode subir a dependência nem remover os `sv-gap`; S2–S5 ficam num PR que só fecha depois da publicação |
| 2 | open | Profile `ui` em vez do `light` padrão | a verificação roda em `ui`; se preferir `light`, a comparação por tela vira amostragem |

## Criteria

### S1: lib `@still-void/ui` 3.4.0 cobre layout estreito, toque e tabela empilhada (P1)

**Acceptance Criteria**

1. The `.sv-layout` class SHALL declare `grid-template-columns: minmax(0, 1fr)`.
2. WHILE `(width < 40rem), (pointer: coarse)` matches the `.sv-btn` of every size and the `.sv-field` SHALL render with `min-height` equal to `calc(var(--sv-space-10) + var(--sv-space-1))` (44px).
3. WHERE the `Table` receives the `stack` prop WHILE the viewport is narrower than 40rem the table SHALL render each body row as a block in which every cell shows its `label` text before its value, with the head row hidden from view and kept for assistive technology.
4. WHERE the `Table` receives the `stack` prop WHILE the viewport is 40rem or wider the table SHALL render as the current table, with the head row visible.
5. The release SHALL ship as a `minor` changeset and SHALL NOT change the value of any `--sv-*` color custom property.

**Independent test:** Storybook/testes da lib com a `Table stack` em 390 e 1024px; `npm run lint:package` verde.

### S2: casca e padrões compartilhados do app (P1)

**Acceptance Criteria**

6. The system SHALL render every page in the page set (see Observable) with `document.documentElement.scrollWidth` at most the viewport width + 2 at 390x844 and at 1440x900.
7. WHILE the viewport is 390x844 every visible `button`, `a[href]`, `input`, `select` and `textarea` inside `main` on every page in the page set SHALL have a bounding box of at least 44x44px.
8. The system SHALL render the title of every staff page through one `PageHeader`, with exactly one `h1` per page.
9. WHILE the viewport is narrower than 40rem the `PageHeader` actions SHALL render below the title (actions top >= `h1` bottom) and inside the viewport.
10. The sidebar identity SHALL render the account e-mail on a single line, truncated with an ellipsis, with the full e-mail in the `title` attribute.
11. WHILE the viewport is narrower than 40rem the KPI groups on Dashboard, Faturamento and Relatórios SHALL render in 2 columns.
12. The back link on the patient detail SHALL render its icon and its label on the same line (icon and label vertical centers within 4px).
13. The system SHALL NOT change any color: the `@theme` color bridge in `src/app/globals.css` and every `text-*`/`bg-*`/`border-*` color utility in `src/**/*.tsx` SHALL resolve to the same `--sv-*` token as on `main` @ `46026ba`.

**Independent test:** abrir `/pacientes` e `/` em 390px: cabeçalho com botão abaixo do título, KPIs 2x2, nenhum scroll lateral.

### S3: tabelas empilhadas no celular (P1)

**Acceptance Criteria**

14. WHILE the viewport is narrower than 40rem every table in the table set (see Observable) SHALL render stacked, with every column label visible and the row actions visible without horizontal scroll.
15. WHILE the viewport is 1440x900 every table in the table set SHALL render with its head row visible and one row per record.
16. IF a table in the table set has no rows THEN the system SHALL show the existing empty-state message, unchanged, at both viewports.

**Independent test:** `/pacientes` em 390px: um bloco por paciente com Nome, Contato, Nascimento, Situação e as ações "Prontuário · Editar · Desativar" visíveis.

### S4: telas com defeito específico (P2)

**Acceptance Criteria**

17. WHILE the viewport is 390x844 the Agenda month grid SHALL show all 7 weekday columns inside the viewport, each day cell at least 44x44px.
18. WHILE the viewport is 390x844 the Agenda SHALL mark each day that has an appointment with a dot and SHALL NOT render appointment chips inside the cells.
19. WHEN the user selects a day in the Agenda at 390x844 THEN the system SHALL list that day's appointments below the grid with time, patient, procedure and status, and SHALL select today on first load.
20. IF the selected day has no appointments THEN the Agenda at 390x844 SHALL show "Nenhuma consulta neste dia." below the grid.
21. WHILE the viewport is 390x844 the Agenda professional filter SHALL render at full content width below the month navigation.
22. WHILE the viewport is 1440x900 the Agenda SHALL render the current month grid with appointment chips inside the cells.
23. WHILE the viewport is 390x844 the patient detail tab list SHALL scroll horizontally inside itself, keep the active tab fully visible, and not widen the page.
24. The patient detail tab panels and the Triagem empty state SHALL fill the content column width (panel width equal to the `main` content width within 2px) at both viewports.
25. WHILE the viewport is 390x844 each "Retornos pendentes" row on the Dashboard SHALL show the full patient name and reason, with its actions on a separate line.
26. WHILE the viewport is 390x844 the Login, Esqueci minha senha and Definir senha cards SHALL keep at least 16px from each side of the viewport.
27. WHILE the viewport is 390x844 the portal appointment row SHALL render "Confirmar presença" without overlapping the appointment date (bounding boxes disjoint).
28. The portal emergency notice SHALL render exactly one icon.
29. WHILE the viewport is narrower than 40rem the portal greeting `h1` SHALL use the lib `headline` size step.
30. WHILE the viewport is 390x844 each document page SHALL keep its tables inside a horizontal scroll container and the page itself without horizontal scroll.

**Independent test:** agenda em 390px: grade 7 colunas, tocar num dia com ponto lista as consultas dele.

## Traceability

| ID | Slice | Criteria | Status |
| --- | --- | --- | --- |
| LAYOUT-01 | S1 | 1, 2 | Pending |
| LAYOUT-02 | S1 | 3, 4 | Pending |
| LAYOUT-03 | S1 | 5 | Pending |
| LAYOUT-04 | S2 | 6, 7 | Pending |
| LAYOUT-05 | S2 | 8, 9 | Pending |
| LAYOUT-06 | S2 | 10, 11, 12 | Pending |
| LAYOUT-07 | S2 | 13 | Pending |
| LAYOUT-08 | S3 | 14, 15, 16 | Pending |
| LAYOUT-09 | S4 | 17, 18, 19, 20, 21, 22 | Pending |
| LAYOUT-10 | S4 | 23, 24, 25 | Pending |
| LAYOUT-11 | S4 | 26, 27, 28, 29, 30 | Pending |

## Observable

Page set (23): `/`, `/agenda`, `/triagem`, `/pacientes`, `/pacientes/[id]`, `/parceiros`,
`/profissionais`, `/procedimentos`, `/materiais`, `/faturamento`, `/repasses`, `/relatorios`,
`/auditoria`, `/configuracoes`, `/login`, `/esqueci-senha`, `/definir-senha`, `/portal` (paciente),
`/portal` (parceiro), `/documentos/atestado`, `/documentos/consentimento`, `/documentos/relatorio`,
`/documentos/plano-cuidados`. `/documentos/recibo` e `/documentos/repasse` compartilham o
`DocumentFrame` e entram pelo AC 30.

Table set (13): pacientes, parceiros, profissionais, procedimentos, materiais, faturamento,
auditoria, relatórios (produção por profissional), repasses (tabelas de repasse), configurações
(contas da equipe), configurações (feriados e ausências), prontuário (estomias e feridas),
relatórios (receita por procedimento).

| Surface | Decision | Landing |
| --- | --- | --- |
| screens (page set) | empty state | existing - cada tela já tem o seu; AC 16 e AC 20 garantem que não some no layout novo |
| screens (page set) | loading state | existing - `CardSkeleton`/`Skeleton` da lib; o layout novo não muda o componente |
| screens (page set) | error state | existing - `ErrorAlert`/toast; fora da mudança |
| screens (page set) | unauthorised state | existing - proxy redireciona para `/login`; fora da mudança |
| screens (page set) | density and ordering | AC 11, AC 14, AC 15, AC 17 |
| screens (page set) | destructive action confirms | existing - `ConfirmAction`/`Modal` da lib; ganha 44px pelo AC 2 |
| lib `Table` (`stack`, `label`) | API shape | AC 3, AC 4; forma literal no door 1 |
| lib `Table` | versioning | AC 5 |
| lib CSS `.sv-layout`, `.sv-btn`, `.sv-field` | versioning | AC 5 |
| lib CSS | error shape | n/a - CSS e componente de apresentação não produzem erro |
| app `PageHeader` | structure | AC 8, AC 9 |

## Flow

Reusa o que já existe: o drawer mobile da lib (`SidebarProvider`/`SidebarTrigger`), o `Tabs`, o
`Card`, o `Skeleton` e o `Table` da lib, e os `sv-gap` do portal viram regra da lib em vez de
serem copiados para as telas da equipe.

1. `still-void/src/css/style.css` (exists) - corrige `.sv-layout` e adiciona a regra de toque (door 2) e a forma empilhada `.sv-table--stack` (door 1)
2. `still-void/src/components/ui/table.tsx` (exists) - `Table` ganha `stack`, `TableCell` ganha `label` (door 1)
3. release `@still-void/ui@3.4.0` via Changesets (exists) -> npm
4. `vitta-flow/package.json` (exists) - sobe para `^3.4.0` (door 3); `src/app/globals.css` (exists) perde os dois `sv-gap` do portal
5. `vitta-flow/src/components/page-header.tsx` (door 4) - usado pelas 19 telas
6. páginas em `src/app/**` (exists) - adotam `PageHeader`, `Table stack`, `Tabs` e o grid mobile-first
7. out: as mesmas rotas, sem mudança de API nem de dado

## Relations

None - nenhuma mudança de dado armazenado.

## Surface

None - nenhuma rota HTTP muda. A API de componente que sai do repositório (a `Table`/`TableCell`
da lib, consumida pelo VittaFlow e pelo blog) e a regra de CSS nova estão nos doors 1 e 2 de
`Landing`, com a forma literal.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. API pública nova na `Table` | `<Table stack>` + `<TableCell label="Nome">` → `table.sv-table.sv-table--stack` e `td[data-label]`; o rótulo sai de `td::before { content: attr(data-label) }` abaixo de 40rem | componente separado `ResponsiveTable` com cards: duplica a marcação e cada consumidor escolheria um dos dois; e `data-label` manual no app: não é a lib, viola "UI só com `@still-void/ui`" |
| 2. Comportamento novo de CSS para todo consumidor da lib | `@media (width < 40rem), (pointer: coarse) { .sv-btn, .sv-field { min-height: calc(var(--sv-space-10) + var(--sv-space-1)); } }` | prop `size="touch"`: o consumidor teria de lembrar em cada botão, e o erro seria silencioso |
| 3. Dependência | `"@still-void/ui": "^3.4.0"` | manter `^3.3.1` com `sv-gap`: resposta do usuário |
| 4. Padrão de app que as próximas telas vão copiar | `<PageHeader title="Pacientes" description? actions={<Button …/>} />` em `src/components/page-header.tsx`, só primitivos da lib | cabeçalho por página: é o que existe hoje e divergiu em 19 cópias |

- Nada mais nesta mudança é difícil de reverter: agenda compacta, abas, grids e espaçamento são CSS/JSX do app.

## Impact

| Front | What changes |
| --- | --- |
| domain | nenhum termo novo; nenhum termo muda de sentido |
| stored data | nothing to migrate |
| consumidores da lib | o blog `blog.kalleopinheiro.dev` também usa a lib: botões e campos ficam com 44px em tela estreita/toque, e `.sv-layout` deixa de crescer até o conteúdo (é correção) |
| testes | `e2e/portal-responsivo.spec.ts` continua valendo, agora sobre a regra da lib; specs de E2E que buscam células por posição de coluna podem precisar de ajuste por causa do `data-label` (só marcação nova, texto igual) |
| docs | `docs/still-void-gaps.md` fecha `layout-grid-min-content` e `touch-target-size`; `docs/domains/agenda/` registra a agenda compacta no celular |
