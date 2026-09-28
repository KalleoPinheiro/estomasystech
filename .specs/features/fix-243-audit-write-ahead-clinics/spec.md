---
title: Auditoria transacional na criação de clínica e no convite de admin (#243)
status: draft
issue: 243
audience: [agent, dev]
---

# Auditoria transacional na criação de clínica e no convite de admin — Specification

## Problem Statement

`POST /api/platform/clinics` e `POST /api/platform/clinics/[id]/admins` gravam a
mudança (clínica+admin, ou admin) e só depois chamam `recordAudit` — que é
fire-and-forget (`after()`, best-effort): se a auditoria falhar, a mudança já
está gravada e a ação mais crítica do `super_admin` fica sem trilha (B6). As
outras ações do super_admin (B4/B5) já seguem outra régua — `recordAuditNow`
antes ou junto da mutação — e essas duas rotas de criação ficaram para trás
(apontamento do CodeRabbit nos PRs #234/#238, nunca corrigido).

## Goals

- [ ] `POST /api/platform/clinics`: `create/clinic` e `create/account` gravam
      na mesma transação de banco que cria a clínica e o admin — falha na
      auditoria desfaz a clínica e a conta (rollback).
- [ ] `POST /api/platform/clinics/[id]/admins`: `create/account` grava de
      forma durável junto com a conta — falha na auditoria impede a conta de
      existir.
- [ ] O convite (e-mail) continua sendo disparado só depois da gravação dar
      certo, e sua falha continua respondendo `200` com `delivered: false`.

## Out of Scope

| Item | Motivo |
| --- | --- |
| `POST /api/accounts` (conta pela equipe da clínica) | Usa o mesmo `recordAudit` best-effort, mas não é ação de plataforma (fora do pedido da issue #243). |
| Mudar a régua de `recordAudit` fire-and-forget para outros fluxos (ex.: updates gerais) | Fora do que a issue #243 pede; a issue é só sobre as duas rotas de criação do B4. |
| Novo endpoint ou UI | Issue é só sobre a garantia de atomicidade da auditoria em rotas já existentes. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Como transacionar `POST /api/platform/clinics/[id]/admins` (AC permite "mesma transação ou write-ahead") | Mesma transação de banco, reaproveitando `TransactionManager`/`TransactionScope` já usado por `SellSessionPackage` (o comentário do port já antecipa "cresce quando outro fluxo precisar") | Write-ahead puro (como B4/B5) exige o `resourceId` do evento antes de existir a conta; a conta só ganha id dentro de `UserAccount.create()`. Transação real evita gerar id fora do domínio e dá a mesma garantia ("nada sobra se a auditoria falhar") pedida no critério de aceite. | y (decisão de implementação, dentro do permitido pela issue) |
| Onde a chamada de auditoria é decidida (ator/sessão) | O use case (`CreateClinic`, `ManageClinicAdmins.invite`) recebe um callback `recordAudit(auditEvents, ...)` construído pela rota com `recordAuditNow` + `guard.session`, executado **dentro** da transação | Mesmo padrão já usado em `ManageClinicAdmins.apply()` e `SuspendClinic`/`ReactivateClinic` (`audit: () => Promise<void>` fornecido pela rota) — mantém `Session` fora da camada de aplicação e reaproveita `recordAuditNow` sem alterar `src/lib/audit.ts`. | y |
| Ordem do envio de convite em `POST /api/platform/clinics` | Passa a rodar **depois** que a transação (clínica+admin+auditoria) confirma, ao invés de antes dos `recordAudit` como hoje | Já era esse o requisito do critério de aceite ("convite só depois da gravação dar certo"); hoje o código dispara o convite antes mesmo de tentar gravar a auditoria. Mudança estritamente na direção pedida pela issue. | y |
| `TransactionScope`/`ClinicProvisioningScope` ganham novos campos | `TransactionScope` ganha `userAccounts` e `auditEvents`; `ClinicProvisioningScope` ganha `auditEvents` | Extensão mínima dos ports existentes ao invés de criar uma nova unidade de trabalho — evita duplicar abstração de transação (`DrizzleTransactionManager` e `DrizzleClinicProvisioning` já envolvem `db.transaction`). | y |

**Open questions:** none — resolvidas acima.

---

## User Stories

### P1: Criação de clínica não fica sem trilha ⭐ MVP

**User Story**: Como operador da plataforma (`super_admin`), quero que a
criação de uma clínica e do primeiro admin só seja considerada concluída se o
evento de auditoria também for gravado, para que a ação mais crítica do meu
papel nunca fique sem rastro.

**Why P1**: É o critério de aceite central da issue #243 e a ação mais
sensível do super_admin (cria empresa + conta com acesso total a ela).

**Acceptance Criteria**:

1. WHEN `POST /api/platform/clinics` recebe um cadastro válido THEN o sistema
   SHALL gravar a clínica, o admin e os eventos `create/clinic` e
   `create/account` na mesma transação de banco.
2. WHEN a gravação do evento de auditoria falha (ex.: repositório de
   auditoria indisponível) THEN o sistema SHALL responder `500` e não deixar
   nem a clínica (`findByCnpj` → `null`) nem a conta (nenhuma conta com o
   e-mail) gravadas.
3. WHEN a transação (clínica+admin+auditoria) é confirmada THEN o sistema
   SHALL só então tentar enviar o convite; falha no envio SHALL continuar
   respondendo `200` com `admin.delivered: false` (comportamento já existente,
   critério C12 do B4 — não regride).
4. WHEN os dois eventos são gravados THEN eles SHALL manter `clinicId` da
   clínica criada e aparecer tanto na trilha da clínica quanto na trilha de
   plataforma (B6).

**Independent Test**: Injetar falha no `AuditEventRepository.save` (mock/spy)
em `tests/api/platform-clinics.test.ts`; chamar `POST` com corpo válido;
esperar `500` e confirmar, via repositórios reais, que não há clínica com o
CNPJ nem conta com o e-mail.

---

### P1: Convite de admin adicional não fica sem trilha ⭐ MVP

**User Story**: Como operador da plataforma, quero que convidar um admin
adicional (ou substituto) para uma clínica já cadastrada só crie a conta se o
evento de auditoria também gravar.

**Why P1**: Segunda metade do mesmo apontamento do CodeRabbit (#234), mesma
severidade P2 na issue.

**Acceptance Criteria**:

1. WHEN `POST /api/platform/clinics/[id]/admins` recebe um e-mail válido para
   uma clínica registrada e não suspensa THEN o sistema SHALL gravar a conta
   e o evento `create/account` de forma durável e atômica (mesma transação).
2. WHEN a gravação do evento de auditoria falha THEN o sistema SHALL
   responder `500` e não deixar a conta gravada (nenhuma conta com o
   e-mail).
3. WHEN a conta e o evento são gravados THEN o sistema SHALL só então tentar
   enviar o convite; falha no envio SHALL continuar respondendo `200` com
   `delivered: false` (comportamento já existente, não regride).
4. WHEN o evento é gravado THEN ele SHALL manter o `clinicId` da clínica-alvo
   e aparecer nas duas trilhas (clínica + plataforma, B6).

**Independent Test**: Injetar falha no `AuditEventRepository.save` em
`tests/api/platform-clinic-admin-actions.test.ts`; chamar `POST
/api/platform/clinics/[id]/admins` com e-mail válido; esperar `500` e
confirmar que nenhuma conta foi criada com aquele e-mail.

---

## Edge Cases

- WHEN o erro de auditoria acontece depois que `CreateAccount` já lançou
  `ValidationError` (e-mail duplicado, corrida do `uq_user_accounts_clinic_email`)
  THEN a resposta SHALL continuar sendo o erro de validação original — a
  transação nunca chega a gravar auditoria para uma conta que não foi criada.
- WHEN a clínica está suspensa ou o cadastro está incompleto (`invite()` já
  valida isso hoje) THEN a rota SHALL continuar respondendo o erro de
  validação de negócio sem abrir transação nenhuma — comportamento
  inalterado.
- WHEN os testes existentes de `tests/api/platform-clinics.test.ts` e
  `tests/api/platform-clinic-admin-actions.test.ts` rodam sem falha injetada
  THEN todos SHALL continuar passando sem alteração de asserts (mudança é
  estrutural/interna, não de contrato de resposta).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUD243-01 | P1: Criação de clínica | Execute | Pending |
| AUD243-02 | P1: Criação de clínica | Execute | Pending |
| AUD243-03 | P1: Criação de clínica | Execute | Pending |
| AUD243-04 | P1: Criação de clínica | Execute | Pending |
| AUD243-05 | P1: Convite de admin | Execute | Pending |
| AUD243-06 | P1: Convite de admin | Execute | Pending |
| AUD243-07 | P1: Convite de admin | Execute | Pending |
| AUD243-08 | P1: Convite de admin | Execute | Pending |

**Coverage:** 8 total, 8 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv` e
      `npm run test:coverage` (≥ 90%) verdes.
- [ ] `tests/api/platform-clinics.test.ts` e
      `tests/api/platform-clinic-admin-actions.test.ts` com um novo teste cada
      provando rollback/nada-gravado quando a auditoria falha, e os testes
      existentes intactos e verdes.
- [ ] Nenhuma mudança de contrato de resposta das duas rotas fora do que os
      critérios de aceite pedem (status 500 só no caminho de falha de
      auditoria).
