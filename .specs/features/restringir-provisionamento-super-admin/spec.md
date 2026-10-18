# Restringir provisionamento do super_admin — Specification

Issue: [#253](https://github.com/KalleoPinheiro/estomasystech/issues/253) — resíduo da #214/ADR-007.
Escopo: **Medium** (mudança cirúrgica em 2 arquivos de domínio/lib + testes + 2 docs; sem
arquitetura nova, sem gray area de produto — a regra de negócio já está decidida no ADR-007).

## Problem Statement

O ADR-007 (2026-09-27) decidiu que o `super_admin` é operador da plataforma: cadastra, pela
plataforma, apenas o `company_admin` de cada clínica, e não faz nada operacional dentro dela.
`PROVISIONING_MATRIX.super_admin`, em `src/domain/auth/role-hierarchy.ts`, ainda lista
`['company_admin', 'atendente', 'profissional', 'patient', 'partner']` — contradiz a decisão. Hoje
nenhuma rota com sessão real alcança essa regra (a família `administrative` bloqueia o
`super_admin`, B1), mas uma rota futura que confie em `canProvision` herdaria a permissão errada.
Além disso, `accountManager(null)` (modo aberto, só dev) trata sessão ausente como `super_admin`
nas rotas `PATCH /api/accounts/[id]` e `POST /api/accounts/[id]/resend-invite`, enquanto
`POST /api/accounts` trata o mesmo modo aberto como `company_admin` — inconsistência que, se a
matriz for enxugada sem alinhar, quebra edição de atendente/profissional no modo aberto (403).

## Goals

- [x] `PROVISIONING_MATRIX.super_admin` vira `['company_admin']`; as demais linhas não mudam.
- [x] `accountManager(null)` devolve `{ role: 'company_admin', subject: null }`, igual ao
      `POST /api/accounts`.
- [x] ACE-RN-05 (`docs/domains/acesso/README.md`) e o ADR-007 declaram explicitamente que o
      `super_admin` só cadastra `company_admin`, pela plataforma.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Consertar/remover o modo aberto | É a #220 — aqui só se alinha o papel que ele assume nas rotas de conta, não sua existência. |
| Novas rotas ou permissões para o super_admin dentro da clínica | Contradiria o ADR-007; não pedido pela issue. |
| Mexer em `/api/accounts` (`POST`) | Já trata modo aberto como `company_admin`; fora do diff desta issue (a #244 tocará `/api/accounts/[id]` depois — diff mantido mínimo). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Nenhum outro consumidor de `PROVISIONING_MATRIX.super_admin` depende das linhas removidas | Confirmado por busca (`grep -rn canProvision`) — só `create-account.ts` e `account-management.ts` (via `assertCanManageAccount`/`visibleAccounts`), ambos guardados por sessão real (`administrative`, bloqueada para `super_admin`) ou pelo próprio modo aberto que este spec realinha | Evita quebrar `tests/api/platform-*` (usam só `canProvision('super_admin','company_admin')`, que continua `true`) | y |
| `docs/plano-evolucao-faseado.md` não ganha nova entrada de backlog | A linha existente já cita "Pendências posteriores: #243–#253" como faixa; não há item individual a riscar | Consistente com o precedente das Fases A–C (não editar a tabela de fases) | y |

**Open questions:** none — resolvidas acima.

---

## User Stories

### P1: Matriz de provisionamento reflete o ADR-007 ⭐ MVP

**User Story**: Como mantenedor do domínio de acesso, quero que `PROVISIONING_MATRIX.super_admin`
liste só `company_admin`, para que nenhuma rota futura herde, por engano, permissão de o
`super_admin` cadastrar papel operacional da clínica.

**Why P1**: É o requisito central da issue — a contradição com o ADR-007.

**Acceptance Criteria**:

1. WHEN `canProvision('super_admin', 'company_admin')` THEN o sistema SHALL retornar `true`.
2. WHEN `canProvision('super_admin', target)` para `target` em `atendente`, `profissional`,
   `patient`, `partner` ou `super_admin` THEN o sistema SHALL retornar `false`.
3. WHEN as demais linhas de `PROVISIONING_MATRIX` (`company_admin`, `atendente`, `profissional`,
   `patient`, `partner`) forem avaliadas THEN o sistema SHALL manter o mesmo comportamento de hoje
   (inalteradas).

**Independent Test**: `npm run test:coverage -- tests/domain/role-hierarchy.test.ts` — a tabela
`EXPECTED` cobre as 36 combinações ator×alvo.

---

### P1: Modo aberto de `/api/accounts/[id]` alinhado a `company_admin` ⭐ MVP

**User Story**: Como desenvolvedor rodando em `ESTOMASYSTECH_ALLOW_OPEN_MODE=true`, quero que o modo aberto
trate sessão ausente como `company_admin` em toda rota de conta, para que editar
atendente/profissional continue funcionando após a matriz ser enxugada.

**Why P1**: Sem isso, o passo anterior quebra o modo aberto em `PATCH /api/accounts/[id]` e
`POST /api/accounts/[id]/resend-invite` (403 para atendente/profissional).

**Acceptance Criteria**:

1. WHEN `accountManager(null)` THEN o sistema SHALL retornar `{ role: 'company_admin', subject: null }`.
2. WHEN `accountManager(session)` com uma sessão real THEN o sistema SHALL retornar
   `{ role: session.role, subject: session.subject }`, sem alteração de comportamento.

**Independent Test**: `npm run test:coverage -- tests/lib/account-manager.test.ts`.

---

### P2: Documentação viva reflete a regra

**User Story**: Como agente/dev lendo `docs/domains/acesso/README.md` ou o ADR-007, quero ver
explicitamente que o `super_admin` só cadastra `company_admin`, pela plataforma, para não reabrir a
dúvida que originou a issue.

**Why P2**: Não muda comportamento de código, mas é critério de aceite explícito da issue e gate do
`tests/docs/super-admin-docs.test.ts`.

**Acceptance Criteria**:

1. WHEN `docs/domains/acesso/README.md` for lido THEN a linha ACE-RN-05 SHALL declarar que o
   `super_admin` só cadastra `company_admin`, pela plataforma.
2. WHEN `docs/adr/007-super-admin-operador-da-plataforma.md` for lido THEN a seção "Um único
   super_admin" SHALL conter a mesma afirmação.
3. WHEN `npm run check:docs` e `tests/docs/super-admin-docs.test.ts` rodarem THEN ambos SHALL
   continuar verdes (frontmatter válido, asserções pré-existentes do ADR-007 intactas).

**Independent Test**: leitura direta dos dois arquivos + `npx vitest run tests/docs/super-admin-docs.test.ts`.

---

## Edge Cases

- WHEN uma rota real de `super_admin` tentar provisionar `atendente`/`profissional`/`patient`/`partner`
  (hoje inalcançável, família `administrative` bloqueada) THEN `canProvision` SHALL já retornar
  `false`, de forma que uma rota futura que reutilize a regra falhe fechado.
- WHEN `PLATFORM_ACCOUNT_MANAGER` (usado por `CreateClinic`/`ManageClinicAdmins`) chamar
  `canProvision('super_admin', 'company_admin')` THEN o resultado SHALL continuar `true` — os
  testes de `tests/api/platform-clinics.test.ts` e `tests/api/platform-clinic-admin-actions.test.ts`
  não podem regredir.
- WHEN `visibleAccounts('super_admin', accounts)` for chamado (hoje sem consumidor de rota real)
  THEN SHALL retornar só contas `company_admin` — comportamento novo, mas sem teste pré-existente
  que dependa do valor antigo (verificado por busca).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PROV-01 | P1: Matriz reflete ADR-007 | Implementado | Verified |
| PROV-02 | P1: Matriz reflete ADR-007 (linhas inalteradas) | Implementado | Verified |
| PROV-03 | P1: Modo aberto alinhado | Implementado | Verified |
| PROV-04 | P1: Modo aberto alinhado (sessão real) | Implementado | Verified |
| DOC-01 | P2: Docs | Implementado | Verified |
| DOC-02 | P2: Docs | Implementado | Verified |

**Coverage:** 6 total, 6 mapeados para implementação/testes, 0 sem cobertura.

---

## Success Criteria

- [x] `tests/domain/role-hierarchy.test.ts` (36 combinações) e `tests/lib/account-manager.test.ts`
      (novo) verdes.
- [x] `tests/api/platform-clinics.test.ts` e `tests/api/platform-clinic-admin-actions.test.ts`
      seguem verdes (sem regressão na plataforma).
- [x] `tests/docs/super-admin-docs.test.ts` segue verde.
- [x] `npm run typecheck`, `npm run lint`, `npm run check:sv`, `npm run test:coverage` (≥ 90%) e
      `npm run check:docs` verdes.

## Implementation Note

Mudança pequena e cirúrgica (2 arquivos de produção, 2 arquivos de teste, 2 docs) — implementada
diretamente sem fases `design.md`/`tasks.md` formais (auto-sizing: Medium, tasks implícitas em
Execute). Commits atômicos: (1) domínio + teste, (2) lib + teste, (3) docs.
