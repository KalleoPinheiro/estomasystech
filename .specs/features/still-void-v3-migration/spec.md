# Migração `@still-void/ui` 2.0.1 → 3.1.0 + fechamento das lacunas — Specification

## Problem Statement

O EstomaSysTech roda em `@still-void/ui@^2.0.1`. A `3.1.0` (latest) entrega, num único
salto, **13 das 18 lacunas** que a própria migração v2 levantou e registrou em
`docs/still-void-gaps.md` — inclusive as sete de maior volume (`native-select`,
`table`, `textarea`, `card-as-element`, `button-accent-variant`, `radio-group`,
`file-input`). Enquanto o app não sobe, esses 69 pontos marcados com `sv-gap:` em
30 arquivos continuam sendo estilo duplicado que a lib já sabe emitir, e as duas
receitas locais de `src/lib/ui.ts` (`nativeField`, 45 usos; `accentButton`, 59 usos)
seguem replicando à mão o que agora é catálogo.

A `3.0.0` é major e traz três mudanças que quebram silenciosamente: `DialogContent`
passa a renderizar um botão de fechar próprio (nome acessível `"Close dialog"`,
fixo em inglês), o frame de campo muda de 14px para `var(--sv-text-base)` (15px), e
o peer `tailwindcss` passa de `>=3 <4` para `>=4`.

## Goals

- [ ] `@still-void/ui@^3.1.0` instalado, com `npm run build`, `typecheck`, `test` e `test:e2e` verdes
- [ ] `src/lib/ui.ts` **deixa de existir**: as duas receitas locais são substituídas por catálogo
- [ ] Zero `<select>`, `<textarea>`, `<input type="file|checkbox|radio">` e `<table>` crus em `src/**/*.tsx`
- [ ] Ponte Tailwind passa a ser `@import "@still-void/ui/tailwind.css"` em vez de bloco copiado à mão
- [ ] `docs/still-void-gaps.md` reduzido às lacunas que a `3.1.0` **de fato** ainda tem, e `npm run check:sv` verde

## Out of Scope

Explicitamente excluído. Decisão do usuário (2026-08-25): o escopo é **portar
workarounds**, não adotar padrões de UI novos.

