# Autenticação Nativa Validation

## Validation: autenticacao-nativa — PASS ✅

**Date**: 2026-09-01
**Spec**: `.specs/features/autenticacao-nativa/spec.md`
**Diff range**: `9ec7e00..9b0371d` (23 commits, 80 files, +9954/-1204)
**Verifier**: independent sub-agent (author ≠ verifier) — re-verificação, iteração 2 de 3
**Iteração anterior**: FAIL em `9ec7e00..557204f` (blocker de `lint` + 6 lacunas menores)

**Result**: PASS

**Verdict**: ✅ **PASS** — o blocker do gate foi resolvido de fato (`npx eslint <callback>` sai 0; `npx eslint .` sai 1 apenas com o baseline pré-existente, verificado arquivo a arquivo contra a lista do diff). Os 7 itens do plano de correção foram confirmados um a um. Gate completo verde (typecheck 0, check:sv 0, 2434 testes / cobertura 96,91 % / 91,51 %, build 0). Sensor de discriminação sobre o **código novo do commit de correção**: 9 mutações injetadas, 9 mortas. Restam 2 estreitamentos aceitos (AUTH-20 e a reescrita do edge case de `purpose`), documentados abaixo — nenhum deles é bloqueante.

---

## Re-verificação (iteração 2)

**Commit sob escrutínio**: `9b0371d fix(auth): endereca os gaps do Verifier na autenticacao nativa`
**Diff novo**: `git diff 557204f 9b0371d` — 11 arquivos, +511/-72 (4 de código/teste em `src/`+`tests/`, 1 de spec, o resto `.specs/`).

| # | Fix do plano anterior | Prioridade | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| 1 | `complexity` no callback do Calendar | Blocker | `npx eslint src/app/api/integrations/google-calendar/callback/route.ts` → **exit 0**, "No issues found". `GET` caiu para 4 ramos: `credentialOwner()` e `persistCalendarCredential()` foram extraídas (`route.ts:55` e `:62`) | ✅ **Confirmado** |
| 1b | Alegação "o exit 1 restante é 100 % baseline" | Blocker | `npx eslint .` → **exit 1**, 2 erros + 6 warnings em 8 arquivos. Cruzados um a um com `git diff --name-only 9ec7e00 9b0371d`: `src/app/api/patients/[id]/evolutions/route.ts` (complexity 14), `src/infrastructure/persistence/drizzle/drizzle-patient-repository.ts` (complexity 11), `tests/components/sidebar-auto-close.test.tsx`, `tests/pages/staff-{faturamento,materiais,paciente-care-plans,paciente-detail,procedimentos}.test.tsx` (`no-unused-vars`) — **nenhum dos 8 aparece na lista de 80 arquivos do diff**, e `eslint.config.*` também não foi tocado | ✅ **Confirmado** |
| 2 | `ConsumeAuthToken` não invalidava os irmãos | Major | `src/application/auth/auth-token-flow.ts:112` `await this.tokens.markAllUnusedAsUsed(account.id, token.purpose, new Date(nowMs));` antes do `save(token.markUsed(...))`. Teste: `tests/application/auth-token-flow.test.ts:253-271` persiste os **dois** tokens direto no repositório (`await tokens.save(first.token); await tokens.save(second.token)`) — não passa pela emissão, então o caso não fica mascarado. Isolamento por propósito: `:272-288` (convite + reset pendentes → consumir o convite deixa o reset usável) | ✅ **Confirmado** |
| 3 | Edge case de `purpose` inverificável | Minor | Spec reescrita (opção (a) do plano). Ver "Edição da spec" abaixo | ⚠️ **Confirmado com ressalva** |
| 4 | AUTH-19 sem asserção de não-persistência | Minor | `tests/api/calendar-integration-routes.test.ts` ganhou `storedCredential()` (`:44`) e `clearCredential()` (`:51`). Os **três** caminhos de recusa chamam `clearCredential()` + `stubTokenExchange` antes e asseveram `expect(await storedCredential()).toBeNull()`: state divergente (`:177,:191`), state ausente (`:195-197,:205`), sem refresh token (`:209,:224`). **Não vacuosas** — provado pelas mutações S2b e S6 do sensor | ✅ **Confirmado** |
| 5a | AUTH-06 sem papel/subject no cookie | Minor | `tests/api/set-password-route.test.ts:79-87` decodifica o cookie com `verifySessionToken` e assere `expect(session?.role).toBe("atendente")` **e** `expect(session?.subject).toBe("login-apos-convite@x.com")` — dentro do fluxo de convite. Provado não-vacuoso pela mutação S7 | ✅ **Confirmado** |
| 5b | Warning novo `resetGoogleEnv` | Minor | Variável removida de `tests/api/auth-portal-gaps.test.ts` (−7 linhas); o arquivo não aparece mais no relatório do ESLint | ✅ **Confirmado** |
| 6 | `secretMatches` duplicava `passwordMatches` | Minor | `src/app/api/auth/bootstrap/route.ts` importa `passwordMatches` de `@/lib/auth/session`; `secretMatches` e o import de `node:crypto` sumiram (−11/+4). Comportamento preservado — mutação S4 mata | ✅ **Confirmado** |
| 7 | Assumptions diziam 201, AUTH-09 diz 200 | Cosmetic | `spec.md:42` agora diz "responde 200 com o DTO da conta". Código (`src/app/api/accounts/route.ts`) e teste (`tests/api/account-invite.test.ts:96`) sempre usaram 200 — a linha das Assumptions era a única divergente | ✅ **Confirmado (correção legítima)** |

