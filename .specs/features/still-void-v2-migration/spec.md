# Migração `@still-void/ui` 1.x → 2.0 + adoção do catálogo — Specification

## Problem Statement

O EstomaSysTech depende de `@still-void/ui@^1.1.0`. A versão `2.0.0` remove o entry point
bare `@still-void/ui` — cinco arquivos do app importam dele e quebram na resolução de
módulo. Além disso, o app reimplementa em HTML cru componentes que a lib já entrega
(botão, input, card, alerta, diálogo), e pinta 52 utilitários Tailwind (`amber-*`,
`emerald-*`, `sky-*`) sem qualquer ponte para os tokens do design system.

## Goals

- [ ] `@still-void/ui@^2.0.1` instalado e zero import bare `@still-void/ui` em `src/`
- [ ] `npm run build`, `npm run typecheck`, `npm test` e `npm run test:e2e` verdes
- [ ] Todo elemento com equivalente no catálogo v2 passa a usar o componente da lib
- [ ] Zero utilitário de cor sem ponte para token `--sv-*`
- [ ] Arquivo de lacunas com os componentes que faltam na lib, pronto para virar backlog do still-void

## Out of Scope

| Feature | Reason |
| --- | --- |
| Trocar os 23 `<select>` nativos pelo `Select` Radix da lib | Decisão do usuário (2026-08-22): Radix Select é combobox custom, não substituto drop-in de campo de formulário; quebraria `userEvent.selectOptions` em ~8 arquivos de teste e forçaria boundary client novo. Vira item do arquivo de lacunas (`NativeSelect`). |
| Criar componentes novos dentro do repo do still-void | O pedido é *listar* as lacunas; a implementação na lib é trabalho futuro em outro repositório. |
| Redesenho visual (novo layout, nova hierarquia, novos fluxos) | "Port, don't redesign" — a migração é de implementação, não de design. |
| `DropdownMenu`, `Tabs`, `Tooltip`, `TableOfContents`, `ReadingProgress`, `CopyButton` | Existem na lib mas o app não tem hoje nenhum caso de uso desses padrões. Adotá-los seria feature nova. |
| Trocar `ThemeProvider`/`ThemeToggle` da lib | O app não expõe troca de tema hoje; adicionar é feature nova. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Alvo de versão | `^2.0.1` | No planejamento a única release da linha 2.x era a `2.0.0`; a `2.0.1` foi publicada durante a implementação e é a que ficou travada no `package.json` e conferida em todas as evidências deste registro. | y |
| `<select>` nativo e `<textarea>` | Mantidos, com estilo tokenizado; registrados como lacuna | Decisão do usuário. | y |
| Paleta | Migrar para utilitários semânticos e remover apelidos `slate-*`/`teal-*` do `@theme` | Decisão do usuário. Ressalva registrada: `slate-*`/`teal-*` **já** apontam para `--sv-*` via `@theme`, então isso é renomeação (legibilidade + fim do apelido enganoso), não correção visual. `amber/emerald/sky` são hardcode real. | y |
| `AlertDialog` | Tratado como **inexistente** na v2 | `docs/design-system.md` cita a família `AlertDialog`, mas a export line de `dist/react/client/index.d.ts@2.0.1` não a inclui. Evidência do artefato publicado vence a documentação. | y |
| Modal do app | Mantém a API pública `Modal({title,onClose,children})`, trocando o miolo por `Dialog` da lib | `Dialog` existe no catálogo v2 e cobre focus trap / Escape / `aria-modal` que hoje são feitos à mão. A API estável evita tocar nos ~10 call sites. | y |
| `ErrorAlert` | Passa de `Callout kind="warn"` + override de CSS var para `Alert` + `AlertDescription` | A v2 traz `Alert` de verdade; o workaround do `Callout` existia porque a v1 não tinha. | y |
| Componente `Header`/`Sidebar`/`Hero`/`Layout`/`CategoryPill` já em uso | Sem mudança além do path de import | A migração é só de import path para quem já usava `/react`. | y |
| Definição de "adaptado" para o gate | Verificável por asserção estática no código-fonte (ausência de padrão cru) + teste de comportamento nos componentes tocados | Evita o gap de precisão da lição candidata L-004 (critério redigido em termos de UI sem dizer onde é satisfeito). | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Subir para a v2 sem quebrar a resolução de módulo ⭐ MVP

**User Story**: Como mantenedor do EstomaSysTech, quero o app rodando em `@still-void/ui@^2.0.1`
para receber correções e componentes shadcn da linha 2.x.

**Why P1**: Sem isso nada mais compila. É o bloqueio raiz.

**Acceptance Criteria**:

