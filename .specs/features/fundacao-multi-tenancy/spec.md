# Fundação de Multi-Tenancy Specification

**Issue:** [#19](https://github.com/KalleoPinheiro/estomasystech/issues/19) (épico) + sub-issues [#22](https://github.com/KalleoPinheiro/estomasystech/issues/22) (M1), [#23](https://github.com/KalleoPinheiro/estomasystech/issues/23) (M2), [#24](https://github.com/KalleoPinheiro/estomasystech/issues/24) (M3), [#25](https://github.com/KalleoPinheiro/estomasystech/issues/25) (M4), [#26](https://github.com/KalleoPinheiro/estomasystech/issues/26) (M5), [#27](https://github.com/KalleoPinheiro/estomasystech/issues/27) (M6)
**ADRs:** [ADR-001](../../../docs/adr/001-multi-tenancy.md) (decisão de arquitetura), [ADR-003](../../../docs/adr/003-modelo-de-papeis-multi-empresa.md) (papel de sistema, próxima issue)

## Problem Statement

O EstomaSysTech hoje atende uma única clínica por deploy — não existe entidade "empresa" no banco, nem forma de isolar dados entre clientes diferentes. Isso bloqueia a reforma de login que distingue Super Admin (acesso a tudo) de Admin de Empresa (acesso só à própria empresa): sem uma Clinic real e um jeito de restringir consultas a ela, "Admin de Empresa" seria a mesma coisa que "acesso total".

## Goals

- [ ] Tabela `clinics` existe e toda tabela que guarda dado por clínica carrega `clinic_id NOT NULL`, com 100% das linhas existentes migradas para um tenant legado (M1).
- [ ] Sessão autenticada carrega `clinic_id`; container de dependências monta repositórios já filtrados pela empresa da sessão; rotas de Paciente provam o padrão de isolamento + auditoria de acesso cross-empresa (M2).
- [ ] Agenda, procedimento e configuração de horário isolados por empresa (M3).
- [ ] Prontuário clínico (profissional, condição clínica, avaliação, foto, nota de evolução, anamnese, plano de cuidado, avaliação de desfecho, registro de intervenção) isolado por empresa; fotos namespaced por empresa (M4).
- [ ] Estoque (suprimento, lote, movimento) isolado por empresa (M5).
- [ ] Contas, parceiros, retorno, lembrete, consentimento, auditoria e cobrança (fatura, pacote de sessões, consumo de pacote) isolados por empresa; e-mail de login único por empresa (M6).

## Out of Scope

| Item | Motivo |
| --- | --- |
| Row-Level Security do Postgres (`SET LOCAL`, política por `current_setting`) | ADR-001 adia para épico dedicado; isolamento por aplicação é a rede de proteção desta entrega. |
| Onboarding self-service de empresas | Fase 3 da ADR-001. |
| Rota/UI para o Super Admin **criar** uma nova empresa | Nenhuma das 6 sub-issues (#22–#27) contém AC para uma rota de criação de clínica — a capacidade de autorizar quem pode chamá-la depende do papel Super Admin real, que é a próxima issue (ADR-003). Testes de isolamento desta entrega inserem uma segunda clínica diretamente no banco de teste (fixture), não via API. |
| Customização de taxonomia clínica por empresa | Catálogo (tipos de lesão, tipos de estoma etc.) continua global, conforme issue #19. |
| Suporte a uma pessoa com contas em mais de uma empresa | 1 conta = 1 empresa (ADR-003). |
| Mudança no catálogo de papéis (Super Admin, Atendente, Profissional como papéis formais) | Tratado na próxima issue desta reforma (ADR-003). |
| Ambiguidade de login Google entre clínicas com o mesmo e-mail | Ver Assumptions - só se torna um risco real quando existir mais de uma clínica em produção, o que depende da capacidade de criar clínica (fora de escopo acima). |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Representação de "papel de sistema" (Super Admin) na sessão antes do catálogo de papéis do ADR-003 existir | Reaproveitar `role: "admin"` com claim `clinicId: null`; o container detecta `clinicId` nulo e monta repositórios sem filtro de tenant, gerando evento de auditoria por acesso cross-empresa. Nenhum valor novo de `UserRole` é adicionado nesta entrega. | Decisão do usuário. Evita adicionar um valor de enum que o ADR-003 provavelmente vai redefinir de qualquer forma; o mecanismo (claim nulo → sem filtro → auditoria) sobrevive à troca por um papel real depois. | y |
| Tabelas ligadas a paciente não listadas em nenhuma das 6 sub-issues (`anamneses`, `care_plans` + 3 tabelas filhas, `outcome_evaluations`, `intervention_records`, `session_packages`, `package_consumptions`, `invoices`) — ganham `clinic_id` próprio ou ficam isoladas só via `patientId`? | Ganham `clinic_id` próprio. `anamneses`/`care_plans`+filhas/`outcome_evaluations`/`intervention_records` entram na M4 (mesmo domínio de prontuário clínico); `session_packages`/`package_consumptions`/`invoices` entram na M6 (cobrança, sem milestone próprio nas 6 issues originais). | Decisão do usuário. Bate com a própria redação do AC da M1 ("toda tabela que guarda dado por clínica") e com a intenção de defesa em profundidade do ADR-001; ficar só no join por `patientId` deixaria uma rota futura vazar dado se esquecer de checar a posse do paciente primeiro. | y |
| Nome/identificador da clínica legada criada pelo backfill da M1 | `name: "Clínica Legada"`, id gerado (uuid), sem necessidade de coluna extra além do já previsto em Goals/M1. | Nenhuma das issues especifica um nome; é um detalhe de baixo risco (a linha nunca aparece numa tela de escolha de clínica, já que só existe uma clínica visível até a Fase 3 de onboarding). | Assumido pelo agente (baixo risco). |
| `google_accounts` (PK = e-mail, sem coluna própria de tenant, conforme AC da M6) resolve para qual `user_accounts` quando o e-mail de login deixa de ser único globalmente (passa a ser único por `(clinic_id, email)`) | Nesta entrega, a resolução por e-mail nunca é ambígua na prática, porque não existe rota para criar uma segunda clínica (ver Out of Scope) — logo há sempre no máximo uma clínica com contas reais. Se o lookup por e-mail encontrar mais de um `user_accounts` (cenário só possível depois que a criação de clínica existir), a rota de login Google retorna 409 e loga o conflito, em vez de escolher arbitrariamente. | Gray area técnica levantada na investigação de código, não decidida por nenhuma sub-issue; como o risco só se materializa depois de uma capacidade fora de escopo desta entrega, o agente resolve com o comportamento mais seguro (fail closed) em vez de perguntar por um edge case ainda inatingível. | Assumido pelo agente (baixo risco, documentado). |
| `schedule_settings` (hoje linha única `id="default"`) após a migração | Passa a ter `clinic_id` como parte da chave; a única linha existente migra para a clínica legada. Como não há rota de criação de clínica nesta entrega, não há necessidade de criar uma segunda linha default nesta entrega — fica implícito para quando a criação de clínica existir. | Consequência direta do item "criação de empresa fora de escopo" acima. | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### M1: Migração `clinics` + `clinic_id` em todas as tabelas ⭐ P1 (issue #22)

**User Story**: Como mantenedor do sistema, quero que o banco tenha uma entidade Clinic real e que toda tabela por-clínica carregue `clinic_id`, sem mudar nenhum comportamento observável ainda, para que o isolamento por empresa tenha uma base estrutural sólida.

**Why P1**: Bloqueia every outra milestone (M2–M6) e a reforma de papéis (ADR-003).

**Acceptance Criteria**:

1. The system SHALL expor uma tabela `clinics` com identificador, nome e metadados de criação (`created_at`, `created_by`).
2. The system SHALL adicionar coluna `clinic_id NOT NULL` (referenciando `clinics`) às tabelas: `patients`, `professionals`, `partners`, `user_accounts`, `appointments`, `procedures`, `clinical_conditions`, `condition_assessments`, `condition_photos`, `evolution_notes`, `supplies`, `supply_batches`, `stock_movements`, `follow_ups`, `reminder_logs`, `consent_records`, `schedule_settings`, `anamneses`, `care_plans`, `care_plan_diagnoses`, `care_plan_outcomes`, `care_plan_interventions` (as 3 tabelas filhas de `care_plans`, nomes confirmados durante a tentativa de execução da Batch A), `outcome_evaluations`, `intervention_records`, `session_packages`, `package_consumptions`, `invoices`. The system SHALL também adicionar a coluna a `audit_events` nesta mesma migração (decisão de sequenciamento em Design: evita alterar essa tabela duas vezes, já que a M2 precisa do campo antes da M6 formalizar seu preenchimento em todo evento).
3. WHEN a migração roda contra um banco com dados pré-existentes THEN a migração SHALL criar automaticamente uma clínica legada e associar 100% das linhas existentes dessas tabelas a ela.
4. IF a migração terminar THEN o sistema SHALL não deixar nenhuma linha dessas tabelas com `clinic_id` nulo (constraint `NOT NULL` reforça isso no schema).
5. The system SHALL manter todo comportamento de API inalterado nesta entrega — a coluna existe, mas nenhuma rota ainda filtra por ela.
6. The system SHALL tornar únicos por `(clinic_id, campo)`, em vez de globalmente, os campos: `patients.email`, `user_accounts.email`, `procedures.name` (case-insensitive, mantendo o índice atual `lower(name)`).

**Independent Test**: Rodar a migração contra um banco de teste (PGlite) com dados de fixture de todas as tabelas listadas e confirmar via teste de migração que toda linha tem `clinic_id` preenchido com o id da clínica legada, e que nenhuma rota HTTP muda de comportamento (suíte de testes de rota existente continua verde sem alteração).

---

### M2: Sessão com `clinic_id` + escopo por empresa no Paciente (piloto) + auditoria do Super Admin ⭐ P1 (issue #23)

**User Story**: Como usuário de qualquer papel de uma empresa, quero que minha sessão só me deixe enxergar paciente da minha própria empresa; como Super Admin, quero acessar paciente de qualquer empresa com o acesso registrado em auditoria.

**Why P1**: Prova o padrão de isolamento (sessão → container → repositório → rota) que M3–M6 replicam mecanicamente; sem isso as demais milestones não têm o que seguir.

**Acceptance Criteria**:

1. The system SHALL incluir a claim `clinic_id` no token de sessão assinado, nula para o papel de sistema (ver Assumptions: `role: "admin"` + `clinicId: null`).
2. WHEN o container de dependências monta os repositórios para uma requisição THEN o container SHALL receber o `clinic_id` da sessão atual e instanciar repositórios já filtrados por ele.
3. WHILE a claim `clinic_id` da sessão é nula (papel de sistema) o container SHALL montar repositórios sem filtro de tenant.
4. WHEN uma sessão de uma empresa lista ou lê paciente THEN a rota SHALL retornar/afetar apenas pacientes da própria empresa da sessão.
5. IF uma sessão de uma empresa tentar acessar (por id) um paciente de outra empresa THEN a rota SHALL responder 404, sem distinguir "não existe" de "existe em outra empresa".
6. WHEN uma sessão de papel de sistema (clinic_id nulo) acessar um paciente de qualquer empresa THEN o sistema SHALL permitir o acesso E gravar um evento de auditoria com o identificador da empresa acessada.
7. The system SHALL adicionar um campo à agregação de evento de auditoria (`AuditEvent`) para registrar a empresa cujo dado foi acessado em um acesso cross-empresa (campo hoje inexistente).

**Independent Test**: Teste de rota (HTTP + PGlite) com duas clínicas e duas sessões assinadas distintas comprova: sessão A não vê paciente de B (404), sessão de papel de sistema vê paciente de ambas e cada acesso cross-empresa gera uma linha em `audit_events` com a empresa acessada.

---

### M3: Escopo por empresa — agenda e catálogo ⭐ P1 (issue #24)

**User Story**: Como desenvolvedor mantendo o sistema, quero que agendamento, procedimento e configuração de horário sigam o mesmo padrão de isolamento já provado no Paciente.

**Why P1**: Replica o padrão da M2 nas entidades operacionais do dia a dia (agenda).

**Acceptance Criteria**:

1. WHEN uma sessão de uma empresa lista ou lê agendamento THEN a rota SHALL retornar/afetar apenas agendamentos da própria empresa.
2. WHEN uma sessão de uma empresa lista, lê ou cria procedimento THEN a rota SHALL retornar/afetar apenas procedimentos da própria empresa.
3. IF duas empresas diferentes cadastrarem um procedimento com o mesmo nome THEN o sistema SHALL permitir ambos, sem colisão (unicidade composta herdada da M1).
4. The system SHALL tornar `schedule_settings` uma configuração por empresa, não mais uma linha global única.
5. WHEN uma sessão de uma empresa lê ou atualiza a configuração de horário THEN a rota SHALL retornar/afetar apenas a configuração da própria empresa.

**Independent Test**: Teste de rota (HTTP + PGlite) com duas clínicas comprova isolamento de agendamento, procedimento (incluindo nome duplicado entre empresas) e configuração de horário.

---

### M4: Escopo por empresa — prontuário clínico + storage de fotos por empresa ⭐ P1 (issue #25)

**User Story**: Como paciente que envia fotos de acompanhamento remoto, quero que meus dados clínicos e fotos fiquem isolados por empresa, para reduzir o risco de exposição cruzada de dado de saúde.

**Why P1**: Cobre o núcleo de dado clínico sensível (LGPD/saúde) da plataforma.

**Acceptance Criteria**:

1. WHEN uma sessão de uma empresa lista ou lê profissional, condição clínica, avaliação de condição ou nota de evolução THEN a rota SHALL retornar/afetar apenas dados da própria empresa.
2. WHEN uma sessão de uma empresa lista ou lê anamnese, plano de cuidado (e suas 3 tabelas filhas), avaliação de desfecho ou registro de intervenção THEN a rota SHALL retornar/afetar apenas dados da própria empresa (tabelas incluídas por decisão registrada em Assumptions).
3. The system SHALL armazenar foto de condição sob um caminho que inclui o identificador da empresa (namespace por clínica).
4. IF uma sessão de uma empresa tentar acessar (por id) uma foto de condição de outra empresa THEN a rota SHALL responder 404.

**Independent Test**: Teste de rota (HTTP + PGlite) com duas clínicas comprova isolamento das entidades de prontuário; teste de storage comprova que o caminho gerado para uma foto inclui o `clinic_id` da sessão que a criou e que uma sessão de outra empresa não consegue ler o arquivo pelo id.

---

### M5: Escopo por empresa — estoque ⭐ P1 (issue #26)

**User Story**: Como desenvolvedor mantendo o sistema, quero que suprimento, lote de suprimento e movimento de estoque sigam o mesmo padrão de isolamento.

**Why P1**: Fecha o domínio operacional restante antes de contas/conformidade.

**Acceptance Criteria**:

1. WHEN uma sessão de uma empresa lista, lê ou movimenta suprimento, lote de suprimento ou movimento de estoque THEN a rota SHALL retornar/afetar apenas dados da própria empresa.

**Independent Test**: Teste de rota (HTTP + PGlite) com duas clínicas comprova isolamento das três entidades de estoque.

---

### M6: Escopo por empresa — contas, conformidade e cobrança ⭐ P1 (issue #27)

**User Story**: Como usuário autenticado, quero que minha conta, e-mail de login, dados de parceiro/retorno/lembrete/consentimento/cobrança e os eventos de auditoria fiquem isolados por empresa.

**Why P1**: Fecha o épico — última milestone antes da reforma de papéis (ADR-003) poder começar.

**Acceptance Criteria**:

1. The system SHALL tornar o e-mail de login (`user_accounts.email`) único por `(clinic_id, email)`, não globalmente.
2. WHEN uma conta Google (`google_accounts`) é usada para login THEN o sistema SHALL continuar resolvendo corretamente a conta de usuário associada (e, por extensão, a empresa dela) sem coluna própria de tenant em `google_accounts`.
3. IF a resolução por e-mail encontrar mais de uma conta de usuário correspondente (ambiguidade entre empresas) THEN o sistema SHALL responder 409 e registrar o conflito, em vez de escolher arbitrariamente (ver Assumptions).
4. WHEN uma sessão de uma empresa lista ou lê parceiro, retorno, lembrete ou consentimento THEN a rota SHALL retornar/afetar apenas dados da própria empresa.
5. WHEN uma sessão de uma empresa lista ou lê fatura, pacote de sessões ou consumo de pacote THEN a rota SHALL retornar/afetar apenas dados da própria empresa (tabelas incluídas por decisão registrada em Assumptions).
6. The system SHALL registrar em todo evento de auditoria a empresa a que pertence, exceto os gerados por acesso cross-empresa do papel de sistema, que registram a empresa acessada (já coberto pela M2).

**Independent Test**: Teste de rota (HTTP + PGlite) com duas clínicas comprova isolamento de conta, parceiro, retorno, lembrete, consentimento, fatura/pacote; teste dedicado comprova a unicidade composta do e-mail de login (mesmo e-mail em duas empresas não colide) e o 409 do cenário de ambiguidade do Google.

---

## Edge Cases

- IF uma migração falhar no meio (M1) THEN a transação SHALL reverter por completo — nenhuma linha fica parcialmente migrada (garantido por rodar a migração inteira em uma transação, padrão já usado pelas migrações Drizzle existentes).
- IF uma sessão sem `clinic_id` e sem papel de sistema chegar a uma rota (estado inconsistente) THEN a rota SHALL responder 401/403 em vez de vazar dado sem filtro.
- WHEN duas clínicas cadastram um paciente com o mesmo e-mail THEN o sistema SHALL aceitar ambos sem conflito (unicidade composta).
- IF uma rota nova (fora das listadas) esquecer de aplicar o filtro de tenant THEN a suíte de testes de "vazamento entre empresas" (ver Success Criteria) SHALL falhar antes de chegar em produção — rede de segurança equivalente, mais fraca, ao que RLS daria depois.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MT-01 | M1: tabela `clinics` | Implementing | Implementing (gate não rodou — sem toolchain no ambiente) |
| MT-02 | M1: `clinic_id NOT NULL` em todas as tabelas | Pending | Pending |
| MT-03 | M1: backfill para clínica legada | Pending | Pending |
| MT-04 | M1: nenhuma linha órfã | Pending | Pending |
| MT-05 | M1: comportamento de API inalterado | Pending | Pending |
| MT-06 | M1: unicidade composta (email paciente/conta, nome procedimento) | Pending | Pending |
| MT-07 | M2: claim `clinic_id` na sessão | Pending | Pending |
| MT-08 | M2: container filtra repositórios por tenant | Pending | Pending |
| MT-09 | M2: papel de sistema sem filtro | Pending | Pending |
| MT-10 | M2: isolamento de Paciente (leitura/escrita) | Pending | Pending |
| MT-11 | M2: 404 cross-empresa em Paciente | Pending | Pending |
| MT-12 | M2: acesso cross-empresa do sistema + auditoria | Pending | Pending |
| MT-13 | M2: campo de empresa acessada em `AuditEvent` | Pending | Pending |
| MT-14 | M3: isolamento de Agendamento | Pending | Pending |
| MT-15 | M3: isolamento de Procedimento | Pending | Pending |
| MT-16 | M3: nome de procedimento duplicado entre empresas | Pending | Pending |
| MT-17 | M3: `schedule_settings` por empresa | Pending | Pending |
| MT-18 | M3: isolamento de configuração de horário | Pending | Pending |
| MT-19 | M4: isolamento de Profissional/Condição/Avaliação/Nota | Pending | Pending |
| MT-20 | M4: isolamento de Anamnese/Plano de Cuidado/Desfecho/Intervenção | Pending | Pending |
| MT-21 | M4: storage de foto namespaced por empresa | Pending | Pending |
| MT-22 | M4: 404 cross-empresa em foto | Pending | Pending |
| MT-23 | M5: isolamento de Suprimento/Lote/Movimento de estoque | Pending | Pending |
| MT-24 | M6: e-mail de login único por empresa | Pending | Pending |
| MT-25 | M6: resolução de conta Google sem coluna própria de tenant | Pending | Pending |
| MT-26 | M6: 409 em ambiguidade de e-mail Google entre empresas | Pending | Pending |
| MT-27 | M6: isolamento de Parceiro/Retorno/Lembrete/Consentimento | Pending | Pending |
| MT-28 | M6: isolamento de Fatura/Pacote de sessões/Consumo | Pending | Pending |
| MT-29 | M6: evento de auditoria carrega empresa própria | Pending | Pending |

**ID format:** `MT-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 29 total, 0 mapped to tasks, 29 unmapped ⚠️ (mapeamento acontece na fase Tasks, por milestone)

---

## Success Criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm run test:coverage` (≥90%) e `npm run check:sv` passam ao final de cada milestone.
- [ ] Para cada milestone M1–M6, existe pelo menos um teste de rota (HTTP + PGlite) com duas clínicas distintas provando que uma sessão de uma empresa nunca lê/escreve dado de outra — nem quando o filtro é "esquecido" num teste de mutação (sensor de discriminação do Verifier).
- [ ] Cada sub-issue (#22–#27) fechada no GitHub somente após seu gate (testes) passar e o commit correspondente existir.
- [ ] `docs/adr/001-multi-tenancy.md` não precisa de nova nota de status além da já existente (2026-08-30) — esta entrega é exatamente o que ela descreve.
