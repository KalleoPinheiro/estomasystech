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

### AD-015
- **Decision**: O `Modal` do app mantém o próprio botão de fechar (`aria-label="Fechar"`) e passa `showCloseButton={false}` ao `DialogContent` da `3.x`.
- **Reason**: o botão que a `3.0.0` passou a renderizar por padrão tem nome acessível `"Close dialog"` **hardcoded** — verificado em `dist/react/client/index.js`; `DialogContentProps` expõe só `showCloseButton`, nenhuma prop de rótulo. Numa interface pt-BR isso é regressão de acessibilidade, e o contrato do app já é asserido por `tests/components/modal.test.tsx`.
- **Trade-off**: a lacuna `dialog-close-button` continua tecnicamente fechada pela lib, mas o app não a consome; a dívida migra para uma lacuna nova, `dialog-close-label`, que é pedido de i18n na lib.
- **Scope**: src/components/modal.tsx, docs/still-void-gaps.md
- **Date**: 2026-08-25
- **Status**: superseded by AD-016

### AD-023
- **Decision**: Filtro temporal fino por registro (Dr. A só vê o histórico do período em que atendeu, Dr. B só o que registra dali em diante) **não será implementado**. O comportamento atual — profissional com vínculo (`ProfessionalPatientLink`) vê o prontuário inteiro do paciente, vínculo nunca revogado — é aceito como definitivo.
- **Reason**: decisão de produto do usuário (issue #43), confirmando a leitura já registrada em `.specs/features/rbac-catalogo-papeis/design.md` ("Approach Exploration", abordagem 2): acesso nunca revogado "por construção" é o requisito central de RBAC-21/AC5, e é mais importante que a leitura estrita de P4-AC4 (spec `rbac-catalogo-papeis`) como filtro por período.
- **Trade-off**: após transferência de caso, tanto Dr. A quanto Dr. B continuam vendo registros clínicos fora do período em que cada um atendeu — aceito.
- **Scope**: nenhum código alterado; decisão de escopo apenas.
- **Date**: 2026-09-05
- **Status**: resolved — issue #43 (fechada sem PR, "não fazer")

### AD-029
- **Decision**: Canal de e-mail em `/configuracoes` (C3, #266) com os defaults da task para os pontos em aberto: limite do e-mail de teste `SharedRateLimiter('email-channel-test', 5, 60_000)` por clínica; dois admins salvando ao mesmo tempo, vence a última escrita (upsert, sem versão). Decididos durante a execução: `DELETE` apaga por `(clinic_id, channel)` sem decifrar a chave (`ClinicChannelRepository.remove`, `RETURNING id`); `last_error` troca o e-mail do destinatário e a chave por `<destinatário>`/`<chave>` antes de truncar a 300; salvar sem chave nova mantém o último teste; o teste sai por `services.email` (o mesmo gateway dos envios reais); em modo aberto (dev, sem conta) o teste responde `409`.
- **Reason**: com a chave de dados trocada sem a anterior, `find` lança `ChannelSecretUnreadableError` — remover por `find` deixaria o admin sem saída para recadastrar. O erro do Resend pode citar o destinatário; o design pede `last_error` sem PII.
- **Trade-off**: GET/PUT/teste ainda respondem `500` enquanto a chave não decifra; a saída é remover e cadastrar de novo. Limite do teste e concorrência entre admins (Unresolved 1 e 2 de `.tasks/c3-tela-canal-configuracoes.md`) confirmados por @KalleoPinheiro em 2026-10-10: mantêm-se os defaults.
- **Scope / Date / Status**: `src/application/clinic/manage-email-channel.ts`, `src/app/api/settings/email-channel/`, `.checks/c3-canal-email-configuracoes.md` · 2026-10-10 · active — Unresolved 1 e 2 confirmados por @KalleoPinheiro em 2026-10-10

### AD-030
- **Decision**: Duas perguntas abertas da C2 (#265), respondidas por @KalleoPinheiro em 2026-10-10. (1) "Nem o link nem o segredo aparecem no log" vale **para produção**: com `NODE_ENV=production` o `NullEmailGateway` não loga o link; fora de produção (dev, E2E) ele loga o link de propósito — comportamento mantido. (2) `POST /api/platform/clinics/[id]/admins` (convite de admin substituto) passa a responder `{ delivered, inviteUrl }` como as demais rotas do ACE-RN-33: o link volta só quando o e-mail não saiu, e `/plataforma/clinicas/[id]` o mostra com "Copiar link".
- **Reason**: (1) o link no log é o caminho de dev e da suíte E2E (`e2e/support/invite-log.ts`) para definir senha sem e-mail real; em produção é credencial (CWE-532). (2) Sem canal na clínica, o convite do substituto não tinha como chegar — o contorno era o reenvio.
- **Trade-off**: (2) o operador da plataforma passa a ver o link de convite do `company_admin` substituto quando o e-mail não sai — o mesmo que já via no 1º admin (ACE-RN-22) e no reenvio; o evento fica na auditoria da clínica.
- **Scope / Date / Status**: `src/application/ports/email-gateway.ts`, `src/app/api/platform/clinics/[id]/admins/route.ts`, `src/app/plataforma/clinicas/[id]/clinic-admins-section.tsx` · 2026-10-10 · active
