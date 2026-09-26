# Decisões arquivadas — 2026

Movidas de `.specs/STATE.md` § Decisions sem edição de conteúdo, para manter o STATE dentro do limite de 250 linhas (`tests/docs/structure.test.ts`). Snapshot congelado: não atualize aqui.

### AD-022
- **Decision**: E2E (Playwright, 85 execuções de teste) passou a rodar no CI num job dedicado (`e2e` em `.github/workflows/ci.yml`), em paralelo ao job `ci` existente, bloqueando merge. **Resolvido pela issue #115.**
- **Reason**: gap de rigor registrado em 2026-09-04 (ver histórico abaixo) — e2e nunca tinha rodado em CI, então regressões só apareciam se alguém rodasse a suíte manualmente antes do merge. Ao medir o tempo local (ambiente idêntico ao CI: sem `.env`, `AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN` só via `webServer.env` do Playwright) pra decidir se valia a pena, a suíte revelou **24 falhas reais e pré-existentes**, não relacionadas à mudança de CI em si — nenhuma tinha sido pega porque e2e nunca rodou em CI. Causas raiz identificadas e corrigidas nos próprios specs (não na aplicação, exceto onde a asserção testava um comportamento que não fazia mais sentido):
  - Migração `@still-void/ui` Tabs (commit `ee25ac7`, PR #95) trocou abas de `role="button"` pra `role="tab"` real sem atualizar `clinico.spec.ts`/`pacientes.spec.ts`/`plano-cuidados.spec.ts`.
  - Célula de dia do calendário (`role="button"` envolvendo `<Button>` de compromisso, nesting deliberado com `biome-ignore`) tornava `getByRole("button", {name})` ambíguo sem `exact: true` em `agenda.spec.ts`.
  - Dupla linha de auditoria pro mesmo paciente tornava `getByRole("cell")` ambíguo sem `.first()`.
  - Feature MAT-08 (confirmação de movimentação de estoque via `ConfirmAction`) e o texto atual de bloqueio client-side de saldo insuficiente (`ExceedsBalanceWarning`) nunca foram refletidos em `inventario.spec.ts` — testava um fluxo sem o passo de confirmação e um erro de servidor ("Estoque insuficiente") que não existe mais.
  - "Modo aberto" (`VITTA_ALLOW_OPEN_MODE=true`, `AUTH_SECRET=""`) bypassa sessão, mas repositórios clínicos cifrados exigem `AUTH_SECRET` incondicionalmente (fail-closed correto pra PHI) — o teste assumia que o Dashboard completo carregaria; corrigido pra verificar só o bypass de sessão (sidebar renderiza, sem redirect a `/login`), não o carregamento de dados cifrados.
  - Toast + região `aria-live` duplicam o mesmo texto pra leitores de tela (`portal-paciente.spec.ts`) — `getByText` sem `.first()` ficava ambíguo.
  - `responsive-tables.spec.ts` tinha sua própria cópia (desatualizada) de `setReportMonth` usando `input[type="month"]`, que não existe mais desde o achado REL-02 (mês virou texto + navegação ‹›, já corrigido em `relatorios.spec.ts` mas nunca replicado aqui).
- **Trade-off**: nenhum novo — o trade-off documentado (regressões só pegas localmente) está resolvido. Custo de runner do job `e2e`: **3m29s medido no GitHub Actions** (PR #122, run `33941141189`) — bate com o baseline local de ~3m46s (85 testes, `workers: 1`, serial por design — PGlite em memória compartilhado pelo processo).
- **Scope**: `.github/workflows/ci.yml` (job `e2e` novo) + 8 specs em `e2e/*.spec.ts` (fixes de asserção, sem mudança de comportamento da aplicação).
- **Date**: 2026-09-04 (decisão original) / 2026-09-05 (resolvida)
- **Status**: resolved — issue #115, PR #122

### AD-023
- **Decision**: Filtro temporal fino por registro (Dr. A só vê o histórico do período em que atendeu, Dr. B só o que registra dali em diante) **não será implementado**. O comportamento atual — profissional com vínculo (`ProfessionalPatientLink`) vê o prontuário inteiro do paciente, vínculo nunca revogado — é aceito como definitivo.
- **Reason**: decisão de produto do usuário (issue #43), confirmando a leitura já registrada em `.specs/features/rbac-catalogo-papeis/design.md` ("Approach Exploration", abordagem 2): acesso nunca revogado "por construção" é o requisito central de RBAC-21/AC5, e é mais importante que a leitura estrita de P4-AC4 (spec `rbac-catalogo-papeis`) como filtro por período.
- **Trade-off**: após transferência de caso, tanto Dr. A quanto Dr. B continuam vendo registros clínicos fora do período em que cada um atendeu — aceito.
- **Scope**: nenhum código alterado; decisão de escopo apenas.
- **Date**: 2026-09-05
- **Status**: resolved — issue #43 (fechada sem PR, "não fazer")
