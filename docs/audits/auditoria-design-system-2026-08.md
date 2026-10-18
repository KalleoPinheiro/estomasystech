---
title: "Auditoria de design system — gaps do `@still-void/ui` (2026-08)"
status: frozen
audience: [dev, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Auditoria de design system — gaps do `@still-void/ui` (2026-08)

- **Origem:** `/impeccable critique` — auditoria completa das 18 superfícies do EstomaSysTech (14 páginas + 4 documentos clínicos), rodada em 2026-08-29 com app local (Docker Postgres + `next dev`, dados de seed mínimos).
- **Versão auditada:** `@still-void/ui@3.2.0`.
- **Relação com `docs/still-void-gaps.md`:** este documento é **novo e separado**. `still-void-gaps.md` está fechado (0 lacunas ativas, 6 arquivadas) e é gate-tracked pelo `npm run check:sv` via comentários `sv-gap: <slug>` no código — não editamos esse arquivo nem adicionamos marcações, porque isso é trabalho de implementação (Tasks), não de auditoria. Este documento é o **backlog candidato**: cada gap abaixo, se você decidir portar, vira uma entrada em `still-void-gaps.md` só quando o workaround correspondente ganhar a marcação `sv-gap: <slug>` no código do EstomaSysTech.
- **Correção factual sobre o arquivo existente:** `still-void-gaps.md` afirma que a 3.2.0 "continua sem exportar um `Progress` genérico". Isso está desatualizado — `dist/react/index.d.ts:803` da 3.2.0 instalada exporta `Progress`/`ProgressProps`. Vale corrigir a entrada histórica para não induzir um workaround desnecessário no futuro.
- **Como ler:** cada gap tem contagem de call sites (quantas páginas reimplementam o mesmo problema), os workarounds exatos (arquivo:linha) e uma sugestão de API para a lib. Ordenados por alcance (quantas superfícies do app o gap atinge), não por severidade — a severidade de cada instância está na auditoria de UX (`docs/audits/auditoria-ux-2026-08.md`).

---

## Nota sobre AD-014 (porte, não redesenho)

`.specs/STATE.md` registra que a migração 2.0→3.1 foi deliberadamente uma **fronteira de porte**: adotar um padrão de UI que o app ainda não usa (Tabs, Tooltip, DropdownMenu, AlertDialog, Badge, ThemeToggle, Prose) foi declarado **feature nova, fora do escopo da migração** — mesmo esses componentes já existindo no catálogo `3.2.0`. Vários achados desta auditoria (abas do prontuário sem `Tabs`, ações destrutivas sem `AlertDialog`, `Badge` de status ausente) **não são gaps da lib** — são adoção pendente de componentes que já existem. Estão listados como "adoção pendente" ao final, separados dos gaps reais, para não confundir os dois backlogs.

---

## Gaps por alcance (quantas páginas reimplementam o mesmo problema)

### 1. `sidebar-app-shell` — `Sidebar` não tem modo responsivo (11 de 18 superfícies afetadas)

**O que falta:** `SidebarProps extends ComponentPropsWithoutRef<'aside'>` (`dist/react/index.d.ts:196-198`) — é uma casca estática. Sem `collapsible`, sem `open`/`onOpenChange`, sem `SidebarTrigger`, sem modo off-canvas/drawer, sem breakpoint. `Layout withSidebar` foi desenhado para trilho de TOC de artigo de blog (coluna à direita, `style.css:342-351`), não para rail de navegação de admin.

**Workaround do app:** `src/app/(staff)/layout.tsx:11` — `<Sidebar className="w-56 shrink-0 …">` sem nenhum breakpoint, mais `<main className="flex-1 overflow-x-hidden">` (linha 24) que **amputa** em vez de rolar o que vaza. É a causa raiz do defeito mais repetido de toda a auditoria: em 390px a sidebar come 224px (57% do viewport), e todas as telas do staff — dashboard, agenda, pacientes, prontuário, procedimentos, materiais, faturamento, relatórios, profissionais, parceiros, auditoria, configurações — ficam com conteúdo inalcançável, não apenas apertado. Confirmado nos 13 screenshots mobile capturados.

**Sugestão para a lib:** `Sidebar collapsible?: 'offcanvas' | 'icon' | 'none'` + `SidebarTrigger` (client) + `SidebarProvider` gerenciando estado/foco/scroll-lock, com breakpoint configurável via token. Padrão já consolidado (shadcn `sidebar-07`); a lib já depende de Radix para portal/foco, o custo de porte é baixo. **Prioridade máxima** — nenhum outro gap desta lista se paga sem este primeiro.

---

### 2. `feedback-toast` — sem notificação transitória / região de anúncio (9 superfícies)

**O que falta:** nenhum `Toast`/`Snackbar` no catálogo, cliente ou server-safe. O token `--sv-z-toast: 50` **já existe** em `theme.css` sem componente correspondente — sinal de que a lib já previu a necessidade.

**Workaround do app:** inconsistente porque não há workaround real — a maioria das telas **simplesmente omite o feedback**. `src/app/(staff)/page.tsx:34-40` (concluir retorno), `agenda/page.tsx:142-143` (criar consulta — o achado mais grave: a consulta criada some da tela sem confirmação nenhuma), `faturamento/page.tsx:274-284`, `procedimentos/page.tsx:30-41`, `materiais/page.tsx` (movimentação de estoque), `profissionais/page.tsx`, `parceiros/page.tsx`, `pacientes/[id]/*` (6 operações de escrita no prontuário), `portal/schedule-return.tsx:85`. O único ponto com feedback textual é `anamnesis-section.tsx:77` ("Salvo às 14:32" em `text-xs text-ink-3`, quase invisível).

**Sugestão para a lib:** `ToastProvider` + `useToast()` client-only, portal + `role="status"`/`role="alert"` por severidade, `duration`, ação (`Desfazer`/`Ver`), empilhamento, pausa em hover/foco. É o gap de maior alcance prático depois do shell — atinge toda ação de escrita do sistema.

---

### 3. `alert-semantic-variants` — `Alert`/`Callout` sem variantes semânticas (9 superfícies)

**O que falta:** `Alert` é `React.HTMLAttributes<HTMLDivElement>` puro (`dist/react/index.d.ts:323`), sem `variant`. `Callout` só aceita `kind: 'note' | 'warn' | 'aha'` — vocabulário de blog, sem `danger`/`success`/`info`.

**Workaround do app:** repintado à mão em pelo menos 8 lugares com anatomias diferentes cada vez: `src/components/feedback.tsx:15-21` (`border-danger` + `text-danger` manual, com docstring de 5 linhas explicando a ausência), `(staff)/page.tsx:89-96` (banner de alergia, `div` cru reimplementando `Alert` do zero), `materiais/page.tsx:136,150` (banners de estoque baixo e validade — **abandonam** o `Alert` inteiramente), `configuracoes/page.tsx:99-102` (sucesso como `<p>` manual, diferente do erro ao lado), `agenda/page.tsx:49-51` (aviso de série), `consent-card.tsx:34,60` (dois padrões diferentes de aviso no portal). Nenhum tem `role` correto por severidade.

**Sugestão para a lib:** `variant?: "info" | "success" | "warning" | "danger"` em `Alert`, mapeando aos tokens semânticos já existentes (`--sv-danger`, `--sv-success`, `-soft`, `-ink`), com `role="alert"` automático em `danger`/`warning` e `role="status"` nos demais, ícone padrão por variante, e slot `action?: ReactNode`. Estender `CalloutKind` com `"danger"`. Este ajuste sozinho elimina o workaround de cor manual mais repetido do app inteiro.

---

### 4. `empty-state` — sem componente de estado vazio (7 superfícies)

**O que falta:** confirmado ausente — nem ícone, nem título, nem CTA.

**Workaround do app:** `src/components/feedback.tsx:35-41` — um único `<p className="py-8 text-center text-sm text-ink-3">`, reusado sem variação em dashboard, faturamento, procedimentos, materiais, profissionais, parceiros, pacientes, portal (5 call sites só no portal). Resultado: nenhuma tela vazia oferece o próximo passo — nem "cadastrar o primeiro procedimento", nem distinção entre "base vazia" e "filtro sem resultado".

**Sugestão para a lib:** `EmptyState` server-safe com `icon?`, `title`, `description?`, `action?` (reaproveitando `Icon`+`Button`), variante `size="sm"` (dentro de card) e `"md"` (página inteira).

---

### 5. `field-wrapper` — sem `Label`/`Field` (rótulo + descrição + erro associados) (6+ superfícies)

**O que falta:** a lib exporta as receitas (`field()`, `fieldMessage()`, `fieldClasses`) e pinta `aria-invalid` sozinha, mas **não exporta um componente** que as use corretamente — nem `Label`, nem `Field`.

**Workaround do app:** todo formulário reescreve `<label className="text-sm font-medium">Texto<Input className="mt-1"/></label>` com associação só implícita, `*` de obrigatório como caractere solto (ilegível para leitor de tela), e **zero** `aria-describedby`/`aria-invalid` real em qualquer formulário do sistema — o erro do servidor sempre cai num `Alert` global no topo, desconectado do campo. Contado em: `profissionais/page.tsx` (7×), `parceiros/page.tsx` (5×), `configuracoes/page.tsx` (6×), `agenda/appointment-form.tsx` (9×), `login/page.tsx` (2×), `schedule-return.tsx` (2×) — mais de 30 repetições da mesma estrutura.

**Sugestão para a lib:** `Label` (server-safe, `htmlFor`) + `Field label required description error` compondo os ids e a fiação ARIA automaticamente. Maior retorno de acessibilidade por linha alterada de toda a lista.

---

### 6. Estratégia responsiva de `Table` (5 superfícies)

**O que falta:** a família `Table` é HTML semântico puro, com `.sv-table-container { overflow-x: auto }` e nada mais — o próprio CSS admite o escopo ("Presentational only", `style.css:803-806`). Sem stack em cards abaixo de um breakpoint, sem coluna de ação sticky, sem affordance visual de que há conteúdo cortado (sombra/gradiente).

**Workaround do app:** nenhum tratamento em `pacientes/page.tsx`, `profissionais/page.tsx`, `parceiros/page.tsx`, `procedimentos/page.tsx` (5 colunas), `materiais/page.tsx` (7 colunas), `auditoria/page.tsx` (6 colunas) — todas simplesmente cortam no mobile, agravado pelo gap #1.

**Sugestão para a lib:** (a) sombra de scroll no `.sv-table-container` via `background-attachment: local` (CSS puro, sem JS); (b) `Table stackAt="sm"` + `TableCell label="Preço"` que vira lista rotulada (`<dl>`) abaixo do breakpoint.

---

### 7. `Calendar`/`DatePicker`/`TimeField` — sem primitiva de data/hora (4 superfícies, a mais cara em consequência)

**O que falta:** nenhuma primitiva de calendário, seletor de data ou campo de hora.

**Workaround do app:** um calendário de mês inteiro reimplementado do zero em `src/app/(staff)/agenda/calendar-grid.tsx` (112 linhas: aritmética de grade, `dayKey` triplicado no repo — copiado literalmente em `schedule-return.tsx:17-20` e reimportado de volta em `appointment-form.tsx:8`, locale hardcoded, cores de status à mão, e chips de evento feitos de `Button variant="outline"` neutralizado a golpe de `className`, só para não violar o gate de HTML cru — o gate passa, o design system não é usado de verdade). Mais `Input type="date"`/`type="time"` nativos do SO em 3 telas (`appointment-form.tsx`, `appointment-detail.tsx`, `schedule-return.tsx`, `configuracoes/page.tsx` para hora de abertura/fechamento) — sem `min`/`max` reais fora de submit nativo, aparência e teclado variam por browser/SO.

**Consequência de design:** é o gap com efeito cascata mais direto na auditoria de UX — sozinho explica a maioria dos P0/P1 da página de Agenda (sem prevenção de erro, sem legenda de status, célula sem teto, grade sem navegação por teclado).

**Sugestão para a lib:** `Calendar` (`role="grid"` completo, teclado, `disabledDates`, `renderDay`), camadas `CalendarMonth`/`CalendarWeek`/`CalendarDay`, `DatePicker` (`Input`+`Popover`+`Calendar`), `TimeField` com `min`/`max`/`step`, `EventChip` como primitiva própria (hoje é `Button` disfarçado), e `dayKey`/`parseLocalDate` exportados como utilitário — encerra as 3 cópias.

---

### 8. `ToggleGroup`/`SegmentedControl` — sem controle de escolha única em pílulas (4 superfícies)

**O que falta:** `Checkbox`/`RadioGroup` cobrem formulário; `Tabs` é navegação de painel. Não existe primitivo para "filtro/seletor apresentado como grupo de pílulas".

**Workaround do app:** `Button` avulsos com `aria-pressed` manual e `className="rounded-full"` repintado, em `configuracoes/page.tsx:104-118` (dias da semana), `faturamento/page.tsx:220-233` (filtro de status), `schedule-return.tsx:182-197` (seleção de horário — aqui degradado a `h-7`, abaixo do próprio padrão `sm` da lib, para caber na grade). Nenhum tem `role="group"` com rótulo, nem navegação por setas.

**Sugestão para a lib:** `ToggleGroup type="single"|"multiple"` + `ToggleGroupItem`, `role="group"`/`radiogroup` conforme o tipo, navegação por setas, variante `wrap` para grades densas de horário.

---

### 9. `Icon` não é seguro em texto corrido (2 superfícies, defeito visível nos screenshots)

**O que falta:** `.sv-icon` (`style.css:1088-1093`) define só `width/height/color/flex-shrink` — sem `display`/`vertical-align`. Sob o preflight do Tailwind (`svg { display: block }`), um ícone dentro de link de texto quebra para a própria linha.

**Workaround do app:** nenhum — o bug simplesmente acontece. Visível nos screenshots do dashboard (`"Ver agenda completa" + chevron` quebrando linha, `page.tsx:70,161`) e do banner de estoque baixo em materiais (`page.tsx:137,153,159`, o triângulo de alerta flutua desalinhado do texto).

**Sugestão para a lib:** `.sv-icon { display: inline-block; vertical-align: -0.125em; }` — uma linha de CSS, sem quebra de compatibilidade com uso em flex.

---

### 10. Primitivos de documento imprimível (categoria nova — 4 gaps específicos, só em `/documentos`)

Uma lib nascida para blog nunca precisou de "modo impressão". O EstomaSysTech tem 4 documentos clínicos (atestado, consentimento, plano de cuidados, relatório) com zero cobertura de impressão no catálogo:

- **`print-sheet`** — sem `@page`, cabeçalho/rodapé repetido por página, contador de página, `break-inside/break-after`. Workaround: `documentos/layout.tsx:12` (`print:max-w-none print:p-0`) + `document-frame.tsx:35` (`print:hidden`) — e **zero** `@media print` em `globals.css`. Sugestão: `<PrintSheet size="a4" margin="20mm" runningHeader runningFooter pageNumbers>`.
- **`print-neutral-tokens`** — sem modo neutro preto-sobre-branco independente de tema. Workaround: `text-black`/`bg-white` literais espalhados em `document-frame.tsx:34`, `layout.tsx:12`, e repetidos em **cada** `TableHead` de `plano-cuidados/page.tsx` e `relatorio/page.tsx` — a ponto de o projeto ter escrito um check estático (`check-sv-adoption.sh:44-47`) só para proteger esse workaround de regressão. Sugestão: `<Table variant="print">` ou token `data-print-neutral`.
- **`signature-block`** — sem linha de assinatura padronizada (nome + registro + legenda + data). Workaround: `document-frame.tsx:59-64`, duplicado e já divergente em `consentimento/page.tsx:42-45` (ordem do fecho errada — assinatura antes da data). Sugestão: `<SignatureLine name registry caption date>` + `<SignatureRow>`.
- **`chart-monochrome`** — `ChartLine` distingue série só por cor (matiz), sem `dash`/`marker`. Em P&B ou daltonismo, "área" e "score" (ambas sólidas) colapsam na mesma linha. Sugestão: props `dash`/`marker` em `ChartLine` + `ChartLegend` por forma, não só cor.

---

### 11. `chart-scale-and-labels` — primitivos de gráfico sem escala nem legenda (2 superfícies)

**O que falta:** `ChartBar`/`ChartLine` recebem coordenadas já em pixels — sem helper de escala (domínio→pixel), sem `ChartLegend`, sem marcador de ponto, sem rótulo de valor.

**Workaround do app:** `healing-chart.tsx` faz a escala à mão (`toPoints`, `xOf`), marcadores como `<circle>` cru, legenda como `<text>`/`<p>` manual — é justamente o custo que explica por que `/relatorios` **não tem gráfico nenhum** apesar do domínio já calcular os dados certos (`ChartBar`/`ChartGrid` exportados e zero call sites no app).

**Sugestão para a lib:** `createLinearScale({domain, range})`, primitivo de marcador de ponto, `ChartLegend`, `ChartValueLabel`.

---

### 12. `table-numeric-cell` + `table-sticky-header` (2 superfícies financeiras)

**O que falta:** `TableCell`/`TableHead` não têm prop `numeric`/`align`; `dist/style.css` não define `font-variant-numeric` em lugar nenhum; `.sv-table__head` não tem `position: sticky`.

**Workaround do app:** `text-right` manual em `relatorios/page.tsx` — e **esquecido** em `faturamento/page.tsx:56,70`, produzindo a inconsistência exata que uma prop evitaria. Sem cabeçalho fixo, tabelas de 100 linhas perdem a associação coluna↔valor no scroll.

**Sugestão para a lib:** `<TableCell numeric>`/`<TableHead numeric>` aplicando `text-align: end; font-variant-numeric: tabular-nums`; `stickyHeader?: boolean` em `Table`.

---

### 13. Componentes menores (1 gap por item, registrados para completude)

| Gap | Onde apareceu | Sugestão |
|---|---|---|
| `description-list` | `relatorios`, `plano-cuidados`, `relatorio-condicao` — metadados rótulo/valor sempre em `<p><strong>` manual | `<DataList>`/`<DataListItem label value>` semântico (`<dl>`) |
| `stat-card` | Dashboard e Relatórios reimplementam `MetricCard` duplicado, tipografia ad hoc | `<Stat label value hint? trend? href?>` |
| `card-header-action` | Padrão "título + link à direita" copiado em 2+ lugares porque `CardHeader` não aceita ação | prop `action?: ReactNode` em `CardHeader` |
| `button-size-xs` | `variant="link" h-auto p-0` usado 12+ vezes só para caber em linha de tabela, viola alvo mínimo de toque | `size="xs"` com hit-area preservada via `::after` |
| `button-loading` | `{saving ? "Salvando…" : "Salvar"}` + `disabled` manual, sem spinner nem `aria-busy` | prop `loading?`/`loadingLabel?` |
| `table-sortable` | Nenhuma lista do sistema ordena | `TableHead sortable sortDirection aria-sort` |
| `input-addon` | Preço sem "R$", quantidade sem unidade — presos no `<label>` | `Input prefix`/`suffix` |
| `combobox-async` | Busca de taxonomia NANDA-I/NOC/NIC reimplementada sem ARIA, sem navegação por setas | `Combobox` com `onSearch` assíncrono |
| `timeline` | Evoluções/condições/planos são `<ul>` de cards sem eixo nem agrupamento por data | `<Timeline>`/`<TimelineItem>`/`<TimelineGroup>` |
| `media-gallery` | Galeria de fotos de ferida é `<img>` cru, sem lightbox, sem comparação | `<MediaGrid>`/`<MediaThumb>`/`<MediaLightbox>`/`<MediaCompare>` |
| `status-indicator` | `StatusBadge` do app e `scoreBadgeClass` usam só cor de fundo pra distinguir estado | `<StatusIndicator tone icon-obrigatório label-obrigatório>` |
| `separator-label` | Divisor "ou" do login ficou torto após a migração — falta variante com texto centralizado | `<Separator label="ou">` |
| `accordion` | Sanfona do parceiro no portal é `Button` + render condicional sem ARIA | `<Accordion>` sobre Radix |

---

## Adoção pendente (não são gaps — componentes já existem, decisão AD-014 os deixou fora da migração)

Estes NÃO entram como issue na lib — são trabalho de adoção no EstomaSysTech, já com componente pronto no catálogo:

- **`Tabs`** — as 5 abas do prontuário (`pacientes/[id]/page.tsx:99-114`) e as abas de documentos são `Button` com `border-b-2` manual, sem `role="tablist"`/ARIA/teclado. `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` já vêm do client entry.
- **`AlertDialog`** — nenhuma das ~15 ações destrutivas do sistema (desativar paciente/profissional/parceiro/procedimento, resolver condição/plano, cancelar fatura, excluir foto) usa confirmação. Está pronto e ocioso.
- **`Badge`** — `StatusBadge` do app usa `CategoryPill` por decisão documentada (evitar colisão com accent da marca) — correto; mas nenhum booleano `active`/`inactive` tem badge dedicado, usando por atalho os status de consulta (`"confirmed"`/`"cancelled"`) para representar ativo/inativo.
- **`Tooltip`** — siglas clínicas (PUSH/DET) e ícones sem legenda persistente poderiam usar `Tooltip`, já no client entry.
- **`DropdownMenu`** — várias linhas de tabela com 3+ ações lado a lado (link, link, link) são candidatas naturais a colapsar num menu.
- **`Prose`** — o termo de consentimento no portal é texto corrido com `<pre>` monoespaçado 12px; é exatamente o caso de uso de `Prose`, hoje não adotado em nenhum dos 4 documentos nem no portal.
- **`ThemeToggle`** — não há troca de tema em lugar nenhum do app; `data-theme="light"` está hardcoded em `layout.tsx:34`. Baixa prioridade, mas registre: se algum dia for adotado, o gap `print-neutral-tokens` acima passa de teórico para bloqueante — hoje os documentos clínicos sobrevivem só porque o tema está fixo.

---

## Resumo para priorização

| # | Gap | Alcance | Bloqueia diretamente |
|---|---|---|---|
| 1 | `sidebar-app-shell` | 11/18 superfícies | Todo uso mobile do sistema |
| 2 | `feedback-toast` | 9/18 | Toda confirmação de escrita |
| 3 | `alert-semantic-variants` | 9/18 | Toda comunicação de erro/sucesso/alerta |
| 4 | `empty-state` | 7/18 | Onboarding e primeira execução |
| 5 | `field-wrapper` | 6+/18 | Acessibilidade de todo formulário |
| 6 | `table-responsive` | 5/18 | Leitura de dado tabular no mobile |
| 7 | `Calendar`/`DatePicker`/`TimeField` | 4/18 | Agenda inteira + self-service do portal |
| 8 | `ToggleGroup` | 4/18 | Filtros e seleção de horário |
| 9 | `icon-inline-alignment` | 2/18 (visível) | Correção trivial, alto retorno |
| 10 | Família "documento imprimível" (4 sub-gaps) | 4/18 (documentos) | Validade jurídica dos documentos clínicos |
| 11-13 | Demais (chart, table numérica/sticky, componentes menores) | 1-2/18 cada | Qualidade pontual |

Recomendo atacar 1→2→3 primeiro: juntos, resolvem a maioria dos P0 levantados na auditoria de UX sem exigir nenhuma decisão de produto — são puramente infraestrutura de design system.
