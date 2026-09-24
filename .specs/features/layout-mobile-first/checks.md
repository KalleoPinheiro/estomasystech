# Layout mobile-first de todas as páginas checks

Profile: ui
Plan: `.specs/features/layout-mobile-first/plan.md`

32 checks em 4 fatias · 4 portas sem volta · 1 pergunta aberta (`blocks go-live`: publicar a lib)

Dois repositórios. Checks da S1 rodam em `still-void/` (Vitest, texto do CSS + jsdom), os demais
em `vitta-flow/` (Vitest para componente, Playwright para arranjo real em 390x844 e 1440x900).
Os specs novos do app são `e2e/layout-mobile-first.spec.ts` (páginas, casca e telas específicas)
e `e2e/layout-tabelas.spec.ts` (table set, com seed de dado por tabela).

Neste container o Chromium do Playwright do projeto não está instalado; as provas E2E rodam aqui
com uma config local idêntica à do projeto mais `launchOptions.executablePath` apontando para
`/opt/pw-browsers/chromium` (arquivo não versionado). No CI rodam com a config padrão.

## Checks

### S1 - lib `@still-void/ui` 3.4.0 · 5 files · ~70 KB · ~18k

**C1** - `.sv-layout` declara `grid-template-columns: minmax(0, 1fr)` (LAYOUT-01, AC 1)
Proof: `cd still-void && npx vitest run tests/layout-css-contract.test.ts -t "sv-layout usa minmax(0, 1fr)"`

**C2** - Dentro de `@media (width < 40rem), (pointer: coarse)`, `.sv-btn` (seletor base, portanto todos os tamanhos) e `.sv-field` declaram `min-height: calc(var(--sv-space-10) + var(--sv-space-1))` (LAYOUT-01, AC 2)
Proof: `cd still-void && npx vitest run tests/layout-css-contract.test.ts -t "alvo de toque de 44px em sv-btn e sv-field"`

**C3** - `<Table stack>` põe a classe `sv-table--stack` no `<table>`; sem `stack`, a classe não aparece (LAYOUT-02, AC 3, AC 4)
Proof: `cd still-void && npx vitest run tests/ui-table.test.tsx -t "stack adiciona sv-table--stack"`

**C4** - `<TableCell label="Nome">` renderiza `data-label="Nome"` no `<td>`; sem `label`, o atributo não existe (LAYOUT-02, AC 3)
Proof: `cd still-void && npx vitest run tests/ui-table.test.tsx -t "label vira data-label"`

**C5** - As regras de `.sv-table--stack` que viram a linha em bloco, escondem o `thead` visualmente (sem `display: none`, que o tiraria da árvore de acessibilidade) e mostram `attr(data-label)` via `::before` existem **só** dentro de `@media (width < 40rem)` (LAYOUT-02, AC 3, AC 4)
Proof: `cd still-void && npx vitest run tests/table-css-contract.test.ts -t "sv-table--stack só abaixo de 40rem"`

**C6** - Existe um changeset `minor` para `@still-void/ui` e nenhum valor de cor em `src/tokens/colors.ts`, `src/css/theme.css` ou nas custom properties `--sv-*` de cor de `src/css/style.css` difere de `origin/main` (LAYOUT-03, AC 5)
Proof: `cd still-void && npx vitest run tests/release-contract.test.ts -t "changeset minor para layout mobile"`
Proof: `cd still-void && git diff --exit-code origin/main -- src/tokens/colors.ts src/css/theme.css`

### S2 - casca e padrões do app · ~26 files · ~170 KB · ~43k

**C7** - Nenhuma página do page set tem `document.documentElement.scrollWidth` > largura + 2 em 390x844 e em 1440x900 (LAYOUT-04, AC 6)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "sem scroll lateral"`

**C8** - Em 390x844, todo `button`, `a[href]`, `input`, `select` e `textarea` visível dentro de `main` mede no mínimo 44x44px, em cada página do page set; para `input` checkbox/radio, mede o `<label>` que o envolve (renegociado com o usuário em 2026-09-24) (LAYOUT-04, AC 7)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "alvos de toque"`