1. WHEN `package.json` é lido THEN a dependência `@still-void/ui` SHALL declarar `^2.0.1` e `node_modules/@still-void/ui/package.json` SHALL reportar `version` iniciando em `2.`
2. WHEN `grep -rn "from \"@still-void/ui\"" src` é executado THEN o resultado SHALL ser vazio (zero linhas)
3. WHEN `src/app/globals.css` é lido THEN os `@import` de `@still-void/ui/theme.css` e `@still-void/ui/style.css` SHALL permanecer inalterados (a v2 não muda os entry points de CSS)
4. WHEN `npm run typecheck` é executado THEN SHALL sair com código 0
5. WHEN `npm run build` é executado THEN SHALL sair com código 0
6. WHEN `npm test` é executado THEN SHALL sair com código 0 e manter os limiares de cobertura de 90% já configurados

**Independent Test**: `npm run typecheck && npm run build` passa e `grep` por import bare retorna vazio.

---

### P1: Trocar reimplementações por componentes do catálogo v2 ⭐ MVP

**User Story**: Como desenvolvedor do EstomaSysTech, quero que todo elemento que a lib já
entrega venha da lib, para não manter estilo duplicado e divergente.

**Why P1**: É o núcleo do pedido — "adaptar todos os componentes existentes para usar a lib".

**Acceptance Criteria**:

1. WHEN um `<button>` cru é procurado em `src/**/*.tsx` THEN SHALL restar **zero** ocorrências, exceto as explicitamente justificadas por comentário `// sv-gap:` no próprio arquivo
2. WHEN um `<input>` de tipo `text|email|tel|number|date|time|password|search|url` é procurado em `src/**/*.tsx` THEN SHALL restar zero ocorrências não marcadas com `// sv-gap:`
3. WHEN `src/components/feedback.tsx` é renderizado com `<ErrorAlert message="x" />` THEN SHALL emitir um elemento com `role="alert"` contendo o texto `x`, construído com `Alert`/`AlertDescription` de `@still-void/ui/react`
4. WHEN `<Modal>` é aberto THEN SHALL manter o contrato de acessibilidade já coberto por `tests/components/modal.test.tsx`: `role="dialog"`, `aria-modal="true"`, rótulo acessível igual ao `title`, foco inicial dentro do diálogo, `Escape` dispara `onClose`, clique no backdrop dispara `onClose`, clique no conteúdo **não** dispara `onClose`, e o foco retorna ao elemento que abriu
5. WHEN um bloco de conteúdo é uma "caixa de cartão" (superfície + borda + raio) THEN SHALL usar `Card`/`CardHeader`/`CardTitle`/`CardContent`/`CardFooter` da lib em vez de `<div>` com classes de superfície
6. WHEN `<LoadMoreButton visible>` é renderizado THEN SHALL emitir um `<button>` produzido por `Button` da lib com texto `Carregar mais` e SHALL chamar `onClick` uma vez por clique
7. WHEN `<LogoutButton>` é clicado THEN SHALL continuar fazendo `POST /api/auth/logout` e navegando para `/login`, agora renderizado via `Button variant="ghost"` da lib
8. WHEN qualquer arquivo em `src/` é inspecionado THEN todo import de símbolo da lib SHALL vir de `@still-void/ui/react` ou `@still-void/ui/react/client`, e um símbolo client-only (`Dialog*`, `Select*`, `useTheme`, `copyToClipboard`, …) SHALL aparecer apenas em arquivo com diretiva `"use client"`

**Independent Test**: `npm test` verde + varredura estática (`scripts/check-sv-adoption.sh`) sem achados.

---

### P1: Registrar as lacunas do catálogo ⭐ MVP

**User Story**: Como mantenedor do still-void, quero a lista exata dos componentes que o
EstomaSysTech precisa e a lib não tem, para transformar em backlog da lib.

**Why P1**: É a segunda metade explícita do pedido.

**Acceptance Criteria**:

1. WHEN `docs/still-void-gaps.md` existe THEN SHALL listar cada componente ausente com: nome proposto, motivo, quantidade de call sites no EstomaSysTech, arquivos de exemplo e o workaround em vigor
2. WHEN um componente é listado como ausente THEN SHALL **não** constar na export line de `@still-void/ui/react@2.0.1` nem de `@still-void/ui/react/client@2.0.1`
3. WHEN o arquivo é lido THEN SHALL conter no mínimo as lacunas confirmadas por inventário: `Textarea`, `NativeSelect`, `Label`/`Field`, família `Table`, `Checkbox`, `RadioGroup`, `Pagination`, `Progress`, `Separator` e `AlertDialog`
4. WHEN um workaround local sobrevive no código THEN SHALL existir um comentário `// sv-gap: <nome-da-lacuna>` no ponto do código, apontando para a entrada correspondente do documento

**Independent Test**: abrir `docs/still-void-gaps.md`; cada nome citado é conferível contra a export line da v2.

