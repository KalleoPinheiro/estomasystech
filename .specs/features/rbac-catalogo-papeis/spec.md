# RBAC: Catálogo de 6 Papéis e Hierarquia de Cadastro por Empresa — Specification

Issue: [#20](https://github.com/KalleoPinheiro/estomasystech/issues/20). Sub-issues (ordem cronológica obrigatória): [#28](https://github.com/KalleoPinheiro/estomasystech/issues/28) (R1), [#29](https://github.com/KalleoPinheiro/estomasystech/issues/29) (R2), [#30](https://github.com/KalleoPinheiro/estomasystech/issues/30) (R3), [#31](https://github.com/KalleoPinheiro/estomasystech/issues/31) (R4). Executa [ADR-003](../../../docs/adr/003-modelo-de-papeis-multi-empresa.md). Depende de #19 (fundação de multi-tenancy, já mergeada).

## Problem Statement

Hoje só existem 3 papéis (`admin`, `partner`, `patient`), e "admin" é monolítico: qualquer conta de equipe tem acesso total a todos os pacientes da clínica. Login por senha sempre atribui `"admin"` na sessão, independente de qual conta autenticou (`src/app/api/auth/login/route.ts:62`). Isso é um risco residual documentado na ADR-002 e torna o sistema superexposto por padrão.

## Goals

- [ ] Catálogo de papéis expandido para 6 valores fixos, sem mecanismo de papel customizado por empresa.
- [ ] Bug "senha sempre vira admin" corrigido: papel sempre lido da própria conta.
- [ ] Hierarquia de cadastro de contas (quem pode criar quem) aplicada e testada.
- [ ] Atendente restrito a dados operacionais; Profissional escopado dinamicamente por vínculo com paciente.
- [ ] Teste de conformidade de rotas cobrindo os 6 papéis.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Remoção do login via Google OAuth, convite/reset de senha por e-mail | Issue #21 (próxima) |
| RBAC configurável por empresa (papéis/permissões customizados) | Fora do catálogo fechado decidido na ADR-003 |
| Suporte a uma pessoa com conta em mais de uma empresa | Fora do escopo desta entrega |
| Onboarding self-service de empresas | Fase 3 do roadmap de multi-tenancy |
| Qualquer mudança na sincronização de agenda com Google Calendar | Integração desacoplada do login |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Coluna `role` em `user_accounts` | Nova coluna `text("role")` com o enum de 6 valores (mesmo padrão de `clinic_id`), `NOT NULL` com backfill | Nenhuma conta hoje tem papel gravado; toda conta existente (exceto as de teste/seed) foi criada via senha mestre e é operada como admin — mapeia para `Admin de Empresa` no backfill (não `Super Admin`, que deve ser criação explícita e rara, ver linha seguinte) | y (segue ADR-003 + issue #28) |
| Primeira conta Super Admin | Não existe hoje nenhuma conta cross-clinic; esta entrega cria/promove **uma única** conta Super Admin via seed/migração determinística (script, não UI), usando a variável já existente `AUTH_PASSWORD` como credencial temporária dela até a issue #21 trocar o mecanismo | Issue #20 não inclui convite por e-mail (isso é #21); sem um bootstrap explícito não haveria como testar/operar os cadastros de Super Admin descritos nas ACs | y (issue #20, seção "Further Notes": mapeamento Google→Super Admin é transitório; aqui cobrimos o equivalente para senha) |
| `clinic_id` nulo para Super Admin | Coluna `user_accounts.clinic_id` passa a aceitar `NULL`; `NULL` significa Super Admin (cross-clinic) | `Session.clinicId` já é `string \| null` desde a fundação de multi-tenancy — nula já significa "papel de sistema"; reaproveitar o mesmo sinal evita uma segunda flag redundante | y |
| Mapeamento temporário Google OAuth → papel | Contas que hoje autenticam via Google e resolviam para `"admin"` mapeiam para `Super Admin`; `partner`/`patient` via Google mapeiam para os papéis `Partner`/`Patient` | Literal do texto da issue #20 ("Further Notes"): comportamento transitório até #21 remover o Google OAuth por completo | y |
| Escopo de leitura do Atendente sobre agenda | Atendente vê e edita agendamentos e cadastro de paciente/parceiro da própria empresa (sem escopo por profissional) — só o campo clínico (evolução, avaliação, foto) é vedado | issue #30 (R3): "acessar a agenda e o cadastro de pacientes, mas não a evolução clínica" — não menciona restrição adicional de agenda por profissional | y |
| Vínculo Profissional↔paciente para R4 | `EXISTS appointment WHERE professionalId = conta.professionalId AND patientId = X` OR `EXISTS evolution_note WHERE professionalId = ... AND patientId = X` (união, nunca revogado) | Ambas tabelas já carregam `professionalId` (`src/infrastructure/persistence/drizzle/schema.ts`); casa com a redação da issue #31 ("agendamento ou nota de evolução vinculados", "nunca revogado") | y |
| Cadastro de paciente por Profissional concede acesso antecipado | Ao criar (`POST /api/patients` ou fluxo equivalente) um paciente estando autenticado como Profissional, o sistema grava automaticamente um vínculo (ex: nota de evolução vazia, ou tabela de vínculo dedicada) para que R4 já enxergue esse paciente antes do 1º agendamento | issue #31, AC 1: "Profissional que cadastra um Paciente ganha acesso imediato a ele, mesmo antes de qualquer agendamento" — não há hoje nenhum registro (appointment/evolution_note) criado nesse momento, então algum vínculo explícito precisa nascer nesse instante | y — decisão de design fica registrada em design.md |
| Rotas de conta (`/api/accounts`) e hierarquia | `POST /api/accounts` passa a exigir `role` no payload e validar (a) se o `role` do ator pode criar aquele `role`-alvo (tabela fixa da ADR-003) e (b) que o `clinic_id` do alvo é o mesmo do ator, exceto para Super Admin, que pode escolher a empresa-alvo | issue #29 (R2), ACs explícitos | y |
| Comportamento ao tentar criar papel fora da hierarquia | 403 com mensagem clara, nunca 500/exceção não tratada | issue #20, user story 16 + issue #29 AC "erro claro" | y |
| Comportamento ao tentar acessar paciente sem vínculo (Profissional) ou empresa errada (Atendente/Admin) | 404 (nunca 403) para não vazar existência do recurso, consistente com o padrão já estabelecido em M2 (#23) para isolamento por clínica | Reaproveita o padrão decidido e testado na fundação de multi-tenancy (`AD-017`, `.specs/STATE.md`); issue #23 AC: "não vaza existência do recurso" | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Catálogo de 6 papéis + correção do bug de resolução de papel (R1) ⭐ MVP

**User Story**: Como mantenedor do sistema, quero que uma conta autenticada por senha assuma sempre o papel gravado na própria conta, e que o sistema reconheça os 6 papéis do catálogo, para eliminar o bug de super-privilégio acidental.

**Why P1**: É a base estrutural — nenhuma outra história (hierarquia de cadastro, restrição do Atendente, escopo do Profissional) faz sentido sem o catálogo correto e sem o bug de resolução de papel corrigido primeiro. Corresponde a #28, bloqueia #29/#30/#31.

**Acceptance Criteria**:

1. The system SHALL reconhecer exatamente 6 valores de papel: `super_admin`, `company_admin`, `atendente`, `profissional`, `patient`, `partner`. <!-- ubiquitous -->
2. WHEN uma conta autentica por senha THEN o sistema SHALL atribuir à sessão o papel gravado no próprio registro de `user_accounts`, nunca um valor fixo por padrão. <!-- event-driven -->
3. WHEN uma conta autentica via Google OAuth e seu e-mail está na allowlist THEN o sistema SHALL atribuir o papel `super_admin` à sessão, com prioridade sobre um cadastro de `partner` ou `patient` no mesmo e-mail — mapeamento temporário até a issue #21 (`ResolveUserRole`, testado em `tests/application/rbac-portal.test.ts`: "Dado email na allowlist da equipe, Quando resolver, Então super_admin (mesmo sendo parceiro)"). <!-- event-driven -->
4. WHILE o mecanismo de resolução de papel por senha está ativo o sistema SHALL nunca produzir uma sessão com papel `super_admin` para uma conta cujo registro em `user_accounts.role` não seja `super_admin`. <!-- state-driven -->
5. WHEN uma rota de API é chamada por uma sessão de qualquer um dos 6 papéis THEN o sistema SHALL aplicar pelo menos a regra grosseira de família de rota (operacional vs. clínico vs. administrativo) antes de decidir 200 ou 403. <!-- event-driven -->
6. The system SHALL manter um teste de conformidade de rotas cobrindo os 6 papéis (extensão do já existente `tests/api/route-guard-conformance.test.ts`). <!-- ubiquitous -->

**Independent Test**: Criar uma conta com `role = "profissional"`, autenticar por senha, confirmar via cookie de sessão decodificado que `role === "profissional"` (não `"admin"`); repetir para os 6 papéis.

---

### P2: Hierarquia de cadastro de contas + API de criação (R2)

**User Story**: Como Admin de Empresa (ou Super Admin, Atendente, Profissional, dependendo do papel), quero cadastrar contas de papéis subordinados dentro da minha empresa, para montar minha equipe sem depender de auto-cadastro.

**Why P2**: Depende do catálogo e da correção de R1 (bloqueada por #28); é o mecanismo central de "quem pode existir no sistema". Corresponde a #29.

**Acceptance Criteria**:

1. WHEN uma sessão `super_admin` cria uma conta com qualquer papel em qualquer empresa THEN o sistema SHALL aceitar a criação. <!-- event-driven -->
2. WHEN uma sessão `company_admin` cria uma conta com papel `profissional`, `atendente`, `patient`, `partner` ou `company_admin` na própria empresa THEN o sistema SHALL aceitar a criação. <!-- event-driven -->
3. WHEN uma sessão `atendente` ou `profissional` cria uma conta com papel `patient` ou `partner` na própria empresa THEN o sistema SHALL aceitar a criação. <!-- event-driven -->
4. IF uma sessão tenta criar uma conta com um papel fora do permitido para o papel do ator (ex.: `company_admin` tentando criar `super_admin`) THEN o sistema SHALL responder 403 com mensagem indicando o papel negado. <!-- unwanted-behavior -->
5. IF uma sessão não-`super_admin` tenta criar uma conta em uma empresa diferente da própria THEN o sistema SHALL responder 403. <!-- unwanted-behavior -->
6. IF uma sessão `patient` ou `partner` tenta criar qualquer conta THEN o sistema SHALL responder 403. <!-- unwanted-behavior -->
7. The system SHALL permitir mais de uma conta `company_admin` simultânea por empresa. <!-- ubiquitous -->
8. The system SHALL não expor nenhuma rota de auto-cadastro (criação de conta sem sessão autenticada) para nenhum papel. <!-- ubiquitous -->

**Independent Test**: Para cada par (papel do ator, papel-alvo) da matriz de hierarquia, chamar `POST /api/accounts` com sessão do ator e confirmar 201 (permitido) ou 403 (negado) conforme a tabela da ADR-003.

---

### P3: Restrição operacional do Atendente (R3)

**User Story**: Como Atendente, quero acessar a agenda e o cadastro de pacientes, mas não a evolução clínica, avaliações ou fotos, para que meu acesso fique restrito ao que preciso pro meu trabalho do dia a dia.

**Why P3**: Depende só de R1 (#28); é uma regra de acesso relativamente isolada. Corresponde a #30.

**Acceptance Criteria**:

1. WHEN uma sessão `atendente` lê ou escreve agendamentos, ou lê/edita cadastro de paciente/parceiro da própria empresa THEN o sistema SHALL responder com sucesso (200/201, conforme o método). <!-- event-driven -->
2. IF uma sessão `atendente` tenta acessar notas de evolução, avaliações de condição ou fotos de condição THEN o sistema SHALL responder 403. <!-- unwanted-behavior -->

**Independent Test**: Sessão `atendente` faz `GET`/`POST` em rotas de agendamento e paciente (sucesso) e em rotas de evolução/avaliação/foto (403).

---

### P4: Escopo dinâmico do Profissional por paciente (R4)

**User Story**: Como Profissional, quero ver e editar só os pacientes com quem tenho pelo menos um agendamento ou nota de evolução vinculados (incluindo os que acabei de cadastrar), para não ter acesso a prontuário de paciente que nunca atendi, e continuar vendo meu próprio histórico mesmo após deixar de atender alguém.

**Why P4**: Depende de R1 (#28) e das duas migrações de escopo por empresa de agenda e prontuário clínico (#24/M3, #25/M4), já mergeadas em #19. É a regra mais fina e a última da cadeia. Corresponde a #31.

**Acceptance Criteria**:

1. WHEN uma sessão `profissional` cadastra um paciente (`POST /api/patients` ou equivalente) THEN o sistema SHALL conceder a esse profissional acesso imediato ao paciente, mesmo antes de qualquer agendamento. <!-- event-driven -->
2. WHILE um paciente recém-cadastrado por um Profissional não tem nenhum agendamento, uma sessão desse Profissional consultando a agenda desse paciente THEN o sistema SHALL retornar lista vazia (não erro). <!-- state-driven -->
3. IF uma sessão `profissional` tenta acessar um paciente com quem não tem nenhum vínculo (não cadastrou, não tem agendamento nem nota de evolução) THEN o sistema SHALL responder 404 ou lista vazia (nunca vazar dado do paciente). <!-- unwanted-behavior -->
4. WHEN um segundo profissional (Dr. B) passa a ter um agendamento com um paciente já atendido por outro profissional (Dr. A) THEN o sistema SHALL manter o acesso de Dr. A ao histórico do período em que atendeu, e conceder a Dr. B acesso ao que passa a registrar dali em diante. <!-- event-driven -->
5. The system SHALL nunca revogar o acesso de um Profissional ao histórico de um paciente que já teve pelo menos um agendamento ou nota de evolução vinculados a ele. <!-- ubiquitous -->

**Independent Test**: (a) Profissional cadastra paciente sem agendamento → acessa paciente, agenda vazia. (b) Profissional sem nenhum vínculo tenta acessar paciente de outro → 404. (c) Dr. A atende paciente, depois Dr. B ganha agendamento com o mesmo paciente → ambos continuam acessando o paciente.

---

## Edge Cases

- IF uma conta tem `role` gravado como um valor fora do enum de 6 (dado corrompido/legado) THEN o sistema SHALL rejeitar o login com erro (nunca cair em um papel implícito).
- IF a migração de backfill de `role` encontra uma conta sem nenhum sinal de papel anterior THEN o sistema SHALL atribuir `company_admin` como default de backfill (ver Assumptions).
- WHEN uma sessão Super Admin acessa dado de uma empresa que não é a "sua" (não tem nenhuma, por definição) THEN o sistema SHALL registrar evento de auditoria com o identificador da empresa acessada (comportamento já herdado de #23/M2, agora estendido a `company_admin` acessando fora da própria empresa nunca deve ocorrer — é sempre 403/404, não um caso de auditoria).
- IF duas contas tentam se tornar `company_admin` da mesma empresa simultaneamente (race de criação concorrente) THEN o sistema SHALL aceitar ambas (não há limite de quantidade), sem tratamento especial de concorrência além do já garantido pela unicidade `(clinic_id, email)`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Task(s) | Status |
| --- | --- | --- | --- | --- |
| RBAC-01 | P1: Catálogo + correção do bug (R1) | Design | T1, T2, T3, T6 | Done |
| RBAC-02 | P1: Catálogo + correção do bug (R1) | Design | T3, T4 | Done |
| RBAC-03 | P1: Catálogo + correção do bug (R1) | Design | T5 | Done |
| RBAC-04 | P1: Catálogo + correção do bug (R1) | Design | T4 | Done |
| RBAC-05 | P1: Catálogo + correção do bug (R1) | Design | T7, T8 | Done |
| RBAC-06 | P1: Catálogo + correção do bug (R1) | Design | T8 | Done |
| RBAC-07 | P2: Hierarquia de cadastro (R2) | Design | T9 | Done |
| RBAC-08 | P2: Hierarquia de cadastro (R2) | Design | T9 | Done |
| RBAC-09 | P2: Hierarquia de cadastro (R2) | Design | T9 | Done |
| RBAC-10 | P2: Hierarquia de cadastro (R2) | Design | T9 | Done |
| RBAC-11 | P2: Hierarquia de cadastro (R2) | Design | T10, T11 | Done |
| RBAC-12 | P2: Hierarquia de cadastro (R2) | Design | T10, T11 | Done |
| RBAC-13 | P2: Hierarquia de cadastro (R2) | Design | T11 | Done |
| RBAC-14 | P2: Hierarquia de cadastro (R2) | Design | T11, T12 | Done |
| RBAC-15 | P3: Restrição do Atendente (R3) | Design | T13 | Done |
| RBAC-16 | P3: Restrição do Atendente (R3) | Design | T13, T14 | Done |
| RBAC-17 | P4: Escopo dinâmico do Profissional (R4) | Design | T15, T16, T18, T19 | Done |
| RBAC-18 | P4: Escopo dinâmico do Profissional (R4) | Design | T16, T19 | Done |
| RBAC-19 | P4: Escopo dinâmico do Profissional (R4) | Design | T17, T18, T19 | Done |
| RBAC-20 | P4: Escopo dinâmico do Profissional (R4) | Design | T17, T19 | Done |
| RBAC-21 | P4: Escopo dinâmico do Profissional (R4) | Design | T15, T17, T19 | Done |

**Coverage:** 21 total, 21 mapped to tasks, 0 unmapped. Todas as 19 tasks (T1-T19) commitadas; evidência por requisito em `.specs/features/rbac-catalogo-papeis/validation.md` (amostragem verificada pelo Verifier independente).

---

## Success Criteria

- [x] `npm run test:coverage` verde, ≥90% (97.01% statements medido), sem regressão.
- [x] `tests/api/route-guard-conformance.test.ts` cobre os 6 papéis (permitido + negado por família de rota).
- [x] Nenhuma conta consegue se auto-cadastrar (`tests/api/no-self-registration.test.ts`).
- [x] Cenário de transferência de caso (Dr. A → Dr. B) tem teste explícito e passa (`tests/api/professional-patient-link-on-appointment-evolution.test.ts`).
- [x] `npm run typecheck`, `npm run lint`, `npm run check:sv`, `npm run build` verdes.
