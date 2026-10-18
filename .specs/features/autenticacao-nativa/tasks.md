# Autenticação Nativa — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/autenticacao-nativa/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Gerada do codebase, das diretrizes do projeto e da spec. Diretrizes encontradas: `AGENTS.md` (comandos e piso de cobertura de 90 %), `vitest.config.ts` (thresholds 90/90/90/90), `.claude/rules` (TDD, AAA), `playwright.config.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain (`src/domain/auth/**`) | unit | Todas as branches; 1:1 com as ACs da spec; todo edge case listado tem teste | `tests/domain/*.test.ts` | `npx vitest run tests/domain` |
| Application (`src/application/**`) | unit | Todas as branches; 1:1 com as ACs; todo caminho de erro | `tests/application/*.test.ts` | `npx vitest run tests/application` |
| Ports/Gateways (`src/application/ports/**`, `src/infrastructure/email/**`) | unit | Caminho habilitado, caminho nulo e caminho de erro de config | `tests/infrastructure/*.test.ts` | `npx vitest run tests/infrastructure` |
| Repositório Drizzle (`src/infrastructure/persistence/drizzle/**`) | integration | Caminhos de query principais + erro, sobre PGlite | `tests/api/*.test.ts`, `tests/infrastructure/*.test.ts` | `npx vitest run tests/api tests/infrastructure` |
| Rota (`src/app/api/**`) | integration (HTTP + PGlite) | Toda rota em escopo: happy path + cada edge case listado + cada caminho de erro | `tests/api/*.test.ts` | `npx vitest run tests/api` |
| Página/Componente (`src/app/**/page.tsx`, `src/components/**`) | unit (Testing Library) | Renderização, submit e estado de erro | `tests/pages/*.test.tsx` | `npx vitest run tests/pages` |
| Política pura (`src/lib/auth/**`) | unit | Todas as branches | `tests/lib/*.test.ts` | `npx vitest run tests/lib` |
| Schema Drizzle / migração SQL | none | — (coberto pelo gate de build e pelos testes de rota que migram o PGlite) | — | build gate |

## Gate Check Commands

> Gerada do codebase — confirmada antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks com testes unitários apenas | `npx vitest run <arquivos de teste da task>` |
| Full | Tasks com testes de rota/integração | `npx vitest run tests/api tests/application tests/domain tests/lib tests/infrastructure` |
| Build | Fim de fase, tasks de config/schema, tasks de UI | `npm run typecheck && npm run lint && npm run check:sv && npx vitest run && npm run build` |

---

## Execution Plan

Fases ordenadas e sequenciais; tasks dentro de uma fase executam em ordem.

### Phase 1: Fundação de e-mail e token (A1 — #32)

```
T1 → T2
T3 → T4
```

### Phase 2: Fluxo de convite (A1 — #32)

```
T1 → T5
T4 → T5 → T6 → T7 → T8
```

### Phase 3: Reset self-service (A2 — #34)

```
T7 → T9 → T10 → T11
```

### Phase 4: Calendar desacoplado do login (A3 — #33)

```
T12 → T13 → T14 → T15
```

### Phase 5: Remoção do Google/senha mestre + bootstrap (A4 — #35)

```
T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 6: Fechamento

```
T20 → T21
```

---

## Task Breakdown

### T1: Porta de e-mail transacional com implementação nula

**What**: criar a porta `EmailGateway` com `NullEmailGateway` (dry-run que loga em vez de enviar).
**Where**: `src/application/ports/email-gateway.ts`
**Depends on**: None
**Reuses**: `src/application/ports/messaging-gateway.ts` (molde literal)
**Requirement**: AUTH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `EmailGateway` expõe `enabled` e `send(message)`
- [x] `NullEmailGateway.enabled === false` e `send` registra destinatário, assunto e corpo sem lançar
- [x] Gate check passes: `npx vitest run tests/infrastructure/email-gateway.test.ts`
- [x] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(auth): adiciona porta de e-mail transacional com gateway nulo`

**Status**: ✅ Done

---

### T2: Gateway Resend + fábrica fail-closed em produção

