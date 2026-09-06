# Identidade de sessão na sidebar — Specification

Issue: #126

## Problem Statement

A sidebar staff (`StaffLayoutClient`) exibe uma string fixa hardcoded
("Clínica de Estomaterapia") no lugar do nome real da clínica, e não mostra
e-mail nem papel da conta logada em nenhum lugar da UI. Em ambiente
multi-clínica isso é enganoso (sempre mostra o mesmo texto) e força quem
depura a consultar o banco direto pra saber qual sessão/clínica está ativa.

## Goals

- [ ] Sidebar mostra o nome real da clínica ativa (`clinics.name`, via
      `clinicId` da sessão), substituindo a string fixa.
- [ ] Sidebar mostra e-mail (`subject`) e papel (`role`) legível da conta
      logada.
- [ ] Caso `clinicId === null` (super_admin / modo aberto) mostra rótulo
      claro em vez de texto em branco ou quebrado.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Trocar de clínica pela UI (multi-clínica por conta) | Fora do modelo atual — uma conta pertence a uma clínica (CONTEXT.md) |
| Editar nome da clínica pela sidebar | Não pedido na issue |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde ler a sessão | Nova rota `GET /api/auth/identity` usando `requireStaffSession(request)` (padrão já testável, usado em ~75 handlers), consumida pelo client via `useApiQuery` | **SPEC_DEVIATION** da 1ª decisão (ler via `cookies()` direto no layout RSC): não há precedente de `next/headers` no repo e o `vitest` não roda dentro do escopo de request do Next — `cookies()` lançaria fora de um Route Handler real, tornando o código de leitura de sessão não testável e furando o gate de 90% de cobertura. A rota API mantém o mesmo padrão usado por `FollowUpsCard`/`LowStockCard`/`TriageQueue` (client fetch + `useApiQuery`) | y (mecânico, sem impacto de produto — resultado visual idêntico) |
| Rótulo pro papel | Mapa local `ROLE_LABELS` com os 4 papéis de equipe (não existe mapa compartilhado hoje — `roleLabel` em `document-frame.tsx` é caso isolado do portal) | Único display de papel necessário aqui; generalizar sem 2º consumidor seria especulativo (YAGNI) | y |
| `clinicId === null` (super_admin / modo aberto) | Mostra "Conta de sistema" no lugar do nome da clínica | Pedido explícito na issue; evita string vazia ou erro de lookup | y |
| Falha ao buscar clínica (`clinics.findById` retorna null) | Mostra "Clínica não encontrada" em vez de quebrar a página | Defesa contra dado inconsistente; não deveria acontecer em uso normal | y |
| Sessão ausente (modo aberto sem cookie) | Layout já pressupõe usuário staff autenticado (proxy + `requireStaffSession` nas rotas) — se `verifySessionToken` retornar `null`, sidebar cai no mesmo tratamento de "Conta de sistema" | Consistente com semântica de modo aberto documentada em `require-session.ts` | y |

**Open questions:** nenhuma — todas resolvidas acima.

---

## User Stories

### P1: Ver clínica e conta ativas na sidebar ⭐ MVP

**User Story**: Como membro da equipe, quero ver o nome real da minha
clínica e minha conta logada na sidebar, pra confiar que estou no contexto
certo sem precisar consultar o banco.

**Why P1**: É o achado inteiro da issue — sem isso não há entrega.

**Acceptance Criteria**:

1. WHEN a sessão tem `clinicId` válido THEN a sidebar SHALL mostrar
   `clinics.name` correspondente no lugar da string fixa atual.
2. WHEN a sessão tem `clinicId === null` (super_admin/modo aberto) THEN a
   sidebar SHALL mostrar "Conta de sistema" no lugar do nome da clínica.
3. WHEN a sessão existe THEN a sidebar SHALL mostrar o e-mail (`subject`) e
   um rótulo legível do papel (`role`) da conta logada, próximo ao botão de
   logout.
4. WHEN `clinics.findById(clinicId)` retorna `null` (clínica removida/dado
   inconsistente) THEN a sidebar SHALL mostrar "Clínica não encontrada" em
   vez de lançar erro ou renderizar em branco.

**Independent Test**: logar como `company_admin` de uma clínica com nome
cadastrado, abrir qualquer página staff, ver nome da clínica + e-mail +
papel na sidebar (desktop e mobile).

---

## Edge Cases

- WHEN sessão é `null` (modo aberto, `VITTA_ALLOW_OPEN_MODE=true`) THEN a
  sidebar SHALL mostrar "Conta de sistema" (mesmo tratamento do
  `clinicId === null`), sem quebrar a página.
- WHEN `role` não está no mapa de rótulos conhecidos (não deveria ocorrer,
  catálogo fechado de 6 papéis) THEN a sidebar SHALL cair para exibir o
  valor bruto do `role` em vez de lançar erro.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SIDEBAR-01 | P1 | Implement | Pending |
| SIDEBAR-02 | P1 | Implement | Pending |
| SIDEBAR-03 | P1 | Implement | Pending |
| SIDEBAR-04 | P1 | Implement | Pending |

**Coverage:** 4 total, 4 mapped to implementation, 0 unmapped.

---

## Success Criteria

- [ ] Nenhum texto fixo de nome de clínica sobra em `staff-layout-client.tsx`.
- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv`,
      `npm run test:coverage` (≥90%) e `npm run test:e2e` verdes.