| Feature | Reason |
| --- | --- |
| `Badge` nos selos de status (7 pills `rounded-full`) | Padrão novo. As pills do app carregam cor semântica (`success`/`warning`/`danger`); `Badge` só tem `default`/`secondary`/`destructive`/`outline`. Adotar exigiria decidir o mapeamento — é redesign, não port. |
| `fieldMessage()` + `aria-invalid` nos erros de formulário | Recurso novo da 3.1.0, mas o app hoje não tem estado de erro por campo. Introduzi-lo é feature. |
| Família `AlertDialog` | O app não tem nenhuma confirmação destrutiva hoje (`window.confirm` não aparece em `src/`). Zero call sites reais. |
| `Tabs`, `Tooltip`, `DropdownMenu` | Padrões estruturais: mudariam navegação e interação do prontuário e das tabelas. Redesign. |
| `ThemeProvider` / `ThemeToggle` / `ThemeScript` | O app não expõe troca de tema. Adicionar é feature. |
| `Prose` / `Lead` / `ArticleHeader` nos documentos imprimíveis | Tipografia de artigo/blog; os documentos clínicos têm layout de impressão próprio. |
| Fechar as lacunas remanescentes (`pagination`, `progress`, `separator`, `data-chart`) | Continuam ausentes na `3.1.0`. Permanecem documentadas como backlog da lib. |
| Implementar componente dentro do repo `still-void` | Outro repositório; aqui só se registra a lacuna. |
| Redesenho visual (layout, hierarquia, fluxos) | "Port, don't redesign", herdado da migração v2. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Versão alvo | `^3.1.0` | `npm view @still-void/ui dist-tags` → `latest: 3.1.0`, conferido em 2026-08-25. Linha 3.x: `3.0.0`, `3.0.1`, `3.1.0`. | y |
| Botão de fechar do `DialogContent` | `showCloseButton={false}` + o botão pt-BR do `Modal` | Decisão do usuário. O botão da lib tem nome acessível `"Close dialog"` **hardcoded** (verificado em `dist/react/client/index.js`; `DialogContentProps` só expõe `showCloseButton`, não o rótulo). Numa UI pt-BR isso seria regressão de acessibilidade. Vira lacuna nova `dialog-close-label`. | y |
| Glifos de texto | Trocar os cobertos pelo `Icon`; registrar os não cobertos | Decisão do usuário. `IconName` tem 15 nomes; `📷`, `⛔`, `⏳` não têm equivalente. `−` e `≤` são **sinais matemáticos em texto corrido**, não ícones — ficam como estão e não entram na lacuna. | y |
| `FileInput` muda a aparência dos 2 call sites | Adotar mesmo assim | Hoje é `<input type="file" className="hidden">` dentro de um `<label>` que parece link ("+ Adicionar foto"). O `FileInput` da lib é o `<input type="file">` **visível** com botão de seleção estilizado. Manter o padrão escondido deixaria aberta uma lacuna que a lib fechou exatamente a pedido deste app. É a única mudança visual que este port produz. Confirmado pelo usuário em 2026-08-25. | y |
| Ponte Tailwind | `@import "@still-void/ui/tailwind.css"`, removendo o bloco `--color-sv-*` copiado à mão e o `@source` do `dist` | Verificado: a `3.1.0` não emite **nenhuma** classe Tailwind no `dist` (busca por `bg-`/`text-`/`ring-`/`shadow-` retornou vazio) — o `@source` passaria a varrer alvo vazio. `tailwind.css` cobre os 5 utilitários `sv-*` que o app usa por conta própria. | y |
| `--spacing: var(--sv-space-1)` que o `tailwind.css` define | Aceito | `--sv-space-1` é `4px` e o default do Tailwind v4 é `0.25rem` — mesmos 4px com `font-size` raiz de 16px. Sem mudança de valor no app; anotado como edge case caso a raiz mude. | y |
| Ponte semântica do app (`--color-accent`, `--color-ink-3`, `--color-danger-soft`…) | Permanece intacta em `globals.css` | É AD-006, vocabulário do app, namespace distinto de `--color-sv-*`. `tailwind.css` não a substitui. | y |
| `--color-background` / `--color-ring` / `--color-destructive` / `--color-destructive-foreground` | Removidos junto com `nativeField` | Únicos consumidores eram `ring-ring` e `ring-offset-background` dentro de `nativeField` (`src/lib/ui.ts`), que some. Confirmado por varredura: zero uso em `src/**/*.tsx`. | y |
| Nav colapsável do `Header` (3.1.0) | Chega automaticamente, sem opt-in; asserção de não-regressão | Único call site é `src/app/portal/layout.tsx`. Abaixo de 640px o nav vira `<details>`/`<summary>`; acima, CSS força visível. Não é escolha de escopo — é comportamento que a versão traz. | y |
| Frame de campo 14px → 15px | Aceito sem compensação | Mudança declarada no CHANGELOG da `3.0.0` como correção contra a escala de tokens (14px era default não-rotulado do Tailwind). Altura, raio, padding e cor inalterados. | y |
| Definição de "portado" para o gate | Ausência do padrão cru verificada por `scripts/check-sv-adoption.sh` **mais** teste de comportamento nos componentes tocados | Mantém o critério da migração v2 (evita o gap de precisão L-004: critério escrito em termos de UI sem dizer onde é satisfeito). | y |

**Open questions:** none — todas resolvidas com o usuário ou registradas como assunção acima (requisito para a spec ser confirmada).

---

## Implicit-Requirement Dimensions Sweep

Escopo Large ⇒ varredura completa; cada dimensão resolve em requisito ou `N/A` justificado.

