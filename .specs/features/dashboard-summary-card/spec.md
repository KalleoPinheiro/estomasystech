# SummaryCard — módulo compartilhado dos cartões do dashboard — Specification

Issue: #140

## Problem Statement

`FollowUpsCard`, `LowStockCard` e `TriageQueue` (`src/app/(staff)/page.tsx`)
reimplementam a mesma máquina de estados — erro → loading → vazio → dado —
com o mesmo ternário de 4 ramos copiado 3x. As 3 rodadas de achados P1-P3
já aplicadas ao dashboard (issues #86-#96, #128-#132) foram point-fixes por
cartão: sintoma de que não existe módulo compartilhado, então cada correção
teve que ser reaplicada em cada cartão separadamente.

## Goals

- [ ] Um módulo (`SummaryCard`) concentra a máquina de estados
      erro/loading/vazio/dado numa única implementação.
- [ ] `FollowUpsCard`, `LowStockCard` e `TriageQueue` consomem esse módulo
      em vez de reimplementar o ternário.
- [ ] Comportamento e aparência visual idênticos ao atual — refactor puro,
      suíte existente (`tests/pages/staff-dashboard.test.tsx`) não muda de
      asserção.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Unificar o cabeçalho (título + link) num formato só | `TriageQueue` é um banner de aviso (cor warning, `h3` menor, ícone+contador no título) — forçar o mesmo cabeçalho das outras duas perderia a diferenciação visual intencional. O módulo cobre o corpo (a parte de fato duplicada); cabeçalho aceita overrides de estilo, não é reescrito do zero |
| Extrair o cartão de "Consultas de hoje" (topo do dashboard) | Não usa o mesmo ternário de erro/loading — é síncrono com `summary` (já tratado por `if (!summary) return <LoadingIndicator />` antes do render) |
| Mudar UX de loading/erro/vazio | Refactor mecânico — issue não pede mudança de comportamento |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde mora o módulo novo | `src/components/summary-card.tsx` | Mesmo diretório de `feedback.tsx`/`status-badge.tsx` — componentes de UI compartilhados entre páginas, não específicos de uma feature | y |
| Forma do módulo | Componente `<SummaryCard>` com props de estado (`error`, `isLoading`, `onRetry`, `isEmpty`, `emptyMessage`, `emptyIcon`) + `children` (a lista/conteúdo, renderizado só no ramo "tem dado") + overrides pontuais de estilo (`title` como `ReactNode`, `titleClassName`, `cardClassName`, `href` opcional com `className`) | Cobre exatamente a lógica duplicada (o ternário) sem forçar um cabeçalho único — `TriageQueue` precisa de tema warning e cabeçalho diferente das outras duas | y |
| `TriageQueue` "desaparece" quando a fila está vazia (hoje retorna `null`) | Prop `hideWhenEmpty` no `SummaryCard` | Único dos 3 cartões com esse comportamento — replicar via prop opcional em vez de duplicar a checagem fora do módulo | y |
| Testes existentes (`staff-dashboard.test.tsx`) | Não reescrever — são o contrato de comportamento; só adaptar se algum seletor mudar por causa da refatoração (não deveria, já que o DOM renderizado é o mesmo) | Contrato já cobre loading/erro/retry/vazio dos 3 cartões — refazer seria trabalho redundante | y |

**Open questions:** nenhuma — todas resolvidas acima.

---

## User Stories

### P1: Consolidar a máquina de estados dos cartões do dashboard ⭐ MVP

**User Story**: Como mantenedor do código, quero que os 3 cartões do
dashboard usem o mesmo módulo pra erro/loading/vazio/dado, pra que uma
correção futura (ex.: achado de acessibilidade num desses estados) se
aplique uma vez só.

**Why P1**: É o achado inteiro da issue.

**Acceptance Criteria**:

1. WHEN um cartão tem `error` THEN `SummaryCard` SHALL renderizar
   `ErrorAlert` com `onRetry`, substituindo o ternário manual.
2. WHEN um cartão está `isLoading` (sem erro) THEN SHALL renderizar
   `LoadingIndicator`.
3. WHEN um cartão não tem erro/loading e está vazio THEN SHALL renderizar
   `EmptyState` com a mensagem/ícone do cartão — EXCETO quando
   `hideWhenEmpty` está ativo (`TriageQueue`), caso em que SHALL renderizar
   `null` (nada, nem o cartão).
4. WHEN um cartão tem dado THEN SHALL renderizar `children` (a lista
   específica de cada cartão) dentro do `<Card>`.
5. WHEN `FollowUpsCard`, `LowStockCard` e `TriageQueue` são refatorados
   THEN a suíte existente `tests/pages/staff-dashboard.test.tsx` SHALL
   continuar 100% verde sem alteração de asserções.

**Independent Test**: rodar `tests/pages/staff-dashboard.test.tsx` sem
modificação — todos os casos de loading/erro/retry/vazio dos 3 cartões
continuam passando.

---

## Edge Cases

- WHEN `TriageQueue` está vazia (sem erro, sem loading) THEN SHALL não
  renderizar nada (nem o `<Card>`) — comportamento já coberto por teste
  existente, preservado via `hideWhenEmpty`.
- WHEN `FollowUpsCard`/`LowStockCard` estão vazios THEN SHALL renderizar o
  `<Card>` com `EmptyState` dentro (não desaparecem) — diferença
  intencional já existente entre os 3 cartões, preservada.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SUMCARD-01 | P1 | Implement | Pending |
| SUMCARD-02 | P1 | Implement | Pending |
| SUMCARD-03 | P1 | Implement | Pending |
| SUMCARD-04 | P1 | Implement | Pending |
| SUMCARD-05 | P1 | Implement | Pending |

**Coverage:** 5 total, 5 mapped to implementation, 0 unmapped.

---

## Success Criteria

- [ ] `FollowUpsCard`, `LowStockCard` e `TriageQueue` não têm mais o
      ternário de 4 ramos erro/loading/vazio/dado duplicado — delegam pro
      `SummaryCard`.
- [ ] Suíte existente de `tests/pages/staff-dashboard.test.tsx` continua
      100% verde, sem asserção alterada.
- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv`,
      `npm run test:coverage` (≥90%) e `npm run test:e2e` verdes.
