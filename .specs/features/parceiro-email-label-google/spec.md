# Rótulo do e-mail no formulário de parceiro (issue #242) Specification

## Problem Statement

O campo de e-mail do formulário de parceiro (`src/app/(staff)/parceiros/page.tsx`) tem o rótulo
"Email (usado no login com Google) *", remanescente do login com Google removido pela ADR-004
(`docs/adr/004-remocao-google-oauth-autenticacao.md`). O texto induz quem cadastra parceiro a achar
que o e-mail serve para um login que não existe mais. Escopo pequeno e mecânico: troca de rótulo +
seletores e2e correspondentes.

## Goals

- [ ] O rótulo do campo de e-mail do formulário de parceiro passa a ser "Email *", igual ao do
      formulário de paciente (`src/app/(staff)/pacientes/patient-form.tsx`)
- [ ] `e2e/equipe.spec.ts` usa o novo rótulo nos `getByLabel` (linhas ~54 e ~90) e
      `npx playwright test e2e/equipe.spec.ts` passa
- [ ] `grep -rn "login com Google" src/app` não encontra mais nenhum rótulo de formulário
- [ ] `npm run check:sv`, `npm run lint`, `npm run typecheck` seguem verdes

## Out of Scope

| Item | Reason |
| --- | --- |
| Comportamento do e-mail do parceiro (unicidade por empresa, EQP-RN-05) | Já entregue na #211; issue #242 é só texto |
| Comentário em `src/infrastructure/calendar/google-calendar-gateway.ts:57` | Fala da integração com Google Agenda, não do login removido |

---

## Assumptions & Open Questions

Nenhuma — mudança mecânica com AC textual e precisa. Não há dimensões implícitas aplicáveis
(escopo Small).

**Open questions:** nenhuma.

---

## User Stories

### P1: Rótulo correto no formulário de parceiro ⭐ MVP

**User Story**: Como recepcionista cadastrando um parceiro, quero que o rótulo do campo de e-mail
não mencione um login que não existe, para não ser induzido a um comportamento inexistente.

**Why P1**: É o único objetivo da issue #242.

**Acceptance Criteria**:

1. WHEN o formulário de novo/edição de parceiro é renderizado THEN o campo de e-mail SHALL exibir
   o rótulo "Email *" (idêntico ao do formulário de paciente).
2. WHEN `e2e/equipe.spec.ts` roda THEN os seletores `getByLabel` do campo de e-mail SHALL usar
   "Email *" e o teste SHALL passar.
3. WHEN se executa `grep -rn "login com Google" src/app` THEN a busca SHALL retornar zero
   ocorrências de rótulo de formulário (only allowed hits, se algum, são sobre a remoção do login,
   não sobre um rótulo ativo).

**Independent Test**: Abrir `/parceiros`, clicar em "Novo parceiro", conferir que o campo de e-mail
mostra "Email *"; rodar `npx playwright test e2e/equipe.spec.ts`.

---

## Requirement Traceability

| Requirement ID | Story                  | Phase   | Status  |
| --------------- | ----------------------- | ------- | ------- |
| PARC-EMAIL-01    | P1: Rótulo correto      | Execute | Pending |
| PARC-EMAIL-02    | P1: Rótulo correto      | Execute | Pending |
| PARC-EMAIL-03    | P1: Rótulo correto      | Execute | Pending |

**Coverage:** 3 total, 3 mapped to tasks (inline, small scope), 0 unmapped

---

## Success Criteria

- [ ] Rótulo do e-mail do parceiro idêntico ao do paciente ("Email *")
- [ ] `e2e/equipe.spec.ts` verde
- [ ] Gate local (`typecheck`, `lint`, `check:sv`) verde
