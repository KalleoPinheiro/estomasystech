# Spec — Adoção still-void: Tabs, Tooltip, Prose

- **Issue:** [#85](https://github.com/KalleoPinheiro/estomasystech/issues/85)
- **Escopo:** Medium (3 sub-itens, consumidor real confirmado por item, implementação+verificação inline)

## Decisão de escopo (item a item)

O pacote `@still-void/ui@3.3.1` instalado **exporta os 5 componentes** citados no achado
descartado (`Tabs`/`Tooltip`/`DropdownMenu`/`Prose`/`ThemeToggle`, todos em
`@still-void/ui/react/client`) — não há gap de catálogo, é dívida de adoção pura.

| Item | Consumidor real hoje | Decisão |
|------|----------------------|---------|
| `Tabs` | `src/app/(staff)/pacientes/[id]/page.tsx` — 5 abas com `useState` puro, sem `role="tablist"`/`aria-selected`/teclado | **IN** — satisfaz também [P1-R10] da issue #88 (Prontuário), exceto o deep-link `?aba=` (fora de escopo aqui, citado explicitamente em #88 como item separado) |
| `Tooltip` | `src/app/(staff)/page.tsx` — selo `PUSH`/`DET` sem legenda | **IN** — satisfaz também [P3-1] da issue #86 (Dashboard) |
| `Prose` | `src/app/portal/consent-card.tsx` — termo LGPD em `<pre className="text-xs">` monoespaçado | **IN** — #70 (Fase C) resolveu versão/revogação do consentimento; a tipografia de leitura em si não fazia parte daquele escopo e segue pendente |
| `DropdownMenu` | Nenhuma linha de tabela do app hoje passa de ~2 ações simultâneas visíveis (dashboard tem 2, listas de diretório têm Editar/Desativar) | **OUT** — sem consumidor concreto; forçar adoção sem uso real é YAGNI. Cada issue de superfície (#86-94) decide por si se um bundle futuro cria a 3ª ação que justifica o dropdown |
| `ThemeToggle`/`ThemeProvider` | Nenhum — app fixa `data-theme="light"` deliberadamente | **OUT** — dark mode é decisão de produto, listada explicitamente como "achado descartado" nesta mesma triagem (tabela de `plano-correcao-achados-auditoria-2026-09.md`). Não compor `ThemeProvider` sem o toggle ser exposto seria trabalho morto |

## Critérios de aceitação

- **AC1**: `/pacientes/[id]` usa `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` de
  `@still-void/ui/react/client` no lugar do `TabButton` manual. `role="tablist"`/`aria-selected`
  chegam de graça via Radix. O guard de troca de aba (`useDirtyTabGuard`, issue #66) continua
  interceptando a troca antes de aplicá-la — nenhuma regressão no `AlertDialog` de descarte.
- **AC2**: Rótulos com contador (`tabLabel()`) continuam idênticos.
- **AC3**: O selo `PUSH`/`DET` no dashboard fica dentro de `Tooltip`/`TooltipTrigger`/`TooltipContent`
  com o texto explicando a escala (PUSH = Pressure Ulcer Scale for Healing; DET = índice
  Débito/Exsudato/Tecido). `TooltipProvider` fica montado uma vez em `src/app/providers.tsx`
  (raiz), não por página.
- **AC4**: `ConsentCard` troca o `<pre>` monoespaçado 12px pelo componente `Prose`, passando
  `status.consentText` direto como filho (texto plano vindo do backend, sem markdown — não precisa
  de `<Lead>`/parágrafo intermediário) e preservando `whitespace-pre-wrap` — mantém a caixa rolável
  de altura máxima, mas com tipografia de leitura em vez de código.
- **AC5**: `npm run check:sv` continua verde (nenhuma classe crua nova).
- **AC6**: Gate completo verde: `typecheck`, `lint`, `test:coverage` ≥ 90%, `build`.

## Fora de escopo

`DropdownMenu`, `ThemeToggle`/`ThemeProvider` (ver tabela acima) e o deep-link `?aba=` do
prontuário (permanece em #88).