**Placar**: 7/7 fixes confirmados (nenhum refutado); 1 com ressalva de escopo (Fix 3).

### Edição da spec — os dois pontos alterados por `9b0371d`

1. **201 → 200 (linha 42, Assumptions)** — **legítimo**. Não move a trave: a AC AUTH-09 já dizia 200, o código sempre respondeu 200 e o teste sempre asseriu 200. A linha das Assumptions era o único ponto errado do documento. Correção de precisão.

2. **Edge case de `purpose` (linha 143)** — **é um deslocamento de trave, mas um deslocamento pré-autorizado e defensável**. O texto antigo (`IF um token é apresentado com purpose diferente do esperado pela rota THEN tratá-lo como inválido`) foi substituído por um `WHERE ... SHALL aceitar tanto convite quanto reset — o purpose decide a validade do link (24 h vs 1 h) e o alcance da invalidação em lote`. Dito com todas as letras: **a garantia original deixou de existir na spec**. O que sustenta a aceitação:
   - O plano de correção anterior ofereceu exatamente esta opção (Fix 3, alternativa (a)) como resolução válida, contra a alternativa (b) de passar o `purpose` esperado ao use-case.
   - O texto novo **não é vazio**: faz duas afirmações testáveis, e as duas têm teste — TTL por propósito (`tests/domain/auth-token.test.ts:42` 24 h e `:50` 1 h) e alcance da invalidação em lote por propósito (`tests/application/auth-token-flow.test.ts:272-288`, o teste de isolamento novo).
   - Não há regressão de segurança: os dois propósitos levam à mesma operação (definir a senha da conta **vinculada ao token**), o token é de uso único e ligado a uma `accountId`; não existe confusão de privilégio a explorar. O caso perigoso seria um propósito com poder diferente — não é o caso aqui.
   - **O que um revisor humano precisa saber**: se no futuro nascer um terceiro propósito de token com poder distinto (p.ex. troca de e-mail), esta AC precisa voltar à forma (b) — `ConsumeAuthToken` continua sem ler `token.purpose` para decidir aceitação, e nada no código impede a confusão. Registrado como dívida, não como bloqueio.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | `EmailGateway` + `NullEmailGateway`, 3 testes |
| T2 | ✅ Done | `ResendEmailGateway` + `buildEmailGateway` fail-closed, 9 testes |
| T3 | ✅ Done | `AuthToken` (issue/isUsable/markUsed), 13 testes |
| T4 | ✅ Done | Migração `0023_auth-tokens.sql` + repositório Drizzle, 6 testes |
| T5 | ✅ Done | `IssueAuthToken` / `ConsumeAuthToken`, 16 testes (2 novos em `9b0371d`) |
| T6 | ✅ Done | `POST /api/accounts` sem `password`, dispara convite |
| T7 | ✅ Done | `POST /api/auth/set-password`, 9 testes |
| T8 | ✅ Done | `/definir-senha`, 5 testes |
| T9 | ✅ Done | `POST /api/auth/forgot-password`, 6 testes |
| T10 | ✅ Done | Ciclo completo de reset, 5 testes |
| T11 | ✅ Done | `/esqueci-senha`, 4 testes |
| T12 | ✅ Done | `google-calendar-oauth.ts`, 7 testes |
| T13 | ✅ Done | Rota de início do Calendar, 4 testes |
| T14 | ✅ Done | **Antes ⚠️ Partial** — `complexity` resolvido em `9b0371d` por extração de `credentialOwner`/`persistCalendarCredential`; `npx eslint` no arquivo sai 0 |
| T15 | ✅ Done | Container monta o gateway pela config dedicada |
| T16 | ✅ Done | `POST /api/auth/bootstrap`, 10 testes; comparação em tempo constante reusada de `session.ts` |
| T17 | ✅ Done | `src/app/api/auth/google/**`, `resolve-user-role.ts`, `google-oauth.ts` removidos |
| T18 | ✅ Done | Conformidade estrutural de rotas + varredura de `src/**` |
| T19 | ✅ Done | `AUTH_PASSWORD` some de `src/**`; login exige `email` |
| T20 | ✅ Done | `/login` sem Google; E2E migrado para bootstrap + convite |
| T21 | ✅ Done | `.env.example`, `AGENTS.md`, `README.md`, `.specs/STATE.md` |

---

## Spec-Anchored Acceptance Criteria

