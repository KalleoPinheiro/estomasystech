# Google Accounts — Escopo por Empresa Specification

## Problem Statement

`google_accounts` não tem `clinic_id`. `findMostRecent()` ignora empresa e o cache de gateway do Calendar em `container.ts` é global por processo — a última clínica a conectar o Google Agenda vence para todas as outras. Issue #74.

## Goals

- [ ] `google_accounts` ganha `clinic_id` (nullable, papel de sistema = null) e escopo via `withTenant` (AD-017), igual ao padrão de `user_accounts`.
- [ ] Cache do gateway de Calendar em `container.ts` deixa de ser uma única entrada global e passa a ser por clínica — elimina o vazamento de credencial entre empresas.
- [ ] Teste de isolamento: duas clínicas conectam contas Google diferentes; cada uma só enxerga a própria.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Revogar/desconectar conta Google pela UI | Fora do escopo da issue #74 (só corrige o vazamento cross-tenant) |
| Migrar dados de linhas legadas de `google_accounts` para uma clínica específica | Não há como inferir a clínica certa de uma linha antiga sem contexto externo — ver Assunção abaixo |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Chave primária da tabela | Trocar de `email` (PK) para `id` determinístico (`` `${clinicId ?? 'system'}:${email}` ``), mantendo upsert por `target: id` como todo resto do schema (padrão `onConflictDoUpdate({ target: table.id })`) | `ON CONFLICT` do Postgres (via drizzle-orm nesta versão) não suporta `targetWhere`/índice parcial como alvo — precisando de upsert determinístico sem depender de índice composto nullable | n (assumido — sem gray area de produto, decisão técnica) |
| Linhas legadas sem `clinic_id` | Ficam com `clinic_id = NULL` (papel de sistema) após a migration — nenhuma coluna é apagada, nenhum dado é descartado | Mesma convenção de `user_accounts` (super_admin) e de toda a migração de multi-tenancy anterior (fundacao-multi-tenancy): dado pré-existente vira escopo de sistema, nunca é excluído | n |
| Cache do gateway de Calendar | Passa de uma variável global única para um `Map` chaveado por `clinicId ?? 'system'` | É a causa raiz do vazamento: mesmo corrigindo a query, o processo reaproveitava o gateway de outra empresa via cache | n |
| `findByEmail` também ganha escopo por clínica | Sim, mesmo padrão de `findMostRecent` — consistência com o resto do repositório, apesar de não haver chamador de produção hoje (só teste) | Repositório com um método escopado e outro não é uma armadilha de segurança futura | n |

**Open questions:** nenhuma — resolvidas ou registradas acima.

---

## User Stories

### P1: Escopo por clínica na tabela e no repositório ⭐ MVP

**User Story**: Como responsável técnico do EstomaSysTech, quero que `google_accounts` tenha `clinic_id` e que as queries do repositório sejam filtradas por empresa, para que a credencial do Google Agenda de uma clínica nunca seja usada por outra.

**Why P1**: É a causa raiz do bug relatado na issue #74.

**Acceptance Criteria**:

1. WHEN a migration roda THEN `google_accounts` SHALL ter coluna `clinic_id` (nullable, FK para `clinics.id`), índice em `clinic_id` e PK trocada para `id` (texto).
2. WHEN `DrizzleGoogleAccountRepository` é instanciado THEN SHALL exigir `clinicId: string | null` no construtor, no mesmo padrão de `DrizzleProfessionalRepository`.
3. WHEN `save()` é chamado com `clinicId` não nulo THEN SHALL persistir a linha com aquele `clinic_id` e SHALL fazer upsert idempotente por reconexão da mesma clínica (mesmo `email` + `clinicId` sobrescreve a linha existente, não duplica).
4. WHEN `findMostRecent()` é chamado com `clinicId` não nulo THEN SHALL retornar apenas a conta mais recente **daquela clínica**, ignorando linhas de outras empresas.
5. WHEN `findMostRecent()` é chamado com `clinicId = null` (papel de sistema) THEN SHALL retornar a mais recente entre as linhas de `clinic_id IS NULL` (comportamento do `withTenant` existente).
6. WHEN `findByEmail()` é chamado THEN SHALL aplicar o mesmo filtro de `clinicId` via `withTenant`.

