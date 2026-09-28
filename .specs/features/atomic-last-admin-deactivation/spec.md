# Desativação atômica do último company_admin (#244) Specification

## Problem Statement

A regra "não desativar o último `company_admin` ativo da empresa"
(`assertCanDeactivate`, `src/domain/auth/account-management.ts:36-56`) é
checada em memória: lê as contas, decide, depois grava. Nada serializa as
duas etapas. Com dois admins ativos A e B, duas desativações concorrentes (uma
por admin) leem o mesmo estado, as duas passam na checagem e a clínica
termina sem admin ativo. O caminho existe em dois lugares: `ManageClinicAdmins.apply`
(plataforma, `src/application/platform/manage-clinic-admins.ts:142-148`) e
`PATCH /api/accounts/[id]` (clínica, `src/app/api/accounts/[id]/route.ts:44`).

## Goals

- [ ] Duas desativações concorrentes de admins diferentes da mesma clínica
      nunca deixam a clínica com zero admins ativos — em nenhuma das duas
      rotas.
- [ ] Exatamente uma das duas requisições concorrentes responde 200; a outra
      responde 400 com a mensagem existente.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Atomicidade audit+conta no `apply` (fora de `deactivate`) | Já é write-ahead (#184); issue #244 pede só a regra do último admin. Não mexer em `resend-invite`/`reactivate`/`invite`. |
| Lock/atomicidade para `reactivate` | Reativar só aumenta o nº de admins ativos — nunca viola a regra do último admin. |
| Advisory lock por clínica | `SELECT ... FOR UPDATE` nas linhas `company_admin` já serializa as duas transações concorrentes sobre a mesma empresa; é o padrão já usado no repo (`findByIdForUpdate` em `drizzle-invoice-repository.ts`, `recover-super-admin.ts`). Não introduzir mecanismo novo. |
| Outras regras de `assertCanDeactivate` (própria conta) | Já não têm corrida: dependem só da sessão do ator, que a rota já tem antes de qualquer leitura de outras contas. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Mecanismo de atomicidade | `SELECT ... FOR UPDATE` nas linhas `company_admin` da clínica-alvo, dentro da mesma transação que grava a desativação | Reusa `TransactionManager`/`DrizzleTransactionManager` já wired (#243) e o padrão `findByIdForUpdate` já existente no repo — sem mecanismo novo (advisory lock exigiria plumbing extra sem ganho) | y (orquestrador já decidiu na tarefa) |
| Novo método de repositório | `UserAccountRepository.findByRoleForUpdate(role)` — mesma forma de `findByRole`, mas com `.for('update')` no Drizzle; implementação in-memory delega para `findByRole` (sem concorrência real em testes unitários) | Consistente com o padrão `findByIdForUpdate` | y |
| Ordem check→audit→mutação (write-ahead #184) | Mantida igual, mas agora toda dentro da transação com lock, para `deactivate` | Preserva o invariante existente (auditoria falha ⇒ nada muda) enquanto fecha a corrida | y |
| Rota `/api/accounts/[id]`: password + active:false na mesma requisição | Ambas mudanças (hash de senha e desativação) gravam num único `save` dentro da transação travada | Já é o comportamento atual (C9 do teste `accounts-hierarchy.test.ts` espera atomicidade entre senha e desativação) | y |

**Open questions:** none — resolvidas acima.

---

## User Stories

### P1: Desativação atômica pela plataforma ⭐ MVP

**User Story**: Como super_admin operando `PATCH /api/platform/clinics/[id]/admins/[accountId]`,
quero que duas desativações simultâneas de admins diferentes da mesma clínica
nunca zerem os admins ativos, para que a clínica nunca fique sem acesso
administrativo por uma corrida.

**Why P1**: É o caminho citado no CodeRabbit original (#238) e o mais fácil
de disparar (o super_admin gerencia várias clínicas, múltiplas abas).

**Acceptance Criteria**:

1. WHEN duas requisições `PATCH .../admins/[accountId]` com `action: "deactivate"`
   para dois `company_admin` ativos diferentes da mesma clínica chegam
   concorrentemente THEN o sistema SHALL responder `200` para exatamente uma
   e `400` com `"Não é possível desativar o último administrador ativo da empresa"`
   para a outra.
2. WHEN a corrida do AC1 termina THEN a clínica SHALL ter exatamente 1
   `company_admin` ativo.
3. WHEN uma única desativação ocorre (sem corrida) e há outro admin ativo
   THEN o comportamento SHALL permanecer igual ao atual (200, sessões
   revogadas, auditoria gravada).
4. WHEN a única desativação ocorre sobre o último admin ativo (sem corrida)
   THEN o sistema SHALL continuar respondendo `400` com a mesma mensagem e
   nada muda.

**Independent Test**: teste de integração em `tests/api/` com PGlite real,
disparando duas `PATCH` concorrentes via `Promise.all`, undefined ordering.

---

### P2: Desativação atômica pela clínica (self-service)

**User Story**: Como `company_admin` da própria clínica usando
`PATCH /api/accounts/[id]`, quero a mesma garantia de atomicidade que a
plataforma, para que a mesma corrida não exista pelo caminho self-service.

**Why P2**: Mesmo bug, caminho de código separado (`route.ts` da clínica não
compartilha função com `ManageClinicAdmins.apply`); precisa do mesmo fix.

**Acceptance Criteria**:

1. WHEN duas requisições `PATCH /api/accounts/[id]` com `active: false`
   mirando dois `company_admin` ativos diferentes da mesma clínica chegam
   concorrentemente THEN exatamente uma SHALL responder `200` e a outra
   `400` com a mesma mensagem.
2. WHEN a corrida termina THEN a clínica SHALL ter exatamente 1
   `company_admin` ativo.
3. WHEN a requisição combina `active: false` e `password` no mesmo corpo
   THEN a troca de senha e a desativação SHALL gravar juntas (mesmo `save`)
   dentro da transação travada — sem regressão do comportamento atual
   (teste C9 existente).

**Independent Test**: teste de integração equivalente ao P1, batendo na rota
de clínica em vez da de plataforma.

---

## Edge Cases

- WHEN a auditoria falha dentro da transação travada (mock de erro) THEN a
  conta SHALL permanecer inalterada e a resposta SHALL ser `500` (mesmo
  comportamento hoje, agora dentro do rollback da transação).
- WHEN o alvo não é `company_admin` (ou não pertence à clínica) THEN o fluxo
  SHALL permanecer igual (404 antes de qualquer lock, sem mudança de rota).
- WHEN só há 1 admin na clínica e a requisição é `active: true`
  (reativação) THEN SHALL seguir sem lock/transação nova (fora do escopo da
  corrida).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| LASTADMIN-01 | P1 AC1-2 | Execute | Pending |
| LASTADMIN-02 | P1 AC3-4 | Execute | Pending |
| LASTADMIN-03 | P2 AC1-2 | Execute | Pending |
| LASTADMIN-04 | P2 AC3 | Execute | Pending |

**Coverage:** 4 total, 4 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Teste de integração (PGlite) do P1 prova exatamente 1×200 + 1×400 e 1
      admin ativo ao final.
- [ ] Teste de integração (PGlite) do P2 prova o mesmo pela rota de clínica.
- [ ] Testes existentes de `assertCanDeactivate`/`platform-clinic-admin-actions.test.ts`/`accounts-hierarchy.test.ts`
      continuam verdes sem alteração de expectativa.
- [ ] `typecheck`, `lint`, `test:coverage` (≥90%) verdes.