### P1: Convite por e-mail define a senha inicial (AUTH-01..09)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AUTH-01 porta de e-mail com implementação nula que loga em vez de enviar | `enabled === false`; log contém destinatário, assunto e corpo | `tests/infrastructure/email-gateway.test.ts:14` `expect(new NullEmailGateway().enabled).toBe(false)`; `:34-36` `expect(logged).toContain("pessoa@clinica.com" / "Defina sua senha" / "https://app.local/definir-senha?token=abc")` | ✅ PASS |
| AUTH-02 produção sem credenciais falha nomeando as duas variáveis | Erro citando `RESEND_API_KEY` **e** `EMAIL_FROM`; fora de produção → gateway nulo | `tests/infrastructure/resend-email-gateway.test.ts:118-119` `expect(() => buildEmailGateway()).toThrow(/RESEND_API_KEY/)` + `toThrow(/EMAIL_FROM/)`; `:126` `expect(buildEmailGateway()).toBeInstanceOf(NullEmailGateway)` | ✅ PASS |
| AUTH-03 persistir só o hash SHA-256 + propósito, conta, expiração, uso | `secretHash === sha256(secret)`, campos preservados | `tests/domain/auth-token.test.ts:26` `expect(token.secretHash).toBe(createHash("sha256").update(secret).digest("hex"))`; `tests/infrastructure/drizzle-auth-token-repository.test.ts:65-69` `expect(found?.purpose).toBe("invite")`, `expect(found?.expiresAt.getTime()).toBe(token.expiresAt.getTime())`, `expect(found?.usedAt).toBeNull()` | ✅ PASS |
| AUTH-04 `POST /api/accounts` emite convite de 24 h com link `{APP_URL}/definir-senha?token=…` | e-mail para o endereço da conta contendo o link; TTL 24 h | `tests/api/account-invite.test.ts:47-48` `expect(emails.bodies[0]).toContain("convidada@x.com")` + `toContain("https://app.estomasystech.test/definir-senha?token=")`; `tests/application/auth-token-flow.test.ts:97` `expect(email.sent[0].text).toContain("24 horas")`; `tests/domain/auth-token.test.ts:42` `expect(token.expiresAt.getTime()).toBe(NOW + INVITE_TTL_MS)` | ✅ PASS |
| AUTH-05 token válido + senha ≥ 8 → grava hash, marca usado, 200 | status 200; hash da nova senha na conta; token consumido | `tests/api/set-password-route.test.ts:69` `expect(response.status).toBe(200)`; `tests/application/auth-token-flow.test.ts:191` `expect(await verifyPassword("senha-nova-1", updated!.passwordHash)).toBe(true)`; `tests/api/set-password-route.test.ts:107-108` reuso → `400` + `INVALID_TOKEN_MESSAGE` | ✅ PASS |
| AUTH-06 login passa a aceitar e-mail+senha, 200 + cookie com o papel da conta | 200, `Set-Cookie` de sessão, papel = o da conta | **Atualizado por `9b0371d`**: `tests/api/set-password-route.test.ts:78-87` `expect(cookie).toContain("estomasystech_session=")` + `verifySessionToken(...)` → `expect(session?.role).toBe("atendente")` **e** `expect(session?.subject).toBe("login-apos-convite@x.com")`, no próprio fluxo de convite. Corroborado em `tests/api/bootstrap-route.test.ts:153` e `tests/api/auth-routes.test.ts:181` | ✅ PASS (era ⚠️ parcial) |
| AUTH-07 token expirado/usado/inexistente → 400 com mensagem literal, sem alterar senha | `400` + `"Link inválido ou expirado — solicite um novo"` | `tests/api/set-password-route.test.ts:107-108` (usado), `:115-116` (inexistente), `:127-128` (expirado) `expect(json.error).toBe(INVALID_TOKEN_MESSAGE)`; senha intacta: `tests/application/auth-token-flow.test.ts:238` `expect(await verifyPassword("senha-nova-1", unchanged!.passwordHash)).toBe(false)` | ✅ PASS |
| AUTH-08 conta sem convite consumido → login 401 com qualquer senha | `401` | `tests/api/account-invite.test.ts:71` `expect(response.status).toBe(401)`; hash sentinela como senha: `:82` `expect(response.status).toBe(401)` | ✅ PASS |
| AUTH-09 falha no envio mantém conta criada, 200 com DTO, erro logado | `200`, DTO da conta, conta persistida, `console.error` chamado | `tests/api/account-invite.test.ts:96-102` `expect(response.status).toBe(200)`, `expect(json.data.email).toBe("envio-falhou@x.com")`, `expect(errors).toHaveBeenCalled()`, `expect(stored).not.toBeNull()`. **Assumptions da spec corrigidas de 201 para 200 em `9b0371d`** — sem divergência restante | ✅ PASS |