**What**: implementar `ResendEmailGateway`, `resendConfigFromEnv()` e `buildEmailGateway()` (lança em produção sem credenciais, cai no nulo fora de produção).
**Where**: `src/infrastructure/email/resend-email-gateway.ts`
**Depends on**: T1
**Reuses**: `src/infrastructure/messaging/meta-whatsapp-gateway.ts`
**Requirement**: AUTH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `send` faz `POST https://api.resend.com/emails` com `Authorization: Bearer`, timeout de 10 s, e lança em resposta não-ok
- [x] `buildEmailGateway()` em `NODE_ENV=production` sem config lança erro citando `RESEND_API_KEY` e `EMAIL_FROM`
- [x] `buildEmailGateway()` fora de produção sem config devolve `NullEmailGateway`
- [x] Gate check passes: `npx vitest run tests/infrastructure/resend-email-gateway.test.ts`
- [x] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(auth): implementa gateway de e-mail Resend com fail-closed em producao`

**Status**: ✅ Done

---

### T3: Primitivo de token de ativação no domínio

**What**: criar a entidade `AuthToken` (emissão, hash SHA-256 do segredo, expiração por propósito, uso único) e a interface do repositório.
**Where**: `src/domain/auth/auth-token.ts`
**Depends on**: None
**Reuses**: `src/domain/auth/user-account.ts` (entidade imutável), `src/lib/auth/crypto.ts` (uso de `node:crypto`)
**Requirement**: AUTH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `AuthToken.issue` devolve o segredo em claro e uma entidade que guarda só o hash
- [x] `isUsable` é falso para token expirado e para token já usado
- [x] TTL de convite é 24 h e de reset é 1 h
- [x] `markUsed` não muta a instância original
- [x] Gate check passes: `npx vitest run tests/domain/auth-token.test.ts`
- [x] Test count: 13 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(auth): adiciona primitivo de token de ativacao com uso unico`

**Status**: ✅ Done

---

### T4: Tabela `auth_tokens` e repositório Drizzle

**What**: adicionar a tabela ao schema, a migração SQL e o repositório Drizzle correspondente.
**Where**: `src/infrastructure/persistence/drizzle/drizzle-auth-token-repository.ts`
**Depends on**: T3
**Reuses**: `src/infrastructure/persistence/drizzle/drizzle-foundation-repositories.ts`
**Requirement**: AUTH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Migração `drizzle/0023_auth-tokens.sql` cria a tabela com índice único em `secret_hash`
- [x] `findUsableBySecretHash` devolve `null` para token expirado, usado ou inexistente
- [x] `markAllUnusedAsUsed(accountId, purpose)` invalida só os do propósito informado
- [x] Gate check passes: `npx vitest run tests/infrastructure/drizzle-auth-token-repository.test.ts`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): persiste tokens de ativacao em auth_tokens`

**Status**: ✅ Done

---

### T5: Use-cases de emissão e consumo de token

**What**: criar `IssueAuthToken` (invalida anteriores, persiste, envia e-mail com o link) e `ConsumeAuthToken` (valida, troca a senha, marca usado).
**Where**: `src/application/auth/auth-token-flow.ts`
**Depends on**: T1, T4
**Reuses**: `src/lib/auth/password.ts`, `src/domain/auth/user-account.ts`
**Requirement**: AUTH-04, AUTH-05, AUTH-07, AUTH-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `IssueAuthToken` envia e-mail cujo corpo contém `{appUrl}/definir-senha?token={segredo}`
- [x] `IssueAuthToken` chama `markAllUnusedAsUsed` antes de persistir o novo token
- [x] `ConsumeAuthToken` lança `ValidationError("Link inválido ou expirado — solicite um novo")` para token inválido, expirado, usado e conta inativa
- [x] `ConsumeAuthToken` grava o hash da nova senha e marca o token como usado
- [x] Gate check passes: `npx vitest run tests/application/auth-token-flow.test.ts`
- [x] Test count: 14 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(auth): adiciona use-cases de emissao e consumo de token`

**Status**: ✅ Done

---

### T6: Cadastro de conta dispara convite