**C9** - `PageHeader` renderiza exatamente um `h1` com o título e as ações num grupo próprio (LAYOUT-05, AC 8)
Proof: `npx vitest run tests/components/page-header.test.tsx -t "um h1 e o grupo de ações"`

**C10** - Cada página da equipe tem exatamente um `h1` e ele está dentro do `PageHeader` (`[data-page-header] h1`) (LAYOUT-05, AC 8)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "um h1 por página"`

**C11** - Em 390x844, o topo das ações do `PageHeader` fica >= o fundo do `h1` e a borda direita delas <= 390 em Pacientes, Agenda e Faturamento (LAYOUT-05, AC 9)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "ações abaixo do título"`

**C12** - O e-mail da conta na sidebar ocupa uma linha (altura da linha <= 1,5 × `line-height`), com `text-overflow: ellipsis` e o e-mail completo no `title` (LAYOUT-06, AC 10)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "e-mail da sidebar em uma linha"`

**C13** - Em 390x844, os cards de KPI de Dashboard, Faturamento e Relatórios formam 2 colunas: cada card mede metade da grade (±2px, descontado o gap) e os dois primeiros dividem a linha (LAYOUT-06, AC 11)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "KPIs em 2 colunas"`

**C14** - No prontuário, o link "Pacientes" de voltar tem ícone e texto com centros verticais a no máximo 4px um do outro (LAYOUT-06, AC 12)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "voltar na mesma linha"`

**C15** - O bloco `@theme` de cores de `src/app/globals.css` é idêntico ao de `main` @ `46026ba`, e `npm run check:sv` segue verde (nenhum degrau cru de paleta) (LAYOUT-07, AC 13)
Proof: `npx vitest run tests/app/color-bridge.test.ts -t "ponte de cor inalterada|todo utilitário de cor do app usa um nome da ponte @theme"`
Proof: `npm run check:sv`

### S3 - tabelas empilhadas · ~15 files · ~120 KB · ~30k

**C16** - Em 375x667, cada tabela do table set tem a classe `sv-table--stack`, o `thead` não ocupa altura visível, cada `td` com conteúdo tem `data-label` não vazio igual ao cabeçalho da coluna, e o controle de ação de cada linha está dentro do viewport (LAYOUT-08, AC 14)
Proof: `npx playwright test e2e/layout-tabelas.spec.ts -g "empilhada no celular"`

**C17** - Em 1440x900, cada tabela do table set mostra o `thead` com altura > 0 e cada registro ocupa uma única `tr` com altura < 80px (LAYOUT-08, AC 15)
Proof: `npx playwright test e2e/layout-tabelas.spec.ts -g "tabela no desktop"`

**C18** - Sem registros, Pacientes mostra a mensagem de vazio atual nos dois viewports (LAYOUT-08, AC 16)
Proof: `npx playwright test e2e/layout-tabelas.spec.ts -g "vazio preservado"`

**C33** - Cada uma das 13 tabelas do table set mostra a mesma mensagem de vazio de antes quando não há registros (o layout novo não mexeu nesses ramos; testes de página existentes, um por tabela) (LAYOUT-08, AC 16)
Proof: `npx vitest run tests/pages/staff-pacientes-list.test.tsx -t "Dado nenhum paciente, Quando a página carrega, Então exibe mensagem de vazio"`
Proof: `npx vitest run tests/pages/staff-operations.test.tsx -t "Dado nenhum parceiro, Quando a página carrega|Dado nenhum profissional, Quando a página carrega|Dado nenhum evento, Quando a página carrega|Dado nenhuma conta cadastrada"`
Proof: `npx vitest run tests/pages/staff-procedimentos.test.tsx -t "Dado nenhum procedimento, Quando a página carrega"`
Proof: `npx vitest run tests/pages/staff-materiais.test.tsx -t "Dado nenhum insumo, Quando a página carrega"`
Proof: `npx vitest run tests/pages/staff-faturamento.test.tsx -t "Dado nenhuma fatura, Quando a página carrega"`
Proof: `npx vitest run tests/pages/staff-relatorios.test.tsx -t "Dado nenhuma consulta concluída no mês|Dado produção sem nenhum registro"`
Proof: `npx vitest run tests/pages/staff-repasses.test.tsx -t "Dado Profissional, Quando abre a tela, Então pede o próprio extrato"`
Proof: `npx vitest run tests/pages/schedule-availability-ui.test.tsx -t "Dado nenhum bloqueio e atendente sem acesso a profissionais"`
Proof: `npx vitest run tests/pages/staff-paciente-detail.test.tsx -t "Dado erro ao carregar avaliações, Quando expandir a condição"`
Proof: `npx vitest run tests/pages/payout-tables-empty.test.tsx -t "extrato da clínica sem profissionais mostra o vazio atual|itens do repasse sem sessões mostram o vazio atual"`

**C34** - Em 1440x900 com ponteiro fino, um `Button` padrão da lib mantém a altura base `--sv-space-10` (< 44px): a regra de toque da 3.4.0 não vaza para o desktop (LAYOUT-01, AC 2)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "desktop com mouse mantém a altura da lib"`