### P2: Reset self-service (AUTH-10..14)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AUTH-10 e-mail de conta ativa → token de reset de 1 h + link | 200, e-mail com link, validade 1 h | `tests/api/forgot-password-route.test.ts:53-57` `expect(response.status).toBe(200)`, `toContain("https://app.estomasystech.test/definir-senha?token=")`, `toContain("1 hora")`; `tests/domain/auth-token.test.ts:50` `expect(token.expiresAt.getTime()).toBe(NOW + RESET_TTL_MS)` | ✅ PASS |
| AUTH-11 e-mail inexistente → mesmo status e mesmo corpo, sem envio | status idêntico, corpo idêntico, 0 e-mails | `tests/api/forgot-password-route.test.ts:73-75` `expect(missing.status).toBe(existing.status)`, `expect(missingJson).toEqual(existingJson)`, `expect(emailsMissing.bodies).toHaveLength(0)` | ✅ PASS |
| AUTH-12 reset válido grava a senha nova; a antiga passa a 401 | nova → 200, antiga → 401 | `tests/api/reset-password-flow.test.ts:83-84` `expect((await login(..., "senha-nova-1")).status).toBe(200)` e `expect((await login(..., "senha-antiga-1")).status).toBe(401)` | ✅ PASS |
| AUTH-13 token de reset expirado/usado → 400 com a mensagem única | `400` + `INVALID_TOKEN_MESSAGE` | `tests/api/reset-password-flow.test.ts:95-96` (usado), `:108-109` (expirado > 1 h) `expect(json.error).toBe(INVALID_TOKEN_MESSAGE)`; fronteira: `:118` 59 min ainda vale → 200 | ✅ PASS |
| AUTH-14 novo token de reset invalida os anteriores não usados | primeiro link → 400; segundo continua válido | `tests/api/reset-password-flow.test.ts:129-131` `expect(stale.status).toBe(400)` + `expect((await setPasswordWith(second, ...)).status).toBe(200)`; `tests/application/auth-token-flow.test.ts:149-154` `expect(await tokens.findUsableBySecretHash(hash(first), ...)).toBeNull()` | ✅ PASS |

### P3: Calendar desacoplado do login (AUTH-15..20)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AUTH-15 sessão de equipe → redirect ao Google só com `calendar.events`, `access_type=offline`, cookie de estado | escopo exato, offline, cookie de state | `tests/api/calendar-integration-routes.test.ts:87-90` `expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events")` + `expect(...get("access_type")).toBe("offline")`; `:102-104` `expect(setCookie).toContain(\`${CALENDAR_OAUTH_STATE_COOKIE}=${state}\`)`; escopo declarado: `tests/lib/google-calendar-oauth.test.ts:26` | ✅ PASS |
| AUTH-16 sem sessão → 401, sem iniciar fluxo | `401` e nenhum `location` | `tests/api/calendar-integration-routes.test.ts:114-115` `expect(response.status).toBe(401)` + `expect(response.headers.get("location")).toBeNull()` | ✅ PASS |
| AUTH-17 `state` confere + refresh token → credencial cifrada em `google_accounts` sob o `subject` | linha existe sob o subject; token não em claro | `tests/api/calendar-integration-routes.test.ts:155-157` `const stored = await googleAccounts.findByEmail("agenda@clinica.com")`, `expect(stored).not.toBeNull()`, `expect(stored!.encryptedRefreshToken).not.toContain("refresh-token-real")`. O `subject` vem da sessão (`route.ts:55-60 credentialOwner`) — mutação S3 confirma | ✅ PASS |
| AUTH-18 callback não cria, renova ou troca sessão | resposta sem `Set-Cookie` do cookie de sessão | `tests/api/calendar-integration-routes.test.ts:172` `expect(response.headers.get("set-cookie") ?? "").not.toContain(\`${SESSION_COOKIE}=\`)` | ✅ PASS |
| AUTH-19 `state` ausente/divergente → recusa sem persistir credencial | recusa (400) **e** nenhuma credencial gravada | **Atualizado por `9b0371d`**: divergente `:189` `expect(response.status).toBe(400)` + `:191` `expect(await storedCredential()).toBeNull()`; ausente `:204` + `:205` idem; ambos precedidos de `clearCredential()` + `stubTokenExchange({ refresh_token: "nao-deve-salvar" })`, então o `toBeNull()` não passa por resíduo nem por falta de material a gravar (mutação S6 mata) | ✅ PASS (era ⚠️ parcial) |
| AUTH-20 credencial conectada monta o gateway de agenda, sincronização preservada | gateway construído da credencial, sem allowlist | `tests/api/calendar-gateway-source.test.ts:39` `expect(calendar.constructor.name).toBe("GoogleCalendarGateway")`; `:54` sem credencial → `"NullCalendarGateway"`; `tests/lib/google-calendar-oauth.test.ts:52` `expect(googleCalendarOAuthConfigFromEnv()).not.toBeNull()` sem `GOOGLE_ALLOWED_EMAILS` | ⚠️ PASS com estreitamento aceito — ver abaixo |

**AUTH-20 — estreitamento aceito, NÃO bloqueante.** A cláusula "preservando a sincronização bidirecional" continua reduzida a uma asserção de `constructor.name`. Reavaliado nesta iteração e mantido como aceito, com fundamento novo: `vitest.config.ts:51` exclui `src/infrastructure/calendar/**` da cobertura por decisão **pré-existente e documentada** ("Cliente Google Calendar real — chamada externa, sem valor em unit test"). Além disso, `git diff --name-only 9ec7e00 9b0371d` **não contém nenhum arquivo sob `src/infrastructure/calendar/`** — a feature não tocou o código de sincronização; ela só trocou a origem da credencial que o alimenta. A asserção disponível mais forte, sob a política de teste do próprio projeto, é exatamente a que existe: com credencial → gateway real do Google; sem credencial → gateway nulo. Verificar o comportamento bidirecional exigiria E2E contra o Google real, fora do escopo desta feature.

