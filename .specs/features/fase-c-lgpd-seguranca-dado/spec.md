# Fase C — LGPD / Segurança de Dado Specification

Cobre as 4 issues da Fase C da auditoria UX: [#69](https://github.com/KalleoPinheiro/estomasystech/issues/69), [#70](https://github.com/KalleoPinheiro/estomasystech/issues/70), [#71](https://github.com/KalleoPinheiro/estomasystech/issues/71), [#72](https://github.com/KalleoPinheiro/estomasystech/issues/72).

## Problem Statement

Quatro gaps de proteção de dado sensível de saúde, todos apontados pela auditoria de 2026-08: (1) o portal do paciente/parceiro expõe nota clínica interna sem filtro; (2) o consentimento LGPD não tem versão nem revogação; (3) eventos sensíveis (login, criação de paciente, config de clínica) não geram trilha de auditoria; (4) campo clínico sensível fica em claro no banco. Os quatro são risco de conformidade com a Lei 13.709/2018 (arts. 8º, 11, 46) e vazamento de dado de terceiro.

## Goals

- [ ] Portal (paciente e parceiro) nunca retorna campo de nota clínica interna, por allowlist explícita — não blocklist.
- [ ] Aceite de consentimento é versionado e paciente tem caminho self-service de revogação.
- [ ] Login (sucesso e falha), logout, criação de paciente, definição/reset de senha e alteração de config de clínica geram evento de auditoria.
- [ ] Notas de evolução (SOAP), notas de condição e notas de avaliação clínica ficam cifradas em repouso.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Reescrita do wording do termo de consentimento | Decisão confirmada com o usuário: só mecânica (versão + revogação); wording é decisão jurídica, não de engenharia |
| Cifra de `anamnesis` (comorbidades, alergias, medicações, histórico cirúrgico) | Issue #72 cita explicitamente "notas de evolução, avaliações"; ampliar para anamnese é escopo novo — registrado como candidato de fase futura, não decidido aqui (evita scope creep sobre issue que não pediu) |
| Cifra de `condition_photos.patient_note` | Campo de autoria do próprio paciente (não é nota interna da equipe) — sem motivo de confidencialidade adicional; distinto de `clinical_conditions.notes` e `condition_assessments.notes`, que são de autoria da equipe |
| KMS externo / pgcrypto | Decisão confirmada: reusar `src/lib/auth/crypto.ts` (AES-256-GCM, chave derivada de `AUTH_SECRET`), mesmo padrão do AD-018 |
| Rate-limit distribuído, CSP nonce, 2FA, RBAC fino, assinatura ICP-Brasil | Outros itens do backlog P1/P2 de `analise-seguranca-escalabilidade.md` §1.7, fora das 4 issues desta fase |
| Paginação/UI de listagem de eventos de auditoria além do que já existe em `/auditoria` | Página já existe (Fase 6); esta fase só adiciona cobertura de eventos, não UI nova |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Mecanismo de cifra em repouso (#72) | AES-256-GCM app-level via `src/lib/auth/crypto.ts` estendido | Zero dependência nova, reusa padrão já em produção (AD-018) | y (usuário) |
| Wording do consentimento (#70) | Mantém `CONSENT_TEXT` atual; só adiciona versionamento/revogação | Reescrita de texto legal não é decisão de engenharia | y (usuário) |
| Conjunto de eventos auditados (#71) | login (sucesso/falha), logout, criar paciente, set-password (convite/reset), alteração de clinic-info e schedule config | Escopo mínimo do issue + ciclo de vida de credencial | y (usuário) |
| Campos cifrados (#72) | `evolution_notes.{subjective,objective,assessment,plan}`, `clinical_conditions.notes`, `condition_assessments.notes` | São os 3 pontos de nota de evolução/avaliação de autoria da equipe hoje em claro; `anamnesis` fica fora (ver Out of Scope) | n — assumido por precisão da issue, sinalizado ao usuário no relatório final |
| Auditoria pré-sessão (login/set-password) precisa de ator sem `Session` | `recordAuditNow`/`recordAudit` ganham parâmetro opcional de ator explícito (`{ role, id }`) para sobrepor o ator quando não há sessão ainda | `AuditInput` hoje deriva ator só de `session`; login e set-password autenticam antes de existir sessão | n — decisão técnica de design, sem gray area de produto |
| Allowlist do portal (#69) | Novas funções `toPortalConditionDto`/`toPortalAssessmentDto` (sem campo `notes`) substituem `toConditionDto`/`toAssessmentDto` nas rotas `/api/portal/**`; DTOs de staff continuam com `notes` | Issue pede allowlist explícita — duplicar a interface e omitir o campo é o único jeito de o TS pegar em compile-time se o domínio ganhar campo novo, sem apagar `notes` da API staff | n — decisão técnica de design |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Portal não vaza nota clínica interna (#69) ⭐ MVP

**User Story**: Como paciente ou parceiro usando o portal, quero que minhas respostas de API nunca incluam a nota clínica interna da equipe, para que dado sensível de terceiro (outros pacientes nunca, mas também minha própria nota de uso restrito da equipe) não vaze pela superfície pública.

**Why P1**: Vazamento de dado sensível de saúde já em produção — maior severidade das 4 issues.

**Acceptance Criteria**:

1. WHEN `GET /api/portal/patient` monta a resposta THEN o sistema SHALL usar um DTO de condição/avaliação que não tem a propriedade `notes` no tipo (allowlist em tempo de compilação), não uma cópia de objeto com `delete`.
2. WHEN `GET /api/portal/partner` monta a resposta THEN o sistema SHALL usar o mesmo DTO allowlist do item 1 para as condições dos pacientes indicados.
3. WHEN o domínio `ClinicalCondition` ou `ConditionAssessment` ganhar um campo novo no futuro THEN o DTO do portal SHALL continuar sem o campo novo automaticamente (é allowlist: cada campo exposto é citado explicitamente na função de mapeamento) — comportamento garantido por teste que falha se o DTO herdar campo não listado.
4. WHEN o teste de regressão roda contra as duas rotas do portal THEN o sistema SHALL confirmar ausência de `"notes"` na resposta JSON serializada mesmo quando a condição/avaliação subjacente tem `notes` preenchido no banco.

**Independent Test**: Popular paciente com condição cujo `notes` = "nota interna teste"; chamar `GET /api/portal/patient` autenticado; resposta não contém a string em lugar nenhum do JSON.

---

### P1: Consentimento LGPD versionado com revogação (#70) ⭐ MVP

**User Story**: Como paciente, quero saber sob qual versão do termo consenti e poder revogar meu consentimento a qualquer momento pelo portal, para exercer meu direito do art. 8º/18 da LGPD.

**Why P1**: Não conformidade legal explícita hoje (aceite sem versão rastreável, sem revogação).

**Acceptance Criteria**:

1. WHEN um paciente aceita o termo THEN o sistema SHALL gravar, além do hash já existente, a `CONSENT_TEXT_VERSION` vigente no momento do aceite.
2. WHEN o portal do paciente carrega a tela de consentimento THEN o sistema SHALL exibir a versão do termo do aceite mais recente e a data do aceite — mesmo quando o status atual é revogado, `acceptedAt`/`textVersion` continuam refletindo o último ACEITE real, nunca a data da revogação.
3. WHEN o paciente aciona "revogar consentimento" no portal THEN o sistema SHALL gravar um evento de revogação imutável (não apaga o aceite original — append-only, mesmo padrão do `ConsentRecord`), expor a data da revogação em campo próprio (`revokedAt`, distinto de `acceptedAt`) e a consulta de "status atual de consentimento" SHALL passar a retornar revogado.
4. WHEN existe uma revogação mais recente que o último aceite para o paciente THEN qualquer fluxo que hoje verifica `covers(consentText)` (ex.: upload de foto pelo portal, se aplicável) SHALL tratar o paciente como sem consentimento válido.
5. WHEN o paciente revoga e depois aceita de novo THEN o sistema SHALL permitir novo aceite (revogação não é estado terminal).
6. WHEN a revogação é registrada THEN o sistema SHALL gerar evento de auditoria (`resourceType: "consent"`, `action: "update"`).

**Independent Test**: Aceitar consentimento → revogar pelo portal → chamar endpoint de status de consentimento → confirma `revoked: true` com data; aceitar de novo → confirma `revoked: false`.

---

### P1: Trilha de auditoria cobre login/logout/criar paciente/config/credencial (#71) ⭐ MVP

**User Story**: Como responsável por conformidade da clínica, quero que login, logout, criação de paciente, definição/reset de senha e alteração de configuração da empresa gerem evento de auditoria com ator, timestamp e empresa, para atender ao art. 11 da LGPD sobre tratamento de dado sensível de saúde.

**Why P1**: Buraco de cobertura explícito no issue, já com precedente de infraestrutura (`recordAudit`/`recordAuditNow`, tabela `audit_events`) — só falta aplicar aos pontos que faltam.

**Acceptance Criteria**:

1. WHEN `POST /api/auth/login` autentica com sucesso THEN o sistema SHALL registrar evento de auditoria com `action: "read"`, `resourceType: "session"`, ator = conta autenticada, empresa = `clinicId` da conta (ou `LEGACY_CLINIC_ID` se `null`, mesma regra do resto do sistema).
2. WHEN `POST /api/auth/login` falha por credencial inválida (conta existe mas senha errada, ou conta não existe/inativa) THEN o sistema SHALL registrar evento de auditoria com `detail` indicando falha, sem vazar no evento se a conta existe ou não além do que a própria resposta HTTP já revela.
3. WHEN `POST /api/auth/logout` é chamado com sessão válida THEN o sistema SHALL registrar evento de auditoria antes de invalidar o cookie.
4. WHEN `POST /api/patients` cria um paciente com sucesso THEN o sistema SHALL registrar evento de auditoria (`action: "create"`, `resourceType: "patient"`, `resourceId` = id do paciente criado, `patientId` = mesmo id).
5. WHEN `PUT /api/settings/clinic-info` altera dado cadastral da clínica THEN o sistema SHALL registrar evento de auditoria (`action: "update"`, `resourceType: "clinic-info"`).
6. WHEN `PUT /api/settings/schedule` altera configuração de agenda THEN o sistema SHALL registrar evento de auditoria (`action: "update"`, `resourceType: "clinic-schedule"`).
7. WHEN `POST /api/auth/set-password` consome um token de convite ou reset com sucesso THEN o sistema SHALL registrar evento de auditoria (`action: "update"`, `resourceType: "account-password"`, ator = conta que teve a senha definida, propósito do token no `detail`).
8. WHEN qualquer um dos eventos acima falha ao gravar no `AuditEventRepository` THEN o sistema SHALL seguir o padrão já existente (`recordAudit` best-effort loga e não derruba a resposta; `recordAuditNow` propaga erro) — login, logout e set-password usam a variante write-ahead (`recordAuditNow`) por serem eventos de acesso a credencial que não podem ficar sem trilha silenciosamente.

**Independent Test**: Fazer login válido, login inválido, logout, criar paciente, editar clinic-info, editar schedule, resetar senha — consultar `/auditoria` (ou repositório direto no teste) e confirmar 1 evento por ação com ator/empresa/timestamp corretos.

---

### P1: Campos clínicos sensíveis cifrados em repouso (#72) ⭐ MVP

**User Story**: Como responsável por conformidade, quero que nota de evolução (SOAP), nota de condição e nota de avaliação clínica fiquem cifradas no banco, para que um dump/vazamento do banco não exponha texto livre de saúde em claro.

**Why P1**: Dado sensível de saúde em claro é o gap mais citado na análise de segurança (`analise-seguranca-escalabilidade.md` §1.7, LGPD art. 11/46).

**Acceptance Criteria**:

1. WHEN `AddEvolutionNote` persiste uma evolução THEN os campos `subjective`, `objective`, `assessment`, `plan` SHALL ser gravados cifrados (AES-256-GCM, mesma função `encryptSecret` de `src/lib/auth/crypto.ts`, chave derivada de `AUTH_SECRET`).
2. WHEN `ListEvolutionNotes` (ou qualquer leitura) recupera evoluções THEN o sistema SHALL decifrar os 4 campos antes de retornar ao domínio — a aplicação e o portal continuam recebendo texto plano, só o banco guarda cifrado.
3. WHEN uma condição clínica (`clinical_conditions.notes`) ou avaliação (`condition_assessments.notes`) é salva com `notes` não nulo THEN o sistema SHALL cifrar esse campo antes de persistir e decifrar na leitura, mesmo mecanismo do item 1.
4. WHEN o campo cifrado está `null` (nunca preenchido) THEN o sistema SHALL persistir/ler `null` sem tentar cifrar/decifrar string vazia.
5. WHEN existem linhas já gravadas em claro nas 3 tabelas antes desta mudança THEN uma migração de dado SHALL cifrar essas linhas existentes sem perda, executável uma única vez (idempotente: rodar duas vezes não cifra de novo o que já está cifrado).
6. WHEN `AUTH_SECRET` está ausente (servidor não configurado) THEN a leitura/escrita desses campos SHALL falhar de forma explícita (erro propagado, resposta 500 — fail-closed, não o mesmo 503 do `getAuthConfig()` porque a checagem acontece dentro do use case, não na guarda de sessão), nunca gravar em claro como fallback silencioso.
7. WHEN o backup do banco (`pg_dump` ou equivalente) é gerado THEN os 6 campos (4 de evolução + 2 de nota clínica) SHALL sair cifrados no dump, pois a cifra acontece na aplicação antes do INSERT — nenhuma configuração adicional de backup é necessária (documentar essa garantia, não implementar backup novo).

**Independent Test**: Criar evolução com texto conhecido → consultar a tabela via SQL direto (bypass do repositório) → confirmar que a coluna não contém o texto plano → consultar via `ListEvolutionNotes` → confirmar texto plano de volta.

---

## Edge Cases

- WHEN o texto cifrado de um campo clínico está corrompido ou com formato inválido (payload manipulado) THEN a leitura SHALL lançar erro explícito (mesmo comportamento de `decryptSecret` hoje), não retornar lixo silenciosamente.
- WHEN um paciente sem nenhum aceite de consentimento acessa a tela de status no portal THEN o sistema SHALL retornar "sem consentimento registrado", distinto de "revogado".
- WHEN duas revogações são acionadas em sequência rápida (duplo clique) THEN o sistema SHALL tratar de forma idempotente — resultado final é "revogado", sem erro nem evento duplicado inválido.
- WHEN login falha por rate limit (429) THEN o sistema NÃO SHALL registrar evento de auditoria adicional (já é observável pelo rate limiter; evitar amplificar ruído de auditoria em tentativa de força bruta).
- WHEN a rota `/api/portal/partner` é chamada para parceiro sem paciente indicado ainda THEN o DTO allowlist SHALL retornar lista vazia normalmente (sem relação com a cifra/allowlist, comportamento já existente preservado).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PORTAL-01 | P1: Portal não vaza nota interna | Design | Pending |
| PORTAL-02 | P1: Portal não vaza nota interna | Design | Pending |
| PORTAL-03 | P1: Portal não vaza nota interna | Design | Pending |
| PORTAL-04 | P1: Portal não vaza nota interna | Design | Pending |
| CONSENT-01 | P1: Consentimento versionado | Design | Pending |
| CONSENT-02 | P1: Consentimento versionado | Design | Pending |
| CONSENT-03 | P1: Consentimento versionado | Design | Pending |
| CONSENT-04 | P1: Consentimento versionado | Design | Pending |
| CONSENT-05 | P1: Consentimento versionado | Design | Pending |
| CONSENT-06 | P1: Consentimento versionado | Design | Pending |
| AUDIT-01 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-02 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-03 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-04 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-05 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-06 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-07 | P1: Trilha de auditoria | Design | Pending |
| AUDIT-08 | P1: Trilha de auditoria | Design | Pending |
| CRYPTO-01 | P1: Campos cifrados | Design | Pending |
| CRYPTO-02 | P1: Campos cifrados | Design | Pending |
| CRYPTO-03 | P1: Campos cifrados | Design | Pending |
| CRYPTO-04 | P1: Campos cifrados | Design | Pending |
| CRYPTO-05 | P1: Campos cifrados | Design | Pending |
| CRYPTO-06 | P1: Campos cifrados | Design | Pending |
| CRYPTO-07 | P1: Campos cifrados | Design | Pending |

**Coverage:** 25 total, 0 mapped to tasks yet, 25 unmapped ⚠️ (mapeamento acontece na fase Tasks)

---

## Success Criteria

- [ ] `npm run test:coverage` ≥ 90% mantido, com testes novos cobrindo as 4 áreas.
- [ ] Nenhuma resposta de `/api/portal/**` contém a string de nota interna de teste, verificado por teste automatizado.
- [ ] `npm run typecheck` e `npm run lint` passam.
- [ ] Query SQL direta nas 3 tabelas cifradas não retorna texto plano para linha criada após a mudança.
- [ ] Issues #69, #70, #71, #72 fechadas com link do PR/commit que resolveu cada uma.