| Dimension | Resolução |
| --- | --- |
| Input validation & bounds | **Requisito SV3-11.** Todo atributo de validação do campo trocado (`name`, `required`, `min`, `max`, `step`, `pattern`, `accept`, `maxLength`) é preservado byte a byte na troca — `Input`, `Textarea`, `NativeSelect`, `FileInput`, `Checkbox` e `RadioGroupItem` fazem spread de `...props`. |
| Failure / partial-failure states | **Requisito SV3-12.** Cada task fecha em commit atômico com `typecheck` + `test` + `check:sv` verdes; nenhuma árvore intermediária fica com metade dos `<select>` trocados e o gate vermelho. |
| Idempotency / retry / duplicate handling | N/A — a migração não introduz operação de runtime; nenhum efeito repetível é criado ou alterado. |
| Auth boundaries & rate limits | N/A — nenhuma rota, middleware ou verificação de sessão é tocada. `src/proxy.ts` e `src/lib/auth` ficam fora do diff. |
| Concurrency / ordering | **Requisito SV3-13.** Fronteira server/client: os seis primitivos novos são server-safe por construção (sem hook, sem Radix). Nenhum arquivo ganha `"use client"` por causa desta migração; a checagem [6] do gate segue verde. |
| Data lifecycle / expiry | N/A — nenhum dado persistido, nenhum schema, nenhuma migração de banco. |
| Observability | N/A — nenhum log, métrica ou trace é adicionado ou removido. A única saída observável nova é a do gate `npm run check:sv`, já existente. |
| External-dependency failure | **Requisito SV3-14.** `@still-void/ui` fixado em `^3.1.0` com `package-lock.json` atualizado; `npm audit` não pode ganhar HIGH/CRITICAL novo em relação ao baseline de `fcd6110` (AD-013). As 5 dependências Radix novas (`alert-dialog`, `dropdown-menu`, `select`, `tabs`, `tooltip`) e `@heroicons/react` entram na árvore mesmo sem call site. |
| State-transition integrity | **Requisito SV3-15.** Campos controlados preservam a semântica de estado: `checked`/`onChange` no `Checkbox`, `value`/`onChange` no `NativeSelect` e `Textarea`. Nos rádios, o `name` do `RadioGroup` só é injetado em **filho direto** — os três grupos de `care-plans-section.tsx` hoje aninham `<input type="radio">` dentro de `<label>`, então a reestruturação para `RadioGroupItem` como filho direto (com o rótulo em `children`) é obrigatória, não cosmética. |

---

## User Stories

### P1: Subir para a `3.1.0` absorvendo as quebras da major ⭐ MVP

**User Story**: Como mantenedor do EstomaSysTech, quero o app rodando em `@still-void/ui@^3.1.0`
com todo o comportamento atual preservado, para poder consumir o catálogo novo.

**Why P1**: É o bloqueio raiz — nenhuma das outras histórias existe sem a versão instalada.

**Acceptance Criteria**:

1. WHEN `package.json` é lido THEN a dependência `@still-void/ui` SHALL declarar `^3.1.0` e `node_modules/@still-void/ui/package.json` SHALL reportar `version` iniciando em `3.`
2. WHEN `src/components/modal.tsx` é renderizado THEN `DialogContent` SHALL receber `showCloseButton={false}` e o documento SHALL conter **exatamente um** elemento com nome acessível `Fechar` e **zero** com nome acessível `Close dialog`
3. WHEN `tests/components/modal.test.tsx` é executado THEN SHALL passar sem alteração nas suas asserções de acessibilidade (`role="dialog"`, `aria-modal="true"`, rótulo igual ao `title`, `Escape` chama `onClose`, clique no conteúdo não chama, foco retorna ao gatilho)
4. WHEN `src/app/portal/layout.tsx` é renderizado THEN o `<nav>` do `Header` SHALL continuar expondo os mesmos itens de navegação, com os mesmos `href`, e o `<summary>` de colapso SHALL ter nome acessível não vazio
5. WHEN `npm run typecheck` é executado THEN SHALL sair com código 0
6. WHEN `npm run build` é executado THEN SHALL sair com código 0
7. WHEN `npm test` é executado THEN SHALL sair com código 0 mantendo os limiares de cobertura de 90% (`lines`, `functions`, `branches`, `statements`) já configurados em `vitest.config.ts`
8. WHEN `npm run test:e2e` é executado THEN SHALL manter 64/64, o resultado verde estabelecido pela feature `e2e-consentimento-verdes`

**Independent Test**: `npm run typecheck && npm run build && npm test && npm run test:e2e` verdes com a `3.1.0` instalada e o `Modal` fechando por um único botão rotulado `Fechar`.

---

### P1: Campos de formulário vêm do catálogo ⭐ MVP

**User Story**: Como desenvolvedor do EstomaSysTech, quero que `<select>`, `<textarea>`,
`<input type="file|checkbox|radio">` venham da lib, para que a receita `nativeField`
— 45 usos espelhando à mão o frame do `Input` — deixe de existir.

