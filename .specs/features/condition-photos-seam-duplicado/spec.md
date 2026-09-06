# Fotos de evolução consomem o seam compartilhado — Specification

Issue: #141

## Problem Statement

`ConditionPhotos` (`src/app/(staff)/pacientes/[id]/condition-photos.tsx`)
reimplementa fetch/estado com `useState`/`useEffect` crus (`version` como
gatilho de refetch manual) em vez de usar `useApiQuery`, a convenção já
seguida por `useTriageQueue` (`src/lib/use-triage-queue.ts`) pro mesmo
domínio (Condition Photo). Duas implementações não relacionadas pro mesmo
tipo de dado — bug de foto exigiria correção nos dois lugares.

## Goals

- [ ] `ConditionPhotos` deixa de gerenciar fetch/estado na mão; consome um
      hook (`useConditionPhotos`) construído sobre `useApiQuery`/`apiFetch`,
      no mesmo formato de `useTriageQueue`.
- [ ] Comportamento visível idêntico ao atual (contrato dos testes
      existentes em `tests/pages/staff-paciente-detail.test.tsx` §
      "Cenário: condition-photos" não muda).

## Out of Scope

| Item | Motivo |
| --- | --- |
| Unificar com `useTriageQueue` num hook só | Domínios de lista diferentes (`/api/conditions/[id]/photos` vs `/api/photos/triage`); forçar um hook genérico agora seria especulativo (YAGNI) sem 2º caso de uso real além do delete compartilhado |
| Mudar UX de upload/exclusão | Refactor mecânico — issue não pede mudança de comportamento |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde mora o hook novo | `src/lib/use-condition-photos.ts`, mesmo diretório/convenção de `use-triage-queue.ts` | Consistência com o seam de referência citado na própria issue | y |
| Upload continua com `fetch` cru (não `apiFetch`) | Sim — `apiFetch` fixa `Content-Type: application/json`, incompatível com `FormData` (o browser precisa definir o boundary do multipart sozinho) | Já é assim no código atual; mudar quebraria upload | y |
| `toast` de sucesso mora no hook (não no componente) | Sim, mesmo padrão de `useTriageQueue` | Hook já é dono do ciclo de vida da mutação (igual a triagem) | y |
| Testes existentes (`staff-paciente-detail.test.tsx` § condition-photos) | Não reescrever do zero — são o contrato de comportamento; ajustar só se a refatoração exigir (ex.: nome de mensagem de erro/loading) | Contrato já cobre loading/erro/retry/upload/delete/limite de tamanho — refazer seria trabalho redundante e arriscaria divergir do comportamento real | y |

**Open questions:** nenhuma — todas resolvidas acima.

---

## User Stories

### P1: Consolidar fetch de fotos de evolução no seam compartilhado ⭐ MVP

**User Story**: Como mantenedor do código, quero que `ConditionPhotos` use o
mesmo seam de acesso a dado que `useTriageQueue`, pra que um bug de fetch de
Condition Photo se corrija num lugar só.

**Why P1**: É o achado inteiro da issue.

**Acceptance Criteria**:

1. WHEN a condição tem fotos THEN `ConditionPhotos` SHALL buscar e exibir a
   lista via `useApiQuery` (não `useState`/`useEffect` manuais).
2. WHEN a busca falha THEN SHALL exibir `ErrorAlert` com botão "Tentar
   novamente" que dispara `refresh()` do `useApiQuery` (não um contador de
   versão próprio).
3. WHEN upload ou exclusão têm sucesso THEN a lista SHALL atualizar via
   `refresh()` do mesmo `useApiQuery` (não um segundo mecanismo de refetch).
4. WHEN upload excede 5 MB THEN SHALL bloquear antes de qualquer chamada de
   rede, mesmo comportamento atual.
5. WHEN exclusão usa `DELETE /api/photos/[id]` THEN SHALL usar `apiFetch`
   (mesmo padrão de `useTriageQueue.triage`). **Correção de spec** (achado
   do Verifier): o código pré-refatoração já usava `apiFetch` pra exclusão —
   este AC não é uma mudança de comportamento introduzida por esta feature,
   é uma invariante preservada.

**Independent Test**: rodar a suíte existente
`tests/pages/staff-paciente-detail.test.tsx` § "Cenário: condition-photos".
A suíte foi estendida (não reescrita) pra fechar um gap real que o sensor de
mutação do Verifier encontrou: os testes de upload/exclusão bem-sucedidos
verificavam a chamada de rede e o toast, mas não afirmavam que a lista
renderizada de fato refletia o novo estado após o `refresh()` — um
`refresh()` removido silenciosamente não quebrava nenhum teste. Adicionadas
2 asserções (uma por cenário) confirmando o conteúdo pós-refresh; nenhuma
asserção existente foi alterada.

---

## Edge Cases

- WHEN `photos` ainda não resolveu pela primeira vez (`photos === null`)
  THEN SHALL mostrar "Carregando fotos…". **Correção de spec** (achado do
  Verifier): usar `isLoading` do `useApiQuery` em vez de `photos === null`
  reintroduziria um "flash" — a cada `refresh()` pós-upload/exclusão,
  `isLoading` volta a `true` mesmo com a lista anterior ainda válida,
  substituindo a grade de fotos por "Carregando fotos…" por um instante. O
  código original nunca fazia isso (mantinha a lista visível durante
  refetch). O gate correto é `photos === null` (só no carregamento inicial,
  antes de qualquer resposta chegar), preservando o comportamento
  stale-while-revalidate original.
- WHEN há erro de carregamento THEN SHALL suprimir tanto "Carregando
  fotos…" quanto "Nenhuma foto registrada." (só o `ErrorAlert` aparece) —
  comportamento já coberto por teste existente.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CONDPH-01 | P1 | Implement | Pending |
| CONDPH-02 | P1 | Implement | Pending |
| CONDPH-03 | P1 | Implement | Pending |
| CONDPH-04 | P1 | Implement | Pending |
| CONDPH-05 | P1 | Implement | Pending |

**Coverage:** 5 total, 5 mapped to implementation, 0 unmapped.

---

## Success Criteria

- [ ] `condition-photos.tsx` não importa `useState`/`useEffect` pra
      fetch/estado de lista (só o que sobrar de UI local, se houver).
- [ ] Suíte existente de `condition-photos` em
      `tests/pages/staff-paciente-detail.test.tsx` continua 100% verde.
- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv`,
      `npm run test:coverage` (≥90%) e `npm run test:e2e` verdes.