**What**: `POST /api/accounts` deixa de aceitar `password`, cria a conta com hash sentinela e emite o convite; falha de envio não desfaz o cadastro.
**Where**: `src/app/api/accounts/route.ts`
**Depends on**: T5
**Reuses**: `src/application/auth/create-account.ts`, `src/infrastructure/container.ts`
**Requirement**: AUTH-04, AUTH-08, AUTH-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cadastro sem `password` responde 200 e envia um e-mail com link de convite
- [x] Login para a conta recém-criada responde 401 enquanto o convite não é consumido
- [x] Falha do gateway de e-mail mantém a conta criada e responde 200
- [x] Gate check passes: `npx vitest run tests/api/account-invite.test.ts tests/api/accounts-provisioning.test.ts`
- [x] Test count: 8 novos tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): dispara convite por e-mail ao cadastrar conta`

**Status**: ✅ Done

---

### T7: Rota de definição de senha por token

**What**: criar `POST /api/auth/set-password` (consome token de convite ou reset e grava a senha) e liberá-la em `PUBLIC_PATHS`.
**Where**: `src/app/api/auth/set-password/route.ts`
**Depends on**: T6
**Reuses**: `src/lib/auth/rate-limit.ts`, `src/lib/api-response.ts`
**Requirement**: AUTH-05, AUTH-06, AUTH-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Token válido + senha de 8+ caracteres responde 200 e habilita o login com a nova senha
- [x] Token expirado, já usado e inexistente respondem 400 com `Link inválido ou expirado — solicite um novo`
- [x] Senha com menos de 8 caracteres responde 400 sem consumir o token
- [x] Gate check passes: `npx vitest run tests/api/set-password-route.test.ts`
- [x] Test count: 9 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona rota de definicao de senha por token`

**Status**: ✅ Done

---

### T8: Página de definição de senha

**What**: criar a tela `/definir-senha` (senha + confirmação) usando componentes do `@still-void/ui`.
**Where**: `src/app/definir-senha/page.tsx`
**Depends on**: T7
**Reuses**: `src/app/login/page.tsx` (estrutura de card e `ErrorAlert`)
**Requirement**: AUTH-05, AUTH-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Formulário usa `Input`/`Button` da lib (nenhum `<input>`/`<button>` cru — `npm run check:sv` verde)
- [x] Submissão bem-sucedida mostra confirmação e link para `/login`
- [x] Erro da API é exibido na tela
- [x] Gate check passes: `npm run check:sv && npx vitest run tests/pages/definir-senha.test.tsx`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: build

**Commit**: `feat(auth): adiciona tela de definicao de senha`

**Status**: ✅ Done

---

### T9: Rota de solicitação de reset

**What**: criar `POST /api/auth/forgot-password` com resposta indistinguível para e-mail inexistente e rate-limit.
**Where**: `src/app/api/auth/forgot-password/route.ts`
**Depends on**: T7
**Reuses**: `src/application/auth/auth-token-flow.ts`, `src/lib/auth/rate-limit.ts`
**Requirement**: AUTH-10, AUTH-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] E-mail existente recebe mensagem com link de reset de 1 h
- [x] E-mail inexistente devolve status e corpo idênticos, sem enviar e-mail
- [x] Sexta chamada no mesmo minuto responde 429
- [x] Gate check passes: `npx vitest run tests/api/forgot-password-route.test.ts`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona reset de senha self-service por e-mail`

**Status**: ✅ Done

---

### T10: Ciclo completo de reset sobre a rota de senha

**What**: cobrir o fluxo ponta a ponta de reset (senha antiga deixa de valer, token de reset expirado/usado rejeitado, reemissão invalida o anterior).
**Where**: `tests/api/reset-password-flow.test.ts`
**Depends on**: T9
**Reuses**: `tests/api/set-password-route.test.ts`
**Requirement**: AUTH-12, AUTH-13, AUTH-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Após reset, login com a senha antiga responde 401 e com a nova responde 200
- [x] Token de reset expirado e token já usado respondem 400 com a mensagem única
- [x] Emitir um segundo reset invalida o primeiro link
- [x] Gate check passes: `npx vitest run tests/api/reset-password-flow.test.ts`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `test(auth): cobre o ciclo completo de reset de senha`

**Status**: ✅ Done

---

### T11: Página "esqueci minha senha"

**What**: criar a tela `/esqueci-senha` com campo de e-mail e mensagem neutra de confirmação.
**Where**: `src/app/esqueci-senha/page.tsx`
**Depends on**: T10
**Reuses**: `src/app/definir-senha/page.tsx`
**Requirement**: AUTH-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Formulário usa `Input`/`Button` da lib (`npm run check:sv` verde)
- [x] Mensagem de confirmação não revela se a conta existe
- [x] Gate check passes: `npm run check:sv && npx vitest run tests/pages/esqueci-senha.test.tsx`
- [x] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: build

**Commit**: `feat(auth): adiciona tela de esqueci minha senha`

**Status**: ✅ Done

---

### T12: Configuração de OAuth dedicada ao Calendar

**What**: criar o módulo de config do OAuth de Calendar (sem allowlist, escopo só de `calendar.events`, redirect próprio).
**Where**: `src/lib/auth/google-calendar-oauth.ts`
**Depends on**: None
**Reuses**: `src/lib/auth/google-oauth.ts` (estrutura de `configFromEnv`)
**Requirement**: AUTH-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Config exige apenas `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `APP_URL` — nunca allowlist
- [x] Redirect aponta para `/api/integrations/google-calendar/callback`
- [x] Escopo é exatamente `["https://www.googleapis.com/auth/calendar.events"]`
- [x] Gate check passes: `npx vitest run tests/lib/google-calendar-oauth.test.ts`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(calendar): adiciona config de OAuth dedicada ao Google Agenda`

**Status**: ✅ Done

---

### T13: Rota de início da conexão do Calendar

**What**: criar `GET /api/integrations/google-calendar` exigindo sessão de equipe e emitindo o cookie de estado.
**Where**: `src/app/api/integrations/google-calendar/route.ts`
**Depends on**: T12
**Reuses**: `src/lib/auth/require-session.ts`, `src/lib/auth/google-oauth-client.ts`
**Requirement**: AUTH-15, AUTH-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sessão de equipe recebe redirect para `accounts.google.com` com `access_type=offline` e o escopo de Calendar
- [x] Chamada sem sessão responde 401
- [x] Chamada sem config responde 503
- [x] Gate check passes: `npx vitest run tests/api/calendar-integration-routes.test.ts`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(calendar): inicia conexao do Google Agenda por sessao nativa`