**Why P1**: É o maior bloco de dívida do inventário e o que a `3.0.0` fecha de forma mais direta.

**Acceptance Criteria**:

1. WHEN `<select` cru é procurado em `src/**/*.tsx` THEN SHALL restar **zero** ocorrências (baseline: 23)
2. WHEN `<textarea` cru é procurado em `src/**/*.tsx` THEN SHALL restar **zero** ocorrências (baseline: 7)
3. WHEN `<input` com `type="file"`, `type="checkbox"` ou `type="radio"` é procurado em `src/**/*.tsx` THEN SHALL restar **zero** ocorrências (baseline: 2 + 1 + 3)
4. WHEN um `<select>` é substituído por `NativeSelect` THEN SHALL preservar `name`, `value`/`defaultValue`, `onChange`, `required`, `disabled` e a lista de `<option>` inalterada — e o campo SHALL continuar serializando em `FormData` sob a mesma chave
5. WHEN os três grupos de rádio de `care-plans-section.tsx` são substituídos por `RadioGroup`/`RadioGroupItem` THEN cada item SHALL ser **filho direto** do `RadioGroup` (rótulo em `children`), o grupo SHALL manter `legend` com o mesmo texto do `<legend className="sr-only">` atual via `legendHidden`, e selecionar um item SHALL desmarcar os demais do mesmo `name`
6. WHEN o checkbox "Insumo ativo" de `materiais/page.tsx` é clicado THEN SHALL alternar `values.active` exatamente como hoje e SHALL continuar associado ao texto "Insumo ativo" por rótulo acessível
7. WHEN um `FileInput` é usado nos dois call sites de upload THEN SHALL preservar `accept`, `disabled`, o `onChange` que dispara o upload e o reset de `e.target.value` após o envio
8. WHEN `src/lib/ui.ts` é procurado THEN o arquivo SHALL **não existir**, e `grep -rn "nativeField\|accentButton" src` SHALL retornar vazio

**Independent Test**: `npm test` verde + `npm run check:sv` sem achado nas checagens de campo, com `src/lib/ui.ts` ausente da árvore.

---

### P1: Tabelas vêm da família `Table` ⭐ MVP

**User Story**: Como desenvolvedor, quero que as 14 tabelas do staff usem a família
`Table`, para que a mesma decoração de cabeçalho e corpo pare de ser reescrita em 12 arquivos.

**Why P1**: É a lacuna que o próprio documento classificou como "maior retorno".

**Acceptance Criteria**:

1. WHEN `<table` cru é procurado em `src/**/*.tsx` THEN SHALL restar **zero** ocorrências (baseline: 14)
2. WHEN uma tabela migrada é renderizada THEN SHALL expor `role="table"` com o mesmo número de colunas e a mesma ordem de células de hoje, e cada cabeçalho SHALL continuar sendo `<th>` (via `TableHead`)
3. WHEN uma tabela migrada é renderizada THEN SHALL estar dentro do container de rolagem horizontal da lib (`sv-table-container`), sem que a página ganhe rolagem horizontal própria
4. WHEN um teste de página que hoje consulta linhas ou células de tabela é executado THEN SHALL continuar passando sem afrouxar a consulta

**Independent Test**: `npm test` verde e a checagem `<table> cru` do gate em zero.

---

### P1: Ação primária é `Button variant="accent"` ⭐ MVP

**User Story**: Como desenvolvedor, quero que a ação primária seja uma variante do
catálogo, para que a constante `accentButton` — 59 usos passados por `className` — desapareça.

**Why P1**: Fecha a lacuna `button-accent-variant` e é pré-requisito para apagar `src/lib/ui.ts`.

**Acceptance Criteria**:

1. WHEN `accentButton` é procurado em `src/**` THEN SHALL retornar **zero** ocorrências (baseline: 59)
2. WHEN um botão que hoje recebe `accentButton` é renderizado THEN SHALL ser um `Button variant="accent"` e SHALL manter `type`, `disabled`, `onClick` e o texto acessível atuais
3. WHEN um botão primário recebia `className` adicional além de `accentButton` (largura, espaçamento) THEN esse `className` SHALL sobreviver na troca

**Independent Test**: `grep -c accentButton src -r` = 0 e a suíte de páginas verde.

---