**Independent Test**: inserir contas Google para duas clínicas diferentes via `save()` e confirmar que `findMostRecent()` de cada uma só retorna a própria.

---

### P1: Cache do gateway de Calendar por clínica

**User Story**: Como responsável técnico, quero que o gateway de Calendar em `container.ts` seja cacheado por clínica, para que o processo Node não reaproveite a credencial OAuth de uma empresa para outra.

**Why P1**: Sem isso, mesmo com a query corrigida, o cache global (`globalForServices.estomasystechCalendar`, uma única entrada) ainda serve a última credencial resolvida para qualquer clínica que peça um gateway em seguida — é a segunda metade do mesmo bug.

**Acceptance Criteria**:

1. WHEN `getRepositories(tenant)` é chamado para a clínica A e depois para a clínica B THEN cada uma SHALL receber o `CalendarGateway` construído com a credencial OAuth da própria clínica (ou o fallback de service-account/nulo), nunca a credencial resolvida para a outra.
2. WHEN a mesma clínica pede o gateway de novo sem ter reconectado a conta THEN o gateway cacheado SHALL ser reaproveitado (sem reconstrução redundante) — comportamento de cache preservado, só a chave muda de global para por-clínica.

**Independent Test**: chamar `getRepositories({clinicId: 'a'})` e `getRepositories({clinicId: 'b'})` com contas Google distintas persistidas para cada uma e inspecionar que o gateway retornado para cada uma reflete a credencial da própria clínica.

---

### P2: Teste de isolamento entre empresas (Calendar)

**User Story**: Como responsável técnico, quero um teste automatizado de isolamento multi-tenant para a conexão do Calendar, para que uma regressão futura seja pega pelo gate de cobertura.

**Why P2**: Critério de aceite explícito da issue #74; garante que o fix não regride silenciosamente.

**Acceptance Criteria**:

1. WHEN duas clínicas têm contas Google conectadas com `connectedAt` diferentes THEN um teste SHALL provar que `findMostRecent(clinicA)` nunca retorna a conta da clínica B mesmo que a de B seja mais recente.

**Independent Test**: é o próprio teste automatizado (roda no gate `test:coverage`).

---

## Edge Cases

- WHEN `clinicId = null` (modo aberto / papel de sistema) faz `save()` duas vezes com o mesmo email THEN SHALL sobrescrever a mesma linha do sistema (não duplicar), preservando o comportamento de hoje para esse caso.
- WHEN uma clínica nunca conectou o Google Agenda THEN `findMostRecent(clinicId)` SHALL retornar `null` e o fallback de service-account/nulo do `container.ts` SHALL se aplicar normalmente (comportamento já existente, não regride).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| GACC-01 | P1: Escopo na tabela/repositório | Execute | Pending |
| GACC-02 | P1: Escopo na tabela/repositório | Execute | Pending |
| GACC-03 | P1: Escopo na tabela/repositório | Execute | Pending |
| GACC-04 | P1: Escopo na tabela/repositório | Execute | Pending |
| GACC-05 | P1: Cache por clínica | Execute | Pending |
| GACC-06 | P2: Teste de isolamento | Execute | Pending |

**Coverage:** 6 total, 6 mapeados para execução direta (Medium — sem `tasks.md` formal), 0 sem mapa.

---

## Success Criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv` passam.
- [ ] `npm run test:coverage` passa com piso de 90% mantido, incluindo o novo teste de isolamento.
- [ ] Nenhuma linha de `google_accounts` é apagada pela migration.