**Status**: ✅ Done

---

### T14: Callback da conexão do Calendar

**What**: criar `GET /api/integrations/google-calendar/callback` que troca o `code` por refresh token, persiste cifrado e não toca na sessão.
**Where**: `src/app/api/integrations/google-calendar/callback/route.ts`
**Depends on**: T13
**Reuses**: `src/lib/auth/crypto.ts`, `src/infrastructure/persistence/drizzle/drizzle-google-account-repository.ts`
**Requirement**: AUTH-17, AUTH-18, AUTH-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Callback com `state` correto persiste a credencial cifrada sob o `subject` da sessão
- [x] Resposta não contém `Set-Cookie` do cookie de sessão
- [x] `state` ausente ou divergente não persiste credencial
- [x] Chamada sem sessão responde 401
- [x] Gate check passes: `npx vitest run tests/api/calendar-integration-routes.test.ts`
- [x] Test count: 6 novos tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(calendar): conclui conexao do Google Agenda sem tocar na sessao`

**Status**: ✅ Done

---

### T15: Container passa a montar o Calendar pela config dedicada

**What**: apontar `oauthCalendarGateway` do container para `googleCalendarOAuthConfigFromEnv` e expor a entrada de UI em configurações.
**Where**: `src/infrastructure/container.ts`
**Depends on**: T14
**Reuses**: `src/infrastructure/calendar/google-calendar-gateway.ts`
**Requirement**: AUTH-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O gateway de agenda é construído a partir da credencial gravada pelo fluxo novo, sem depender de `GOOGLE_ALLOWED_EMAILS`
- [x] `/configuracoes` oferece o link para conectar a agenda (`npm run check:sv` verde)
- [x] Gate check passes: `npm run typecheck && npm run check:sv && npx vitest run tests/api tests/pages`
- [x] Test count: 2 novos tests pass (no silent deletions)

**Tests**: integration
**Gate**: build

**Commit**: `refactor(calendar): monta gateway de agenda pela config dedicada`

**Status**: ✅ Done

---

### T16: Rota de bootstrap do primeiro Super Admin

**What**: criar `POST /api/auth/bootstrap`, guardada por `x-bootstrap-token` e pela ausência de qualquer conta.
**Where**: `src/app/api/auth/bootstrap/route.ts`
**Depends on**: T15
**Reuses**: `src/application/auth/create-account.ts`, `src/application/auth/auth-token-flow.ts`
**Requirement**: AUTH-27, AUTH-28, AUTH-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Base vazia + header correto cria conta `super_admin` e envia convite
- [x] Segunda chamada (já existe conta) responde 403 sem criar nada
- [x] Header ausente/incorreto e `ESTOMASYSTECH_BOOTSTRAP_TOKEN` não configurado respondem 403
- [x] Gate check passes: `npx vitest run tests/api/bootstrap-route.test.ts`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona bootstrap do primeiro super admin`