> **Nota de 2026-09-23 ([#45](https://github.com/KalleoPinheiro/estomasystech/issues/45)):** a cláusula "bidirecional" estava errada: a sincronização é só de saída (`CalendarGateway` expõe apenas `createEvent`/`updateEvent`/`deleteEvent`). O requisito AUTH-20 em `spec.md` foi corrigido. A #45, que pedia o E2E contra o Google, foi fechada como *not planned*, porque as chamadas ao gateway já são testadas com fakes em `tests/application/`.

### P4: Remoção + bootstrap (AUTH-21..30)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AUTH-21 nenhuma rota sob `/api/auth/google`; teste falha se reaparecer | lista de rotas sob esse caminho vazia | `tests/api/route-guard-conformance.test.ts:147-150` `expect(googleRoutes.map((f) => f.relative)).toEqual([])` | ✅ PASS |
| AUTH-22 nenhuma leitura de `GOOGLE_ALLOWED_EMAILS` em `src/**` | varredura textual devolve `[]` | `tests/api/route-guard-conformance.test.ts:154` `expect(sourceFilesMentioning("GOOGLE_ALLOWED_EMAILS")).toEqual([])`; `:158` `expect(PUBLIC_PATHS.filter((p) => p.includes("google"))).toEqual([])` | ✅ PASS |
| AUTH-23 nenhuma leitura de `AUTH_PASSWORD`; login exige `email` e `password` | varredura `[]`; schema exige os dois | `tests/api/route-guard-conformance.test.ts:163` `expect(sourceFilesMentioning("AUTH_PASSWORD")).toEqual([])`; `src/app/api/auth/login/route.ts:19-21` schema com `email` obrigatório, exercitado em `tests/api/auth-routes.test.ts:82` | ✅ PASS |
| AUTH-24 login sem `email` → 401 sem sessão | `401` e nenhum `Set-Cookie` | `tests/api/auth-routes.test.ts:82-84` `expect(response.status).toBe(401)`, `expect(body.error).toContain("Credenciais inválidas")`, `expect(response.headers.get("set-cookie")).toBeNull()`; senha-mestre-legada: `:98` `expect(response.status).toBe(401)` | ✅ PASS |
| AUTH-25 `AUTH_SECRET` definido → auth configurada, independente do Google | `resolveAuthMode() === "configured"` | `tests/lib/access-policy.test.ts:98` `expect(resolveAuthMode()).toBe("configured")`; `:107` mesmo sem nenhuma variável do Google; `tests/api/auth-routes.test.ts:257` `expect(Object.keys(body.data)).toEqual(["password"])` | ✅ PASS |
| AUTH-26 sem `AUTH_SECRET` e sem modo aberto → 503 em toda rota | `503` em API e página | `tests/proxy.test.ts:134` `expect(response.status).toBe(503)`; `:144-145` `expect((await proxy(request("/api/patients"))).status).toBe(503)` e `expect((await proxy(request("/agenda"))).status).toBe(503)`; `tests/lib/access-policy.test.ts:113,126` `toBe("unconfigured")` | ✅ PASS |
| AUTH-27 header correto + base vazia → cria `super_admin` e emite convite | conta com `role: "super_admin"`, e-mail com link | `tests/api/bootstrap-route.test.ts:74-76` `expect(response.status).toBe(200)`, `expect(json.data.role).toBe("super_admin")`; `:115-117` `expect(emails.bodies[0]).toContain("convite-sa@clinica.com")` + `toContain("https://app.estomasystech.test/definir-senha?token=")` | ✅ PASS |
| AUTH-28 já existe conta → 403 e não cria nada | `403` + conta não criada | `tests/api/bootstrap-route.test.ts:167-171` `expect(response.status).toBe(403)`, `expect(json.error).toBe(BOOTSTRAP_UNAVAILABLE_MESSAGE)`, `expect(await userAccounts.findByEmail("segundo@clinica.com")).toBeNull()` | ✅ PASS |
| AUTH-29 header ausente/incorreto ou `ESTOMASYSTECH_BOOTSTRAP_TOKEN` não configurado → 403, sem criar | `403` + `hasAnyAccount() === false` | `tests/api/bootstrap-route.test.ts:180-184` (ausente), `:194-197` (incorreto), `:208-211` (não configurado) `expect(response.status).toBe(403)` + `expect(await userAccounts.hasAnyAccount()).toBe(false)`. Guarda agora delega a `passwordMatches` (`src/app/api/auth/bootstrap/route.ts:26`) — mutação S4 mata | ✅ PASS |
| AUTH-30 `/login` só com e-mail+senha e link para `/esqueci-senha` | sem elementos do Google; link presente | `tests/pages/login.test.tsx:98-100` `expect(screen.queryByText("Entrar com Google")).not.toBeInTheDocument()` + `queryByRole("separator")` ausente; `:120` `expect(link).toHaveAttribute("href", "/esqueci-senha")`; `:109` `expect(email.required).toBe(true)` | ✅ PASS |

**Status**: 30/30 ACs com evidência `file:line`. **29 PASS integrais** (era 27), **1 com estreitamento aceito e justificado** (AUTH-20). AUTH-06 e AUTH-19 saíram de "parcial" para integral nesta iteração.

---

## Discrimination Sensor

Escopo desta iteração: **exclusivamente o código novo/alterado por `9b0371d`** (as 10 mutações da iteração 1, todas mortas, continuam válidas e estão preservadas no anexo). Isolamento: `git worktree add /tmp/verify-issue21-b HEAD` + `node_modules` por symlink; nenhum `git stash`. `git status --porcelain` do worktree real **vazio antes e vazio depois**; worktree temporário removido (`git worktree list` confirma que só restam os worktrees legítimos do projeto).

Baseline no worktree limpo: `npx vitest run tests/application/auth-token-flow.test.ts tests/api/calendar-integration-routes.test.ts tests/api/bootstrap-route.test.ts tests/api/set-password-route.test.ts tests/api/reset-password-flow.test.ts --no-file-parallelism` → **PASS (51) FAIL (0)**.

| # | Alvo (código novo de `9b0371d`) | Mutação | Killed? | Teste que matou |
| --- | --- | --- | --- | --- |
| S1 | `src/application/auth/auth-token-flow.ts:112` | Remove a chamada nova `markAllUnusedAsUsed` do **consumo** | ✅ Killed | `tests/application/auth-token-flow.test.ts:272` "dois convites pendentes … o outro deixa de ser usável" — `AssertionError: expected AuthToken{…} to be null` |
| S2 | `callback/route.ts:69` | `if (!tokens.refresh_token)` → nunca dispara (segue para persistir) | ✅ Killed | `calendar-integration-routes.test.ts:222` "não devolver refresh token → 400" (`expected 502 to be 400`) |
| S2b | `callback/route.ts:69` | Persiste a credencial **e** devolve 400 quando falta o refresh token (variante que preserva o status, para atacar a asserção nova) | ✅ Killed | `calendar-integration-routes.test.ts:224` `expect(await storedCredential()).toBeNull()` — `expected { email: 'agenda@clinica.com', …} to be null` |
| S3 | `callback/route.ts:57` | `credentialOwner` ignora a sessão e devolve sempre `"sessao-aberta"` | ✅ Killed | `calendar-integration-routes.test.ts:155-157` (AUTH-17: credencial gravada sob o subject da sessão) |
| S4 | `src/app/api/auth/bootstrap/route.ts:26` | Enfraquece `hasValidBootstrapToken` — remove a chamada a `passwordMatches` (basta o header existir) | ✅ Killed | `tests/api/bootstrap-route.test.ts` — 2 falhas ("segredo incorreto → 403" + "já existe conta") |
| S5 | `callback/route.ts:28` | `extractValidatedCode` deixa de comparar `state` | ✅ Killed | `calendar-integration-routes.test.ts` "state divergente → 400" e "state ausente → 400" (`expected 307 to be 400`) |
| S6 | `callback/route.ts:97` | Persiste credencial no ramo `!code` **mantendo** o 400 (variante que só a asserção nova pode pegar) | ✅ Killed | `calendar-integration-routes.test.ts:191` e `:205` `expect(await storedCredential()).toBeNull()` — **prova que as duas asserções novas de AUTH-19 não são vacuosas** |
| S7 | `src/app/api/auth/login/route.ts:57` | Sessão emitida com papel fixo `"super_admin"` em vez de `identity.role` | ✅ Killed | `tests/api/set-password-route.test.ts:85` `expect(session?.role).toBe("atendente")` — **prova que a asserção nova de AUTH-06 não é vacuosa** |
| S8 | `src/application/auth/auth-token-flow.ts:112` | Consumo invalida **também** os tokens do propósito oposto | ✅ Killed | `tests/application/auth-token-flow.test.ts:287` "convite e reset pendentes … o reset continua usável" — **prova o isolamento por propósito** |

**Sensor depth**: 9 mutações sobre o código novo (≥ 3 exigidas), somadas às 10 da iteração 1 → 19 mutações no total sobre a feature.
**Result**: **9/9 mortas, 0 sobreviventes** (sensor verde). Iteração 1: 10/10 mortas.
**Isolamento**: `git status --porcelain` vazio antes e depois; `/tmp/verify-issue21-b` removido; nenhum arquivo de implementação ou teste alterado pelo Verifier.

<details>
<summary>Anexo: sensor da iteração 1 (diff `9ec7e00..557204f`) — 10/10 mortas</summary>

| # | File:line | Mutação | Killed? |
| --- | --- | --- | --- |
| M1 | `src/domain/auth/auth-token.ts:68` | Remove `usedAt === null` de `isUsable` | ✅ |
| M2 | `src/domain/auth/auth-token.ts:68` | `expiresAt > nowMs` → `>=` | ✅ |
| M3 | `src/application/auth/auth-token-flow.ts:56` | Remove `markAllUnusedAsUsed` da **emissão** | ✅ |
| M4 | `src/application/auth/auth-token-flow.ts:109` | Deixa de persistir `token.markUsed(...)` | ✅ |
| M5 | `src/app/api/auth/bootstrap/route.ts:61` | Anula a guarda `hasAnyAccount()` | ✅ |
| M6 | `src/app/api/auth/bootstrap/route.ts:26-28` | Comparação do `x-bootstrap-token` sempre verdadeira | ✅ |
| M7 | `src/app/api/auth/forgot-password/route.ts:39` | Conta inexistente responde 404 (oráculo de e-mails) | ✅ |
| M8 | `callback/route.ts:27` | Remove a comparação de `state` | ✅ |
| M9 | `src/lib/auth/access-policy.ts:111` | `isAuthUsable()` sempre `true` | ✅ |
| M10 | `src/infrastructure/email/resend-email-gateway.ts:67` | Produção sem credenciais devolve `NullEmailGateway` | ✅ |

</details>

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — o commit de correção mexe em 4 arquivos de `src/`+`tests/`, todos apontados pelo plano; nada de refactor oportunista |
| No scope creep | ✅ |
| Matches patterns | ✅ — **corrigido**: `complexity` ≤ 10 restabelecido no callback (extração de `credentialOwner`/`persistCalendarCredential`); `secretMatches` substituído por `passwordMatches` de `src/lib/auth/session.ts` (DRY resolvido) |
| Spec-anchored outcome check | ✅ — 29/30 ACs com asserção equivalente ao enunciado; 1 estreitamento aceito e justificado (AUTH-20) |
| Per-layer Coverage Expectation | ✅ — domínio 1:1 com ACs; toda rota nova tem happy + edge + erro (incl. 429) |
| Every test maps to a spec requirement | ✅ — os 2 testes novos de `9b0371d` cobrem o edge case de invalidação em lote no consumo e o isolamento por propósito, ambos ancorados no texto vigente da spec |
| Documented guidelines followed | ✅ — `AGENTS.md` ("ESLint `complexity` max 10", "unused vars prefixadas com `_`") agora cumprido em todo arquivo do diff |
| Test integrity | ✅ — nenhum teste enfraquecido ou apagado; `9b0371d` só **acrescenta** asserções (`set-password`, `calendar-integration`) e 2 testes; a única remoção é a variável morta `resetGoogleEnv` |
| Comentários/JSDoc | ⚠️ Low — em `callback/route.ts:34-39` o JSDoc que documentava `GET` ficou órfão acima de `interface CredentialOwner`, e o JSDoc de `persistCalendarCredential` (`:40-45`) também ficou sobre a `interface` em vez da função. Cosmético; não afeta comportamento nem gate |

---

## Edge Cases

- [x] `POST /api/auth/set-password` aceita token de convite **e** de reset; o `purpose` decide TTL e o alcance da invalidação em lote — TTL: `tests/domain/auth-token.test.ts:42` (24 h) e `:50` (1 h); alcance: `tests/application/auth-token-flow.test.ts:272-288` (convite + reset pendentes, consumir o convite não queima o reset). *Edge case reescrito em `9b0371d`; ver "Edição da spec".*
- [x] Senha com menos de 8 caracteres → 400 sem consumir o token: `tests/api/set-password-route.test.ts:135-138` (`400`, depois o mesmo token ainda responde `200`)
- [x] `forgot-password` repetido do mesmo IP → 5/min: `tests/api/forgot-password-route.test.ts:132-133` (`5×200` depois `429`)
- [x] Conta inativa → mesma mensagem de link inválido: `tests/api/set-password-route.test.ts:151-152`
- [x] **Consumir um convite invalida os demais convites não usados da conta** — **implementado e testado em `9b0371d`**: `src/application/auth/auth-token-flow.ts:112`; teste em `tests/application/auth-token-flow.test.ts:253-271`, que persiste os dois tokens **direto no repositório** (sem passar pela emissão, que mascararia o caso). Mutação S1 confirma que a asserção depende da linha nova.
- [x] Falha na construção do gateway de e-mail em produção propaga o erro: `tests/infrastructure/resend-email-gateway.test.ts:118-119`

---

## Gate Check

- **Gate command** (Build, de `tasks.md`): `npm run typecheck && npm run lint && npm run check:sv && npx vitest run && npm run build`
- **Nota metodológica**: `npm run lint` passa por um wrapper (`rtk`) que imprime um resumo e **retorna 0 independentemente do resultado** — foi assim que o blocker escapou na primeira execução do autor. Este relatório usa `npx eslint` direto e lê `$?`.

| Gate | Exit real | Resultado |
| --- | --- | --- |
| `npm run typecheck` | **0** | ✅ `tsc --noEmit` limpo |
| `npx eslint src/app/api/integrations/google-calendar/callback/route.ts` | **0** | ✅ "No issues found" — blocker da iteração 1 resolvido |
| `npx eslint .` | **1** | ⚠️ **Baseline pré-existente, integralmente fora do diff**: 2 erros `complexity` (`src/app/api/patients/[id]/evolutions/route.ts:51` complexidade 14; `src/infrastructure/persistence/drizzle/drizzle-patient-repository.ts:107` complexidade 11) + 6 warnings `no-unused-vars` (`tests/components/sidebar-auto-close.test.tsx:3`, `tests/pages/staff-faturamento.test.tsx:3`, `tests/pages/staff-materiais.test.tsx:3`, `tests/pages/staff-paciente-care-plans.test.tsx:3`, `tests/pages/staff-paciente-detail.test.tsx:3`, `tests/pages/staff-procedimentos.test.tsx:3`). **Os 8 arquivos foram cruzados um a um com `git diff --name-only 9ec7e00 9b0371d` e nenhum aparece lá**; `eslint.config.*` também não foi tocado, então nenhuma mudança de regra pode ter criado esses achados. **Zero achados novos atribuíveis à feature.** |
| `npm run check:sv` | **0** | ✅ 13/13 checagens, "OK — adoção do @still-void/ui v2 completa" |
| `npm run test:coverage -- --no-file-parallelism` | **0** | ✅ **157 arquivos, 2434/2434 testes passando**, 0 falhas, 0 skips. Stmts **96,91 %** (6036/6228), Branch **91,51 %** (3665/4005), Funcs **96,78 %** (2110/2180), Lines **97 %** (5641/5815) — piso 90/90/90/90 |
| `npm run build` | **0** | ✅ inclui `/definir-senha` e `/esqueci-senha` como rotas estáticas |

- **Test count antes da iteração 2**: 2432 → **depois**: 2434 (+2, os dois testes novos de `auth-token-flow.test.ts`)
- **Test count antes da feature**: ≈ 2260
- **Skipped**: nenhum · **Failures**: nenhuma
- **Delta de dívida de lint introduzida pela feature**: **zero**. A dívida remanescente (2 erros + 6 warnings) já existia em `9ec7e00` e é responsabilidade de outra frente.

---

## Requirement Traceability Update

| Requirement | Status iteração 1 | Status iteração 2 |
| --- | --- | --- |
| AUTH-01..05, AUTH-07..18, AUTH-21..30 | ✅ Verified | ✅ Verified |
| AUTH-06 | ⚠️ Verified com ressalva | ✅ **Verified** (papel + subject asseridos dentro do fluxo de convite) |
| AUTH-19 | ⚠️ Verified com ressalva | ✅ **Verified** (não-persistência asserida nos 3 caminhos de recusa, não-vacuosa) |
| AUTH-20 | ⚠️ Verified com ressalva | ⚠️ **Verified com estreitamento aceito** (limite estrutural do projeto, não da implementação) |

---

## Summary

**Overall**: ✅ Ready to merge

**Fixes re-checked**: 7/7 confirmados, 0 refutados
**Spec-anchored check**: 30/30 ACs com evidência `file:line`; 29 integrais, 1 estreitamento aceito; 6/6 edge cases cobertos
**Sensor**: 9/9 mutações mortas sobre o código novo (19/19 acumuladas na feature)
**Gate**: 5/5 verdes — typecheck 0, eslint do arquivo-alvo 0, `npx eslint .` 1 **apenas com baseline pré-existente comprovadamente fora do diff**, check:sv 0, 2434 testes / 96,91 % / 91,51 %, build 0

**O que funciona**: o primitivo de token (hash SHA-256, uso único, TTL por propósito) é rigoroso e resiste a todas as mutações das duas iterações; a garantia de invalidação em lote deixou de depender de uma invariante externa e agora vive no consumo, com isolamento por propósito comprovado; o desacoplamento do Calendar não persiste credencial em nenhum dos três caminhos de recusa, e isso é asserido de forma não-vacuosa; o cookie emitido após o convite carrega o papel real da conta; a remoção do Google/senha mestre continua travada estruturalmente por varredura de `src/**`; a comparação em tempo constante do bootstrap reusa a primitiva do projeto.

**Issues restantes (nenhuma bloqueante)**: um estreitamento de AUTH-20 imposto pela exclusão de cobertura pré-existente do cliente real do Calendar; a reescrita do edge case de `purpose`, que remove da spec uma garantia que nunca chegou a existir no código (aceitável hoje, dívida se surgir um terceiro propósito); dois JSDoc deslocados no callback; e a dívida de lint pré-existente do repositório, alheia a esta feature.

---

**Ranked gaps** (nenhum bloqueia o merge)

1. **AUTH-20 — estreitamento aceito** (Low): "sincronização bidirecional preservada" segue asserida só por `expect(calendar.constructor.name).toBe("GoogleCalendarGateway")` (`tests/api/calendar-gateway-source.test.ts:39`). Limite estrutural: `vitest.config.ts:51` exclui `src/infrastructure/calendar/**` da cobertura por decisão anterior, e a feature não tocou esse diretório. Fecharia com E2E, fora do escopo. _(2026-09-23: premissa corrigida para "sincronização de saída"; E2E descartado na #45.)_
2. **Dívida de spec no `purpose`** (Low): `ConsumeAuthToken` continua sem ler `token.purpose` para decidir aceitação. Inofensivo com dois propósitos equivalentes; precisa virar validação real se nascer um terceiro propósito com poder distinto (ex.: troca de e-mail). Sugestão: registrar no backlog.
3. **JSDoc deslocado** (Low, cosmético): `src/app/api/integrations/google-calendar/callback/route.ts:34-45` — o bloco que documentava `GET` e o de `persistCalendarCredential` ficaram ambos sobre `interface CredentialOwner`.
4. **Dívida de lint do repositório** (Low, fora do escopo desta feature): `npx eslint .` sai 1 por 2 erros `complexity` e 6 warnings `no-unused-vars` herdados de `9ec7e00`. Não atribuível a `feature/issue-21`, mas mantém o comando repo-wide vermelho — vale uma issue própria.
5. **Wrapper de lint mascara o exit code** (Low, ferramental): `npm run lint` retorna 0 sempre. Enquanto for assim, todo gate de lint precisa ser lido por `npx eslint` + `$?`. Já capturado como lição L-026.