### P1: Documento de lacunas e gate refletem a `3.1.0` ⭐ MVP

**User Story**: Como mantenedor do still-void, quero `docs/still-void-gaps.md` contendo
apenas o que a `3.1.0` ainda não tem, para o backlog da lib parar de listar trabalho já entregue.

**Why P1**: Por AD-005 o gate `check:sv` falha nos dois sentidos — deixar seção órfã ou marcação órfã quebra o build.

**Acceptance Criteria**:

1. WHEN `docs/still-void-gaps.md` é lido THEN a "Versão verificada" SHALL ser `@still-void/ui@3.1.0` e SHALL **não** conter seção para `native-select`, `textarea`, `table`, `checkbox`, `radio-group`, `file-input`, `card-as-element`, `button-accent-variant`, `alert-dialog`, `dialog-shadow`, `dialog-close-button`, `dialog-aria-modal`, `badge-hardcoded-red` nem `tailwind-setup-v3-only`
2. WHEN uma lacuna é declarada fechada THEN o símbolo correspondente SHALL constar na *export line* de `dist/react/index.d.ts` ou `dist/react/client/index.d.ts` da `3.1.0` — evidência do artefato publicado, não da documentação (regra herdada da migração v2)
3. WHEN `docs/still-void-gaps.md` é lido THEN SHALL manter as quatro lacunas ainda reais na `3.1.0` — `pagination`, `progress`, `separator`, `data-chart` — cada uma reconferida contra a export line da `3.1.0`
4. WHEN `docs/still-void-gaps.md` é lido THEN SHALL conter duas entradas novas: `dialog-close-label` (nome acessível `"Close dialog"` sem prop de tradução) e `icon-set-gaps` (ausência de equivalente para câmera, bloqueado e pendente no `IconName` de 15 nomes)
5. WHEN `npm run check:sv` é executado THEN SHALL sair com código 0, com zero `sv-gap` órfão nos dois sentidos
6. WHEN `scripts/check-sv-adoption.sh` é lido THEN SHALL ter ganho checagens para os padrões que agora têm equivalente — `<select>`, `<textarea>`, `<table>`, `<input type="file|checkbox|radio">` e `accentButton` — com o baseline pré-migração registrado no cabeçalho, como já é a convenção do arquivo
7. WHEN `tests/scripts/check-sv-adoption.test.ts` é executado THEN SHALL cobrir as checagens novas contra fixture, provando que cada uma **acha** o padrão cru antes de aprovar sua ausência

**Independent Test**: `npm run check:sv` verde e cada nome removido do documento conferível contra a export line da `3.1.0`.

---

### P2: Superfície de cartão com semântica correta

**User Story**: Como desenvolvedor, quero que os 9 pontos onde a superfície de cartão
precisa ser `<section>` ou `<li>` usem `Card as=`, em vez de reescrever a superfície à mão.

**Why P2**: Não bloqueia build nem teste — é duplicação visual, não quebra. Mas fecha `card-as-element`.

**Acceptance Criteria**:

1. WHEN um dos 9 pontos marcados `sv-gap: card-as-element` é renderizado THEN SHALL usar `Card` com `as="section" | "li" | "article" | "aside"` (ou `asChild`) e SHALL emitir a mesma tag HTML de hoje
2. WHEN o elemento migrado é inspecionado THEN a superfície SHALL vir da classe do `Card`, e a dupla `rounded-lg border border-sv-border bg-sv-surface` escrita à mão SHALL desaparecer daquele ponto
3. WHEN um `Card as="li"` é usado THEN SHALL continuar sendo filho direto de `<ul>`/`<ol>`, preservando a validade da lista

**Independent Test**: `grep -rn "sv-gap: card-as-element" src` retorna vazio e as páginas afetadas seguem verdes.

---

### P2: Glifos cobertos viram `Icon`

**User Story**: Como desenvolvedor, quero que os símbolos que a lib desenha venham do
`Icon`, para que o app pare de depender da fonte do sistema para desenhar `✕`, `⚠` e setas.

**Why P2**: Melhora consistência e escala com os tokens, mas nenhum comportamento depende disso.

**Acceptance Criteria**:

1. WHEN `✕` é procurado em `src/**/*.tsx` THEN SHALL restar zero ocorrências, substituído por `<Icon name="x" />` (baseline: 1, em `modal.tsx`)
2. WHEN `⚠` é procurado em `src/**/*.tsx` THEN SHALL restar zero ocorrências, substituído por `<Icon name="alert-triangle" />` (baseline: 3)
3. WHEN `✓` é procurado em `src/**/*.tsx` THEN SHALL restar zero ocorrências, substituído por `<Icon name="check-circle" />` ou `name="check"` (baseline: 1, em `consent-card.tsx`)
4. WHEN `←` ou `→` aparece como **afordância de navegação** (voltar, avançar, paginar) THEN SHALL virar `<Icon name="chevron-left" />` / `<Icon name="chevron-right" />` (baseline: 3 `←` e 11 `→`, a classificar um a um); WHEN aparece dentro de texto corrido como ligação tipográfica (ex.: `"Triagem → Consulta"`) THEN SHALL permanecer como está
5. WHEN um `Icon` substitui um glifo que era a **única** informação do controle THEN SHALL receber `label` com o texto acessível equivalente ao de hoje; WHEN acompanha texto visível THEN SHALL ficar sem `label` (decorativo)
6. WHEN `📷`, `⛔` ou `⏳` é encontrado (baseline: 1 cada) THEN SHALL permanecer inalterado, marcado com `sv-gap: icon-set-gaps` e coberto pela seção correspondente do documento de lacunas
7. WHEN `−` (menos) ou `≤` é encontrado THEN SHALL permanecer inalterado e SHALL **não** ser marcado como lacuna — é notação matemática em texto, não ícone

**Independent Test**: os `grep` dos AC1–3 retornam vazio; `npm run check:sv` verde com a lacuna `icon-set-gaps` pareada.

---

### P2: Ponte Tailwind vem do pacote

**User Story**: Como mantenedor, quero a ponte de tokens importada do pacote, para que
o bloco copiado à mão em `globals.css` pare de precisar ser mantido em sincronia manual.

**Why P2**: É a lacuna `tailwind-setup-v3-only`, aberta pelo próprio app e fechada pela `3.0.0`.

**Acceptance Criteria**:

1. WHEN `src/app/globals.css` é lido THEN SHALL conter `@import "@still-void/ui/tailwind.css";` depois do `@import` de `theme.css`
2. WHEN `src/app/globals.css` é lido THEN SHALL **não** conter mais `@source "../../node_modules/@still-void/ui/dist";` nem os `--color-sv-*`, `--color-background`, `--color-ring`, `--color-destructive` e `--color-destructive-foreground` declarados à mão
3. WHEN `src/app/globals.css` é lido THEN a ponte semântica do app (`--color-accent`, `--color-ink*`, `--color-border*`, `--color-*-soft`, `--font-*`, `--radius-*`) SHALL permanecer inalterada — é AD-006 e não é substituída pelo pacote
4. WHEN o CSS gerado do build é inspecionado THEN todo utilitário `bg-sv-*`/`text-sv-*`/`border-sv-*` que o app usa no seu próprio markup SHALL continuar existindo e resolvendo para `var(--sv-*)`
5. WHEN o app é comparado antes e depois THEN nenhuma cor renderizada SHALL mudar, com uma exceção declarada: o `font-size` do frame de campo passa de 14px para 15px (mudança da `3.0.0`)

**Independent Test**: `npm run build` verde e uma página com campo, cartão e tabela renderizando com as mesmas cores de antes.

---

## Edge Cases