**Status**: ✅ Done

---

### T17: Remoção do login via Google e da allowlist

**What**: apagar as rotas `api/auth/google/**`, `resolve-user-role.ts` e `google-oauth.ts`, junto dos testes que exercitavam esse caminho.
**Where**: `src/app/api/auth/google/`
**Depends on**: T16
**Reuses**: —
**Requirement**: AUTH-21, AUTH-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nenhum arquivo sob `src/app/api/auth/google/` e nenhuma referência a `GOOGLE_ALLOWED_EMAILS` em `src/**`
- [x] `PUBLIC_PATHS` não lista mais rotas do Google
- [x] Gate check passes: `npm run typecheck && npx vitest run`
- [x] Test count: nenhuma queda além dos testes do caminho removido (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth)!: remove login via Google e allowlist de e-mails`

**Status**: ✅ Done

---

### T18: Teste de conformidade cobre a ausência das rotas do Google

**What**: estender o teste de conformidade de rotas com a checagem estrutural de que nenhum handler existe sob `api/auth/google`.
**Where**: `tests/api/route-guard-conformance.test.ts`
**Depends on**: T17
**Reuses**: a varredura de `src/app/api` já existente no arquivo
**Requirement**: AUTH-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O teste falha se um arquivo de rota reaparecer sob `api/auth/google`
- [x] O teste falha se `GOOGLE_ALLOWED_EMAILS` voltar a `src/**`
- [x] Gate check passes: `npx vitest run tests/api/route-guard-conformance.test.ts`
- [x] Test count: 3 novos tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `test(auth): confirma ausencia das rotas de login por Google`

**Status**: ✅ Done

---

### T19: Remoção da senha mestre e fail-closed só por AUTH_SECRET

**What**: apagar `AUTH_PASSWORD` de `session.ts`, da rota de login, de `access-policy.ts` e da rota de provedores; login passa a exigir `email`.
**Where**: `src/lib/auth/session.ts`
**Depends on**: T18
**Reuses**: `src/lib/auth/password.ts`
**Requirement**: AUTH-23, AUTH-24, AUTH-25, AUTH-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nenhuma leitura de `AUTH_PASSWORD` em `src/**`
- [x] Login sem `email` responde 401
- [x] Com `AUTH_SECRET` definido e nenhuma variável do Google, o modo de auth é `configured`
- [x] Sem `AUTH_SECRET` e sem modo aberto, toda rota responde 503
- [x] Gate check passes: `npx vitest run tests/api tests/lib tests/proxy.test.ts`
- [x] Test count: 6 novos tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth)!: remove a senha mestre AUTH_PASSWORD`

**Status**: ✅ Done

---

### T20: Tela de login sem Google e suíte E2E migrada

**What**: reduzir `/login` ao formulário de e-mail/senha com link de recuperação e migrar o setup do Playwright para bootstrap + convite.
**Where**: `src/app/login/page.tsx`
**Depends on**: T19
**Reuses**: `e2e/global-setup.ts`, `e2e/support/constants.ts`
**Requirement**: AUTH-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `/login` não renderiza mais nada de Google e mostra o link para `/esqueci-senha`
- [x] `global-setup.ts` obtém a sessão admin por bootstrap + convite consumido, sem senha mestre
- [x] `npm run check:sv` verde
- [x] Gate check passes: `npm run typecheck && npm run lint && npm run check:sv && npx vitest run && npm run build`
- [x] Test count: suíte completa verde (no silent deletions)

**Tests**: unit
**Gate**: build

**Commit**: `feat(auth): simplifica tela de login e migra setup do E2E`

**Status**: ✅ Done

---

### T21: Documentação, variáveis de ambiente e decisões

**What**: atualizar `.env.example`, `AGENTS.md`, `README.md`, `CONTEXT.md` e registrar `AD-018`/`AD-019`/`AD-020` em `.specs/STATE.md`.
**Where**: `.env.example`
**Depends on**: T20
**Reuses**: `.specs/STATE.md`
**Requirement**: AUTH-02, AUTH-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `.env.example` documenta `RESEND_API_KEY`, `EMAIL_FROM`, `ESTOMASYSTECH_BOOTSTRAP_TOKEN` e não cita mais `AUTH_PASSWORD`/`GOOGLE_ALLOWED_EMAILS`
- [x] `AGENTS.md` e `README.md` descrevem o novo fail-closed e o fluxo de convite
- [x] `.specs/STATE.md` ganha as decisões novas sem tocar nas anteriores
- [x] Gate check passes: `npm run typecheck && npm run lint && npm run check:sv && npx vitest run --coverage && npm run build`
- [x] Test count: suíte completa verde com cobertura ≥ 90 % (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `docs(auth): documenta autenticacao nativa e registra decisoes`

**Status**: ✅ Done

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 ------→ T2
          T3 ------→ T4
Phase 2:  T1 ------→ T5
          T4 ------→ T5 ------→ T6 ------→ T7 ------→ T8
Phase 3:  T7 ------→ T9 ------→ T10 -----→ T11
Phase 4:  T12 -----→ T13 -----→ T14 -----→ T15
Phase 5:  T15 -----→ T16 -----→ T17 -----→ T18 -----→ T19 -----→ T20
Phase 6:  T20 -----→ T21
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 arquivo (porta + nulo) | ✅ Granular |
| T2 | 1 arquivo (gateway + fábrica) | ✅ Granular |
| T3 | 1 arquivo (entidade + interface de repo) | ✅ Granular |
| T4 | 1 repositório (+ schema/migração cofuncionais) | ✅ Granular |
| T5 | 1 arquivo (2 use-cases do mesmo ciclo) | ✅ Granular |
| T6 | 1 rota | ✅ Granular |
| T7 | 1 rota | ✅ Granular |
| T8 | 1 página | ✅ Granular |
| T9 | 1 rota | ✅ Granular |
| T10 | 1 arquivo de teste | ✅ Granular |
| T11 | 1 página | ✅ Granular |
| T12 | 1 módulo de config | ✅ Granular |
| T13 | 1 rota | ✅ Granular |
| T14 | 1 rota | ✅ Granular |
| T15 | 1 wiring de container | ✅ Granular |
| T16 | 1 rota | ✅ Granular |
| T17 | 1 remoção coesa (o caminho de login Google) | ✅ Granular |
| T18 | 1 arquivo de teste | ✅ Granular |
| T19 | 1 remoção coesa (a senha mestre) | ✅ Granular |
| T20 | 1 página + o setup que dependia dela | ✅ Granular |
| T21 | documentação | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | — (início da segunda cadeia da fase 1) | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T1, T4 | T1 → T5, T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T7 | T7 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None | — (início da cadeia da fase 4) | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Ports | unit | unit | ✅ OK |
| T2 | Gateway de infraestrutura | unit | unit | ✅ OK |
| T3 | Domain | unit | unit | ✅ OK |
| T4 | Repositório Drizzle | integration | integration | ✅ OK |
| T5 | Application | unit | unit | ✅ OK |
| T6 | Rota | integration | integration | ✅ OK |
| T7 | Rota | integration | integration | ✅ OK |
| T8 | Página | unit | unit | ✅ OK |
| T9 | Rota | integration | integration | ✅ OK |
| T10 | Rota (cobertura de fluxo) | integration | integration | ✅ OK |
| T11 | Página | unit | unit | ✅ OK |
| T12 | Política pura | unit | unit | ✅ OK |
| T13 | Rota | integration | integration | ✅ OK |
| T14 | Rota | integration | integration | ✅ OK |
| T15 | Container + página | integration | integration | ✅ OK |
| T16 | Rota | integration | integration | ✅ OK |
| T17 | Rota (remoção) + política | integration | integration | ✅ OK |
| T18 | Teste de conformidade | integration | integration | ✅ OK |
| T19 | Política + rota | integration | integration | ✅ OK |
| T20 | Página + setup E2E | unit | unit | ✅ OK |
| T21 | Documentação/config | none | none | ✅ OK (matriz diz "none" para doc/config) |
