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

### AD-031
- **Decision**: Login endurecido (#208): limite por e-mail normalizado com o mesmo teto/janela do IP (5/60 s) e a mesma mensagem neutra do 429; scrypt `2^17` com re-hash no login; scrypt fictício quando não há candidata com hash atual. Padrão conservador já usado nos endpoints de auth.
- **Reason**: a issue define teto e janela ("mesma do IP") e pede mensagem neutra; nada além disso foi decidido.
- **Trade-off**: um terceiro pode travar o login de uma conta por até 1 min errando 6 vezes. **Perguntas abertas** para @KalleoPinheiro: (1) aceitar esse travamento ou trocar o desenho (ex.: contar só senha errada, CAPTCHA)? (2) política de senha do staff — tamanho mínimo, senhas vazadas, 2FA (item 4 da issue).
- **Respostas do dono (2026-10-11, #291)**: (1) a trava por conta (6 erros = 1 min) **fica como está**; (2) senha da equipe com mínimo de 10 caracteres e lista embutida de senhas comuns, sem chamada externa; 2FA (TOTP) obrigatório para `company_admin` e opcional para Atendente/Profissional, reaproveitando o fluxo do super_admin. Entregue em `.specs/features/senha-2fa-equipe/` e [ADR-012](../docs/adr/012-segundo-fator-e-senha-da-equipe.md) (ACE-RN-41, ACE-RN-42).
- **Scope / Date / Status**: `src/app/api/auth/login/route.ts`, `src/lib/auth/password.ts`, `src/domain/auth/{password-policy,mfa}.ts`, `.specs/features/{endurecer-login,senha-2fa-equipe}/` · 2026-10-10, respondida em 2026-10-11 · closed — issues #208, #291

### AD-027
- **Decision**: Padrão seguro até decisão de produto — a aba "Pacotes" do prontuário fica **oculta para o Profissional** (e `/api/packages` continua `administrative`); só aparece com o papel da sessão já conhecido e diferente de `profissional`. **Pergunta aberta**: o Profissional deve ver os pacotes dos pacientes vinculados (com preço? só saldo de sessões?)
- **Reason**: pacote carrega preço (dado financeiro); a #189 deixa a pergunta aberta e indica esconder como padrão seguro (regra 5 do `AGENTS.md`). Trade-off: o Profissional não vê saldo de sessões do pacote até a decisão.
- **Scope / Date / Status**: `src/app/(staff)/pacientes/[id]/page.tsx` · 2026-09-26 · resolved — issue #189. **Resposta (2026-10-11):** o Profissional vê o nome do pacote e o saldo de sessões, sem preço, nos pacientes vinculados. Implementação na #296: a aba "Pacotes" aparece para o Profissional e lê `GET /api/patients/:id/packages` (família `clinical`, vínculo R4, DTO sem valores monetários — FIN-RN-14). **Resolvida.**

### AD-026
- **Decision**: R4 nas rotas clínicas endereçadas pelo id do recurso (#186) via helper único `src/lib/auth/clinical-resource-scope.ts` (cadeia recurso→paciente + `assertPatientAccessibleToProfessional`). O `404` cita o recurso pedido, nunca o `patientId`. `GET /api/follow-ups`, `GET /api/waitlist` e `GET /api/photos/triage` filtram para o Profissional só pacientes vinculados — **padrão seguro** aplicado; a issue deixava em aberto se follow-ups/waitlist precisavam do filtro.
- **Reason**: o motivo do retorno e a fila de espera carregam nome e motivo clínico; mostrar para quem não tem vínculo contradiz RBAC-17/19.
- **Trade-off**: Profissional deixa de ver retornos/lista de espera de pacientes sem vínculo (inclusive para oferecer horário vago da própria agenda). Perguntas abertas ao produto: (1) o Profissional deve ver a lista de espera inteira para preencher horários vagos? (2) `POST /api/follow-ups` e `POST /api/waitlist` pelo Profissional para paciente sem vínculo devem ser negados? — hoje seguem permitidos (fora do escopo de #186).
- **Scope**: 13 rotas em `src/app/api/{conditions,photos,care-plans,care-plan-interventions,care-plan-outcomes,follow-ups,waitlist}`, `.checks/r4-resource-routes.md`.
- **Date**: 2026-09-26
- **Status**: resolved — respondidas por @KalleoPinheiro em 2026-10-11: (1) a lista de espera continua só com os pacientes vinculados; (2) os dois POSTs sem vínculo passam a ser negados (403). Implementação na #296: `POST /api/follow-ups` e `POST /api/waitlist` negam o Profissional sem vínculo com 403 (AGE-RN-17). **Resolvida.**

### AD-021
- **Decision**: `eslint.config.mjs` usa `**/` na frente de todo padrão de `globalIgnores` (`**/.next/**`, `**/.next-open-mode/**`, etc.) e ignora `.claude/worktrees/**` explicitamente.
- **Reason**: sem `**/`, o glob só bate na raiz do projeto. Checkouts de worktree aninhados em `.claude/worktrees/*/` (usados por sessões de agente em paralelo, ver `docs/agents/*`) escapavam do ignore, e o build Turbopack deles inundava `npx eslint .` com milhares de "erros" em bundles compilados do Next/React — isso, não um bug do ESLint ou de `npm run lint`, era a causa do ruído investigado nas issues #48/#49. `npm run lint`/`npx eslint .` sempre propagaram o exit code real; a suspeita registrada em AD anterior (ver handoff de `autenticacao-nativa`, linha ~171) de que um "wrapper `rtk`" mascarava o exit code não reproduziu nesta sessão — não teve como confirmar a causa raiz daquela observação, mas o sintoma descrito (`npm run lint` "sempre" exit 0 mesmo com erro) não bate com o comportamento atual, testado com erro proposital introduzido e revertido.
- **Trade-off / Scope / Date / Status**: nenhum — só corrige o glob para o comportamento que o comentário original já pretendia · eslint.config.mjs · 2026-09-02 · active

### AD-024
- **Decision**: Gestão de conta existente (`PATCH /api/accounts/[id]`, `POST /api/accounts/[id]/resend-invite`) usa a matriz `canProvision` do cadastro; negação → `403` (`ProvisioningDeniedError`, mesmo status do `POST`); `GET /api/accounts` lista só as contas que o papel pode gerir; desativar a própria conta ou o último `company_admin` ativo → `400`; senha/ativação/reenvio auditados write-ahead (`recordAuditNow` antes do `save`). Issue #184.
- **Reason**: P0 da revisão pré-produção (#183): atendente/profissional trocavam a senha do Admin e o desativavam, sem trilha.
- **Trade-off**: padrão seguro aplicado a três perguntas em aberto para o dono do produto — (1) `password` no PATCH foi mantido (agora sob hierarquia + auditoria); (2) Atendente/Profissional não trocam a própria senha nem se reativam pelo PATCH (a matriz não os deixa gerir o próprio papel; o caminho é "esqueci a senha"); (3) desativação concorrente de dois admins não tem trava transacional.
- **Scope**: src/domain/auth/account-management.ts, src/lib/auth/account-manager.ts, src/app/api/accounts/**
- **Date**: 2026-09-26
- **Status**: resolved — perguntas respondidas por @KalleoPinheiro em 2026-10-11 (o PATCH perde `password`, "Minha conta" troca a própria senha, trava com 409 no último admin) e 2026-10-12 (Admin remove o 2º fator de quem perdeu o celular). Implementado na #295; ver ADR-019 e ACE-RN-11, ACE-RN-52 a ACE-RN-54. **Resolvida.**

### AD-025
- **Decision**: `GET /api/patients/:id/export` (exportação LGPD, art. 18) é família `clinical` e aplica o vínculo R4: Atendente recebe 403, Profissional sem vínculo recebe 404. Toda sub-rota de `/api/patients/:id/*` passa a ser clínica por padrão; a exceção é uma allowlist explícita (`NON_CLINICAL_PATIENT_SUBROUTES` em `src/lib/auth/route-family.ts`, hoje vazia).
- **Reason**: o export devolve anamnese, SOAP, condições e fotos; qualquer subrota nova nascia `operational` e aberta ao Atendente porque a regra antiga listava só as clínicas e casava com `pathname.includes`.
- **Trade-off**: a recepção não gera a portabilidade sozinha. **Pergunta aberta** (issue #185): o Atendente deve poder gerar uma exportação **sem** dado clínico? Até o usuário decidir, padrão seguro: negar.
- **Scope / Date / Status**: lib/auth/route-family, api/patients/[id]/export, (staff)/pacientes/[id] · 2026-09-26 · active — issue #185. **Resposta (2026-10-12):** manter negado. O paciente baixa a própria cópia pelo portal (#293)

### AD-045
- **Decision** (substituída pelo AD-050): textos LGPD da #216 entregues como **versão prévia fora do código** (`docs/legal/textos-lgpd-previa.md` (hoje `textos-lgpd.md`), `status: draft`), a pedido de @KalleoPinheiro (2026-10-17, "faça você mesmo uma versão prévia, eu ajusto depois"). Decidido pelo coordenador/thread: **não ligar ao sistema** e **não disparar a invalidação** dos aceites do #310 (texto e hash vigentes `v1`/`v0-placeholder` não mudam); só a promoção do texto revisado troca constante e versão juntas. Imagem separada do TCLE, interpolação de clínica/encarregado e páginas de aviso ficam como tickets futuros, não requisito. Trade-off: paciente não vê a prévia até a promoção. #216 segue aberta (`needs-info`); #323 segue bloqueada. [ADR-026](../docs/adr/026-textos-lgpd-previa-nao-ligada.md) · 2026-10-17 · active

### AD-043
- **Decision**: remover o gateway da Meta (#328, delegado): `MetaWhatsAppGateway`, a porta `MessagingGateway`/`NullMessagingGateway`, `container.messaging` e as variáveis `WHATSAPP_*` saem do código e dos exemplos. Nenhum caso de uso consumia o canal; os lembretes seguem por e-mail e pelo link `wa.me`. O RM-14 continua em Later e a especificação fica em `docs/engineering/integrations/whatsapp-meta.md`; reintroduzir é aditivo. Alternativa descartada: manter o código dormente (custo de manutenção e superfície de configuração sem uso). Reversível. · `src/infrastructure/container.ts`, `docs/engineering/integrations/` · 2026-10-17 · active

### AD-040
- **Decision**: remarcação bloqueada para profissional inativo e revogação imediata no recadastro do 2º fator (#297), decididas por @KalleoPinheiro (2026-10-11). `RescheduleAppointment` recebe o repositório de profissionais (opcional, como em `ScheduleAppointment`) e reusa `assertActiveProfessional` com a mensagem "Profissional inativo: escolha outro profissional" (`400`); `POST /api/me/mfa/confirm` chama `forgetSessionStatus` como logout, set-password e PATCH de conta. Pergunta aberta sobre a remarcação **pelo portal** **decidida** pelo coordenador (autonomia de @KalleoPinheiro): também é bloqueada, com mensagem pedindo contato com a clínica (`400`; POR-RN-20), porque consulta sem profissional ativo seria atendimento fantasma; cancelar segue livre. Trade-off: o paciente depende da clínica para trocar de profissional; a equipe resolve o impasse trocando de profissional ou reativando o cadastro. AGE-RN-20, POR-RN-20, ACE-RN-53 · 2026-10-17 · active