### S4 - telas com defeito específico · ~20 files · ~150 KB · ~38k

**C19** - Em 390x844, a grade da Agenda mostra 7 colunas de dia dentro do viewport, cada célula com >= 44x44px (LAYOUT-09, AC 17)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "agenda: 7 colunas no celular"`

**C20** - Em 390x844, dia com consulta tem o marcador `[data-has-appointments]` e nenhuma célula contém chip de consulta (LAYOUT-09, AC 18)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "agenda: ponto no dia com consulta"`

**C21** - Em 390x844, a Agenda abre com o dia de hoje selecionado; tocar num dia com consulta lista abaixo da grade a hora, o paciente, o procedimento e a situação dela (LAYOUT-09, AC 19)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "agenda: lista do dia"`

**C22** - Em 390x844, tocar num dia sem consulta mostra "Nenhuma consulta neste dia." abaixo da grade (LAYOUT-09, AC 20)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "agenda: dia vazio"`

**C23** - Em 390x844, o filtro de profissional da Agenda fica abaixo da navegação de mês e tem a largura útil da coluna de conteúdo (viewport − sidebar fixa − padding de `main`, ±2px) (LAYOUT-09, AC 21)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "agenda: filtro em largura total"`

**C24** - Em 1440x900, a Agenda mostra a consulta como chip dentro da célula do dia dela (`[data-calendar-day]`) (LAYOUT-09, AC 22)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "agenda: chips no desktop"`

**C25** - Em 390x844, a lista de abas do prontuário tem `scrollWidth > clientWidth` e rola dentro de si, a página não rola de lado, a aba ativa ao abrir (Anamnese) está inteira dentro do viewport, e depois de escolher "Pacotes" essa aba também fica (LAYOUT-10, AC 23)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "prontuário: abas rolam dentro de si"`

**C26** - Nos dois viewports, o painel da aba Anamnese e o vazio da Triagem têm a largura útil da coluna de conteúdo, calculada sem depender dela: viewport − sidebar fixa (0 no celular) − padding de `main`, ±2px (LAYOUT-10, AC 24)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "painéis na largura do conteúdo"`

**C27** - Em 390x844, cada linha de "Retornos pendentes" do Dashboard mostra o nome completo e o motivo sem corte (`scrollWidth <= clientWidth`), com as ações abaixo do texto (LAYOUT-10, AC 25)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "retornos pendentes sem esmagar"`

**C28** - Em 390x844, os cards de Login, Esqueci minha senha e Definir senha ficam a >= 16px de cada borda (LAYOUT-11, AC 26)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "telas públicas com margem"`

**C29** - Em 390x844, no portal, o botão "Confirmar presença" não se sobrepõe à data da consulta (caixas disjuntas) (LAYOUT-11, AC 27)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "portal: confirmar não sobrepõe a data"`

**C30** - O aviso de emergência do portal tem exatamente um ícone (`svg`) (LAYOUT-11, AC 28)
Proof: `npx vitest run tests/components/portal-layout.test.tsx -t "aviso de emergência com um ícone"`

**C31** - Em 390x844, o `h1` de saudação do portal tem `font-size` igual ao degrau `headline` da lib (`--sv-fs-headline` ou equivalente resolvido), e em 1440x900 continua no degrau `display` (LAYOUT-11, AC 29)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "portal: saudação no degrau headline"`