---

### P2: Um único vocabulário de cor, todo em token

**User Story**: Como desenvolvedor, quero que a cor no código diga o papel semântico
(`text-ink-3`, `border-border`, `text-accent-ink`) e não um apelido de paleta Tailwind.

**Why P2**: Não bloqueia a v2, mas sem isso o app fica com dois vocabulários — o da lib e o
apelido `slate-*`/`teal-*` — e os 52 usos de `amber/emerald/sky` seguem fora do tema.

**Acceptance Criteria**:

1. WHEN `grep -rE "(slate|teal|amber|emerald|sky)-[0-9]{2,3}" src --include='*.tsx'` é executado THEN SHALL retornar zero linhas
2. WHEN `src/app/globals.css` é lido THEN o bloco `@theme` SHALL **não** conter mais nenhum `--color-slate-*` nem `--color-teal-*`
3. WHEN `src/app/globals.css` é lido THEN `@theme` SHALL definir a ponte semântica completa usada pelo app, cada uma derivada de um `--sv-*`
4. WHEN um utilitário `bg-*`/`text-*`/`border-*` de cor aparece em `src/**/*.tsx` THEN SHALL resolver para um token `--sv-*` (via ponte `@theme`) ou ser cor neutra `white`/`black`/`transparent`/`current`
5. WHEN o app é comparado antes e depois THEN nenhum valor de cor renderizado SHALL mudar para os degraus que já tinham ponte 1:1 (`teal-500`→accent, `teal-700`→accent-ink, `slate-50`→bg, `slate-900`→ink)

**Independent Test**: o `grep` do AC1 retorna vazio e a suíte de páginas continua verde.

---

## Edge Cases

- WHEN um componente server importa símbolo client-only THEN o build do Next SHALL falhar — a checagem estática do AC P1-2.8 pega isso antes do build
- WHEN `Dialog` da Radix roda em jsdom THEN os testes de `Modal` SHALL continuar passando; se a Radix exigir API de browser ausente no jsdom (`ResizeObserver`, `PointerEvent`), o setup de teste SHALL prover o polyfill em `tests/setup.ts` em vez de o teste ser afrouxado
- WHEN o `Button` da lib recebe `className` do app THEN as classes do app SHALL vencer (Tailwind utilities > `layer(components)`), preservando os ajustes de largura/espaçamento existentes
- WHEN um `<button>` cru precisa sobreviver (ex.: célula clicável de grade de agenda que não é um botão visual) THEN SHALL ser marcado com `// sv-gap:` e entrar no documento de lacunas
- WHEN `docs/still-void-gaps.md` cita um componente que passe a existir numa release futura THEN a entrada SHALL carregar a versão verificada (`ausente em 2.0.1`) para o leitor saber contra o quê foi conferido

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SV2-01 | P1: Subir para a v2 | Verified | Implementado |
| SV2-02 | P1: Subir para a v2 | Verified | Implementado |
| SV2-03 | P1: Subir para a v2 | Verified | Implementado |
| SV2-04 | P1: Catálogo — Button | Verified | Implementado |
| SV2-05 | P1: Catálogo — Input | Verified | Implementado |
| SV2-06 | P1: Catálogo — Alert | Verified | Implementado |
| SV2-07 | P1: Catálogo — Dialog/Modal | Verified | Implementado |
| SV2-08 | P1: Catálogo — Card | Verified | Implementado |
| SV2-09 | P1: Catálogo — fronteira server/client | Verified | Implementado |
| SV2-10 | P1: Lacunas — documento | Verified ⚠️ | Lacuna de precisão em AC P1-3.3 (`Label`/`Field`) — ver validation.md |
| SV2-11 | P1: Lacunas — marcações `// sv-gap:` no código | Verified | Implementado |
| SV2-12 | P2: Paleta — apelidos removidos | Verified | Implementado |
| SV2-13 | P2: Paleta — hardcodes amber/emerald/sky mapeados | Verified | Implementado |

**ID format:** `SV2-[NUMBER]`
**Coverage:** 13 total, 13 mapeados a tasks, 0 sem mapeamento

---

## Success Criteria

- [ ] `npm run typecheck && npm run build && npm test` verdes, cobertura ≥ 90% mantida
- [x] `npm run test:e2e` verde (nenhuma regressão de fluxo) — a migração fechou com 60/64, as 4 falhas
      medidas como **pré-existentes** contra o baseline `d917d72`; exceção documentada em `validation.md`
      e encerrada em 2026-08-22 pela feature `e2e-consentimento-verdes` (64/64)
- [ ] Zero import bare `@still-void/ui`, zero `<button>`/`<input>` cru não justificado, zero cor fora de token
- [ ] `docs/still-void-gaps.md` acionável: cada entrada tem contagem de call sites e arquivos de exemplo
