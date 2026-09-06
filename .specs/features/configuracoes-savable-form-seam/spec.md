# Seam de save de rascunho em Configurações — Specification

Refactor interno (issue #150), achado pelo relatório `/improve-codebase-architecture` de 2026-09-06.

## Problem Statement

`ClinicInfoSection` e `ScheduleSection` em `src/app/(staff)/configuracoes/page.tsx` repetem à mão o mesmo seam não-trivial: `useApiQuery` pra carregar, estado local de `edits`/`saveError`, `save()` com try/catch, `setSaveError` + `toast()` nos dois ramos. Dois adapters idênticos confirmam seam real (regra da skill codebase-design: um adapter é hipotético, dois são reais). Interface hoje é rasa — cada seção reimplementa o mesmo fluxo em vez de expor uma interface pequena.

**Ajuste de escopo vs. issue #150**: a issue original citava `AccountsSection` como terceiro adapter idêntico. Releitura do código mostra que `AccountsSection` usa um shape diferente (handlers de ação: `toggleActive`, `resendInvite`, criação via modal/form) — não tem draft/save. Escopo real: 2 sections, não 3.

## Goals

- [ ] `ClinicInfoSection` e `ScheduleSection` passam a consumir um hook compartilhado que encapsula draft, erro de save e chamada PUT
- [ ] Comportamento observável (toasts, mensagens de erro, refresh) permanece idêntico ao atual

## Out of Scope

| Feature | Reason |
| --- | --- |
| Refatorar `AccountsSection` | Shape diferente (ações, não draft/save) — não é a mesma duplicação |
| Refatorar `CalendarIntegrationSection` | Não tem draft/save, é status + link OAuth |
| Mudar contrato das rotas `/api/settings/clinic-info` e `/api/settings/schedule` | Fora do escopo de refactor interno |
| Migrar validação de `ScheduleSection` pra schema Zod | Já existe `validateScheduleDraft`; hook só precisa aceitar validador opcional, não reescrever a validação |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Nome do hook | `useSavableForm` | Nome proposto no relatório de arquitetura original | y (herdado do relatório, sem objeção) |
| `ScheduleSection` precisa de `refresh()` pós-save; `ClinicInfoSection` não | Hook aceita `onSaved?: () => void` opcional | Preserva comportamento atual sem forçar refresh universal | y (derivado do código lido) |
| Mensagem de sucesso do toast varia por seção | Hook aceita `successMessage: string` | `ClinicInfoSection` e `ScheduleSection` têm textos de sucesso diferentes hoje | y |
| Terceiro adapter (`AccountsSection`) | Fora de escopo — não é a mesma duplicação | Ver "Ajuste de escopo" acima | y |

**Open questions:** none — todas resolvidas acima.

---

## User Stories

### P1: Hook `useSavableForm` compartilhado ⭐ MVP

**User Story**: Como desenvolvedor mantendo a página de Configurações, quero um hook único de draft/save/erro/toast, pra não duplicar a mesma lógica em cada seção nova.

**Why P1**: É o único objetivo do refactor — sem ele não há deepening.

**Acceptance Criteria**:

1. WHEN uma seção usa `useSavableForm({ endpoint, initialValue, successMessage, onSaved?, validate? })` THEN o hook SHALL retornar `{ draft, setDraft, saveError, save }`.
2. WHEN `save()` é chamado e a chamada PUT ao `endpoint` resolve com sucesso THEN o hook SHALL disparar toast de sucesso com `successMessage`, limpar `saveError`, e chamar `onSaved()` se fornecido.
3. WHEN `save()` é chamado e a chamada PUT rejeita THEN o hook SHALL setar `saveError` com a mensagem do erro (`err.message` se `Error`, senão fallback fornecido) e disparar toast de erro com a mesma mensagem.
4. WHEN `validate` é fornecido e retorna uma mensagem (não `null`) antes do `save()` fazer a chamada de rede THEN o hook SHALL setar `saveError` com essa mensagem e SHALL NOT chamar a API.
5. WHEN `ClinicInfoSection` é renderizada usando o hook THEN o comportamento observável (campos, botão, toasts, texto de erro) SHALL ser idêntico ao atual.
6. WHEN `ScheduleSection` é renderizada usando o hook THEN o comportamento observável (toggle de dias, validação de horário, refresh pós-save, toasts) SHALL ser idêntico ao atual.

**Independent Test**: testes de `tests/pages/staff-operations.test.tsx` (ou equivalente) continuam passando sem alteração de asserção — só a implementação interna muda.

---

## Edge Cases

- WHEN `draft` é editado localmente e a seção é desmontada antes do save THEN não deve haver setState em componente desmontado (hook não deve manter timers/efeitos pendentes além do que já existe hoje).
- WHEN `save()` é chamado duas vezes em sequência rápida (duplo clique) THEN o comportamento deve ser o mesmo do código atual (sem debounce/dedupe novo — não introduzir requisito que não existe hoje).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CFG-SEAM-01 | P1 | Implementing | Pending |
| CFG-SEAM-02 | P1 | Implementing | Pending |
| CFG-SEAM-03 | P1 | Implementing | Pending |
| CFG-SEAM-04 | P1 | Implementing | Pending |
| CFG-SEAM-05 | P1 | Implementing | Pending |
| CFG-SEAM-06 | P1 | Implementing | Pending |

**Coverage:** 6 total, 6 mapped to tasks (implicit — ≤3 steps), 0 unmapped.

---

## Success Criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm run test:coverage` passam
- [ ] `ClinicInfoSection` e `ScheduleSection` usam `useSavableForm`; nenhuma duplicação de draft/saveError/save entre elas
- [ ] Nenhum teste existente foi enfraquecido ou removido