- WHEN o `Header` é renderizado abaixo de 640px THEN o nav SHALL colapsar em `<details>`/`<summary>`; WHEN renderizado acima de 640px THEN SHALL permanecer visível independentemente do estado `open` — inclusive nos browsers que implementam `::details-content` (corrigido na `3.1.0`)
- WHEN um `RadioGroupItem` acaba aninhado dentro de outro elemento em vez de ser filho direto do `RadioGroup` THEN o `name` do grupo **não** é injetado e os rádios deixam de ser mutuamente exclusivos — o teste de comportamento do AC P1-2.5 é o que pega isso
- WHEN `NativeSelect` recebe `value` sem `onChange` THEN o React emite aviso de campo controlado; os call sites que hoje usam `defaultValue` SHALL continuar com `defaultValue`
- WHEN a família `Table` roda em jsdom THEN não há dependência de API de browser (é server-safe, sem Radix) — se algum teste falhar, a causa é o markup, não o ambiente
- WHEN o `FileInput` substitui o par `<label>` + `<input className="hidden">` THEN a afordância visual muda de "link" para controle de arquivo nativo estilizado — é a única alteração visual planejada, aprovada explicitamente (ver tabela de assunções)
- WHEN a `font-size` raiz do documento não for 16px THEN `--spacing: var(--sv-space-1)` (4px absolutos) divergirá do default `0.25rem` do Tailwind; hoje o app não altera a raiz
- WHEN `npm audit` ganhar HIGH/CRITICAL novo vindo das 5 dependências Radix ou do `@heroicons/react` THEN o achado SHALL ser reproduzido localmente antes de virar trabalho (AD-013)
- WHEN um `<select>` for encontrado dentro de um documento imprimível (`src/app/documentos/**`) THEN a troca SHALL preservar o comportamento de impressão — essas telas ignoram o tema por decisão (AD-006)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SV3-01 | P1: Versão — `^3.1.0` instalada e build verde | Implemented | Verified |
| SV3-02 | P1: Versão — `Modal` com `showCloseButton={false}` e rótulo pt-BR único | Implemented | Verified |
| SV3-03 | P1: Versão — `Header` sem regressão de navegação | Implemented | Verified |
| SV3-04 | P1: Campos — `NativeSelect` nos 23 `<select>` | Implemented | Verified |
| SV3-05 | P1: Campos — `Textarea` nos 7 `<textarea>` | Implemented | Verified |
| SV3-06 | P1: Campos — `Checkbox`, `RadioGroup`, `FileInput` | Implemented | Verified |
| SV3-07 | P1: Campos — `src/lib/ui.ts` eliminado | Implemented | Verified |
| SV3-08 | P1: Tabelas — família `Table` nas 14 tabelas | Implemented | Verified |
| SV3-09 | P1: Botões — `Button variant="accent"` nos 59 usos | Implemented | Verified |
| SV3-10 | P1: Lacunas — documento reduzido às 4 reais + 2 novas | Implemented | Verified |
| SV3-11 | Sweep: validação — atributos de campo preservados | Implemented | Verified |
| SV3-12 | Sweep: falha parcial — gate verde por commit | Implemented | Verified |
| SV3-13 | Sweep: fronteira server/client sem `"use client"` novo | Implemented | Verified |
| SV3-14 | Sweep: dependência — lockfile e `npm audit` sem HIGH/CRITICAL novo | Implemented | Verified |
| SV3-15 | Sweep: estado — campos controlados e exclusividade de rádio | Implemented | Verified |
| SV3-16 | P1: Lacunas — `check:sv` estendido e testado contra fixture | Implemented | Verified |
| SV3-17 | P2: `Card as`/`asChild` nos 9 pontos | Implemented | Verified |
| SV3-18 | P2: `Icon` nos glifos cobertos | Implemented | Verified |
| SV3-19 | P2: `Icon` — glifos não cobertos registrados como lacuna | Implemented | Verified |
| SV3-20 | P2: Ponte Tailwind via `@still-void/ui/tailwind.css` | Implemented | Verified |
| SV3-21 | P2: Ponte semântica do app (AD-006) preservada | Implemented | Verified |

**ID format:** `SV3-[NUMBER]`
**Status values:** Pending → In Design → In Tasks → Implementing → Verified
**Coverage:** 21 total, 21 mapeados a tasks, 0 sem mapeamento — 39 tasks (T1-T39) em 8 fases, todas commitadas

---

## Success Criteria

- [x] `npm run typecheck && npm run build && npm test && npm run test:e2e` verdes, cobertura ≥ 90% mantida, e2e em 64/64
- [x] `npm run check:sv` verde com as checagens novas de `<select>`, `<textarea>`, `<table>`, `<input type="file|checkbox|radio">` e `accentButton`
- [x] `src/lib/ui.ts` não existe mais; as 69 marcações `sv-gap:` caem para as poucas que a `3.1.0` ainda justifica
- [x] `docs/still-void-gaps.md` lista **só** o que a `3.1.0` não tem, cada nome conferido contra a export line do artefato publicado
- [x] Nenhuma cor renderizada muda, com a única exceção declarada do frame de campo (14px → 15px)