**C32** - Em 390x844, cada página de documento (atestado, consentimento, relatório, plano de cuidados, recibo) mantém suas tabelas dentro de um contêiner com rolagem horizontal e a página sem rolagem lateral; e o comprovante de repasse também, renderizado no navegador com a resposta da API do comprovante interceptada (fechar repasse exige mês encerrado); no jsdom, a tabela do comprovante fica dentro de `.sv-table-container` (LAYOUT-11, AC 30)
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "documentos sem scroll lateral"`
Proof: `npx vitest run tests/pages/documento-repasse.test.tsx -t "tabela do comprovante dentro de contêiner com rolagem"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| page set × viewport, sem scroll lateral (46) | C7, table-driven over all 46 (23 páginas × 390x844 e 1440x900) | - |
| page set, alvo de toque (23) | C8, table-driven over all 23 | - |
| páginas da equipe com `PageHeader` (14) | C10, table-driven over all 14 (`/` `/agenda` `/triagem` `/pacientes` `/pacientes/[id]` `/parceiros` `/profissionais` `/procedimentos` `/materiais` `/faturamento` `/repasses` `/relatorios` `/auditoria` `/configuracoes`) | - |
| grupos de KPI (3) | Dashboard C13 · Faturamento C13 · Relatórios C13 (largura de cada card = metade da grade) | - |
| vazio das tabelas do table set (13) | pacientes C18 C33 · parceiros C33 · profissionais C33 · procedimentos C33 · materiais C33 · faturamento C33 · auditoria C33 · relatórios receita C33 · relatórios produção C33 · repasses C33 (extrato e itens) · configurações contas C33 · configurações feriados C33 · prontuário estomias e feridas C33 | - |
| table set (13) | pacientes C16 C17 · parceiros C16 C17 · profissionais C16 C17 · procedimentos C16 C17 · materiais C16 C17 · faturamento C16 C17 · auditoria C16 C17 · relatórios receita C16 C17 · relatórios produção C16 C17 · repasses C16 C17 · configurações contas C16 C17 · configurações feriados C16 C17 · prontuário estomias e feridas C16 C17 | - |
| telas públicas (3) | login C28 · esqueci-senha C28 · definir-senha C28 | - |
| páginas de documento (6) | atestado C32 · consentimento C32 · relatório C32 · plano de cuidados C32 · recibo C32 · repasse C32 (navegador, API interceptada; e estrutura no jsdom) | - |
| estados da agenda no celular (4) | hoje selecionado C21 · dia com consulta C21 · dia vazio C22 · marcador C20 | - |
| viewports da agenda (2) | 390x844 C19 · 1440x900 C24 | - |
| `Table` `stack` (2 estados) | com `stack` C3 C5 · sem `stack` C3 | - |
| `TableCell` `label` (2 estados) | com `label` C4 · sem `label` C4 | - |
| regra de toque, seletor × contexto (3) | `.sv-btn` estreito/toque C2 · `.sv-field` estreito/toque C2 · `.sv-btn` desktop com mouse C34 | - |
| Landing doors (4) | 1 `Table stack`/`label` C3 C4 C5 · 2 regra de toque C2 · 3 dependência `^3.4.0` C15 (via `check:sv` sobre o pacote instalado) e C8 · 4 `PageHeader` C9 C10 | - |

- Claims naming a concrete bound (px, viewport, contagem): C7, C8, C11–C14, C16, C17, C19, C23, C25–C29, C31, C32 - cada prova mede no navegador real, não por classe CSS
- C3, C4 provam a API no jsdom; C5 prova que as regras só existem abaixo de 40rem; C16 prova o arranjo resultante no navegador. Os três somam, nenhum substitui o outro
- Nenhum outro check afirma mais do que o caso que a prova exercita

## Test policy

O repositório já responde "onde vive o teste" (`tests/**` Vitest, `e2e/**` Playwright) e o
still-void já tem o padrão de contrato de texto do CSS (`tests/table-css-contract.test.ts`). O que
fica em aberto é o nível que prova **arranjo**, porque jsdom não calcula layout.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Regra de CSS da lib (decide por media query) | contrato de texto do CSS na lib **e** medição no navegador no app | cada seletor da regra e a condição de mídia; no navegador, um caso por viewport |
| Componente da lib com prop que muda a marcação | teste de componente (jsdom) | prop presente e ausente |
| Página/arranjo do app | Playwright com medição de caixa | um caso por página do conjunto e por viewport declarado |
| `PageHeader` (composição sem decisão além de "tem ações?") | teste de componente | com e sem ações |

Evidence:

- `still-void/src/components/ui/table.tsx`: hoje repassa props sem condicional -> instrumentação; com `stack`/`label` passa a decidir 2 pontos -> decide
- `still-void/src/css/style.css` seção Table: nenhuma media query hoje; a nova forma decide por `(width < 40rem)` -> decide
- analogue: `still-void/tests/table-css-contract.test.ts` já prova a seção Table por contrato de texto; `vitta-flow/e2e/portal-responsivo.spec.ts` já prova arranjo por medição de caixa em 390x844 e 375x667

Cost: 6 provas na lib (3 arquivos de teste) e ~26 no app (2 specs E2E novos + 3 testes Vitest).

## Swept

- validation: n/a - não há entrada nova; formulários existentes mantêm suas validações
- failure modes: C18, C22, C33 - estados vazios preservados no layout novo; erros de API seguem o `ErrorAlert` atual
- idempotency: n/a - só apresentação, nenhuma escrita nova
- authorization: existing - proxy e `getRequestSession` decidem acesso; o layout não muda rota nem guarda
- concurrency: n/a - nenhum estado compartilhado novo; a seleção de dia da agenda é estado local de componente
- data lifecycle: n/a - nenhum dado armazenado muda
- dependency failure: C6 - a release da lib é a dependência externa; enquanto não publicada, o app não sobe a versão (open question 1 do plano)
- state transitions: C21, C22 - seleção de dia na agenda (hoje por padrão → dia tocado); C25 - aba ativa
- observability: n/a - mudança só de apresentação, sem log ou métrica nova

## Handoff

Divisão planejada, com a conta, antes de qualquer código:

- S1 = ~18k, sozinha em `still-void/` e publicada antes do resto -> fronteira natural: PR próprio na lib
- S2 + S3 = ~73k, no app, dependem do `^3.4.0`; S4 = ~38k -> S2–S4 = ~111k, cabem num builder (budget padrão 150k)
- Ordem: S1 (lib, PR, release) -> S2 -> S3 -> S4 no app, um PR, Verifier único sobre `origin/main..HEAD` dos dois repositórios

- **Settled mid-build (2026-09-24):** C8 mede o `<label>` que envolve checkbox/radio, não a caixinha (decisão do usuário: tocar no rótulo já marca; a lib dá 44px ao rótulo em tela estreita/toque). Achados que viraram regra da lib além do plano original, todos aditivos e na mesma release 3.4.0: `.sv-btn` com `min-width` de 44px, `.sv-tabs__trigger` com 44px e `.sv-tabs__list` rolando dentro de si, `TabsContent` esticando à largura (`align-self: stretch`), título do `Hero` no degrau `headline` abaixo de 40rem.
- **Round 1 do Verifier (2026-09-24, FAIL):** coluna de conteúdo da equipe encolhia até o conteúdo (wrapper sem `flex-1`/`w-full`, `staff-layout-client.tsx`) e a aba ativa do prontuário abria fora da tela (`.sv-tabs__list` centralizada com overflow; a lib agora alinha ao início em tela estreita/toque). C13, C24, C25, C26 e C32 tiveram a prova reforçada para medir o que a claim diz; C33 foi acrescentado para os estados vazios do AC 16. A agenda compacta vale abaixo de 768px (`md`), não de 40rem: a grade de chips precisa de 840px, então entre 640 e 768 ela também não cabe.
- **Round 2 do Verifier (2026-09-24, FAIL):** C26/C23 mediam contra a largura de `main`, que encolhe junto com o wrapper (a falha injetada passou). A referência agora é viewport − sidebar fixa − padding de `main`; com o wrapper sem `flex-1` o C26 falha (87,5px em 390 e 323px em 1440). C33 ganhou o vazio do extrato da clínica e dos itens do repasse; C32 mede o comprovante de repasse no navegador; C34 prova a regra de toque no desktop; C15 ganhou a varredura de utilitários de cor.
