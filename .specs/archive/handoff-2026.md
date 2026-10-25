# Handoffs arquivados — 2026

Movidos de `.specs/STATE.md` (feature `docs-progressive-disclosure`) sem edição de conteúdo, na ordem original. Snapshot congelado: não atualize aqui.

## Handoff (histórico)


- **`fix-login-email-ambiguo` — CONCLUÍDA** (issue #125, "login resolve conta errada quando mesmo e-mail existe em clínicas diferentes"). `findByEmail` usava `withTenant(clinicId=null)` (sem filtro de clínica) + `LIMIT 1` sem `ORDER BY` — se o mesmo e-mail existisse em contas de clínicas diferentes (MT-06/ADR-003 permite isso intencionalmente, mesma pessoa em duas empresas), o Postgres podia devolver linha arbitrária e o login verificava a senha contra o hash da conta errada.
- **O que mudou**: novo `UserAccountRepository.findAllByEmail(email)` (Drizzle + in-memory), sem `LIMIT 1`. `authenticateAccount` (login route) busca todas as contas ativas com o e-mail e verifica a senha contra cada candidata: 0 acertos → 401 genérico (preservado); exatamente 1 → autentica essa conta; 2+ acertos (e-mail **e** senha iguais em clínicas diferentes, colisão rara) → nega login com a mesma mensagem genérica, mas audita com `detail: 'ambiguous_credentials'` (resposta HTTP não muda, não revela existência de conta).
- **Decisão de design registrada em spec** (`.specs/features/fix-login-email-ambiguo/spec.md`): rejeitada a Opção 1 da issue (constraint de unicidade global de e-mail) por contradizer MT-06/ADR-003 já decidido; senha vira o critério de desambiguação em vez de pedir empresa na tela de login (sem demanda de UI pra isso hoje).
- **Security-reviewer (sub-agente independente) — sem CRITICAL/HIGH**: 1 MEDIUM aceito e documentado inline em código (`filterByValidPassword` roda 1 `scrypt` por candidata em paralelo — timing side-channel proporcional a quantas clínicas compartilham o e-mail; risco baixo, caso raro, mitigado pelo rate limit de login 5/min). 1 MEDIUM fora de escopo: `forgot-password` reproduz o mesmo padrão `findByEmail+LIMIT 1` (mesma causa raiz) — rastreado separadamente, não misturado neste fix.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` nos arquivos alterados, `npm run check:sv`, `npm run test:coverage` (174 arquivos, 2811 testes, cobertura ≥90%). CI: `Typecheck, lint, sv-gate, test:coverage` + `E2E (Playwright)` verdes, CodeRabbit sem achado acionável (revisou o diff, cota consumida no resumo, sem comentário inline).
- **Next step**: issue #155 (`forgot-password reproduz o bug do findByEmail+LIMIT 1`) — mesma causa raiz, ainda não iniciada. Fora disso, nenhum pendente desta feature.
- **Blockers**: nenhum.
- **Branch**: `fix/125-login-email-ambiguo-multi-clinica` (deletada local e remota após squash-merge). PR #156, squash-merged em `main` (`81c7d1c`). Issue #125 fechada via `Closes #125`.

- **`fix-146-flaky-condition-resolve-e2e` — CONCLUÍDA** (issue #146). Flake recorrente em `e2e/clinico.spec.ts:110` ("condição resolvida bloqueia novas avaliações"), reportado 2x em PRs #144/#145 sem relação com o domínio de Condition. Auditoria completa da cadeia resolve→assess (`src/app/api/conditions/[id]/route.ts`, `ResolveCondition`, `AddConditionAssessment`, `DrizzleClinicalConditionRepository`, pool `pg`) não achou race real: sem camada de cache, sem transação pendurada, Postgres single-instance em read-committed garante que o PATCH de resolve só responde após commit — as duas ocorrências coincidiram com spikes de lentidão do runner (uma com 5 outras specs falhando junto), confirmando timing de CI e não lógica de negócio errada. Fix: POST de avaliação pós-resolução envolto em `expect(...).toPass()` (retry até 10s) — idempotente, sem enfraquecer a asserção. Branch `fix/146-flaky-condition-resolve-e2e`, PR #154, merged em `main` (`8bf847f`). Issue #146 fechada manualmente (PR body não tinha `Closes #146`).
- **Next step**: nenhum pendente para esta feature.
- **Blockers**: nenhum.

- **`eslint-to-biome-migration` — CONCLUÍDA** (issue #107). `npm run lint` migrado de ESLint pro Biome único (lint+format), `biome.json` novo, lint-staged e hook `.claude/hooks/lint-edited-file.sh` atualizados, `eslint`+`eslint-config-next` removidos (286 pacotes). Branch `fix/eslint-to-biome-migration`, PR #109, merged em `main` (`5a133cd`). Issue #107 fechada linkando o PR.
- **Achado de sessão**: `npx biome check .` (sem pin de versão) baixa/roda binário divergente e reporta falso positivo (2 erros); usar sempre `./node_modules/.bin/biome check .` ou `npm run lint`. Gate real: `./node_modules/.bin/biome check .` → 0 erros, `npm run test` → 167/167 arquivos, 2750/2750 testes, `npm run typecheck` → 0 erros, `npm run check:sv` → OK.
- **Next step**: nenhum pendente para esta feature.
- **Blockers**: nenhum.

- **Fix pontual — CONCLUÍDO** (issue #105, warning de Vite config nativo em toda rodada de `npm run test:coverage`: `configLoader: 'native'` não suporta ESM carregado como CommonJS). Correção isolada: `vitest.config.ts` → `vitest.config.mts` (ESM real sem exigir `"type": "module"` no `package.json`, evitando afetar outros arquivos `.js`/`.ts` do projeto) + `__dirname` → `import.meta.dirname` + comentários desatualizados em `tests/support/session.ts`. PR #110, merged em `main` (`2adb394`). Issue #105 fechada via `Closes #105`. **Entrada pulada nesta sessão anterior** — registrada agora fora de ordem.
- **Next step**: nenhum pendente para esta feature.
- **Blockers**: nenhum.

- **Feature `fase-a-padroes-estruturais` — CONCLUÍDA e VERIFICADA** (issues #57-60, os 4 padrões estruturais que a auditoria UX 2026-08 aponta como causa-raiz de achados pontuais em 9+ superfícies). Pipeline spec-driven completo (Specify → Design → Tasks → Execute em 4 fases com 1 sub-agente por fase, sequencial, mesma branch). 34 tasks (T1-T34), branch `fix/fase-a-padroes-estruturais`, PR #80, squash-merged em `main` (`12f6c3e`). Issues #57, #58, #59, #60 fechadas sozinhas via "Closes #N" no squash.
- **O que mudou**: (1) `useApiQuery` ganha `isLoading`; Prontuário (evoluções/condições/planos/fotos) distingue carregando/erro/vazio, com retry via `refresh()`/`load()` no `ErrorAlert` (`onRetry` opcional); (2) 11 tabelas largas do staff envoltas em `overflow-x-auto`, mais um fix de shell não previsto no design (`min-w-0` no wrapper flex de `staff-layout-client.tsx` + alvo de toque do `SidebarTrigger` ≥44px, achado pelo próprio e2e novo); (3) novo componente `ConfirmAction` (sobre `AlertDialog` do `@still-void/ui`) aplicado nas 12 ações destrutivas confirmadas no código (desativar paciente/profissional/parceiro/procedimento/conta, cancelar fatura/retorno, resolver condição/plano, excluir foto, antecipar retorno, manter plano) — "revogar consentimento" e "remover material" citados pela auditoria não existem como ação no código hoje, ficaram fora; (4) toast de sucesso/erro (`useToast`) em toda mutação das 4 páginas sem feedback (`pacientes`, `configuracoes`, `portal/patient-view`, `portal/consent-card`).
- **Verifier (fresh sub-agent, author ≠ verifier) — 2 iterações**. Iteração 1: **FAIL** — 1 blocker real (8 specs e2e pré-existentes nunca atualizados pra clicar em "confirmar" no `AlertDialog` novo, quebrando o próprio gate de build da feature) + 3 gaps de escopo incompleto (retry via refresh não implementado; 3 handlers de mutação órfãos de toast — `ScheduleSection.save`, `resendInvite`, `PatientPhotoUpload.upload`; variant do toast nunca testado, sensor achou mutante sobrevivente). Fix round 1: 5 commits. Iteração 2: **PASS** — 15/17 ACs verificadas com evidência `file:line`, sensor 3/3 + a sobrevivente da it.1 re-confirmada morta, gate completo verde. Relatório: `.specs/features/fase-a-padroes-estruturais/validation.md`.
- **CodeRabbit no PR #80 — 3 achados acionáveis, todos corrigidos** (commit `6d968cb`, após o merge da it.2 do Verifier): (1) bug real em `condition-photos.tsx` — um único estado de erro misturava falha de carregamento da lista com falha de upload/exclusão, fazendo "Tentar novamente" reaparecer errado em erro de mutação; separado em `listError`/`actionError` + indicador de carregamento inicial; (2) `e2e/responsive-tables.spec.ts` usava `some()` pra checar `overflow-x-auto` — passava com só 1 de N tabelas envolvida; trocado por `every()` + checagem de contagem mínima; (3) `spec.md` citava "~15 ações" com 2 exemplos (revogar consentimento, remover material) que não existem no código — alinhado com os 12 call sites confirmados em `design.md`, com nota explicando a diferença de método de contagem da auditoria. CodeRabbit não re-revisou dentro de ~30min após o push do fix — merge seguiu mesmo assim (gate local 100% verde, Verifier independente já tinha dado PASS antes desse commit), documentado em comentário no PR.
- **4 lições candidatas registradas** (`L-030`–`L-033`, `.specs/LESSONS.md`): (1) migrar uma UI pra confirmação modal exige varrer e2e existente que exercita os mesmos fluxos, não só os testes unit da própria task; (2) AC de spec frouxa ("com opção de X") vira gap silencioso se não virar item de checklist explícito na task; (3) "escopo restrito ao nome literal do handler" pode deixar handlers-irmãos do mesmo componente de fora mesmo cumprindo a letra da task — ler a intenção da história, não só o texto da task; (4) toast precisa de teste que assere `variant`, não só o texto, pra sensor de discriminação pegar troca success/danger.
- **Gate final verde**: `npm run typecheck`, `npm run lint`, `npm run check:sv`, `npm run test:coverage` (163 arquivos, **2510/2510** testes, 96,8%+ em todas as dimensões — piso 90%), `npm run test:e2e` (82 testes, 2 flakies pré-existentes documentados absorvidos pelo retry padrão, 0 falha real).
- **Next step**: nenhum pendente para esta feature. Próximo item de backlog UX é a Fase B/C da auditoria (achados pontuais por superfície que não são padrão estrutural) — decisão do usuário sobre priorizar.
- **Blockers**: nenhum.

- **Feature `fase-b-clinico-legal-critico` — CONCLUÍDA e VERIFICADA** (issues #61-#68, achados clínico/legal crítico da auditoria UX 2026-08 — dados cadastrais da clínica, documentos sem responsável técnico, atestado sem checar status, autoria de evolução forjável, erro confundido com "sem histórico", perda de SOAP/anamnese ao trocar de aba, complicações de estomia nunca exibidas, copy de login). Pipeline spec-driven completo (Specify → Discuss → Design → Tasks → Execute, 16 tasks em 4 fases, executadas inline sem sub-agentes por escolha do usuário). Branch `fix/fase-b-clinico-legal-critico`, PR #81, squash-merged em `main` (`d0addcb`) numa sessão posterior.
- **O que mudou**: (1) `clinics` ganha 5 colunas cadastrais (migration 0026) + `Clinic.updateInfo()`/`isCompleteForDocumentEmission()` no domínio; nova rota `/api/settings/clinic-info` (GET/PUT, admin-only) e seção "Dados da clínica" em Configurações; `/api/clinic-info` passa a ler do banco, `src/lib/clinic-info.ts` (env-based) removido; (2) Atestado/Relatório/Plano de Cuidados bloqueiam (fail-closed) sem CNPJ/responsável técnico; Atestado também bloqueia consulta com status ≠ `completed`; Consentimento fica de fora do bloqueio (decisão registrada em spec.md); (3) `resolveProfessionalId` (evoluções) passa a ignorar `professionalId` do corpo pra **todo** papel, não só profissional — autoria sempre da sessão; seletor de profissional removido da UI; (4) `AnamnesisSection` ganha estados de erro/loading (antes descartados) — **causa raiz real** era `apiFetch` (`src/lib/client.ts`) lançando erro sempre que `data === null`, mesmo em resposta de sucesso (SPEC_DEVIATION documentado no código); (5) guarda de troca de aba (`useDirtyTabGuard`) com `AlertDialog` controlado do Still Void antes de descartar SOAP/anamnese não salvos; (6) tabela de avaliações passa a exibir `complicationCodes` (labels canônicas) ao lado do texto livre; (7) #68 (copy do login) já estava resolvido incidentalmente por commit anterior (`c521841`) — só validado via e2e, sem código novo.
- **Verifier (fresh sub-agent, author ≠ verifier) — 2 iterações**. Iteração 1: **FAIL** — 3 gaps: (a) Major — e2e de login de paciente/parceiro (#68) usava cookie forjado em vez do formulário real, sem `SPEC_DEVIATION`; (b) Minor — atestado mostrava "Consulta não encontrada" durante o loading do próprio agendamento (só guardava loading da clínica); (c) Minor spec-precision — nenhum teste confirmava CNPJ/responsável técnico visíveis nos documentos. Sensor de discriminação (3 mutações: `isClinicInfoComplete` `&&`→`||`, forjamento de `professionalId` reintroduzido, condição do dirty-guard invertida) matou as 3 já na it.1. Fix round: `SPEC_DEVIATION` documentado (e2e de paciente/parceiro via cookie é limitação real — `POST /api/accounts` não devolve link de convite na resposta, mesmo precedente de `portal-paciente.spec.ts`/`portal-parceiro.spec.ts`; spec.md/tasks.md realinhados); `isLoading` do agendamento passa a guardar o atestado; testes ganham assert de CNPJ/responsável visíveis. Iteração 2: **PASS** — os 3 gaps confirmados resolvidos com evidência `file:line`, nenhum gap novo, gate 100% verde. Relatório: `.specs/features/fase-b-clinico-legal-critico/validation.md`.
- **2 lições candidatas registradas** (`L-034`-`L-035`, `.specs/LESSONS.md`) sobre os gaps da it.1 — ver relatório para o texto exato.
- **Gate final verde**: `npm run typecheck`, `npm run lint`, `npm run check:sv`, `npm run test:coverage` (2560/2560 testes, 96,8%/91,31%/96,74%/96,92% — piso 90%), `npm run build` (OK), e2e alvo (`documentos.spec.ts` + `auth.spec.ts`, 16/16) — suíte e2e completa também rodada uma vez (83 testes, 80 passed + 3 flaky pré-existentes recuperados no retry, confirmados não relacionados a esta feature ao isolar os arquivos).
- **Next step**: usuário decide sobre push/PR/merge desta branch. Backlog restante da auditoria UX: achados pontuais por superfície que não viraram Fase A (padrão estrutural) nem Fase B (clínico/legal crítico).
- **Blockers**: nenhum.
- **Branch**: `fix/fase-b-clinico-legal-critico`. 20 commits: `2f1c041`..`884047f`.
- **Branch**: `fix/fase-a-padroes-estruturais` (deletada após squash-merge). 42 commits, PR #80, merge commit `12f6c3e` em `main`.

- **Feature `autenticacao-nativa` — CONCLUÍDA e VERIFICADA** (issue #21 + sub-issues #32 A1 convite, #34 A2 reset, #33 A3 Calendar desacoplado, #35 A4 remoção+bootstrap). Executa a ADR-004 (Opção A: autenticação 100 % nativa). Pipeline spec-driven completo (Specify → gray areas resolvidas como assumptions → Design → Tasks → Execute) rodado inline, sem sub-agentes de batch, num worktree dedicado (`.claude/worktrees/agent-a7af95ed531c2c8f4`), branch `feature/issue-21`. 21 tasks (T1-T21) em 6 phases + 1 commit de correção do Verifier: 23 commits, `7dec63d`..`9b0371d`. Relatório: `.specs/features/autenticacao-nativa/validation.md`.
- **O que mudou**: toda conta autentica com e-mail + senha própria, definida pela própria pessoa por link de convite (24 h, uso único) ou reset self-service (1 h). Novos: porta `EmailGateway` + `NullEmailGateway` (dry-run) + `ResendEmailGateway` sem SDK; primitivo `AuthToken` (segredo de 32 bytes no link, só SHA-256 em `auth_tokens`, migração `0023`); rotas `set-password`, `forgot-password`, `bootstrap`; telas `/definir-senha` e `/esqueci-senha`; fluxo dedicado `/api/integrations/google-calendar[/callback]`. Removidos: `api/auth/google/**`, `google-oauth.ts`, `ResolveUserRole`, `GOOGLE_ALLOWED_EMAILS`, `AUTH_PASSWORD`. Fail-closed passa a depender só de `AUTH_SECRET`.
- **Verifier (fresh sub-agent, author ≠ verifier) — 2 iterações**. Iteração 1: **FAIL** — pegou um erro `complexity` **novo** (11 > 10) no `GET` do callback do Calendar que eu não tinha visto, mais um edge case não implementado (consumo de token não invalidava os irmãos), um gap de precisão de spec e 4 achados menores. Iteração 2 (após o commit `9b0371d`): **PASS** — os 7 itens do plano de correção confirmados um a um. Sensor de discriminação: 10/10 mortas na iteração 1 (uso único, expiração, invalidação em lote, as 2 guardas do bootstrap, oráculo do forgot-password, `state` do OAuth, fail-closed de auth e de e-mail) + 9/9 sobre o código novo do fix na iteração 2 = **19/19 mutações mortas**. `validate_state.py` exit 0.
- **ARMADILHA DE FERRAMENTAL — corrige o AD-001 do handoff anterior**: `npm run lint` passa por um wrapper `rtk` que **retorna exit 0 sempre**, inclusive com erros reais. O handoff da feature anterior registrou "exit code 0 é o sinal confiável" — **isso está errado e foi exatamente como o erro de `complexity` passou pelo meu gate**. O sinal confiável é `npx eslint . ; echo $?`. Além disso, `npx eslint .` neste repo **já sai 1 no baseline** (2 erros `complexity` em `src/app/api/patients/[id]/evolutions/route.ts` e `drizzle-patient-repository.ts`, + 6 warnings `no-unused-vars` em `tests/**`), todos herdados de `9ec7e00`. O critério utilizável é "zero achados novos atribuíveis ao diff", cruzando os arquivos apontados contra `git diff --name-only <base> HEAD` — não "exit 0".
- **Gate final verde**: `npm run typecheck` (limpo), `npx eslint .` (exit 1 = baseline pré-existente, 0 achados do diff — verificado arquivo a arquivo), `npm run check:sv` (OK), `npm run test:coverage --no-file-parallelism` (157 arquivos, **2434/2434** testes, 96,91 % stmts / 91,51 % branches / 96,78 % funcs / 97 % lines, piso 90), `npm run build` (OK), `npm run test:e2e` (**70/70**, sem flake, rodado 2×).
- **Decisões novas**: `AD-018` (Resend por `fetch` sem SDK; fail-closed em produção, dry-run fora dela), `AD-019` (token opaco, só hash no banco, sem `clinic_id` — exceção deliberada ao AD-017), `AD-020` (bootstrap por rota com dupla guarda: segredo de deploy + zero contas; `DrizzleUserAccountRepository.save` deixou de recusar repositório de sistema). `AD-001` ganhou nota: a premissa mudou de forma (não sobram mais subjects sem linha em produção), a conclusão não.
- **2 estreitamentos aceitos, não bloqueantes** (documentados no `validation.md`): (1) AUTH-20 verifica "sincronização preservada" pelo nome do construtor do gateway, não por um round-trip real de evento; (2) o edge case de `purpose` divergente foi **reescrito** na spec — era inverificável como estava, já que `/api/auth/set-password` é a única rota consumidora e aceita os dois propósitos de propósito.
- **Ambiente**: o worktree precisou de `npm ci` próprio — `next build` do Turbopack recusa `node_modules` symlinkado para fora da raiz do projeto ("Symlink is invalid, it points out of the filesystem root"), e o script `build` usa caminho relativo. Confirmado de novo: comandos longos em **background** morrem neste WSL; rodar em foreground resolve.
- **Next step**: nenhum pendente. Candidatos de backlog levantados pelo Verifier: issue própria para a dívida de lint pré-existente do repo (2 erros + 6 warnings), e o gap conhecido de `google_accounts` ser global (sem `clinic_id`, `findMostRecent()` faz a última conexão vencer para todas as empresas) — pré-existente e explicitamente fora do escopo da ADR-004.
- **Revisão do CodeRabbit no PR #44 — 17 apontamentos, 10 aplicados, 7 recusados com justificativa** (commit `540b06d`). Os que valeram de verdade:
  1. **`docker-compose.yml` estava quebrado** e nem o Verifier nem eu pegamos: ainda exigia `AUTH_PASSWORD` (`:?defina AUTH_PASSWORD`) e passava `GOOGLE_ALLOWED_EMAILS`, ambos removidos por esta própria feature, e não tinha `RESEND_API_KEY`/`EMAIL_FROM`/`VITTA_BOOTSTRAP_TOKEN`. O stack não subia. **Lição**: o gate (`typecheck`/`lint`/`test`/`build`) não toca arquivos de orquestração — remover uma env var exige varrer `docker-compose.yml`, `Dockerfile` e `playwright.config.ts` à mão.
  2. **TOCTOU no resgate do token (CWE-367)**: `findUsableBySecretHash` + `save(markUsed)` era checar-e-depois-marcar; duas requisições simultâneas com o mesmo link passavam as duas. Virou `claimBySecretHash`, um `UPDATE … WHERE used_at IS NULL AND expires_at > now RETURNING *`. As 19 mutações do sensor não pegaram isso porque mutação de linha única não modela concorrência.
  3. **Oráculo de tempo no `forgot-password` (CWE-204)**: o corpo era idêntico, mas o caso "conta existe" aguardava emissão + POST ao provedor. O envio deixou de ser aguardado.
  4. **`APP_URL` sem garantia de origem**: passa a exigir `https://` em produção (loopback liberado para o compose local) — o link carrega o segredo que define a senha.
  5. **Estado do OAuth de agenda não amarrado à sessão**: o cookie passa a levar `<state>:<subject>` e o callback recusa se a sessão do retorno for outra.
  6. **Falha de envio no bootstrap devolvia 500** com a conta já criada — como a rota é de uso único, a instalação ficava sem primeiro acesso. Agora responde 200 com o `inviteUrl`.
- **Recusados com motivo** (registrados no PR): sincronizar contagens de teste de `tasks.md` com as finais (são plano vs. resultado, o histórico é deliberado); pôr `test:e2e` no gate de uma task; exigir `npx eslint .` exit 0 (a dívida é herdada de `9ec7e00` e fora do diff); transação no bootstrap (exige o segredo + janela de ms, e o índice único parcial já cobre o mesmo e-mail); `reuseExistingServer` idempotente no `globalSetup` (falhar alto num servidor com estado sujo é o comportamento desejável).
- **Gate re-rodado após as correções**: 158 arquivos, **2444/2444** testes, 96,9 % stmts / 91,48 % branches, `build` OK, **E2E 70/70** (terceira execução).
- **Blockers**: nenhum.
- **Branch**: `feature/issue-21` (worktree dedicado). 26 commits: `7dec63d`..`540b06d`. PR #44.

- **Feature `rbac-catalogo-papeis` — CONCLUÍDA e VERIFICADA** (issue #20, catálogo de 6 papéis + hierarquia de provisionamento + escopo dinâmico do Profissional por vínculo). Todas as 19 tasks (T1-T19) já estavam implementadas e commitadas antes desta sessão (a sessão anterior travou por crash da IDE logo após o commit da T19, `5ca89b3`, sem rodar o Verifier). Esta sessão retomou do handoff, rodou o gate completo e disparou o Verifier que faltava. Branch `feature/issue-20`, 19 commits: `6ed2762`..`5ca89b3`.
- **Verifier (fresh sub-agent, author ≠ verifier) — PASS**: 18 ACs (user stories P1-P4) amostradas com evidência `file:line`, nenhum gap de precisão de spec; sensor de discriminação (3 mutações — vínculo desabilitado em `professional-patient-scope.ts`, `atendente` adicionado à família `clinical` em `route-family.ts`, `canProvision` de `role-hierarchy.ts` sempre `true`) matou as 3 em worktree isolado (`/tmp/verify-issue20`, removido); árvore real confirmada intacta. Relatório: `.specs/features/rbac-catalogo-papeis/validation.md`. Nenhuma lição nova distilada (PASS limpo).
- **Gate rodado nesta sessão e verde**: `npm run typecheck` (limpo), `npm run lint` (exit 0 — nota: `npm run lint`/`npx eslint` nesta VM passam por um wrapper `rtk` que despeja um resumo com nomes de arquivo ofuscados apontando para `node_modules`/`.next`; é ruído do wrapper, não do ESLint real — `globalIgnores` do `eslint.config.*` já exclui `.next/**`; exit code 0 é o sinal confiável, não o texto do resumo), `npm run test:coverage --no-file-parallelism` (todos passando, 97.01% statements — acima do piso de 90%), `npm run build` (OK), `npm run check:sv` (OK), `npm run test:e2e` (68/68 passed, sem flake).
- **Next step**: nenhum pendente para esta feature. Issue #20 pronta para fechar/merge (decisão do usuário). Próximo trabalho do backlog RBAC, se houver, é o que a spec já marca como fora de escopo: mudanças no mecanismo de autenticação em si.
- **Blockers**: nenhum.
- **Branch**: `feature/issue-20` (não `main` — checkout principal, sem worktree dedicado para esta feature).

- **Feature `fundacao-multi-tenancy` — CONCLUÍDA e VERIFICADA** (issue #19 + sub-issues #22-#27, épico de RBAC multi-empresa). Todas as 24 tasks (T1-T24), 6 phases, 3 batches (A: T1-T7, B: T8-T16, C: T17-T24) executadas inline nesta sessão (sem sub-agentes, por escolha do usuário), direto no checkout principal (`~/projects/vitta-flow`), branch `main`, sem worktree dedicado. Issues #22-#27 fechadas. Relatório completo: `.specs/features/fundacao-multi-tenancy/validation.md`.
- **Verifier (fresh sub-agent, author ≠ verifier) — PASS**: 15/15 requisitos amostrados (MT-02..MT-28) com evidência `file:line` e outcome batendo com o spec; sensor de discriminação (3 mutações — `withTenant` removido de `findById`, rota com `clinicId: null` forçado, guarda `=== null` invertida) matou as 3 em worktree isolado, árvore real confirmada intacta antes/depois. `validate_state.py` confirma o relatório bem-formado.
- **2 gaps não-bloqueantes apontados pelo Verifier, aceitos como follow-up (não corrigidos nesta entrega — fora do escopo das 24 tasks)**:
  1. `src/app/api/patients/[id]/export/route.ts:30` (export LGPD) ainda chama `getRepositories({ clinicId: null })` incondicionalmente — nenhuma task cobria essa rota; sem teste provando se uma sessão comum consegue exportar paciente de outra clínica. Candidato a task futura de isolamento.
  2. 1 warning de lint pré-existente adicional (`tests/components/sidebar-auto-close.test.tsx:3`, import não usado) fora da baseline de 20 documentada — não relacionado a este épico.
- **Gate final rodado nesta sessão (foreground, não background — ver nota abaixo) e verde**: `npm run typecheck`, `npm run lint` (baseline de 20 problemas pré-existentes, nenhum novo), `npm run test:coverage --no-file-parallelism` (1928/1928 testes, 96.86% statements — acima do piso de 90%), `npm run check:sv` (OK), `npm run build` (OK), `npm run test:e2e` (61 passed, 7 flaky por lentidão da VM — todos recuperados no retry, 0 falha real após a correção abaixo).
- **Regressão real encontrada e corrigida rodando o e2e completo** (só apareceu ali, não nos testes unitários/integração): `e2e/support/session-token.ts` é uma réplica documentada do formato de token de `src/lib/auth/session.ts`, mas não foi espelhada quando `createSessionToken` passou a incluir `clinicId` no payload (T6) — `verifySessionToken` rejeitava todo token e2e (campo ausente, não `null`), derrubando os specs de portal do paciente/parceiro. Corrigido no mesmo commit da T24 (`144fc28`), com default `"legacy-clinic"` (mesma clínica do fluxo de login real). **Lição**: specs e2e que replicam formatos de assinatura por design (para não puxar `next/server` no test runner) são um ponto cego real de qualquer suíte unitária — só o e2e completo pega.
- **Achado de ambiente desta sessão**: rodar comandos longos (`npm run test:coverage`, `npx vitest run` sem filtro) em **background** neste WSL foi finalizado externamente (`status: killed`) várias vezes, sem OOM no `dmesg` e sem processo travado — causa não identificada com certeza, mas correlacionada a alguma interrupção do lado da sessão/terminal. **Rodar em foreground (sem `run_in_background`) resolveu 100% das vezes.** Também: os binários do Chromium do Playwright (`~/.cache/ms-playwright`) não estavam instalados nesta VM — `npx playwright install chromium` funciona sem root, mas as libs de sistema (`libnspr4` etc.) exigem `sudo npx playwright install-deps chromium`, que só funciona num terminal interativo de verdade (o prefixo `!` desta sessão não serve, `sudo` não consegue ler senha de um pipe).
- **Padrão consolidado ao longo do épico** (útil para qualquer isolamento futuro, ex.: o gap do export LGPD acima): cada entidade isolada segue o mesmo molde — (1) repositório Drizzle ganha `clinicId: string | null` no construtor, usa `withTenant` em toda leitura, e `save()`/`delete()` lança erro se `clinicId` for `null` (exceção deliberada: `ReminderLogRepository`, cai em `LEGACY_CLINIC_ID` em vez de lançar, porque o cron `/api/reminders/run` é cross-empresa por natureza); (2) `container.ts` passa `tenant.clinicId`; (3) call sites de teste que instanciam o repositório direto (`new Drizzle...Repository(appDb)`) precisam de um clinicId literal (`"legacy-clinic"`); (4) rotas de leitura (GET) usam `guard.session?.clinicId ?? null` (papel de sistema pode ler cross-empresa); rotas de escrita usam `?? LEGACY_CLINIC_ID`; (5) todo `getRepositories({ clinicId: null })` num arquivo tocado precisa ser auditado — call sites fora do escopo da task atual que **escrevem** via um repositório recém-scoped quebram silenciosamente — sempre rodar a suíte COMPLETA pelo menos uma vez por task; (6) nova task de isolamento sempre ganha `tests/api/<entidade>-tenant-isolation.test.ts` usando `tests/support/clinics.ts` (`ensureTestClinics`, `CLINIC_A_ID`, `CLINIC_B_ID`).
- **Decisões técnicas não registradas como AD formal** (candidatas se o épico continuar): `PatientRepository.findClinicIdById` (T7) e `DrizzleConditionPhotoRepository` ganhando `clinicId`+`withTenant` completo (T16) — ambos padrões para o papel de sistema auditar/isolar sem poluir o domínio.
- **Next step**: nenhum pendente para este épico. Se houver trabalho futuro, considerar: (a) isolar `patients/[id]/export`, (b) decidir sobre os 2 gaps do Verifier, (c) próxima feature.
- **Blockers**: nenhum.
- **Branch**: `main` (checkout principal, sem worktree). 26 commits deste épico: `f9ca946`..`144fc28`.

- **Batch de correção de issues abertas — CONCLUÍDA e MERGEADA** (#38, #39, #42, #46, #48, #49, #50, #51). Branch `fix/resolve-open-issues-batch-1`, executado inline sem sub-agentes de batch. PR #56, squash-merge `31771aa` em `main`. As 8 issues fecharam automaticamente via `Closes #N` nos commits. #43 pulada por pedido explícito do usuário (é decisão de design, não bug) — segue **aberta**. #45 (E2E real do Google Calendar) comentada e deixada **aberta** — exige decisão de infraestrutura de teste (conta/sandbox dedicada do Google) fora do alcance de um agente automatizado. #47 já estava corrigida por commit anterior (`d2ef69e`) — fechada à parte, sem código novo, antes de abrir o PR.
- **O que mudou**: isolamento por clínica no export LGPD (#38); `ConsumeAuthToken` valida `purpose` (#46); emissão de `auth_token` e bootstrap do Super Admin atômicos contra corrida via índice único parcial + retry em `23505` (#50, #51) — `src/lib/db-errors.ts` novo, compartilhado; `ensureLink` em melhor esforço não derruba mais o registro clínico principal se falhar (#42) — `src/lib/patient-link.ts` novo; dívida de lint real corrigida (2 `complexity` + 6 `no-unused-vars`) e causa raiz do ruído do `eslint.config.mjs` corrigida (AD-021) — ver #48/#49.
- **Revisão do CodeRabbit no PR #56 — 5 achados acionáveis, todos aplicados** (commit de fixes após o primeiro push): (1) migrations `0024`/`0025` ganharam saneamento de duplicatas antes do `CREATE UNIQUE INDEX` — sem isso, uma instalação onde a corrida já tivesse ocorrido antes da migração teria o deploy travado pelo Postgres; (2) export LGPD ganhou `Cache-Control: no-store` (CWE-525); (3) teste de evolução resiliente passou a confirmar persistência real, não só status 200; (4) `InMemoryAuthTokenRepository` de `send-invite.test.ts` corrigido para invalidar os irmãos em `replaceUnused`, espelhando o contrato real; (5) spies de teste restaurados em `finally` em 4 testes. Re-review automática não rodou (plano CodeRabbit com cota de 1 review/hora esgotada; `@coderabbitai review` manual respondeu "rate limited, incremental review não aplicável") — mergeado com o gate local 100% verde e os achados já corrigidos/verificados, sem esperar a cota renovar.
- **Gate completo rodado nesta sessão e verde**: `npm run typecheck` (limpo), `npx eslint .` / `npm run lint` (exit 0, zero achados), `npm run check:sv` (OK), `npx vitest run tests/` (2476/2476), `npm run test:coverage --no-file-parallelism` (96.63% stmts / 91.13% branches / 96.6% funcs / 96.7% lines — acima do piso de 90%), `npm run build` (OK), `npm run test:e2e` (70/70, sem flake). Migrations 0024/0025 (incluindo o saneamento de duplicatas) confirmadas aplicando limpo contra pglite.
- **Next step**: nenhum pendente deste batch. Backlog restante: #43 (decisão de design pendente do usuário) e #45 (decisão de infra de teste do Google Calendar).
- **Blockers**: nenhum.
- **Branch**: `main`. Squash-merge `31771aa` (PR #56, base `100c692`). Branch de trabalho `fix/resolve-open-issues-batch-1` deletada (remota e local) após o merge.

- **Feature `fase-c-lgpd-seguranca-dado` — CONCLUÍDA e VERIFICADA** (issues #69-#72, Fase C da auditoria UX 2026-08 — LGPD/segurança de dado: portal vazando nota clínica interna, consentimento sem versão/revogação, buracos na trilha de auditoria, campo clínico sensível em claro no banco). Pipeline spec-driven completo (Specify → Design → Tasks → Execute em 4 fases com 1 sub-agente por fase, sequencial). 20 tasks (T1-T20), branch `feat/fase-c-lgpd-seguranca-dado`, PR #82, squash-merged em `main` (`32fd518`). Issues #69, #70, #71, #72 fechadas sozinhas via "Closes #N" no squash.
- **O que mudou**: (1) `toPortalConditionDto`/`toPortalAssessmentDto` (allowlist em compile-time, sem `notes`) substituem `toConditionDto`/`toAssessmentDto` nas rotas `/api/portal/patient` e `/api/portal/partner`; (2) `ConsentRecord` ganha `kind: "accept"|"revoke"` + `textVersion`, `ConsentRecord.resolveStatus` (empate resolvido a favor da revogação) e `revoke()`; novo `POST /api/portal/patient/consent/revoke`; gate de upload de foto passa a usar o status resolvido em vez de `.some(covers)` cru; (3) `recordAudit`/`recordAuditNow` ganham `actorOverride` pra eventos pré-sessão; login (sucesso/falha), logout, set-password, criar paciente, `settings/clinic-info` e `settings/schedule` passam a auditar; (4) `encryptField`/`decryptField`/`isEncryptedPayload` novos em `src/lib/auth/crypto.ts` (AES-256-GCM, reuso do padrão AD-018); os 3 repositórios Drizzle de `evolution_notes`/`clinical_conditions`/`condition_assessments` cifram/decifram na fronteira; `scripts/encrypt-clinical-fields.ts` migra dado existente (idempotente).
- **Verifier (fresh sub-agent, author ≠ verifier) — 1 iteração, PASS**: 24/25 ACs batendo o outcome exato do spec, 1 spec-precision gap não bloqueante (AUDIT-03, logout `action` não pinado pelo spec — autor usou `"delete"`). Sensor de discriminação: 3/3 mutações mortas (DTO allowlist, `resolveStatus` invertido, `actorOverride` ignorado). Relatório: `.specs/features/fase-c-lgpd-seguranca-dado/validation.md`. 2 lições candidatas registradas (`L-036`-`L-037`).
- **Revisão do CodeRabbit no PR #82 — 22 achados acionáveis, todos triados** (commits `100183d`, `1579053`, após o PASS do Verifier): achado mais sério — `isEncryptedPayload` (T15) só validava **formato**, não autenticação GCM real; um texto plano que coincidisse por acaso no formato `iv.tag.ciphertext` seria tratado como "já cifrado" e a migração de dado o deixaria em claro pra sempre (CWE-311) — o Verifier tinha classificado isso como mera "inconsistência de doc", mas é bug de segurança real; corrigido pra exigir decifra real com a secret vigente. Outros corrigidos: `logout`/`set-password` não podem mais falhar a resposta por erro de auditoria depois que a ação (cookie limpo / senha trocada com token já consumido) já é irreversível; `acceptedAt` do consentimento não é mais sobrescrito pela data de revogação (`revokedAt` em campo próprio); paginação da migração de dado ganhou `ORDER BY` estável; teste de round-trip de leitura pra `notes: null` adicionado. Recusados com justificativa (comentário no PR): checagem de `textVersion` separada em `resolveStatus` é falso positivo (a versão já está interpolada no próprio `CONSENT_TEXT`, então o hash muda junto); compare-and-swap na migração de dado é escopo desproporcional a um script de rodada única documentado pra janela de manutenção; teste de execução dedicado pro script CLI foge do padrão já estabelecido (`scripts/import-taxonomy.ts`).
- **Gate final verde**: `npm run typecheck`, `npm run lint`, `npm run test:coverage` (96,78%/91,12%/96,72%/96,89% — piso 90%). `npm run test:e2e` não rodado nesta feature (mudança é 100% backend/API, sem superfície nova de UI).
- **Lição de processo desta sessão**: 3 dos 4 phase workers (fases 2, 3 e 4) pararam no meio dizendo "vou aguardar o teste em background terminar" sem de fato aguardar — precisaram de um `SendMessage` de cutucão pra retornar o resumo final com o resultado real. Prompts de fase futuros devem instruir explicitamente rodar o gate em **foreground bloqueante**, não background, e nunca devolver o resumo sem o exit code confirmado na mão.
- **Next step**: nenhum pendente para esta feature. Backlog restante da auditoria UX 2026-08: nenhuma fase D definida ainda — decisão do usuário sobre próximos achados a priorizar.
- **Blockers**: nenhum.
- **Branch**: `feat/fase-c-lgpd-seguranca-dado` (deletada após squash-merge). PR #82, merge commit `32fd518` em `main`.

- **Feature `paginacao-cursor-csp-nonce` — CONCLUÍDA** (issues #75-#76, Fase E — Infra/escala — de `docs/plano-correcao-achados-auditoria-2026-09.md`; usuário se referiu a elas como "Fase D" ao pedir, mas o plano as classifica como Fase E). Execução inline sem sub-agentes (2 issues, escopo Large mas bem delimitado pelo próprio audit doc). Branch `feat/75-76-paginacao-cursor-csp-nonce`, PR #84, squash-merged em `main` (`6f19f74`). Issues #75, #76 fechadas sozinhas via "Closes #N" no squash.
- **O que mudou**: (1) `src/lib/pagination.ts` (novo) — cursor opaco base64url; pacientes/faturas migram `offset`→`cursor` (domínio, Drizzle, in-memory, use case, rota); `nextCursor` viaja num campo `meta` novo e opcional do envelope HTTP (`{success, data, error, meta?}`) — `data` continua array, sem quebrar consumidores existentes; hook novo `useCursorPagedQuery` (mesma interface pública de `usePagedQuery`, que fica intacto — só a auditoria o usa, fora de escopo). Retornos (follow-ups) ficaram deliberadamente fora: sem listagem paginada de retornos na UI hoje, só widget de dashboard com teto fixo — decisão registrada em `spec.md` (YAGNI). (2) `src/proxy.ts` ganha `nextWithCsp()` — nonce novo por request, `Content-Security-Policy: script-src 'self' 'nonce-<v>' 'strict-dynamic'` sem `unsafe-inline`; `next.config.ts` não define mais CSP estática; `layout.tsx` ganha `export const dynamic = "force-dynamic"` (nonce só existe em HTML renderizado por request).
- **CodeRabbit no PR #84 — 8 achados acionáveis, todos triados** (commit `e3a9ed9`): 3 reais corrigidos — `style-src` sem `unsafe-inline` em dev bloquearia HMR/overlay do Next (doc oficial recomenda a exceção só em dev); predicado de continuação do cursor no in-memory (pacientes **e** faturas, o 2º não sinalizado explicitamente mas mesmo padrão) usava comparação UTF-16 (`>`/`<`) divergente do `localeCompare` do sort, podendo excluir itens com acento; `loadMore()` do hook sem guarda contra resposta atrasada/concorrente podia duplicar itens ou pisar num `refresh()` mais novo — resolvido com contador de geração de requisição. 1 comentário trivial corrigido (comentário dizia app "100% autenticado" pra justificar `force-dynamic`, mas `/login` é rota pública). 3 sugestões de precisão aplicadas no próprio `docs/agents/fix-audit-issues.md` (novo). 1 nitpick recusado com justificativa (e2e cobrindo nonce no HTML renderizado — comportamento documentado do Next, não lógica própria) — comentário de resposta no PR.
- **Sem Verifier de sub-agente dedicado** (execução inline, não passou por `tasks.md` formal do `tlc-spec-driven`) — gate local + CodeRabbit fizeram esse papel.
- **Gate final verde**: `npm run typecheck`, `npm run lint`, `npm run check:sv`, `npm run test:coverage` (2636/2636 testes, 96,78%/90,97%/96,76%/96,92% — piso 90%), `npm run test:e2e` (72 passed, 1 flaky pré-existente absorvido no retry, 0 falha real). Testes novos incluem keyset SQL contra Postgres real (pglite) percorrendo todas as páginas de pacientes/faturas sem duplicar nem pular.
- **Doc novo**: `docs/agents/fix-audit-issues.md` (linkado em `AGENTS.md`) — pipeline reutilizável pra próximas rodadas "corrija só as issues N e M de uma fase de auditoria". `docs/plano-evolucao-faseado.md` Fase 6 atualizada (paginação por cursor: backlog → entregue para pacientes/faturas).
- **Next step**: nenhum pendente para esta feature. Se surgir uma listagem paginada de retornos, aplicar o mesmo padrão de keyset já usado aqui.
- **Blockers**: nenhum.
- **Branch**: `feat/75-76-paginacao-cursor-csp-nonce` (deletada localmente após squash-merge). PR #84, merge commit `6f19f74` em `main`.

- **Feature `still-void-adocao-remanescente` — CONCLUÍDA** (issue #85, um dos "achados descartados deliberadamente" de `docs/plano-correcao-achados-auditoria-2026-09.md` — não tinha virado issue até esta sessão). Pipeline `tlc-spec-driven` escopo Medium, execução inline sem sub-agentes. Branch `fix/still-void-adocao-remanescente`, PR #95, squash-merged em `main` (`ee25ac7`). Issue #85 fechada sozinha via "Closes #85" no squash.
- **Contexto da sessão**: pedido original do usuário cobria TODOS os itens descartados da tabela (RLS Postgres, billing/ADR-001 Fase 3, TISS, 2FA, outbox/ETag/UoW, dark mode, 13 gaps do still-void, adoção Tabs/Tooltip/etc., dezenas de achados P1-P3 da auditoria UX). Escopo negociado via `AskUserQuestion`: grupos A/B/C/D (decisão de negócio/AD-003, pertence a outro repo, já resolvido, decisão de produto pendente) ficaram fora sem código; infra/backend (outbox/ETag/UoW) também ficou fora ("nenhuma dessas agora"); só a adoção still-void e os P1-P3 pontuais entraram em escopo. Dado o tamanho real (9 bundles de superfície + adoção, cada um do tamanho de uma Fase anterior), o usuário escolheu **criar as 10 issues de tracking agora, implementar só 1 bundle nesta sessão** — as outras 9 (#86-94, achados P1-P3 por superfície: Dashboard, Agenda, Prontuário, Procedimentos/Materiais, Faturamento/Relatórios, Profissionais/Parceiros, Auditoria/Configurações, Login/Portal, Documentos clínicos) ficam **abertas como backlog**, cada uma já com os achados extraídos do audit doc e instrução de restringir escopo no spec.md quando alguém pegar.
- **O que mudou** (só issue #85): `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` de `@still-void/ui/react/client` substituem o `TabButton` manual do prontuário (`role="tablist"`/`aria-selected`/teclado de graça via Radix; guarda de troca de aba do #66 preservada); `Tooltip` no selo PUSH/DET do dashboard (sigla sem legenda antes); `Prose` no termo de consentimento do portal (era `<pre>` monoespaçado 12px). `DropdownMenu` e `ThemeToggle`/`ThemeProvider` ficaram fora — sem consumidor real (YAGNI) e decisão de produto pendente (dark mode), respectivamente — decisão documentada em `spec.md`.
- **Achado de framework**: Radix `Tabs.Trigger` seleciona no `onMouseDown`, não `onClick` (`node_modules/@radix-ui/react-tabs/dist/index.mjs`) — 18 pontos de teste que simulavam clique de aba via `fireEvent.click` (2 arquivos: `staff-paciente-detail.test.tsx`, `staff-paciente-care-plans.test.tsx`) precisaram trocar pra `fireEvent.mouseDown`; `fireEvent.click` do RTL não sintetiza a sequência completa de mouse (só o evento `click`), então qualquer componente Radix que decida no `mousedown` engana esse padrão silenciosamente (tablist ficava com o primeiro item sempre selecionado, sem erro nenhum). Vale para qualquer adoção futura de Tabs/RovingFocusGroup do Radix nos testes.
- **CodeRabbit no PR #95 — 3 achados acionáveis, todos corrigidos** (commit `1973133`, após o push inicial): `TabsList` sem nome acessível (`aria-label="Seções do prontuário"` adicionado); selo PUSH/DET do dashboard não era focável por teclado nem tinha foco visível (`tabIndex={0}` + anel de foco `focus-visible:outline-*`; teste novo cobre abertura do tooltip por foco); `spec.md` AC4 descrevia `Prose` envolvendo o texto em `<Lead>`/parágrafo, mas a implementação passa `status.consentText` direto — spec corrigido pra bater com o código. Warning de docstring coverage (23%) ignorado por decisão de projeto (ver `[[coderabbit-docstring-coverage]]` na memória).
- **Sem CI de GitHub Actions no repo** — único gate automatizado do PR é o CodeRabbit (cota gratuita: 1 review/hora); a 2ª rodada de push (fixes) não gerou nova review automática por rate limit — merge feito com gate local 100% verde e os 3 achados já corrigidos/verificados manualmente, sem esperar a cota renovar (mesmo padrão já usado no PR #56).
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage` (145 testes nos 4 arquivos tocados, 96,78% stmts/90,93% branches/96,76% funcs/96,92% lines — piso 90%), `npm run build` (`--max-old-space-size=4096`, OK).
- **Next step**: issues #86-94 (achados P1-P3 pontuais por superfície da auditoria UX 2026-08) seguem abertas — próxima sessão que pegar uma delas deve restringir o escopo no próprio spec.md antes de implementar (cada issue já lista os achados verbatim do audit doc). Nenhum próximo passo pendente para #85.
- **Blockers**: nenhum.
- **Branch**: `fix/still-void-adocao-remanescente` (deletada remota e local após squash-merge, via `gh pr merge --delete-branch`). PR #95, merge commit `ee25ac7` em `main`.

- **Feature `dashboard-p1-p3-pontuais` — CONCLUÍDA** (issue #86, primeira das 9 issues de tracking #86-94 abertas na sessão anterior). Escopo Medium — spec direto, sem Design/Tasks formais, execução inline. Branch `fix/86-dashboard-p1-p3`, PR #96, squash-merged em `main` (`49fd3cd`). Issue #86 fechada via `Closes #86` no commit.
- **O que mudou**: (1) `TriageQueue` sai do card "Retornos pendentes" e vira faixa de largura total acima do grid de KPIs (hierarquia de heading corrigida); (2) `useApiQuery` de `/api/follow-ups` e `/api/supplies` passa a propagar `error`/`isLoading` — os 2 cards que antes mascaravam falha de API como "lista vazia" agora mostram `ErrorAlert`+retry ou `LoadingIndicator`; (3) chevron dos links "Ver agenda completa"/"Ver materiais" com `inline-flex items-center gap-1 whitespace-nowrap`; (4) os 4 KPIs viram `Link` navegável (sem filtro por querystring — `/faturamento` não suporta, decisão YAGNI documentada no spec); (5) grid de 2 colunas ativa em `lg` (1024px) em vez de `xl`; (6) `EmptyState` (`src/components/feedback.tsx`, compartilhado) ganha props opcionais `icon`/`action`, aditivo; (7) `Hero` de landing page trocado por `<h1 className="sv-display ...">Dashboard</h1>`, igual às outras páginas do staff. `DashboardPage` extraiu `FollowUpsCard`/`LowStockCard` como componentes próprios pra manter `complexity` ≤10 do ESLint.
- **CodeRabbit não revisou** — cota diária esgotada antes da primeira review automática no PR #96; usuário instruiu seguir com o merge sem esperar (mesmo padrão dos PRs #56/#95), gate local 100% verde.
- **Achado de e2e**: `e2e/auth.spec.ts` → "acessa o dashboard sem login quando a autenticação não está configurada" falha no baseline `main` (confirmado via `git stash` antes de implementar) — pré-existente, não é regressão desta feature. Não investigado a fundo (fora do escopo desta issue); candidato a issue própria se voltar a incomodar.
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2655/2655 testes, 96,78%/90,93%/96,76%/96,92% — piso 90%), `npm run test:e2e` (auth/followup/sidebar-responsive/triagem, 20/21 — 1 falha pré-existente documentada acima).
- **Next step**: seguir sequencialmente pras issues #87-94, 1 PR por issue (decisão do usuário via `AskUserQuestion` no início da sessão) — mesmo pipeline de `docs/agents/fix-audit-issues.md`. CodeRabbit provavelmente segue sem cota pro resto da sessão — não bloquear merge por causa disso, seguir o precedente desta issue.
- **Blockers**: nenhum.
- **Branch**: `fix/86-dashboard-p1-p3` (deletada remota e local após squash-merge). PR #96, merge commit `49fd3cd` em `main`.

- **Feature `agenda-p1-p3-pontuais` — CONCLUÍDA** (issue #87, segunda das 9 issues de tracking #86-94). Escopo Medium, execução inline. Branch `fix/87-agenda-p1-p3`, PR #97, squash-merged em `main` (`50fe943`). Issue #87 fechada via `Closes #87` no commit.
- **O que mudou**: (1) `calendar-grid.tsx` marca dia passado ou fora de `ScheduleConfig.weekdays` com `aria-disabled` e bloqueia `onDayClick`; (2) `AppointmentForm` busca `/api/settings/schedule` real em vez de `BUSINESS_HOURS` (constante de build que podia divergir de `/configuracoes`); (3) legenda de status + `EmptyState` (mês sem consulta) na grade; (4) `monthLabel` corrige capitalização (só 1ª letra — a classe Tailwind `capitalize` maiusculizava "De" também) e `ProfessionalFilter` ganha `max-w-56`; (5) `ErrorAlert` (`src/components/feedback.tsx`) ganha prop opcional `variant` (`"danger" | "warning"`, default `danger`, aditivo) — erro 409 usa `warning`; (6) célula do dia limita a 3 consultas + "+N mais"; (7) aviso de série pulada ganha botão "Dispensar" via prop `action` do `Alert`. `DashboardPage`-style extração de função de módulo (`resolveScheduleConfig`, `resolveSubmitError`) usada de novo pra manter `complexity` ≤10 do ESLint.
- **Decisão de escopo herdada, não nova**: P0-1..P0-4 desta superfície (navegação pós-criação, `SlotPicker`/prevenção real, grade por teclado, mobile) seguem fora — a própria issue #87 notava que nenhuma Fase os cobre, mas a decisão de escopo (só P1-P3 nas 9 issues #86-94) já tinha sido tomada na sessão da feature `still-void-adocao-remanescente`, então não reabri a pergunta.
- **Achado de teste**: 2 testes fixos de `CalendarGrid` (mês fixo julho/2026) quebraram com a feature nova de "dia inválido" porque o mês virou passado em relação à data real de execução — corrigido com `vi.useFakeTimers()`/`vi.setSystemTime()` pinando "hoje" dentro do próprio mês fixo. Qualquer teste futuro de `CalendarGrid` com mês hardcoded precisa do mesmo cuidado, ou vai quebrar quando o calendário real passar daquele mês.
- **CodeRabbit sem cota diária** (usuário confirmou fora da sessão) — merge feito direto após gate local 100% verde, sem esperar review automática, mesmo padrão dos PRs #56/#95/#96.
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2665/2665 testes, 96,8%/90,96%/96,77%/96,94% — piso 90%), `npm run test:e2e` (`agenda.spec.ts` + `followup.spec.ts`, 10/10).
- **Next step**: seguir sequencialmente pras issues #88-94. CodeRabbit deve continuar sem cota pro resto da sessão — não bloquear merge por causa disso.
- **Blockers**: nenhum.
- **Branch**: `fix/87-agenda-p1-p3` (deletada remota e local após squash-merge). PR #97, merge commit `50fe943` em `main`.

- **Feature `prontuario-p1-p3-pontuais` — CONCLUÍDA** (issue #88, terceira das 9 issues #86-94 — "superfície de maior risco clínico" da auditoria). Maior das 3 até agora: 13 ACs entre lista de pacientes e prontuário. Escopo Medium/Large tratado como execução direta (sem `tasks.md` formal), igual às anteriores. Branch `fix/88-prontuario-p1-p3`, PR #98, squash-merged em `main` (`caf0c91`). Issue #88 fechada via `Closes #88`.
- **O que mudou**: (1) lista de pacientes — "Prontuário" `font-semibold`, ações viram `Button ghost/sm`; `useCursorPagedQuery` ganha `isLoading` (mesmo padrão settledKey de `useApiQuery`), tabela `aria-busy`+dimmed durante nova busca sem apagar a lista antiga; linha inativa troca `opacity-50` por `bg-surface-2/60` (preserva contraste); empty state distingue base vazia de busca sem resultado; (2) prontuário — contador de aba só conta `status === "active"`; SOAP em blocos rotulados, campo vazio mostra "— não preenchido —"; tira de fotos usa a mesma ordem cronológica do par de comparação acima (antes corria ao contrário); dor ≥7 e complicações ganham `font-semibold text-danger`; formulário de avaliação vira responsivo (`grid-cols-1 sm:grid-cols-*`); lista de evoluções limita a 10 + "Ver mais"; aba endereçável por `?aba=` via `router.replace`; aba "Pacotes" ganha `ml-auto`.
- **SPEC_DEVIATION real**: PRONT-07 (toast na criação de condição) — a leitura pré-spec sugeriu que faltava, mas na hora de implementar já existia no código (`conditions-section.tsx`); as outras 6+ escritas do prontuário também já tinham toast. Achado do audit doc não reproduziu — nenhuma mudança de código nessa AC, só documentação no spec. **Lição**: verificar comportamento no código no momento de implementar, não só na leitura inicial de escopo — o código pode ter mudado entre as duas.
- **Decisões de escopo (Out of Scope documentado)**: R9 (`HealingChart` com escalas separadas — o audit doc já trata como task própria T13, rework de gráfico); R11 (aba "Resumo" somente-leitura — é tela nova, não ajuste); R12 (seletor de profissional assinando por outro — não estava na lista de achados da issue #88, não expandido).
- **Achado de teste real**: 2 arquivos de teste (`staff-paciente-detail.test.tsx`, `staff-paciente-care-plans.test.tsx`) quebraram com "invariant expected app router to be mounted" — `useRouter`/`useSearchParams` novos em `page.tsx` exigem mock de `next/navigation`, que esses arquivos não tinham (outros como `staff-agenda.test.tsx` já tinham o padrão `vi.hoisted` + `vi.mock`). Corrigido replicando o padrão já usado em `tests/pages/login.test.tsx`.
- **Achado de e2e pré-existente (não é regressão)**: `e2e/pacientes.spec.ts` → "abre o prontuário do paciente" falha no baseline `main` (confirmado via `git stash`) — o teste espera `getByRole("button", {name:"Anamnese"})`, mas a migração pra `Tabs` do Radix na issue #85 já mudou a role real pra `"tab"`; ninguém atualizou esse e2e na época. Candidato a issue própria de manutenção de e2e (2ª falha pré-existente documentada nesta rodada de 9 issues, depois da de `auth.spec.ts` no #86).
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96/#97.
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2681/2681 testes, 96,81%/91,02%/96,79%/96,95% — piso 90%), `npm run test:e2e` (`pacientes.spec.ts` + `portal-paciente.spec.ts`, 6/7 — 1 falha pré-existente documentada acima).
- **Next step**: seguir sequencialmente pras issues #89-94.
- **Blockers**: nenhum.
- **Branch**: `fix/88-prontuario-p1-p3` (deletada remota e local após squash-merge). PR #98, merge commit `caf0c91` em `main`.

- **Feature `catalogo-p0-p3-pontuais` — CONCLUÍDA** (issue #89, quarta das 9 issues #86-94 — Procedimentos e Materiais). **Diferente de #86-88**: nenhuma Fase anterior tinha coberto esta superfície, então os P0 listados na issue nunca foram corrigidos — decisão do usuário via `AskUserQuestion` (3 opções: só P1-P3 / P0 pequenos caso a caso / todos os P0) foi **incluir todos os P0**. Escopo tratado como execução direta (sem `tasks.md` formal). Branch `fix/89-catalogo-p0-p3`, PR #99, squash-merged em `main` (`61e81f8`). Issue #89 fechada via `Closes #89`.
- **O que mudou — domínio**: (1) `Supply.isLowStock` passa a exigir `minQty > 0` — sem isso, todo insumo recém-criado (`stockQty`/`minQty` default 0) nascia "estoque baixo" (`0 <= 0`); (2) `Supply.isOutOfStock` novo (`stockQty === 0`) escala a severidade visual acima de "baixo" quando `isLowStock` já é `true` — badge "Sem estoque" com token `out_of_stock` novo em `status-badge.tsx` (`var(--sv-danger-ink)`, nenhum status existente mapeava pra vermelho); (3) `ProcedureKitRepository.countByProcedure()` (Drizzle: `GROUP BY procedureId` + `count(*)`; in-memory: reduce) — `ProcedureDto` ganha `kitItemCount`, `GET /api/procedures` faz `Promise.all` das duas queries.
- **O que mudou — Procedimentos**: Kit/Editar/Desativar/Reativar viram `Button ghost/sm`; botão "Kit" mostra "Kit (N)" ou "Sem kit"; `KitForm` filtra do `<select>` de cada linha os insumos já escolhidos nas outras linhas do mesmo kit (domínio já rejeitava duplicata via `validateKitItems`, UI não impedia escolher); quantidade inválida bloqueia o salvar com erro inline em vez de coagir `|| 1` silenciosamente; busca client-side por nome + contagem; prefixo "R$" visual (sem máscara de vírgula — `Input` não tem slot de prefixo no catálogo, gap conhecido).
- **O que mudou — Materiais**: `LowStockBanner` lista nome de cada insumo + botão "repor" (aria-label `Repor <nome>`) que abre `MovementForm` daquele insumo direto; campo quantidade de saída ganha `max={stockQty}` + bloqueio inline se exceder o saldo, sem chamar a API; `MovementForm` inteiro passou a exigir `ConfirmAction` antes do POST (form não submete mais no Enter, só previne o reload); histórico troca `bg-warning-soft text-warning` por `bg-surface-2 text-ink-2` pra saída (uso normal não é alerta) e limita a 10 registros com "Ver mais"; coluna "Previsão" mostra "Erro ao calcular" (ícone + `title`) quando `/api/supplies/insights` falha, distinto de "—" (sem consumo); Movimentar/Histórico/Editar viram `Button ghost/sm`; busca + contagem.
- **SPEC_DEVIATION real**: pluralização "0 unidade"/"N unidades" (achado P2) foi implementada e depois **revertida** — quebrava um teste pré-existente que documentava `{stockQty} {unit}` cru como comportamento intencional ("2 un"). Sem decisão de produto sobre fechar o vocabulário de `unit` (hoje texto livre — "un"/"und"/"Unidade" convivem no mesmo catálogo), pluralizar só a abreviação "un" seria inconsistente. Revertido, documentado no spec como achado não corrigido nesta rodada.
- **Achado de teste real**: `LowStockBanner` mostrando o nome do insumo como texto do próprio botão "repor" colidia com `screen.getByText(nome)` em praticamente todo teste de `staff-materiais.test.tsx` (o insumo padrão da suíte É o de estoque baixo) — corrigido separando nome (texto plano) de um botão "repor" menor com `aria-label` próprio, em vez do nome inteiro ser o botão.
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2702/2702 testes, 96,82%/91,12%/96,79%/96,96% — piso 90%), `npm run test:e2e` completo (86 testes, 69 passed, 17 falhas — todas em `clinico.spec.ts`/`auth.spec.ts`/`auditoria.spec.ts`, nenhuma toca procedimentos/materiais).
- **Achado de e2e pré-existente, blast radius maior que o já documentado**: a suíte completa (não só specs isolados) revelou que a causa raiz "abas do prontuário viraram `role=tab`, e2e ainda espera `role=button`" (já achada em #86/#88) afeta muito mais `clinico.spec.ts` do que o suspeitado — 5 testes únicos × retries = maior parte das 17 falhas. Vale a pena virar issue própria de manutenção de e2e (atualizar os helpers `getByRole("button", ...)` → `getByRole("tab", ...)` nos specs que abrem o prontuário) antes de rodar a suíte completa de novo.
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96/#97/#98.
- **Next step**: seguir sequencialmente pras issues #90-94. Considerar abrir issue de manutenção pro e2e (`role=tab` vs `role=button` nas abas do prontuário) quando o usuário priorizar.
- **Blockers**: nenhum.
- **Branch**: `fix/89-catalogo-p0-p3` (deletada remota e local após squash-merge). PR #99, merge commit `61e81f8` em `main`.

- **Feature `financeiro-p0-p3-pontuais` — CONCLUÍDA** (issue #90, quinta das 9 issues #86-94 — Faturamento e Relatórios). Verificado no código antes do spec: 2 dos 3 P0 da issue já estavam resolvidos (cancelamento de fatura já tinha `ConfirmAction`; mobile já tinha `overflow-x-auto` da Fase A) — só o P0 real de Relatórios (skeleton infinito no erro) precisava de correção. Branch `fix/90-financeiro-p0-p3`, PR #100, squash-merged em `main` (`ab94411`). Issue #90 fechada via `Closes #90`.
- **O que mudou — Relatórios**: (1) `error` de `/api/reports` agora renderiza `ErrorAlert` **antes** do guard `!report`, corrigindo o skeleton infinito (P0 real); (2) `<input type="month">` nativo removido — mês vira texto pt-BR ("Agosto de 2026", mesma correção de capitalização de `/agenda`) + botões ‹›/`Button` navegando por `shiftMonth`; (3) taxa de falta usa `formatPercent` (`Intl.NumberFormat` pt-BR, novo em `format.ts`) — vírgula decimal; (4) delta percentual vs. mês anterior nos 3 `MetricCard` numéricos — busca `/api/reports?month=<mês-1>` em paralelo, `computeDelta` retorna `undefined` quando `previous` é 0 (sem base de comparação, evita divisão por zero); (5) "Produção por profissional" (antes sumia inteira se vazia) e "Consultas por status" (antes só uma lista vazia) ganham `EmptyState`, mesma convenção das outras seções; (6) `TableFooter` com linha de total nas 2 tabelas.
- **O que mudou — Faturamento**: coluna Valor ganha `text-right tabular-nums`; filtros de status ganham `role="group"` + `aria-pressed`; célula de Ações mostra "—" em faturas pagas/canceladas.
- **Compartilhado**: `MetricCard` extraído pra `src/components/metric-card.tsx` (fecha o P3 "duplicado, já divergindo") — `BillingSummaryCards` e `ReportKpis` (novo subcomponente, extraído também por complexity do ESLint) usam o mesmo componente, com `delta` como prop nova opcional.
- **Achado de e2e real (regressão própria, corrigida na mesma sessão)**: `e2e/relatorios.spec.ts` tinha um helper `setReportMonth` inteiro construído em torno de `input[type="month"]` (com comentário longo explicando um workaround de React value-tracker) — removido pela mudança REL-02. Reescrito pra navegar clicando os botões ‹›/`Próximo mês`/`Mês anterior` a quantidade de meses de diferença, com `waitForResponse` por mês intermediário (não só o final, porque agora cada render dispara 2 fetches — mês atual + mês anterior pro delta — e uma correspondência "qualquer resposta de `/api/reports`" arriscava resolver no fetch errado).
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2708/2708 testes, 96,79%/91,1%/96,73%/96,96% — piso 90%), `npm run test:e2e` (`faturamento.spec.ts` + `relatorios.spec.ts`, 7/7).
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96-#99.
- **Next step**: seguir sequencialmente pras issues #91-94.
- **Blockers**: nenhum.
- **Branch**: `fix/90-financeiro-p0-p3` (deletada remota e local após squash-merge). PR #100, merge commit `ab94411` em `main`.

- **Feature `diretorios-p0-p3-pontuais` — CONCLUÍDA** (issue #91, sexta das 9 issues #86-94 — Profissionais e Parceiros). Verificado no código antes do spec: 3 dos 8 P0/P1 da issue já estavam resolvidos (`ConfirmAction` em Desativar nas duas páginas; toast pós-save; `overflow-x-auto` nas tabelas da Fase A). Branch `fix/91-diretorios-p0-p3`, PR #101, squash-merged em `main` (`632e7ad`). Issue #91 fechada via `Closes #91`.
- **O que mudou — Profissionais**: (1) `POST /api/professionals` passa a aceitar `commissionPct` — só o `PATCH` aceitava antes, então a coluna "Repasse" do relatório gerencial nascia morta pra todo profissional criado pela UI (P0 real, domínio e PATCH já suportavam, só faltava o create); (2) `ProfessionalForm` ganha campo "Repasse (%)" + tabela ganha coluna "Repasse"; (3) Editar/Desativar/Reativar viram `Button ghost/sm`; (4) linha inativa troca `opacity-50` por `bg-surface-2/60` (mesmo padrão de #88); (5) hint do registro vira texto persistente abaixo do input, não só `placeholder`.
- **O que mudou — Parceiros**: (1) `POST`/`PUT /api/partners` ganham `.email("Email inválido")` no schema zod — antes `z.string().min(1).max(200)` sem validação de formato, e o email É a credencial de login do portal do parceiro (P0 real, risco operacional: typo silencioso trava o primeiro acesso); (2) modal ganha `grid-cols-1 sm:grid-cols-2` no Telefone/CRM (P0 mobile do *modal*, distinto do P0 da tabela já resolvido pela Fase A); (3) `ConfirmAction` de Desativar ganha frase explicando que pacientes indicados podem perder a referência; (4) H1 muda de "Médicos parceiros" para "Parceiros" (menu e empty state já diziam "Parceiros"/"parceiro" — unifica pro nome majoritário); (5) email/telefone da tabela viram `mailto:`/`tel:`; (6) composição de erro (`actionError ?? error ?? ""`) alinhada ao padrão já usado em `ProfessionalsPage`, sem o cast `as string` que havia em `PartnersPage`.
- **Achado de teste real**: `type="email"` no `<Input>` de Parceiro faz o jsdom bloquear o `fireEvent.click` no botão de submit antes do handler React rodar (validação nativa do browser) — o teste de "email inválido rejeitado pelo servidor" precisou trocar `fireEvent.click` no botão por `fireEvent.submit` direto no `<form>`, que dispara o evento sem passar pelo algoritmo de submissão nativo. Vale para qualquer teste futuro que precise forçar um valor client-side "inválido" através de um campo `type="email"`/`type="url"`/etc.
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2722/2722 testes, 96,79%/91,09%/96,73%/96,96% — piso 90%). Sem e2e dedicado a `/profissionais`/`/parceiros` — `e2e/support/api.ts` (`createPartner`/`createProfessional`) já usa email/dados válidos, sem risco de regressão nos specs que dependem delas.
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96-#100.
- **Next step**: seguir sequencialmente pras issues #92-94.
- **Blockers**: nenhum.
- **Branch**: `fix/91-diretorios-p0-p3` (deletada remota e local após squash-merge). PR #101, merge commit `632e7ad` em `main`.

- **Feature `admin-p0-p3-pontuais` — CONCLUÍDA** (issue #92, sétima das 9 issues #86-94 — Auditoria e Configurações). Verificado no código antes do spec: 4 dos achados já estavam resolvidos (P0-1 trilha não identifica pessoas — `actorId` já vem de `Session` real desde a autenticação nativa ADR-004; P0-10 dados da clínica — Fase B; confirmação em Desativar conta já existe via `ConfirmAction`; P2-17 sucesso sem anúncio — todo `useToast()` já anuncia). Branch `fix/92-admin-p0-p3`, PR #102, squash-merged em `main` (`a46d8a6`). Issue #92 fechada via `Closes #92`.
- **O que mudou — Auditoria**: (1) `ACTION_LABELS`/`RESOURCE_LABELS` expandidos pra cobrir todos os valores reais de `resourceType`/`action` emitidos no código (levantados por grep), incluindo os 2 novos (`professional`, `account`) introduzidos por este mesmo spec; (2) `usePagedQuery` ganha `isLoading` (mesmo padrão `settledKey` já usado em `useApiQuery`/`useCursorPagedQuery`) — tabela fica `aria-busy` + esmaecida durante refetch, sem apagar a lista anterior (achado real: trocar o filtro de paciente mostrava por um instante a lista do paciente anterior); (3) filtro de período (De/Até, `<Input type="date">` do still-void) somado ao filtro de paciente, convertido pro `Date.toISOString()` que a API espera (`z.iso.datetime()` em `/api/audit`, não aceita `YYYY-MM-DD` cru); (4) timestamp da trilha ganha segundos via formatter local `formatDateTimeWithSeconds` — decisão do spec de não tocar `formatDateTime` compartilhado, usado por outras páginas com granularidade diferente; (5) select de paciente ganha `aria-label="Filtrar por paciente"`.
- **O que mudou — cobertura de auditoria**: `POST /api/professionals` e `POST /api/accounts` passam a chamar `recordAudit` (`action: "create"`, `resourceType: "professional"`/`"account"`) — únicos 2 gaps reais confirmados por grep (`patients`/`settings/*`/`auth/*` já auditavam desde a Fase C).
- **O que mudou — Configurações**: (1) `ScheduleSection` destructura `refresh` de `useApiQuery` e chama após `PUT /api/settings/schedule` ter sucesso — corrige o bug real de mensagens contraditórias ("Grade salva" ficava ao lado de "(usando padrão — nada salvo ainda)" porque `isDefault` nunca recarregava); (2) validação client-side dos 3 campos numéricos da grade (`startHour < endHour`; `minGapMinutes` 15-120), espelhando as faixas de `validateScheduleConfig` do domínio sem duplicar a mensagem exata — bloqueia o salvar com erro inline, sem chamar a API; (3) `AccountRow` troca `opacity-50` por `bg-surface-2/60` na linha de conta inativa (mesmo padrão de contraste já usado em `/pacientes`, `/procedimentos`, `/materiais`, `/profissionais`, `/parceiros`).
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (arquivos alterados, exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (96,81%/91,1%/96,73%/96,97% — piso 90%), `tests/pages/staff-operations.test.tsx` (83/83, incluindo os novos cenários AUD-03/04/05/06 e CFG-01/02/03).
- **Achado de e2e pré-existente, não corrigido nesta rodada**: `e2e/auditoria.spec.ts` — "filtro por paciente esconde eventos de outros pacientes" falha por *strict mode violation* (2 células com o mesmo nome de paciente resolvidas pelo Playwright), confirmado via `git stash` que já falha na baseline `main`, sem relação com as mudanças desta issue.
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96-#101.
- **Next step**: seguir sequencialmente pras issues #93 (Login e Portal) e #94 (Documentos clínicos). Para #93, reverificar no código atual a menção do achado de "senha master" no `docs/audits/auditoria-ux-2026-08.md` §8 antes de escrever o spec — pode estar obsoleta, já que ADR-004/autenticação nativa removeu completamente a senha master.
- **Blockers**: nenhum.
- **Branch**: `fix/92-admin-p0-p3` (deletada remota e local após squash-merge). PR #102, merge commit `a46d8a6` em `main`.

- **Feature `login-portal-p0-p3-pontuais` — CONCLUÍDA** (issue #93, oitava das 9 issues #86-94 — Login e Portal). A issue presumia que só restavam P0s de UX de agendamento/sessão sem issue própria + P1-P3, mas a verificação de código antes do spec achou 2 divergências reais: (1) `/login` já foi reescrito (provavelmente na migração pra autenticação nativa, ADR-004) — sem senha master, sem botão Google, sem o subtítulo "Acesso restrito à equipe", então 4 dos 7 achados de Login já estavam resolvidos; (2) **o vazamento de notas clínicas NÃO foi totalmente resolvido pela Fase C** — `PortalAssessmentDto` removia `notes` mas mantinha `complications` como texto livre, vazando pro paciente e pro parceiro o exato exemplo citado no audit doc ("suspeita de recidiva, encaminhar oncologia"). Tratado como P0 real, não como já resolvido — mesmo padrão de "incluir P0 genuinamente não resolvido" já usado em #89. Branch `fix/93-login-portal`, PR #103, squash-merged em `main` (`2671bc7`). Issue #93 fechada via `Closes #93`.
- **O que mudou — Login**: `autoComplete`/`name` nos campos de email/senha; `?error=` passa a resolver por um allowlist (`LOGIN_ERROR_MESSAGES`) com fallback genérico — nunca mais renderiza o texto bruto da URL (vetor de phishing por texto refletido, mesmo sem XSS); `CardSkeleton` enquanto `/api/auth/providers` carrega; `<main>` + `login/layout.tsx` novo com `<title>` de rota.
- **O que mudou — cobertura de auditoria/vazamento**: `PortalAssessmentDto` (`src/lib/dto.ts`) perde o campo `complications` (igual já tinha acontecido com `notes` em #69) — `ConditionProgress`/`describeAssessment` retipados pro DTO já filtrado do portal, não mais pro DTO completo do staff (`AssessmentDto`); `HealingChart` ganha uma interface `ChartAssessment` estrutural (só os campos numéricos que o gráfico usa), pra não depender do DTO mais amplo por acidente.
- **O que mudou — Portal, sessão/agendamento**: `/portal` mostra tela dedicada ("Sua sessão expirou" + link "Entrar") em vez de repetir `"Não autenticado"`/`"Rota exclusiva do portal..."` cru sem ação nenhuma; tocar um horário em `ScheduleReturn` abre `ConfirmAction` antes do POST, e o botão do horário volta ao tamanho `sm` padrão (36px) — antes tinha um `h-7` (28px) reduzindo o alvo de toque abaixo do próprio padrão do design system.
- **O que mudou — Portal, consentimento/urgência**: card de consentimento aceito ganha botão "Revogar consentimento" (`ConfirmAction` + `POST /api/portal/patient/consent/revoke`, endpoint que já existia sem nenhuma UI que o chamasse); `PortalLayout` ganha um `Alert` fixo de orientação de urgência (texto estático — sem telefone dinâmico porque `ClinicInfoDto` não tem esse campo hoje).
- **O que mudou — Portal, achados restantes**: envio de foto vira 2 passos — escolher o arquivo só monta uma prévia (`URL.createObjectURL`) com "Enviar"/"Cancelar" explícitos, não dispara mais no `onChange`; painel de agendamento ganha texto explicando a janela de 14 dias e perde os overrides `text-xs`/`h-8` que reduziam a fonte dos campos pra 12px; legenda do gráfico de evolução troca "score PUSH/DET" por "gravidade clínica"; consulta futura cancelada pela clínica sai de "Histórico" (onde ficava enterrada, abaixo da evolução clínica) e vira um `Alert` destacado logo no topo; sanfona do parceiro ganha `aria-expanded`; galeria de fotos de condição começa borrada (`blur-md`), revela ao clicar num `Button` que envolve a imagem; faturas ganham legenda "Pagamento realizado presencialmente na clínica"; `EmptyState` do portal usa ícone contextual por seção (`pending`/`info`/`check-circle`, união `IconName` do still-void é curta — sem ícone de calendário/fatura dedicado).
- **Fora de escopo, registrado no spec com motivo**: paciente desmarcar a própria consulta (exige endpoint novo + regra de negócio — janela de corte, notificar a clínica); pré-seleção de procedimento antes de mostrar horários (exige decisão de produto — `FollowUp` não carrega `procedureId` hoje); versão do termo de consentimento LGPD (exige campo novo no domínio + migração — a lacuna mais urgente, revogar, foi resolvida ligando o endpoint já existente).
- **Achado de teste real**: 3 testes de `tests/pages/portal.test.tsx` (fluxo de agendar horário, mensagem de erro ao agendar, envio de foto) e a mesma quantidade de asserções em outros 2 (login com `?error=` cru, avaliação com `complications`/`notes`) codificavam o comportamento antigo (inseguro/vazando) como esperado — todos reescritos pra afirmar o comportamento novo, não só "consertados pra passar".
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (166 arquivos, 2729/2729 testes, 96,55%/90,89%/96,58%/96,74% — piso 90%), `e2e/portal-paciente.spec.ts` + `e2e/portal-parceiro.spec.ts` (3/3, fluxo de foto reescrito pro passo de confirmação).
- **Achado de e2e pré-existente, não corrigido nesta rodada**: `e2e/auth.spec.ts` "acessa o dashboard sem login quando a autenticação não está configurada" — confirmado via `git stash` que já falha na baseline `main`, mesma flake já documentada em #86.
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96-#102.
- **Next step**: seguir pra issue #94 (Documentos clínicos, achados pontuais) — última das 9.
- **Blockers**: nenhum.
- **Branch**: `fix/93-login-portal` (deletada remota e local após squash-merge). PR #103, merge commit `2671bc7` em `main`.

- **Feature `documentos-clinicos-pontuais` — CONCLUÍDA** (issue #94, nona e última das 9 issues #86-94 — Documentos clínicos: atestado, consentimento, plano de cuidados, relatório). Verificado no código antes do spec: 2 dos 8 P0 já estavam resolvidos, melhor do que a issue presumia — atestado já bloqueava consulta cancelada/faltou; 3 dos 4 documentos (atestado/plano/relatório) já tinham a guarda `isClinicInfoComplete`, só o consentimento não. Branch `fix/94-documentos-clinicos`, PR #104, squash-merged em `main` (`ab62ecc`). Issue #94 fechada via `Closes #94`.
- **Escopo deliberadamente reduzido vs. a auditoria**: a auditoria recomenda uma família de 11 tasks (gramática de documento genérica — `DocumentMeta`/`DocumentSection`/`DocumentTable`/`DocumentEmpty`/`SignatureLine` em `src/components/document/` — guarda `assertPrintable`, `@page` com numeração real). Nada disso foi construído — cada achado real foi corrigido direto na página correspondente, mesmo padrão de #86-93. Numeração de página real ficou fora porque Chrome/Firefox não implementam margin boxes de `@page` em impressão de navegador (só ferramentas dedicadas de geração de PDF no servidor resolveriam, o que trocaria a estratégia de impressão do zero).
- **O que mudou — emissão persistida (infra nova, DOC-01)**: `POST /api/documents/issue` reaproveita a trilha de auditoria já existente — `AuditEventFilter` ganhou `resourceType`/`resourceId` (Drizzle + in-memory), e a rota cria (ou reaproveita, se já existir pra aquele `documentType`+`resourceId`) um `AuditEvent` com `resourceType: documentType`; `documentNumber` deriva de `id.slice(0,8)` prefixado (`ATST-`/`TCLE-`/`PLAN-`/`REL-`). Reimprimir o mesmo documento devolve o mesmo número/data — corrige o achado mais grave da issue ("a data do documento é `new Date()` no render, reimprimir em 2027 produz documento indistinguível do original"). `DocumentFrame` (moldura compartilhada dos 4 documentos) passa a exigir `documentNumber`/`issuedAt` como props obrigatórias — nenhuma página consegue mais renderizar sem emissão persistida, por construção de tipo. Novo hook `useDocumentIssuance` chama a rota uma vez por `documentType`+`resourceId` montado; toda página espera a resposta antes de renderizar o `DocumentFrame`.
- **O que mudou — consentimento (a maior concentração de achados)**: (1) ganhou a guarda de clínica completa que faltava (DOC-02); (2) `DocumentFrame` reordena o fecho — data → assinatura do paciente (+ linha em branco pra nome/CPF de responsável legal) → assinatura do profissional, corrigindo a ordem trocada que quebrava a semântica de um TCLE (DOC-03/DOC-08); (3) autorização de imagem virou um segundo bloco de aceite com sua própria linha de assinatura, separado do consentimento do procedimento — LGPD exige opt-in específico e revogável independentemente (DOC-09); (4) rodapé ganha `CONSENT_TEMPLATE_VERSION` (constante no código, sem persistência — documentado como decisão proporcional) + nota de "duas vias" (DOC-10).
- **O que mudou — plano de cuidados e relatório (guarda de vazio)**: ambos bloqueiam a impressão quando não têm conteúdo nenhum (plano: diagnósticos+resultados+intervenções todos vazios; relatório: zero avaliações) — antes saíam como folha timbrada assinável em branco, sem nenhuma guarda (DOC-04/DOC-05). Relatório também para de imprimir "Paciente: —" numa falha/espera de busca — agora espera o paciente resolver antes de renderizar o `DocumentFrame`, mesmo padrão das outras guardas de carregamento (DOC-06). Plano passa a assinar com o profissional que prescreveu (`professionalId` já existia no domínio, só não era usado aqui — busca via `/api/professionals/{id}` e sobrescreve a assinatura genérica da clínica via novo prop `signerOverride` do `DocumentFrame`) (DOC-11); tabela NOC ganha "(escala 1-5)" nos cabeçalhos (DOC-12); bordas trocam `border-black/30` por `border-black/60`, mais visíveis em laser P&B (DOC-13).
- **O que mudou — gráfico monocromático (relatório, DOC-07)**: `HealingChart` (componente compartilhado com o portal, editado por #93) ganha `.healing-chart__score-line` (pontilhado) — a série de dor já era tracejada desde antes, só a de score/área eram indistinguíveis sem cor. Marcador do score virou quadrado (`<rect>`), a área continua círculo — reforça a diferenciação por forma. Legenda do gráfico (já ajustada em #93 pra remover nome de token) ganhou o texto "gravidade clínica" no lugar de "score PUSH/DET" no relatório impresso especificamente via `print:grayscale` no wrapper.
- **Achado real de teste**: 3 dos testes existentes em `tests/pages/documentos-fail-closed.test.tsx` ("clínica completa, renderiza normalmente" pro plano e pro relatório, e "clínica incompleta, consentimento renderiza normalmente") tinham fixtures/expectativas que codificavam o comportamento antigo — plano/relatório com fixture vazia (agora bloqueiam por DOC-04/05) e consentimento presumindo que a guarda de clínica não se aplicava a ele (agora se aplica, DOC-02). Todos os 3 reescritos pra afirmar o comportamento novo; a suíte ganhou 10 testes novos cobrindo cada AC (idempotência da emissão em `tests/api/documents-issue.test.ts`, ordem do fecho, linha de responsável legal, autorização de imagem separada, versão/duas vias, assinatura do profissional do plano, escala NOC, guardas de vazio, traço/marcador do gráfico).
- **Gate final verde**: `npm run typecheck`, `npx eslint .` (exit 0), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (167 arquivos, 2750/2750 testes, 96,54%/90,76%/96,56%/96,75% — piso 90%), `e2e/documentos.spec.ts` (5/5).
- **CodeRabbit sem cota diária** (confirmado pelo usuário fora da sessão) — merge direto após gate local 100% verde, mesmo padrão de #96-#103.
- **Sequência #86-94 CONCLUÍDA** — as 9 issues da auditoria UX 2026-08 (`docs/audits/auditoria-ux-2026-08.md`) especificadas e implementadas nesta sessão, uma PR por issue, todas fechadas via `Closes #NN`: #86 Dashboard (PR #96), #87 Agenda (PR #97), #88 Prontuário (PR #98), #89 Procedimentos e Materiais (PR #99), #90 Faturamento e Relatórios (PR #100), #91 Profissionais e Parceiros (PR #101), #92 Auditoria e Configurações (PR #102), #93 Login e Portal (PR #103), #94 Documentos clínicos (PR #104).
- **Candidatos a issue futura, identificados mas não corrigidos nesta sequência** (registrados aqui pra não se perder): (1) manutenção de e2e — vários specs ainda esperam `role="button"` nas abas do prontuário, que viraram `role="tab"` desde a migração still-void da issue #85 (achado em #86/#88/#89, blast radius maior em `clinico.spec.ts`); (2) o mesmo padrão de `e2e/auth.spec.ts` "acessa o dashboard sem login..." falhando por flakiness de infra, não por código (achado desde #86, confirmado repetidas vezes via `git stash` que já falha na baseline `main`); (3) a gramática de documento genérica + `assertPrintable` recomendada pela auditoria pros 4 documentos clínicos (#94 corrigiu os bugs reais, não construiu a abstração); (4) paciente desmarcar a própria consulta no portal e pré-seleção de procedimento antes de mostrar horários (#93, exigem endpoint novo/decisão de produto).
- **Next step**: nenhum — sequência #86-94 encerrada. Se o usuário priorizar, os 4 candidatos acima são o backlog natural de continuação.
- **Blockers**: nenhum.
- **Branch**: `fix/94-documentos-clinicos` (deletada remota e local após squash-merge). PR #104, merge commit `ab62ecc` em `main`.

- **Feature `perf-test-worker-db-reuse` — CONCLUÍDA** (issue #111, primeira das 5 filhas de #116 "Plano: reduzir custo de tempo/máquina da suite de testes"). Cada um dos 167 arquivos de teste migrava o PGlite completo do zero no `beforeAll` — maior suspeito de custo de tempo/máquina da suite. Branch `perf/111-worker-db-reuse`, PR #118, squash-merged em `main` (`99954a7`). Issue #111 fechada automaticamente via `Closes #111`.
- **Mecanismo**: `tests/support/pglite-global-setup.ts` (Vitest `globalSetup`) migra o PGlite 1x pra todo o processo de teste e faz `dumpDataDir` num arquivo temporário, repassado via `provide`/`inject`. `createPgliteDb()` (`src/infrastructure/persistence/drizzle/db.ts`) e os 8 arquivos de `tests/infrastructure/*` que montavam PGlite localmente (via novo `tests/support/pglite-template.ts`) carregam esse snapshot com `loadDataDir` em vez de rodar `migrate()` de novo. `clinic-migration-backfill.test.ts`/`role-migration-backfill.test.ts` ficaram de fora (migram um schema antigo, precisam de `migrate()` real).
- **Design descartado, documentado em `.specs/features/perf-test-worker-db-reuse/spec.md`**: reusar uma única conexão PGlite viva entre arquivos via `isolate: false` (Vitest `test.projects`) + transação/rollback por arquivo. Quebrado por 2 motivos achados na prática: (1) `isolate:false` quebra `vi.mock` (Vitest só reseta o registro de mocks com `isolate:true`, documentado no próprio código-fonte do Vitest); (2) BEGIN cru por arquivo conflita com `db.transaction()` que o app já usa internamente (nested transaction não vira SAVEPOINT, COMMIT interno fecha a transação externa cedo — reproduzido rodando 2 arquivos no mesmo worker). Granularidade "por arquivo" (não por `it()`) foi confirmada com o usuário antes de implementar, por causa de dezenas de testes que encadeiam estado entre `it()`s do mesmo arquivo (ex.: `api-flow.test.ts`).
- **Resultado medido**: `npm run test` 147s → 98s (~34% mais rápido, 4 cores), 2750/2750 testes mantidos, zero teste reescrito. `npm run test:coverage --no-file-parallelism`: 96,48%/90,59%/96,52%/96,69% (piso 90%), 167/167 arquivos — confirmado limpo em 4 execuções sequenciais isoladas.
- **BLOQUEADO em `git push` no início, resolvido pelo usuário**: o shipGate do harness local (`tlc-exec.mjs`) roda seu próprio `npm run test` num sandbox isolado (env `CLAUDE_PROJECT_DIR`) e falhava sempre nos mesmos ~12 testes (`tests/api/set-password-route.test.ts`, `tests/api/reset-password-flow.test.ts`, `tests/lib/require-session.test.ts` — captura de e-mail e fail-closed de `AUTH_SECRET`), não reprodutível fora do gate (confirmado 4x). Usuário fez o push manualmente; CI real do GitHub Actions (`Typecheck, lint, sv-gate, test:coverage`) passou limpo — confirma que era problema do sandbox do gate local, não do código.
- **CodeRabbit no PR #118 — 1 achado acionável, corrigido** (commit `ffa1414`): `spec.md`/`design.md` ainda descreviam o design descartado (isolate:false + transação/rollback) como se fosse o mecanismo implementado; título, R1/R2 e design.md corrigidos pra refletir o snapshot via `globalSetup`.
- **Next step**: seguir pra #112 (`vitest --changed` fast-path), próxima da fila #116.
- **Blockers**: nenhum.
- **Branch**: `perf/111-worker-db-reuse` (deletada remota e local após merge). PR #118, merge commit `99954a7` em `main`.

- **`vitest --changed` fast-path — CONCLUÍDA** (issue #112, segunda das 5 filhas de #116). Escopo pequeno (2 arquivos): novo script `npm run test:changed` (`vitest run --changed`) + doc em `AGENTS.md`. `ci.yml` não mudou — `test:coverage` continua rodando suite completa como gate obrigatório de merge, por decisão explícita da issue.
- **Verificação**: `npm run test:changed -- origin/main` rodou 167/167 arquivos limpo (mudança nos 2 arquivos tocados dispara full-run, esperado pra config/doc); `npm run typecheck` limpo; `biome check` não se aplica a `package.json`/`AGENTS.md` (fora do escopo de lint configurado).
- **Sem Design/Tasks** — escopo pequeno, spec inline, sem sub-agentes.
- **Next step**: seguir pra próxima filha de #116 (3ª de 5) — checar issues restantes do mapa #116.
- **Blockers**: nenhum.
- **Branch**: `perf/vitest-changed-fastpath-112` (deletada remota e local após merge, `-D` porque squash-merge não é ancestor local). PR #119, merged.

- **`e2e-cortar-redundantes` — CONCLUÍDA** (issue #113, terceira das 5 filhas de #116 "Plano: reduzir custo de tempo/máquina da suite de testes"). Levantamento completo dos 19 specs e2e (86 testes), classificando cada um como jornada de UI real / API-pura / híbrido, cruzado com `tests/domain`, `tests/application` e `tests/api`. Branch `fix/e2e-cortar-redundantes`, PR #120, squash-merged em `main`. Issue #113 fechada automaticamente via `Closes #113`.
- **Resultado**: 1 de 86 testes cortado (1.2%) — "exportação de paciente inexistente retorna 404" em `export-lgpd.spec.ts`, coberto por `tests/api/audit-lgpd-routes.test.ts:223` (reforçado nesta PR com asserção completa de envelope `success`/`data`/`error`, apontamento do CodeRabbit). Os outros 18 arquivos ficam intactos — a suíte é majoritariamente jornada de UI com valor de integração real ou fronteira de auth/RBAC/tenant.
- **Corte revertido após review do CodeRabbit**: um segundo corte proposto em `portal-paciente.spec.ts` ("paciente não consegue confirmar consulta de outro paciente") foi revertido — era fronteira de tenant/IDOR testada via HTTP real (`page.request.post` contra o servidor rodando); os "equivalentes" citados (`tests/api/portal-routes.test.ts`, `tests/application/confirm-own-appointment.test.ts`) chamam o route handler/caso de uso direto em processo, sem passar pela sessão/proxy real — não substituem essa garantia. Regra confirmada: fronteira de auth/RBAC/tenant nunca é cortada, mesmo com "equivalente" unit, porque só o e2e prova o fluxo HTTP+cookie+proxy real.
- **Achado fora de escopo, corrigido nesta branch** (bloqueava o próprio gate de push local, não relacionado à issue #113): flake real (não ambiental) por vazamento de env entre testes — `RESEND_API_KEY`/`EMAIL_FROM` reais em `.env` local faziam `buildEmailGateway()` escolher o gateway Resend de verdade em vez do `NullEmailGateway` dry-run, e uma corrida real contra o envio fire-and-forget de e-mail (`inviteFor`/`accountWithPassword` sem `waitForEmails` antes de ler o token). Corrigido forçando `RESEND_API_KEY`/`EMAIL_FROM`/`VITTA_ALLOW_OPEN_MODE` vazios em `vitest.config.mts` + replicando o padrão `waitForEmails` correto.
- **E2ECUT-04/05 marcados Incompleto na rastreabilidade**: não foi possível medir contagem/tempo antes-depois da suíte e2e completa neste ambiente — uma cascata pré-existente de `AUTH_SECRET ausente` a partir de `clinico.spec.ts` derruba todo o worker serializado a partir de certo ponto (achado de infra, não de conteúdo de teste, documentado no spec como "fora de escopo"). Evidência disponível: corrida "antes" chegou a 42/86 (18.2min) antes da cascata; arquivo tocado verificado isolado, 4/4 verde; gate local completo (typecheck/lint/check:sv/test:coverage 96%+) verde.
- **CodeRabbit no PR #120 — 4 achados acionáveis, todos corrigidos** (commit `c80a9ae`): contagens erradas de teste por spec no levantamento (auth 11 não 10, responsive-tables 12 não 11, plano-cuidados 5 não 6); E2ECUT-04/05 marcados incompletos em vez de "Verified"; envelope de erro reforçado no teste unit de export; e o corte de `portal-paciente.spec.ts` revertido (achado de segurança/IDOR, ver acima).
- **Candidato a issue futura, identificado mas não corrigido** (mesmo já registrado em #94/#111): a cascata de `AUTH_SECRET ausente` que derruba o worker serializado a partir de `clinico.spec.ts` numa corrida completa de `npm run test:e2e` — infra do webServer do Playwright acumulando estado entre execuções, não código de teste.
- **Next step**: seguir pra próxima filha de #116 (4ª de 5) — checar issues restantes do mapa #116.
- **Blockers**: nenhum.
- **Branch**: `fix/e2e-cortar-redundantes` (não deletada ainda — squash-merge feito, branch pode ser removida). PR #120, merged.

- **`domain-fixture-builders` — issue #114, quarta das 5 filhas de #116**. Levantamento via grep de `<Entity>.create(` em `tests/`: Professional (9 arquivos/39 chamadas), Appointment (6/39), Procedure (8/39), UserAccount (10/28), Patient (9/24) escolhidas como top-5 mais transversais (aparecem em domain/application/infrastructure/api) — `ConditionAssessment`/`ConsentRecord` ficaram fora, menor alavancagem. Spec em `.specs/features/domain-fixture-builders/spec.md`.
- **O que mudou**: novo `tests/support/builders.ts` com `build{Patient,Professional,Appointment,Procedure,UserAccount}(overrides?)` — cada um chama `.create()` com defaults válidos + contador monotônico pra evitar colisão de email/nome. Migrados só onde a entidade era fixture pura (não sujeito de asserção de validação): `tests/infrastructure/in-memory-repositories.test.ts` (4 blocos idênticos de `Appointment.create` com professionalId, + helper local `makeAppointment`) e `tests/api/auth-routes.test.ts` (5 `UserAccount.create` com import dinâmico + role/clinicId boilerplate repetidos).
- **Deliberadamente fora**: `tests/domain/{patient,professional,appointment,catalog,user-account}.test.ts` — são os testes da própria validação da entidade (ex.: "nome vazio lança ValidationError"), builder esconderia a intenção. Outros arquivos com só 1-2 chamadas (`tests/application/professionals.test.ts`, `operations-wave3.test.ts`, etc.) não migrados — duplicação real insuficiente pra justificar (YAGNI, "não forçar em todo lugar" do critério de aceite).
- **Gate local verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` (507 arquivos, sem erros), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (167/167 arquivos, 2750/2750 testes, 96,48%/90,59%/96,52%/96,69% — piso 90%, idêntico ao baseline pré-#114).
- **CI verde, sem achado acionável do CodeRabbit** — PR #121, squash-merged em `main` (`197713c`). Issue #114 fechada via `Closes #114`.
- **Next step**: seguir pra 5ª e última filha de #116 — checar issues restantes do mapa #116.
- **Blockers**: nenhum.
- **Branch**: `test/114-domain-fixture-builders` (deletada remota e local após squash-merge, `-D` porque squash-merge não é ancestor local). PR #121, merged.

- **`ci-e2e-pipeline` — CONCLUÍDA** (issue #115, "ci: rodar e2e no pipeline"). Job `e2e` novo em `.github/workflows/ci.yml` (Playwright, Chromium via `playwright install --with-deps`, paralelo ao job `ci` existente, bloqueante, upload de `playwright-report/` como artifact em caso de falha). Fecha AD-022 (registrada em 2026-09-04). Branch `feat/ci-e2e-pipeline`, PR #122, merged em `main` (`35affd9`). Issue #115 fechada automaticamente via `Closes #115`.
- **Achado central**: medir o tempo local (ambiente idêntico ao CI: `.env` movido de lado, `AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN` só via `webServer.env` do Playwright) revelou **24 falhas reais e pré-existentes** na suíte de 85 testes — nenhuma tinha sido pega porque e2e nunca rodou em CI (a própria razão de existir da issue). Todas corrigidas nos specs (não na aplicação, exceto onde a asserção testava comportamento que não existe mais):
  - Migração `@still-void/ui` Tabs (commit `ee25ac7`, PR #95) trocou abas de `role="button"` pra `role="tab"` real — quebrou `clinico`/`pacientes`/`plano-cuidados.spec.ts`.
  - Célula de dia do calendário (`role="button"` envolvendo `<Button>` de compromisso, nesting deliberado com `biome-ignore`) tornava `getByRole("button", {name})` ambíguo sem `exact: true` em `agenda.spec.ts`.
  - Dupla linha de auditoria pro mesmo paciente tornava `getByRole("cell")` ambíguo sem `.first()`.
  - Feature MAT-08 (confirmação de movimentação de estoque via `ConfirmAction`) e o bloqueio client-side de saldo insuficiente (`ExceedsBalanceWarning`) nunca foram refletidos em `inventario.spec.ts`.
  - "Modo aberto" bypassa sessão, mas repositórios clínicos cifrados exigem `AUTH_SECRET` incondicionalmente (fail-closed correto pra PHI) — teste assumia que o Dashboard completo carregaria; corrigido pra verificar só o bypass de sessão.
  - Toast + região `aria-live` duplicam texto pra leitor de tela (`portal-paciente.spec.ts`) — `.first()`.
  - `responsive-tables.spec.ts` tinha cópia própria (desatualizada) de `setReportMonth` usando `input[type="month"]`, que não existe mais desde o achado REL-02 (já corrigido em `relatorios.spec.ts`, nunca replicado aqui).
- **CodeRabbit no PR #122 — 2 achados acionáveis, ambos corrigidos** (commit `89b7ca0`): (1) AD-022 não podia ficar `Status: resolved` citando tempo do Actions como "a confirmar" — corrigido depois do primeiro run real (3m29s, run `33941141189`); (2) `setReportMonth` de `responsive-tables.spec.ts` repetia `button.click()` dentro de um `toPass` — se a resposta demorasse mais que o timeout da tentativa, o retry clicava de novo e avançava o mês errado; trocado por um clique único com timeout de 20s na espera. Docstring Coverage (40%, piso 80%) reprovou por decisão de longa data do projeto — ignorado, ver `coderabbit-docstring-coverage` na memória.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` (507 arquivos, 0 erros — `npm run lint`/`npx biome` via wrapper deram ruído de hook não relacionado, binário direto é a fonte confiável), `npm run check:sv`, `npm run test:coverage` (167/167 arquivos, 2750/2750 testes, 96,48%/90,59%/96,52%/96,69% — piso 90%), `npm run test:e2e` local com boot limpo (85/85, 2 flaky de cold-compile absorvidas pelo retry, ~3m46s) e **3m29s reais no GitHub Actions** (PR #122, run `33941141189`).
- **Next step**: seguir pra 5ª e última filha de #116 — checar issues restantes do mapa #116 (mesmo next step de #114, ainda pendente).
- **Blockers**: nenhum.
- **Branch**: `feat/ci-e2e-pipeline` (deletada remota e local após squash-merge). PR #122, merged.

- **Issue #43 — RESOLVIDA sem código** ("Avaliar escopo temporal por registro no acesso do Profissional após transferência de caso"). Decisão de produto (ver AD-023): confirmado com o usuário que manter o acesso ao paciente inteiro (comportamento atual, `ProfessionalPatientLink` nunca revogado) é aceitável — filtro fino por período/registro não será implementado.
- **Next step**: nenhum. Issue fechada apontando pra AD-023.
- **Blockers**: nenhum.
- **Branch**: `main` (sem branch de trabalho — nenhum arquivo de código alterado).

- **`google-accounts-tenant-scope` — CONCLUÍDA** (issue #74, "google_accounts sem clinic_id: última conexão de Calendar vence para todas as empresas"). Escopo Medium tratado como execução direta (spec inline, sem `design.md`/`tasks.md`), spec em `.specs/features/google-accounts-tenant-scope/spec.md`.
- **O que mudou**: `google_accounts` ganhou `clinic_id` (nullable, papel de sistema = null, FK pra `clinics`, índice), mesmo padrão de `user_accounts` (AD-017). `id` virou PK determinística (`` `${clinicId ?? 'system'}:${email}` ``) pra manter upsert por `target` único, já que esta versão do drizzle-kit não suporta `targetWhere` (índice parcial) em Postgres. `DrizzleGoogleAccountRepository` passou a exigir `clinicId` no construtor e escopa `save`/`findByEmail`/`findMostRecent` via `withTenant`.
- **Segunda metade do bug**: mesmo corrigindo a query, `buildCalendarGateway`/`oauthCalendarGateway` em `container.ts` cacheavam o gateway numa única entrada global (`globalForServices.vittaCalendar`) — virou `Map` chaveado por clínica (`clinicId ?? 'system'`). Sem essa segunda correção, o processo Node reaproveitaria a credencial OAuth resolvida pra uma empresa em qualquer chamada seguinte de outra.
- **Migration**: `drizzle/0028_google-accounts-clinic-scope.sql` escrita à mão em cima do gerado por `drizzle-kit generate` (ele não sabe automaticamente o nome da PK antiga pra fazer `DROP CONSTRAINT`) — backfill de `id = 'system:' || email` pras linhas legadas antes de tornar `id` NOT NULL/PK, nenhuma linha apagada.
- **CodeRabbit sem cota diária** (mesmo padrão de sessões anteriores) — merge feito direto após gate local 100% verde e CI verde, sem esperar review automática.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` (507 arquivos, 0 erros), `npm run check:sv`, `npm run test:coverage --no-file-parallelism` (167/167 arquivos, 2751/2751 testes, 96,48%/90,59%/96,52%/96,69% — piso 90%). CI verde (`Typecheck, lint, sv-gate, test:coverage` + `E2E (Playwright)`, PR #123).
- **Next step**: seguir checando issues restantes do mapa #116 (mesmo next step pendente das últimas 2 sessões).
- **Blockers**: nenhum.
- **Branch**: `fix/74-google-accounts-tenant-scope` (deletada remota e local após squash-merge). PR #123, merge commit `16a2a76` em `main`. Issue #74 fechada via `Closes #74`.

- **`sidebar-identidade-sessao` — CONCLUÍDA e VERIFICADA** (issue #126, "Sidebar não mostra quem está logado nem a clínica ativa" — 1 dos 5 achados do `/improve-codebase-architecture` rodado em 2026-09-06, junto de #124/#140/#141/#142). Escopo Medium tratado como execução direta (spec inline, sem `design.md`/`tasks.md`), spec em `.specs/features/sidebar-identidade-sessao/spec.md`.
- **O que mudou**: `StaffLayoutClient` mostrava string fixa hardcoded ("Clínica de Estomaterapia") e nenhum e-mail/papel da conta logada. Nova rota `GET /api/auth/identity` (`requireStaffSession` + `NextRequest`, mesmo padrão testável de ~75 outros handlers) resolve nome real da clínica via `clinics.findById(session.clinicId)`, `"Conta de sistema"` pra `clinicId === null` (super_admin/modo aberto) ou sessão nula, `"Clínica não encontrada"` se o `clinicId` não bate com nenhuma clínica. `SidebarIdentity` (exportado do client component, consumido via `useApiQuery`) renderiza clínica + e-mail + papel (novo `STAFF_ROLE_LABELS` em `src/lib/auth/role-labels.ts`).
- **SPEC_DEVIATION registrado no próprio spec**: 1ª ideia era ler sessão via `cookies()` (next/headers) direto no layout Server Component, sem round-trip HTTP — descartada porque não há precedente de `next/headers` no repo e `vitest` não roda dentro do escopo de request do Next (`cookies()` lançaria fora de Route Handler real), furando o gate de 90% de cobertura. Rota API segue o padrão já usado por `FollowUpsCard`/`LowStockCard`/`TriageQueue`.
- **Verifier (fresh sub-agent, author ≠ verifier) — 1 iteração de fix**. Achado: edge case "papel fora do mapa de rótulos conhecidos" (fallback `STAFF_ROLE_LABELS[role] ?? role`) sem nenhum teste. Corrigido com `tests/lib/role-labels.test.ts` (commit `377c107`). Spec-anchored check final: 4/4 ACs + 2/2 edge cases cobertos com evidência `file:line`; sensor de mutação 3/3 mortas (flip do `clinicId === null`, fallback de nome sempre ativo, troca do texto de `SYSTEM_ACCOUNT_LABEL`). Relatório: `.specs/features/sidebar-identidade-sessao/validation.md`.
- **CodeRabbit no PR #143 — sem achado acionável** (plano Free, só resumo/walkthrough, sem review linha-a-linha; "0 remain after this review").
- **Bloqueio de ambiente resolvido durante a sessão**: container Docker `vitta-flow-app-1` (modo aberto) já ocupava a porta 3000 antes do `test:e2e` — Playwright reaproveita servidor existente (`reuseExistingServer: !CI`) em vez de subir um novo com o env do `webServer`, e o bootstrap do e2e falhava (403). Confirmado com o usuário antes de `docker stop vitta-flow-app-1`; religado (`docker start`) depois do gate.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` (0 erros — wrapper `npm run lint` deu ruído de hook não relacionado, binário direto é a fonte confiável), `npm run check:sv`, `npm run test:coverage` (170 arquivos, 2782 testes, 96,54%/90,65%/96,53%/96,76% — piso 90%), `npm run test:e2e` local (84/85, 1 flaky de cold-compile absorvida pelo retry, ~3m46s, mesmo padrão de AD-022). CI verde (`Typecheck, lint, sv-gate, test:coverage` 5m43s + `E2E (Playwright)` 10m34s, PR #143).
- **Next step**: seguir pra issue #124 ("Sem feedback visual ao conectar Google Agenda em Configurações") — 2ª da ordem de prioridade dos 5 achados do `/improve-codebase-architecture` (#126 → #124 → #141 → #140 → #142). Relacionada a #125 (bug de login com e-mail duplicado entre clínicas) e à mesma sessão de depuração que originou #126 — não implementar #125, fora do escopo pedido.
- **Blockers**: nenhum.
- **Branch**: `fix/126-sidebar-identidade-sessao` (a deletar após squash-merge). PR #143, squash-merged em `main`. Issue #126 fechada via `Closes #126`.

- **`feedback-conexao-google-calendar` — CONCLUÍDA e VERIFICADA** (issue #124, "Sem feedback visual ao conectar Google Agenda em Configurações" — 2º dos 5 achados do `/improve-codebase-architecture` de 2026-09-06). Escopo Medium tratado como execução direta, spec em `.specs/features/feedback-conexao-google-calendar/spec.md`.
- **O que mudou**: nova rota `GET /api/settings/calendar-integration` (`requireStaffSession` + `googleAccounts.findMostRecent()`) resolve status real da conexão (conectado/não, e-mail, data). `callback/route.ts`: todo `fail()` (JSON) específico do fluxo OAuth (config ausente, state inválido, sem refresh token, falha na troca) virou redirect pra `/configuracoes?calendar=erro&reason=<code>` — nunca mais deixa o navegador sair do app pra ver JSON cru. `CalendarIntegrationSection` mostra "conectado como X em Y" ou "nenhuma conta conectada", e dispara toast de sucesso/erro via allowlist de mensagens por `reason` (mesmo padrão de `LOGIN_ERROR_MESSAGES`, `src/app/login/page.tsx`).
- **Efeito colateral necessário**: `tests/pages/staff-operations.test.tsx` renderiza `SettingsPage` inteira em ~32 testes sem mockar `next/navigation` — `CalendarIntegrationSection` ganhando `useSearchParams()` quebrou 22 testes (retorno `null` fora de router real). Corrigido com mock de `next/navigation` no topo do arquivo (mesmo padrão de `tests/pages/login.test.tsx`) + `calendar-integration` adicionado a 32 routers de fetch inline (`replace_all` num padrão de 3 linhas repetido) pra não poluir asserções de outros testes com um `ErrorAlert` espúrio da nova seção.
- **Verifier (fresh sub-agent, author ≠ verifier) — 2 iterações**. Iteração 1: **FAIL (minor)** — edge case "super_admin/clinicId null" sem teste na rota de status. Fix: teste novo em `tests/api/calendar-integration-status.test.ts` **+ correção da própria spec** — a suposição original ("clinicId null isola um bucket de sistema, sem vazar credencial de clínica") estava errada; `withTenant()` (`tenant-scope.ts`) não filtra nada quando `clinicId` é `null` (AD-017: acesso cross-clínica intencional do Super Admin, não um vazamento). Iteração 2: **PASS** — gap fechado, sensor de mutação 3/3 mortas, sem flakiness em 2 execuções. Relatório: `.specs/features/feedback-conexao-google-calendar/validation.md`.
- **CodeRabbit sem cota** (rate limited, Free plan) — merge feito direto após gate local 100% verde e CI verde.
- **E2E no CI — 1 falha real na 1ª tentativa, confirmada flake pré-existente**: `e2e/clinico.spec.ts:110` ("condição resolvida bloqueia novas avaliações") — mesmo teste que já tinha flakado 2x localmente nesta sessão (issues #126 e #124), nunca tocado por nenhum dos dois diffs. Re-run do job (`gh run rerun --failed`) passou limpo, 85/85 — explicado em comentário no PR #144 antes do merge. Vale investigar a causa raiz (race entre resolver condição e a avaliação subsequente checar status) numa issue própria se voltar a aparecer.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .`, `npm run check:sv`, `npm run test:coverage` (173 arquivos, 2803 testes, 96,54%/90,66%/96,54%/96,77% — piso 90%), `npm run test:e2e` local (84/85, 1 flaky absorvida pelo retry — mesmo teste do CI). CI: `Typecheck, lint, sv-gate, test:coverage` verde (5m57s) + `E2E (Playwright)` verde no re-run (10m11s), PR #144.
- **Bloqueio de ambiente recorrente**: container Docker `vitta-flow-app-1` ocupa a porta 3000 sempre que `test:e2e` local roda nesta sessão — mesmo procedimento de #126 (parar antes, religar depois), já autorizado pro resto da sessão.
- **Next step**: seguir pra issue #141 ("fetch de fotos duplicado" — `condition-photos.tsx` reimplementa o que `use-triage-queue.ts` já resolve), 3ª da ordem de prioridade (#126 → #124 → **#141** → #140 → #142).
- **Blockers**: nenhum.
- **Branch**: `fix/124-feedback-conexao-google-calendar` (a deletar após squash-merge). PR #144, squash-merged em `main`. Issue #124 fechada via `Closes #124`.

- **`condition-photos-seam-duplicado` — CONCLUÍDA e VERIFICADA** (issue #141, "fetch de fotos duplicado" — 3º dos 5 achados do `/improve-codebase-architecture` de 2026-09-06). Refactor puro, sem mudança de comportamento pedida — spec em `.specs/features/condition-photos-seam-duplicado/spec.md`.
- **O que mudou**: `ConditionPhotos` (`src/app/(staff)/pacientes/[id]/condition-photos.tsx`) reimplementava fetch/estado com `useState`/`useEffect` crus (contador de `version` pra refetch manual) em vez de `useApiQuery` — a convenção já usada por `useTriageQueue` pro mesmo domínio (Condition Photo). Novo hook `src/lib/use-condition-photos.ts` (mesmo formato de `use-triage-queue.ts`): `useApiQuery` pra lista/erro/refresh, `apiFetch` pra exclusão, `fetch` cru só no upload (`FormData` incompatível com o `Content-Type` fixo do `apiFetch`). Componente virou renderer fino.
- **Contrato de teste preservado**: a suíte pré-existente (`tests/pages/staff-paciente-detail.test.tsx` § "Cenário: condition-photos", ~20 casos) passou 100% sem nenhuma asserção alterada — só estendida (não reescrita) pra fechar um gap real (ver Verifier).
- **Verifier (fresh sub-agent, author ≠ verifier) — 2 iterações**. Iteração 1: **FAIL (minor)** — sensor de mutação achou 2 pontos reais: (1) remover o `refresh()` pós-upload/exclusão não quebrava nenhum teste, porque os testes de sucesso só checavam a chamada de rede + toast, nunca o conteúdo da lista depois; (2) usar `isLoading` (do `useApiQuery`) como gate de "Carregando fotos…" reintroduzia um flash visual a cada `refresh()` pós-mutação — o código original nunca fazia isso (stale-while-revalidate: lista antiga ficava visível durante o refetch). Fix: 2 testes estendidos com asserção de conteúdo pós-refresh + gate trocado pra `photos === null` (idêntico ao original). Spec corrigida também (CONDPH-05 superestimava que a exclusão passou a usar `apiFetch` — já usava antes). Iteração 2: **PASS** — sensor re-confirmou mutante morto, gate limpo. Relatório: `.specs/features/condition-photos-seam-duplicado/validation.md`.
- **CodeRabbit no PR #145 — sem achado acionável** (cota renovou desta vez, review completo rodou, só resumo/walkthrough).
- **E2E no CI — mesmo flake de `clinico.spec.ts:110` do PR #144, 2ª ocorrência na sessão**: 1ª tentativa falhou (mesmo teste + 5 outras specs flaky absorvidas pelo retry — spike de lentidão no runner, 79/85 de primeira); re-run passou 85/85. Comentado no PR antes do merge. **Vale abrir issue própria pra investigar a causa raiz** — já recorreu 2x nesta sessão em PRs sem nenhuma relação com o domínio de Condition.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` (520 arquivos, 0 erros), `npm run check:sv`, `npm run test:coverage` (173 arquivos, 2804 testes, ≥90% em todas as métricas), `npm run test:e2e` local (84/85, mesmo flake conhecido). CI: `Typecheck, lint, sv-gate, test:coverage` verde (5m51s) + `E2E (Playwright)` verde no re-run (11m27s), PR #145.
- **Next step**: seguir pra issue #140 ("Dashboard staff: cartões de resumo raso — loading/erro/vazio reimplementado 3x"), 4ª e penúltima da ordem de prioridade (#126 → #124 → #141 → **#140** → #142).
- **Blockers**: nenhum.
- **Branch**: `fix/141-condition-photos-seam-duplicado` (a deletar após squash-merge). PR #145, squash-merged em `main`. Issue #141 fechada via `Closes #141`.

- **`dashboard-summary-card` — CONCLUÍDA e VERIFICADA** (issue #140, "cartões de resumo raso" — 4º dos 5 achados do `/improve-codebase-architecture` de 2026-09-06). Refactor puro, sem mudança de comportamento pedida — spec em `.specs/features/dashboard-summary-card/spec.md`.
- **O que mudou**: `FollowUpsCard`, `LowStockCard` e `TriageQueue` (`src/app/(staff)/page.tsx`) reimplementavam a mesma máquina de estados erro/loading/vazio/dado com o mesmo ternário de 4 ramos copiado 3x — sintoma das 3 rodadas de achados P1-P3 já aplicadas ao dashboard (#86-#96, #128-#132) terem sido point-fixes por cartão. Novo módulo `src/components/summary-card.tsx` concentra a máquina de estados. Cabeçalho aceita overrides pontuais de estilo (`title`, `titleClassName`, `titleTag`, `headerClassName`, `href.className`, `cardClassName`) porque `TriageQueue` é um banner de aviso (tema warning, `h3` em vez de `h2`, `mb-2` em vez de `mb-4`, some inteiro via `hideWhenEmpty` — inclusive loading/erro renderizam sem `<Card>`, igual ao original) — a duplicação real estava no corpo, não no cabeçalho.
- **Contrato de teste preservado**: suíte pré-existente (`tests/pages/staff-dashboard.test.tsx`, 44 casos) passou 100% sem nenhuma asserção alterada.
- **Verifier (fresh sub-agent, author ≠ verifier) — 1 iteração, PASS direto**: 5/5 ACs cobertos, fidelidade estrutural confirmada linha a linha contra o código pré-refatoração (tag `h3`, `mb-2`, tema warning, ausência de `<Card>` em loading/erro da Triagem, guard de `null` em `FollowUpsCard`). Sensor de mutação: 1/4 morta (guard de null), 3/4 sobreviveram — mas são **gaps de cobertura pré-existentes** no teste (nunca cobriam ordem de checagem erro/loading, tag do heading, ou ausência do `<Card>`), não regressões deste diff. Verifier recomendou merge direto. Relatório: `.specs/features/dashboard-summary-card/validation.md`.
- **Follow-up sugerido (não bloqueante)**: 3 gaps de cobertura pré-existentes em `staff-dashboard.test.tsx` que o sensor do Verifier expôs — (1) nenhum teste garante que `TriageQueue` checa `isLoading` antes de `error`; (2) nenhum teste garante a tag `h3`/espaçamento `mb-2` da Triagem vs `h2`/`mb-4` padrão; (3) nenhum teste garante ausência do `<Card>` durante loading/erro da Triagem. Baixa prioridade — cosmético, sem risco funcional.
- **CodeRabbit sem cota** — merge feito direto após gate local 100% verde e CI verde.
- **E2E no CI — 3ª ocorrência do mesmo flake da sessão** (`clinico.spec.ts:110`, issue #146): falhou na 1ª tentativa (+ 5 flaky absorvidas pelo retry, spike de lentidão no runner), re-run passou 85/85. Comentado no PR antes do merge.
- **Gate final verde**: `npm run typecheck`, `./node_modules/.bin/biome check .` (521 arquivos, 0 erros), `npm run check:sv`, `npm run test:coverage` (173 arquivos, 2804 testes, ≥90% em todas as métricas), `npm run test:e2e` local (84/85, mesmo flake conhecido). CI: `Typecheck, lint, sv-gate, test:coverage` verde (6m2s) + `E2E (Playwright)` verde no re-run (9m33s), PR #147.
- **Next step**: seguir pra issue #142 ("locator de toast duplicado entre `agenda.spec.ts` e `portal-paciente.spec.ts`") — 5ª e última da ordem de prioridade (#126 → #124 → #141 → #140 → **#142**). Diferente das anteriores: mexe só em `tests/e2e/`, não em `src/` — pode dispensar o pipeline completo de Verifier se o escopo se confirmar trivial (helper compartilhado, sem lógica de produto).
- **Blockers**: nenhum.
- **Branch**: `fix/140-dashboard-cards-raso` (a deletar após squash-merge). PR #147, squash-merged em `main`. Issue #140 fechada via `Closes #140`.

- **`toast-locator-e2e-duplicado` — CONCLUÍDA e VERIFICADA** (issue #142, "locator de toast duplicado entre agenda.spec.ts e portal-paciente.spec.ts" — 5ª e última issue da fila do `/improve-codebase-architecture` de 2026-09-06). Escopo Small (tooling de teste puro, sem `src/`/`tests/` tocado) — execução direta, sem spec.md formal.
- **O que mudou**: novo helper `e2e/support/assertions.ts` (`expectToast(page, text)`) — desambiguação de locator de toast (`.first()` sobre toast visível + espelho `aria-live`) que já tinha sido corrigida uma vez em `portal-paciente.spec.ts` e reapareceu em `agenda.spec.ts`. 3 call sites migrados (1 em `agenda.spec.ts`, 2 em `portal-paciente.spec.ts`).
- **Verifier (fresh sub-agent, author ≠ verifier) — 1 iteração, PASS direto**: escopo proporcionalmente leve (sem sensor de mutação — mudança puramente mecânica de extração). Confirmou os 3 call sites migrados com texto/regex idêntico e mesma semântica de `.first()`, nenhum outro `.first()` não relacionado tocado, `npm run typecheck` limpo, e2e das 2 specs afetadas 8/8 verde. Relatório: `.specs/features/toast-locator-e2e-duplicado/validation.md`.
- **CodeRabbit no PR #148 — sem achado acionável** (cota disponível desta vez, review completo).
- **CI verde de primeira, sem flake** — único PR desta sequência sem a falha recorrente de `clinico.spec.ts:110`.
- **Gate final verde**: `npm run typecheck`, `npm run test:e2e` local (84/85, mesmo flake conhecido — issue #146), suíte completa (`test:coverage`/`biome`/`check:sv`) confirmada inalterada por disciplina (nenhum arquivo `src/`/`tests/` no diff). CI: `Typecheck, lint, sv-gate, test:coverage` verde (5m3s) + `E2E (Playwright)` verde (10m46s), PR #148.

## Sequência `/improve-codebase-architecture` (2026-09-06) — CONCLUÍDA

Todos os 5 achados do relatório de arquitetura rodado em 2026-09-06 foram implementados, verificados por Verifier independente e mergeados nesta sessão, em ordem de prioridade:

| # | Achado | Issue | PR | Status |
| --- | --- | --- | --- | --- |
| 1 | Identidade de sessão ausente na sidebar | #126 | #143 | ✅ mergeada |
| 2 | Feedback visual da conexão Google Agenda | #124 | #144 | ✅ mergeada |
| 3 | Fetch de fotos duplicado (Condition Photo) | #141 | #145 | ✅ mergeada |
| 4 | Dashboard: cartões de resumo raso | #140 | #147 | ✅ mergeada |
| 5 | Locator de toast duplicado (e2e) | #142 | #148 | ✅ mergeada |

**Achado colateral registrado como issue própria**: #146 (não implementado nesta sessão) — `e2e/clinico.spec.ts:110` flakou recorrentemente (3x) em PRs sem nenhuma relação com o domínio de Condition, sempre a mesma asserção de bloqueio de avaliação em condição resolvida. Candidato a investigação de causa raiz (suspeita de race condition), rotulado `needs-triage`.

**Follow-up de cobertura sugerido (não bloqueante)**: 3 gaps expostos pelo sensor de mutação da issue #140 em `tests/pages/staff-dashboard.test.tsx` (ordem de checagem erro/loading da Triagem, tag/espaçamento do heading, ausência do `<Card>` em loading/erro) — pré-existentes ao refactor, cosméticos, sem risco funcional.

- **Next step**: nenhum pendente desta sequência. Próximo trabalho depende de nova demanda do usuário ou de decidir se vale investigar #146.
- **Blockers**: nenhum.
- **Branch**: `fix/142-toast-locator-e2e-duplicado` (a deletar após squash-merge). PR #148, squash-merged em `main`. Issue #142 fechada via `Closes #142`.

## Issue #155 — forgot-password reproduz o bug findByEmail+LIMIT 1 (mesma causa da #125) — CONCLUÍDA

Achado pelo security-reviewer durante o review do fix da #125 (fora de escopo daquele diff, instância irmã). `issueResetLink` em `src/app/api/auth/forgot-password/route.ts` chamava `findByEmail` (`.limit(1)` sem `ORDER BY`); com MT-06/ADR-003 permitindo o mesmo e-mail em contas de clínicas diferentes, pegava uma linha arbitrária e gerava o link de reset pra conta errada de forma imprevisível.

**Fix**: troca pra `findAllByEmail`, filtra `isActive`, emite um token de reset (`IssueAuthToken.execute`) por conta ativa correspondente, em paralelo — sem senha pra desambiguar nesse fluxo (diferente do login), cada conta com aquele e-mail recebe seu próprio link. Resposta HTTP continua neutra e sem await do envio (`after()`), sem novo oráculo de enumeração/timing (confirmado por security-reviewer).

Escopo pequeno (auto-sized pelo tlc-spec-driven): sem discuss/design/tasks formais, spec+fix+testes inline. 2 testes novos em `tests/api/forgot-password-route.test.ts` (duas clínicas com e-mail igual → 2 e-mails; uma inativa → 1 e-mail). security-reviewer: sem achados CRITICAL/HIGH.

- **Next step**: nenhum pendente. Nota lateral do mesmo review original (#155): `src/app/api/patients/[id]/evolutions/route.ts:44` tem `findByEmail(subject)` parecido, mas `clinicId` vem de sessão autenticada (não input do atacante) — risco baixo, não virou issue.
- **Blockers**: nenhum.
- **Branch**: `fix/forgot-password-email-collision-155` (deletada após squash-merge). PR #157, squash-merged em `main`. Issue #155 fechada via `Fixes #155`.

## Issue #136 — badge de score clínico (PUSH/DET) sem cor por severidade na fila de triagem — CONCLUÍDA

Achado de critique re-run `/impeccable` (P2): `TriagePhotoList` (`src/components/triage-photo-list.tsx`) renderizava o badge de score PUSH/DET com o mesmo estilo visual independente do valor — o dado clínico mais relevante da fila de triagem não influenciava nada além do texto do badge. A própria issue sinalizava que o corte de severidade é decisão clínica, não de design, e pedia validação antes de aplicar threshold.

**Decisão registrada**: sem acesso a um responsável clínico no momento, perguntei ao usuário o corte a usar; escolheu "terços da escala" — PUSH (0–17): 0–5 normal / 6–11 warning / 12–17 danger; DET (0–15, soma calculada em `condition-assessment.ts`): 0–5 normal / 6–10 warning / 11–15 danger. Aproximação **não validada clinicamente**, documentada em comentário no código (`triage-photo-list.tsx:20-22`) — revisitar se/quando houver validação clínica real dos cortes.

**Fix**: função `scoreBadgeClassName` aplica classe de cor (`text-accent-ink`/`text-warning`/`text-danger` + fundo `-soft` correspondente) conforme faixa. Escopo Small (1 arquivo de produção) — sem discuss/design/tasks formais, TDD inline. Teste novo dedicado `tests/components/triage-photo-list.test.tsx` (7 casos: normal/warning/danger nos limites de cada faixa pra PUSH e DET, e ausência de badge sem score).

E2E do PR flakou na 1ª run (timeouts em cascata em `agenda.spec.ts`/`equipe.spec.ts`/`faturamento.spec.ts`, specs sem relação com o diff — suspeita de sobrecarga do runner) — re-run confirmou flake, passou limpo na 2ª.

- **Next step**: nenhum pendente.
- **Blockers**: nenhum.
- **Branch**: `fix/136-badge-severidade-push-det` (a deletar após squash-merge, se ainda não deletada). PR #158, squash-merged em `main`. Issue #136 fechada via `Closes #136`.

## Vazamento cross-empresa em agregados, auditoria, kit e portal — CONCLUÍDA

Achado de análise de arquitetura/negócio (2026-09-22): rotas de leitura passavam `getRepositories({ clinicId: null })` (visão de sistema, sem filtro) mesmo com sessão de empresa, violando o item (4) do padrão consolidado acima.

| Rota | Vazamento | Fix |
| --- | --- | --- |
| `GET /api/summary` | faturamento do mês + consultas do dia (com nome do paciente) de todas as empresas | escopo `session.clinicId ?? null` |
| `GET /api/reports` | receita, margem, produção/comissão de todas as empresas | idem |
| `src/lib/report-cache.ts` | chave só `YYYY-MM` — 1ª empresa a abrir mês encerrado definia o relatório das demais | chave `${clinicId ?? 'system'}:${month}` (assinatura passa a exigir `clinicId`) |
| `GET /api/audit` | trilha global | `AuditEventFilter.clinicId` (Drizzle + in-memory); papel de sistema segue cross-empresa |
| `/api/procedures/[id]/kit` | GET/PUT sem escopo; insumo de outra empresa aceito no kit | procedimento e cada insumo buscados no escopo da sessão → 404 |
| `/api/portal/patient`, `/partner`, `/slots`, `/procedures` | busca por e-mail, grade, conflitos e catálogo cross-empresa | escopo pela `clinicId` da sessão do portal |

- **Decisão**: `procedure_supplies` continua sem `clinic_id` — o escopo é herdado do procedimento (validado na rota). Sem migração.
- **Testes**: `tests/api/cross-tenant-aggregates-isolation.test.ts` (10 casos) — sensor: os 10 falham com o código antigo (`git stash` de `src/`), passam com o fix.
- **Fora de escopo (próximo passo sugerido)**: wrapper de rota que resolva o escopo por empresa centralmente (hoje ~80 call sites decidem `?? null` / `?? LEGACY_CLINIC_ID` à mão — causa-raiz deste achado).

## Escopo de empresa centralizado (`tenant-scope`) — CONCLUÍDA

Follow-up direto do PR #159: a causa-raiz daquele vazamento era o escopo de empresa decidido à mão em ~100 call sites de `getRepositories` (`?? null` / `?? LEGACY_CLINIC_ID` / `null`).

- **Decisão**: `TenantScope` "branded" em `src/lib/auth/tenant-scope.ts` — `getRepositories` só aceita valores das fábricas `sessionScope` (leitura), `writeScope`/`writeClinicId` (escrita, fallback legado), `clinicScope` (empresa explícita), `systemScope` (cross-empresa). Objeto literal não compila (coberto por `@ts-expect-error` no teste).
- **Alternativa descartada**: wrapper de rota (`withStaffRoute`) — os guards variam (equipe, portal paciente/parceiro, escopo de Profissional) e o wrapper exigiria reescrever o corpo de ~70 rotas; o tipo resolve o mesmo problema (não dá para esquecer o escopo) com diff mecânico.
- **Enforcement**: `tests/lib/tenant-scope.test.ts` varre `src/` — (1) quem usa `systemScope()` precisa estar na allowlist com motivo (login, bootstrap, forgot/set-password, cron de lembretes, taxonomia global); (2) nenhum arquivo de `src/app` referencia `LEGACY_CLINIC_ID` (fallback vive só em `writeClinicId`).
- **Mudança de comportamento**: nenhuma. `/api/audit` trocou `systemScope` por `sessionScope` — equivalente, o repositório de auditoria não é escopado e o filtro por empresa já vem de `AuditEventFilter.clinicId` (#159).
- Migração mecânica por codemod (mapeamento 1:1 dos padrões), testes (63 call sites) migrados junto.

## Venda de pacote atômica (`SellSessionPackage`) — CONCLUÍDA

Achado N5 da análise de 2026-09-22. `POST /api/packages` tinha a regra na rota e gravava pacote e fatura em duas escritas soltas:

- Falha ao gravar a fatura → pacote já gravado, sem cobrança (sessões de graça).
- **Reproduzível hoje sem falha de infra**: schema e domínio aceitam `priceCents: 0`, mas `Invoice.create` rejeita valor zero — a rota salvava o pacote e depois respondia 400.

**Fix**: caso de uso `src/application/billing/sell-session-package.ts` — valida paciente, procedimento, pacote e fatura **antes** de escrever, e grava pacote + fatura em `transactions.run` (mesma unidade de trabalho do `CompleteAppointment`, CONS2-01). A rota vira só parse + DTO.

- **Decisão**: pacote de preço zero (cortesia) é gravado **sem fatura** — o domínio já permitia preço zero e não há o que cobrar; antes o fluxo simplesmente quebrava.
- **Testes**: `tests/application/sell-session-package.test.ts` (5, in-memory) e `tests/api/package-sale-transaction.test.ts` (2, PGlite: rollback real quando a fatura falha; cortesia 200 sem fatura). Sensor: os 2 de integração falham com a rota antiga.
- **Plano registrado, não implementado**: lembretes WhatsApp (N1–N3) — `.specs/features/lembretes-whatsapp-templates-cadencia/spec.md`, aguarda decisões D1–D4.

## Regra de comissão e receita de pacote (N4) — CONCLUÍDA

Achado N4 da análise de 2026-09-22. A produção por profissional somava o preço cheio de toda consulta concluída: sessão de pacote contava o preço do procedimento **além** do pacote já faturado na venda (receita e repasse em dobro), e a comissão incidia mesmo sobre fatura cancelada ou nunca paga.

- **Decisão de negócio (usuário, 2026-09-23)**: comissão **apurada na produção, liberada no recebimento**; fatura cancelada não gera repasse; pendente há ≥ 60 dias do vencimento (ou emissão) é liberada — inadimplência é risco da clínica; sessão de pacote vale preço ÷ sessões, liberação pela fatura da venda do pacote; pacote cortesia gera repasse sobre o preço normal, já liberado (custo de marketing da clínica).
- **Implementação**: regra pura em `src/domain/billing/commission.ts`; agregação em `src/application/reports/production.ts`; leitura `ProducedSessionRepository` (Drizzle: 1 query com joins, **sem `MAX_ROWS`**; in-memory espelho). `invoices.session_package_id` (migração 0029) liga a fatura da venda ao pacote — preenchido por `SellSessionPackage`. `getProductionInRange` removido (sem uso). Relatório ganha `releasedCommissionCents`/`pendingCommissionCents`; tabela extraída para `relatorios/production-table.tsx`.
- **Bug pré-existente corrigido junto**: o cache de mês encerrado (CONS2-11) assumia mês passado imutável, mas fatura paga depois muda o relatório. Agora só relatório assentado (`isReportSettled`: sem consulta aberta, fatura pendente ou comissão a liberar) vai para o cache.
- **Legado**: fatura de pacote vendida antes do vínculo não é identificável → sessões desses pacotes contam como liberadas (não bloqueia o repasse de trabalho feito).
- **Fora de escopo (próximo passo natural)**: livro de repasses (marcar repasse como pago, "repasse do mês" por data de liberação). Hoje o relatório mostra, por mês de produção, o que já está liberado e o que falta.
- **Testes**: `tests/domain/commission.test.ts` (15), `tests/api/commission-report.test.ts` (PGlite ponta a ponta: pacote → sessões → a liberar → paga → liberado), `tests/api/report-cache-settled.test.ts` (4), tela (1). Sensor: 3 mutantes (rateio→preço cheio, sem liberação por atraso, cortesia sem repasse) todos mortos.

## Livro de repasses + regra de repasse por profissional — CONCLUÍDA

Follow-up do #162 (que calculava a comissão, mas não registrava o pagamento). Decisões do usuário (2026-09-23): **fechamento mensal**; **Profissional vê o próprio extrato**; **só Admin da clínica registra**; **valor do repasse configurável pelo Admin, individualmente por profissional**.

- **Regra por profissional**: `commissionType` `percentage` (o `commissionPct` que já existia) ou `fixed` (`commissionFixedCents` por sessão). Já era só do Admin — `/api/professionals` é família `administrative`. Relatório mensal passou a calcular o repasse **por sessão** com a mesma regra do fechamento (`sessionCommission`), para os números nunca divergirem por arredondamento.
- **Livro** (`commission_payouts` + `commission_payout_items`, migração 0030): um fechamento por (clínica, profissional, mês) e cada sessão paga no máximo uma vez (`uq_commission_payout_items_appointment` em `(appointment_id, kind)`) — as unicidades viram `ConflictError` (409, novo) e barram corrida entre dois Admins. Valor congelado no item.
- **Regras**: fechar M paga o liberado até o fim de M ainda não pago (inclui liberações atrasadas); só mês encerrado; fatura cancelada após o pagamento → estorno negativo no próximo fechamento; saldo ≤ 0 → recusa e o estorno aguarda.
- **Acesso (declarado por família de rota, não no handler)**: `/api/commission-payouts` (visão da clínica + fechamento) entra em `administrative`; o extrato próprio vai para `/api/my-payouts`, numa família nova `professional_self` (Admin e Profissional; Atendente não) que sempre usa o `professionalId` da sessão. Primeira versão tinha uma rota única com checagem de papel no handler — o `route-guard-conformance.test.ts` reprovou (rota "operational" não pode dar 403 a Atendente), e a divisão deixou a regra na matriz de `route-family.ts`, onde o proxy também a aplica. A tela escolhe a rota pelo `role` que `GET /api/auth/identity` passou a expor. Fechamento é auditado (`commission-payout`).
- **Tela**: `/repasses` (item novo no menu) — Admin: saldo por profissional, "Registrar repasse" (data, forma, observações, com prévia das sessões) e histórico; Profissional: "Meus repasses" (a receber, aguardando paciente, regra, histórico).
- **Testes**: domínio (20), casos de uso in-memory (11), API PGlite (7: permissões por papel, 409, isolamento entre clínicas, corrida barrada pelo banco com rollback do cabeçalho), tela (6), profissionais (+2). Sensor: 4 mutantes (pagar duas vezes, fechar mês aberto, Profissional registrando, sem estorno) — todos mortos.
- **Fora de escopo** (resolvido na seção seguinte): reabrir/estornar um fechamento registrado por engano; exportar extrato em PDF.

## Cancelar repasse + comprovante de repasse — CONCLUÍDA

Fecha as duas pontas deixadas em aberto pelo livro de repasses. Decisões do usuário (2026-09-23): **cancelar, nunca apagar**; comprovante imprimível no padrão de `/documentos`.

- **Cancelamento** (`CancelPayout`, `POST /api/commission-payouts/:id/cancel`, família `administrative`): motivo obrigatório (≥ 5 caracteres), grava quem/quando/motivo, audita (`update` em `commission-payout`). O repasse fica no histórico como **Cancelado**; as sessões voltam ao saldo e o mês pode ser fechado de novo. Migração 0031: `status`/`cancelled_*` no cabeçalho, `active` nos itens e os índices únicos viram **parciais** (`status = 'active'` / `active`) — a unicidade continua barrando pagamento duplo entre repasses ativos.
- **Só o mais recente ativo de cada profissional** pode ser cancelado (409 apontando o mês a cancelar antes): um fechamento posterior pode ter descontado estornos do anterior, e cancelar fora de ordem deixaria o desconto sem origem. A tela só oferece o botão nesse repasse.
- **O sistema não movimenta dinheiro**: se o valor já foi transferido, a devolução ou compensação é combinada com o profissional (aviso no formulário).
- **Retrato da regra**: `rule_kind`/`rule_value` no cabeçalho — o comprovante mostra a regra aplicada naquele fechamento, não a atual. Repasses anteriores a 0031 ficam com regra "não registrada".
- **Comprovante** (`/documentos/repasse/:id`, número `REP-…` pela mesma emissão idempotente dos demais documentos): cabeçalho da clínica (bloqueia com cadastro incompleto), profissional/registro, mês, data e forma de pagamento, regra, sessões e estornos, total, linha "recebi o valor acima" para o profissional, marca CANCELADO com motivo. Admin lê qualquer um da clínica (`GET /api/commission-payouts/:id`); Profissional só o próprio (`GET /api/my-payouts/:id`, 404 para o alheio — nem a existência vaza).
- **Testes**: domínio (+3), casos de uso in-memory (+5: reabre e refecha, visão geral em aberto, só o mais recente, outro profissional não bloqueia, inexistente/já cancelado), API PGlite (7: permissões por papel e clínica, 409 fora de ordem, 400 motivo curto, auditoria, reabertura real pelos índices parciais, número `REP-` idempotente), tela (+4), documento (6). Sensor: 4 mutantes (sem regra do mais recente, itens não desativados no Drizzle, comprovante alheio liberado, visão geral contando cancelado) — todos mortos.

## Gateway de agenda preguiçoso (A2) — CONCLUÍDA

Achado A2 da análise de 2026-09-22: `getRepositories` consultava o banco em **todo** request (`buildCalendarGateway` → `google_accounts.findMostRecent`), mesmo em rotas que nunca usam a agenda.

- **Fix**: `calendar` passa a ser `LazyCalendarGateway` (`src/application/ports/calendar-gateway.ts`) — resolve no primeiro uso, memoriza (chamadas simultâneas compartilham a resolução) e tenta de novo se a resolução falhar. Sem integração no ambiente (nem OAuth nem service account), o container devolve `NullCalendarGateway` direto, sem consulta. A prioridade OAuth → service account → nulo e o cache por clínica (issue #74) ficaram iguais.
- **Sincronização**: `scheduleCalendarSync` só descarta de imediato o gateway nulo; o preguiçoso é resolvido dentro do `after()` — a leitura da credencial saiu do caminho da resposta — e, se resolver para o nulo (nenhuma conta conectada), não sincroniza.
- **Relação com #151** (segmentar o container): resolve só a parte de desempenho; a segmentação organizacional continua `ready-for-human`.
- **Testes**: gateway preguiçoso (5), `calendar-sync` (+3), origem da credencial com PGlite (5: não lê a credencial ao montar e lê uma vez ao usar, OAuth sem conta → nulo, service account, sem integração → nulo sem consulta). Sensor: 5 mutantes (resolução antecipada, sem atalho do nulo, sem checar nulo após resolver, sem nova tentativa, sem memorizar) — todos mortos.

## Pronto para várias réplicas (A4) — CONCLUÍDA

Achado A4 da análise de 2026-09-22: rate limit, caches e fotos viviam na memória ou no disco do processo. Decisões do usuário (2026-09-23): **rate limit em Postgres** (sem serviço novo) e **fotos em bucket S3-compatível**.

- **Rate limit** (issue #77): `SharedRateLimiter` em login, esqueci a senha, definir senha e bootstrap, contando em `rate_limit_windows` (migração 0032) com um upsert atômico de janela fixa — exato entre réplicas. Falha do banco → limite em memória da réplica (nunca libera tudo), com log. Poda das janelas vencidas no máximo uma vez por janela por processo.
- **Limite global da API ficou por réplica nesta entrega** — resolvido na seção seguinte (#77).
- **Fotos**: `S3PhotoStorage` (`@aws-sdk/client-s3`), ligado por `PHOTO_STORAGE=s3`; disco local continua o padrão, então o deploy atual não muda. A chave espelha o caminho do disco (`<clinicId>/condition-photos/<id>`) — migrar é copiar `uploads/` para o bucket. Variável S3 faltando falha na montagem, nunca volta ao disco em silêncio. Um `S3Client` por processo.
- **Estado por processo que fica como está** (seguro por réplica): cache de revogação de sessão (TTL 60 s sobre o banco), cache de relatório de mês fechado (só relatório assentado, imutável) e cache do gateway de agenda (só reaproveita token).
- **Testes**: rate limit com PGlite (9: contagem, janela vencida, 8 acessos simultâneos sem perder incremento, poda, **duas réplicas somando o mesmo limite**, contadores separados por endpoint, queda do banco → limite local, poda uma vez por janela); S3 (11: gravar/ler/remover, isolamento por clínica, path traversal, 404, corpo vazio, configuração pelo ambiente, container). Rotas de autenticação existentes (137) seguem passando. Sensor: 6 mutantes (limite com off-by-one, janela sem reinício, falha liberando tudo, chave sem clínica, 404 não tratado, container ignorando S3) — todos mortos. `npm run build` ok com o SDK.

## Issue #77 — limite geral da API somado entre réplicas — CONCLUÍDA

Pedido do usuário (2026-09-23): resolver a #77 por inteiro. Faltava o limite geral de `/api/*` (`proxy.ts`), que tinha ficado por réplica para não gravar no banco a cada request.

- **Fix**: `SharedRateLimiter` ganha `syncEveryMs`. Com `0` (endpoints de autenticação) cada acesso vai ao banco, exato como antes. Com `> 0` (proxy, 1 s), a réplica conta localmente e envia o acumulado ao banco no máximo 1×/s por IP (`hit(..., amount)` soma o lote no mesmo upsert atômico), lendo de volta o total global. Deriva limitada a 1 s de tráfego por réplica; escritas: ≤ 1 por IP por segundo por réplica.
- **Falha do banco**: limite em memória da réplica; o acumulado não enviado fica para a próxima sincronização. Chaves paradas saem da memória na poda (1× por janela).
- **Redis dispensado**: o critério da issue citava Redis; a decisão do usuário foi Postgres, sem serviço novo. `API_RATE_LIMIT_MAX` continua configurável.
- **Testes**: +6 no `shared-rate-limit` (lote no upsert, 1 ida ao banco por segundo, envio do acumulado, **duas réplicas em lote somando o teto**, falha → local e nova tentativa, poda da memória); `proxy.test.ts` passa a usar PGlite e zera o contador entre cenários. E2E completo local: 84 passaram, 1 intermitente já conhecido (`responsive-tables › relatórios`, colisão de horário nos dados de teste). Sensor: 6 mutantes (lote contado como +1, acumulado descartado, sem lote, contagem local sempre liberando, sem poda da memória, proxy sem limite) — todos mortos.

## Paciente cancela e remarca pelo portal (N6, item 8a) — CONCLUÍDA

Pedido do usuário (2026-09-23): implementar o item 8 (lacunas de produto do N6), uma PR por tópico. Este é o primeiro tópico; os outros (agenda por profissional, lista de espera + cancelamento tardio, pagamento parcial + desconto + recibo) seguem em PRs próprias.

- **Regra**: antecedência mínima fixa de 24 h (`PATIENT_CHANGE_MIN_NOTICE_HOURS`); dentro dela o portal manda falar com a clínica. Configuração por clínica fica para o tópico de política de cancelamento tardio.
- **Registro do cancelamento**: `appointments.cancelled_at/cancelled_by/cancel_reason` (migração 0033). Cancelamento da equipe grava `clinic`; o do portal, `patient`. O alerta "cancelada pela clínica" do portal (PORT-09) ignora os do próprio paciente.
- **Remarcação**: mesma duração, procedimento, preço e profissional; mesma regra de disponibilidade da equipe (`RescheduleAppointment`). A listagem de horários aceita `appointmentId` (duração/profissional da consulta, ela mesma não conta como conflito).
- **Decisões**: motivo opcional para o paciente; sem notificação ativa à equipe (a agenda mostra a origem no detalhe); remarcação só dentro da janela de oferta de 14 dias (UI), sem limite no servidor além de "futuro".

## Agenda por profissional, almoço e feriados (N6, item 8b) — CONCLUÍDA

Segundo tópico do item 8 (lacunas de produto do N6), PR própria.

- **Almoço** na grade da clínica (`schedule_settings.lunch_start_minute/lunch_end_minute`, migração 0034): vale para todos; nenhuma consulta pode invadir.
- **Feriados/recessos e ausências** (`schedule_closures`): da clínica (dia fechado para todos) ou de um profissional (só as consultas dele). Cadastrar não cancela consultas: a resposta devolve as ativas no período e a tela avisa. Sem importação de feriados nacionais — entrada manual (decisão: evitar dependência externa e feriados municipais variam).
- **Horário semanal do profissional** (`professional_availability`): janelas por dia da semana; sem janelas = segue a clínica. Editado só pelo Admin (família `/api/professionals`); feriados/ausências também pela Atendente (família da grade).
- **Regra única**: `assertSlotAvailable` ganhou o repositório de disponibilidade; todos os caminhos de agendamento (equipe, recorrência, portal, remarcação e listagem de horários) passam por ele. A listagem do portal lê bloqueios/horário uma vez por chamada (memo), não por candidato.
- **Testes**: domínio, aplicação, API (PGlite: isolamento entre clínicas, Atendente 403 no horário do profissional, pausa em todos os caminhos) e telas; E2E de ausência em Configurações. Sensor: 9 mutantes, 1 sobreviveu (consulta de bloqueios por intervalo) → teste de férias de vários dias adicionado, morto. E2E completo: 85 passaram, 2 intermitentes já conhecidos (`responsive-tables › relatórios`, `export-lgpd › auditoria`) passaram na nova tentativa.

## Lista de espera e política de cancelamento tardio (N6, item 8c) — CONCLUÍDA

Terceiro tópico do item 8, PR própria (empilhada na de agenda por profissional por causa da numeração das migrações).

- **Política por clínica** (`schedule_settings.cancel_notice_hours/late_cancel_fee_cents`, migração 0035): antecedência mínima do portal (substitui as 24 h fixas do item 8a) e taxa opcional. Cancelamento pela equipe registra quem pediu; pedido do paciente dentro da antecedência fica `cancelled_late`. Taxa (tardio ou falta) é decisão da equipe, vira fatura pendente ligada à consulta — nunca entra em comissão (consulta não concluída).
- **Lista de espera** (`waitlist_entries`): recepção e paciente (portal, quando o dia não tem horário) entram na fila; ao cancelar, a agenda avisa quantos aceitam o dia. Sem agendamento automático nem aviso ativo ao paciente — depende do item 3 (WhatsApp), ainda aguardando D1–D4.
- **Decisões**: taxa não bloqueia nada (é fatura comum, pode ser cancelada no Faturamento); PUT da grade preserva campos omitidos; re-resolver uma entrada da fila é 409.
- **Testes**: domínio, aplicação, API (PGlite: taxa como fatura, tardio persistido, política no portal, fila com isolamento entre clínicas e posse no portal) e telas (painéis de cancelamento/falta, fila na agenda e no portal, fluxo de agendar a partir da fila). Sensor: 10 mutantes, 3 sobreviveram (rota do portal sem política, painel mandando taxa indevida, tardio não persistido) → testes adicionados, todos mortos. E2E: lista de espera na agenda; completo com 86 passando e os 2 intermitentes conhecidos passando na nova tentativa.

## Pagamento parcial, desconto e recibo (N6, item 8d) — CONCLUÍDA

Quarto e último tópico do item 8, PR própria, sobre a `main` já com a lista de espera (#171) — a migração 0036 vem depois da 0035.

- **Recebimentos** (`invoice_payments`, migração 0036): fatura aceita vários pagamentos; só vira `paid` quando alcança o líquido. Backfill `legacy-<id>` para as já pagas. Resumo: recebido = soma dos pagamentos; a receber = saldo das pendentes.
- **Desconto** (`invoices.discount_cents/discount_reason`): com motivo, só pendente, nunca abaixo do já recebido nem total (total = cancelar). Fatura com pagamento não pode ser cancelada (409).
- **Recibo** por pagamento (`REC-`), com desconto, recebido até o momento e saldo.
- **Decisões**: comissão não muda — libera só com a fatura quitada e continua sobre o valor da sessão (desconto é custo da clínica); convênio/TISS segue fora (backlog); recibo só para o Admin (o portal mostra pago/saldo, sem recibo).
- **Testes**: domínio, aplicação, API (PGlite: parcial→quitação, resumo, desconto, 409 no cancelamento, auditoria, isolamento, número do recibo, backfill da migração) e telas (formulários, Faturamento, recibo, portal). Sensor: 9 mutantes, 1 sobreviveu (recebido acumulado no recibo) → teste com dois pagamentos, morto. E2E completo: 88 passaram, 1 intermitente conhecido.


## Revisão pré-produção #183 — lote P0 + P1 (2026-09-26) — ENCERRADO (#229)

P0 #187, #191; P1 #192, #193, #197–#203, #205 via `tlc-implement` ([checklist](../../.checks/pre-producao-p0-p1.md)). CI (#203): jobs `build-e2e-prod` (~2 min 40 s com build) e `docker` (~2 min 30 s) rodam em paralelo ao `ci` (~6–9 min) e ao `e2e` (~13 min). Achado: `node:crypto` em `shared/id.ts` violava a CSP de produção no cliente.

## Issue #247 — mensagem de falha de conexão no recover-super-admin (2026-09-28) — ENCERRADO (#255)

Gap 4 do `.checks/b3-recuperacao-super-admin.verified.md` (B3, #214, PR #237): `runRecoverSuperAdminCli` abria o banco (`deps.openDb()`) dentro do mesmo `try` da recuperação, então uma falha de conexão (`DATABASE_URL` errada, banco fora do ar) imprimia `ROLLED_BACK_MESSAGE` ("transação desfeita") mesmo sem nenhuma transação ter existido.

**Detalhes**: `openDb()` passou a rodar num `try` próprio, antes da recuperação; se rejeitar, a CLI imprime `DB_CONNECTION_FAILED_MESSAGE` (cita conexão/`DATABASE_URL`, sem falar em transação) e sai `1`. Falha depois de o banco abrir continua reportando `ROLLED_BACK_MESSAGE`, sem mudança de comportamento. `docs/engineering/producao.md` § 10 (tabela de saídas) atualizada. Especificado com `tlc-spec-driven` (spec pequena, sem Design/Tasks formais) em `.specs/features/recover-super-admin-opendb-message/spec.md`. Gate local: typecheck, lint (Biome), check:sv, test:coverage (1293 suites / 4136 testes, thresholds 90% mantidos) e check:docs verdes; CI (4 jobs) verde; CodeRabbit só resumo, sem achados.

- **Next step**: nenhum pendente desta issue.
- **Blockers**: nenhum.
- **Branch**: `fix/247-recover-super-admin-opendb-message` (a deletar após squash-merge). PR #255, squash-merged em `main` (`3581d8d`). Issue #247 fechada via `Closes #247`.

## Issue #209 — foto clínica sem cache e com leitura auditada (2026-10-10) — ENCERRADO (#276)

P2 da revisão pré-produção #183. `GET /api/photos/[id]` (equipe) e `GET /api/portal/patient/photos/[id]` (paciente) passaram a responder `Cache-Control: no-store`, e cada download grava `recordAudit` (`read`, `photo`) nas duas rotas. `404` e `403` não gravam evento. A leitura passou a usar `sessionScope`, e a escrita continua em `writeScope`. Regra nova: PRO-RN-13. Spec em `.specs/features/foto-clinica-leitura/spec.md`.

**Detalhes**: o item 3 da issue (super_admin vendo fotos de outra empresa) não foi implementado porque contradiz o ADR-007. Ficou como pergunta aberta para @KalleoPinheiro. Efeito registrado pelo Verifier: com `no-store`, cada montagem do `<img>` baixa a foto de novo e grava outro evento `read`. Isso é consequência direta da issue. Gate local: e2e 235/235 e `test:coverage` 4314/4314 (linhas em 96,92%, branches em 91,69%). CI com os 4 jobs verdes e Verifier independente com PASS.

- **Next step**: resposta do dono sobre o item 3 (ADR-007 vs. ADR novo, opção C).
- **Blockers**: nenhum.
- **Branch**: `fix/209-foto-clinica`. PR #276, squash-merged em `main` (`29cb72f`). Issue #209 fechada via `Closes #209`.

## Issue #208 — login endurecido (2026-10-10) — ENCERRADO (#279)

P2 da revisão pré-produção #183. O `POST /api/auth/login` fecha três brechas:

- **Oráculo de tempo:** e-mail sem conta, convite pendente ou hash antigo rodam um scrypt fictício no custo atual.
- **Limite por conta:** além do limite por IP, 5 tentativas por minuto por e-mail normalizado no `SharedRateLimiter`, com a chave em SHA-256 do e-mail.
- **Custo do scrypt:** senha nova usa `N=2^17`. O hash `2^14` continua valendo e é refeito no login bem-sucedido por compare-and-set, sem derrubar sessões.

Regra nova: ACE-RN-38. Spec em `.specs/features/endurecer-login/spec.md`. Memória do login (~128 MiB por scrypt) documentada em `docs/engineering/producao.md`.

**Detalhes**: o item 4 da issue (política de senha) ficou fora porque é decisão de produto. Estão em aberto em AD-031 para @KalleoPinheiro duas perguntas: o travamento por terceiros (6 erros travam a conta por 1 min) e a política de senha do staff (tamanho mínimo, senhas vazadas, 2FA). CI com os 4 jobs verdes e Verifier independente com PASS (132/132 nos testes-alvo, hash legado conferido byte a byte).

- **Next step**: respostas do dono em AD-031.
- **Blockers**: nenhum.
- **Branch**: `fix/208-endurecer-login`. PR #279, squash-merged em `main` (`9a7b1c0`). Issue #208 fechada via `Closes #208`.

## Issue #207 — sessão expirada vai ao login e preserva o rascunho (2026-10-10) — ENCERRADO (#277)

P2 da revisão pré-produção #183. Um `401` de API numa tela autenticada passa a levar a `/login?error=session_expired&next=<rota>` em vez de mostrar "Não autenticado" em cada tela.

- **Retorno à tela:** o login volta ao `next`, validado só em `safeNextPath` (`src/lib/login-redirect.ts`). Ele aceita apenas caminho interno, e as telas de login são recusadas.
- **Proxy:** só marca `session_expired` quando havia cookie de sessão.
- **Corpo não-JSON:** respostas como 502/504 em HTML viram "Serviço indisponível, tente novamente".
- **Rascunho:** o SOAP e a anamnese que falham por `401` vão para o `sessionStorage` da aba, junto com o e-mail da conta, e reabrem só para a mesma conta e o mesmo paciente (`use-session-draft.ts`).

Regras novas: ACE-RN-39, renumerada depois que a #208 ocupou a ACE-RN-38, e PRO-RN-14. Spec em `.specs/features/fix-207-sessao-expirada/spec.md`.

**Detalhes**: o E2E `sidebar-responsive.spec.ts` falhava às vezes porque o seletor `button[aria-expanded]` também casava com os botões "Cancelar" dos retornos. O seletor foi corrigido nesta PR. Risco residual: um `401` de outra chamada *antes* do clique em salvar navega sem guardar o SOAP. CI com os 4 jobs verdes e Verifier independente com PASS (fuzz de `safeNextPath` com 300 mil entradas).

- **Next step**: o dono responder às perguntas abertas: `sessionStorage` vs. `localStorage`, texto próprio para sessão revogada e texto do aviso de rascunho.
- **Blockers**: nenhum.
- **Branch**: `fix/207-sessao-expirada`. PR #277, squash-merged em `main` (`9b89df2`). Issue #207 fechada via `Closes #207`.

## Issue #245 — rotas da plataforma leem o banco dentro do envelope (2026-10-11) — ENCERRADO (#282)

P3 da revisão pré-produção #183. As rotas `/api/platform/clinics/[id]/**` liam a clínica antes do `handleRequest`. Com o banco fora, o Next respondia um 500 fora do envelope `{ success, data, error }` e sem o log padronizado.

- **Leitura dentro do envelope:** o helper `loadPlatformClinic(id)` (`src/app/api/platform/clinics/[id]/platform-clinic.ts`) lê com `clinicScope(id)` e é chamado dentro do `handleRequest` nas 7 rotas.
- **404 inalterado:** o caso de não encontrado continua 404 com a mesma mensagem, via `PlatformNotFoundError`.
- **Autenticação antes do banco:** `requireStaffSession` continua rodando antes de qualquer acesso ao banco.

Regra nova: ACE-RN-40. Teste `tests/api/platform-clinic-envelope.test.ts`, parametrizado sobre as 7 rotas.

**Detalhes**: fica fora do escopo um caso que já existia: no PATCH `[id]`, a clínica que some entre a leitura e a escrita ainda responde 500. Nota do Verifier: `PlatformNotFoundError` chama `super('', '')` e depois sobrescreve a `message`, o que funciona mas é frágil. CI com os 4 jobs verdes e Verifier independente com PASS.

- **Next step**: nenhum.
- **Blockers**: nenhum.
- **Branch**: `fix/245-plataforma-envelope`. PR #282, squash-merged em `main` (`7689b3b`). Issue #245 fechada via `Closes #245`.

## Issue #219 — endurecimento pré-produção (2026-10-11) — ENCERRADO (#283)

P3 da revisão pré-produção #183. São quatro itens de higiene:

1. **`X-Powered-By`:** o cabeçalho foi removido (`poweredByHeader: false`).
2. **Profissional da consulta:** a consulta avulsa, a série recorrente e a ausência agora passam por `assertActiveProfessional`. Profissional de outra empresa ou inexistente dá 404; inativo dá 400. A série valida uma vez, antes do laço.
3. **404 sem UUID:** a mensagem do `NotFoundError` não leva mais o id. O id vai só para o log. No portal, o `entityId` passou a ser o id da conta em vez do e-mail de login, por LGPD.
4. **COOP/CORP:** `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy` passam a ser `same-origin` em toda rota.

Regra nova: AGE-RN-12. Spec em `.specs/features/endurecimento-219/spec.md` (H-01..H-07).

**Detalhes**: fora do escopo ficaram `RescheduleAppointment` (mantém o profissional já validado), `SetProfessionalHours` (só checa existência) e `POST /api/waitlist` (sugerido como follow-up). Antes do merge, a `main` com a #282 foi trazida para a PR e o CI rodou de novo. CI com os 4 jobs verdes e Verifier independente com PASS, incluindo discriminação: cada mudança desfeita derruba algum teste.

- **Next step**: respostas do dono a duas perguntas. Remarcar consulta de profissional inativado depois de marcar: hoje continua permitido. Registrar ausência de profissional inativo: agora dá 400.
- **Blockers**: nenhum.
- **Branch**: `fix/219-endurecimento`. PR #283, squash-merged em `main` (`13c78cc`). Issue #219 fechada via `Closes #219`.

## Issue #246 — testes do portal do Super Admin com asserções fortes (2026-10-11) — ENCERRADO (#287)

P3 que reúne as lacunas não bloqueantes que os Verifiers do B2 ao B6 apontaram. A mudança é só de testes: nenhum arquivo de `src/` mudou.

- **C23:** um cookie emitido antes do recadastro do segundo fator recebe 401.
- **C9:** o teste conta os `company_admin` órfãos quando `adminEmail` é inválido.
- **E-mail de contato:** `contactEmail: ''` grava `null`, e a clínica volta a "Cadastro incompleto".
- **C18:** o cookie do `partner` cai na suspensão.
- **Trilha da plataforma em memória:** ordem e paginação.
- **Tela de auditoria:** colunas, rótulos e "Carregar mais".

O C21 já estava corrigido na `main` (`93b79dc`). Spec em `.specs/features/fix-246-testes-portal-super-admin/spec.md`.

**Detalhes**: a discriminação foi provada por mutação manual em `src/` (M1–M4). Cada teste novo falha com a regra quebrada, e vários testes antigos passavam mesmo assim. Fica registrada uma nota: o recadastro do segundo fator incrementa `session_version`, mas não chama `forgetSessionStatus`. Por isso o cookie antigo pode valer até 60 s na instância que o tinha em cache, dentro da garantia do ADR-005. Revogar na hora pede uma issue separada. CI com os 4 jobs verdes e Verifier independente com PASS.

- **Next step**: nenhum. Revogação imediata no recadastro do segundo fator, se for desejada, numa issue nova.
- **Blockers**: nenhum.
- **Branch**: `fix/246-testes-portal-super-admin`. PR #287, squash-merged em `main` (`af53ff5`). Issue #246 fechada via `Closes #246`.

## Issue #224 — fake timers do CalendarGrid restaurados em afterEach (2026-10-11) — ENCERRADO (#286)

P3 da revisão pré-produção #183, só de testes. Dois testes de `CalendarGrid` (`tests/pages/staff-agenda.test.tsx`) ligavam `vi.useFakeTimers()` e só restauravam o relógio na última linha. Uma falha no meio vazava os fake timers e virava uma cascata de timeouts em `waitFor`. Agora o `describe('Feature: Grade do calendário')` tem `afterEach(() => vi.useRealTimers())`. A varredura de `tests/**` confirmou que os outros usos já restauram o relógio de forma garantida.

**Detalhes**: o comportamento do `CalendarGrid` e de `isInvalidDay` fica fora do escopo. CI com os 4 jobs verdes e Verifier independente com PASS.

- **Next step**: nenhum.
- **Blockers**: nenhum.
- **Branch**: `fix/224-calendar-grid-timers`. PR #286, squash-merged em `main` (`0d85711`). Issue #224 fechada via `Closes #224`.

## Issue #221 — documentação de ambiente bate com o código (2026-10-11) — ENCERRADO (#288)

P3 da revisão pré-produção #183. `.env.example`, `docs/engineering/onboarding.md` § 4 e o README passaram a bater com as variáveis que o código lê:

- **Variáveis mortas:** saem as `CLINIC_*`.
- **Variáveis sem documentação:** entram as do compose e do E2E, e as internas das suítes, marcadas como "não defina".
- **WhatsApp:** a linha passa a dizer que é opt-in futuro (RM-14).
- **`RESEND_API_KEY`/`EMAIL_FROM`:** ficam opcionais em todo lugar, conforme o ADR-011. Isso inclui `docker-compose.yml` (`:?` → `:-`), `integrations/resend.md`, `producao.md` § 8 e `troubleshooting.md`.

O teste novo `tests/docs/env-docs.test.ts` trava a divergência nos dois sentidos: variável lida pelo código sem documentação e variável documentada que ninguém lê.

**Detalhes**: o item 4 da issue (marcadores do `next dev` no `AGENTS.md`) já estava resolvido na `main`. `scripts/docker-smoke.sh` ainda passa uma chave Resend falsa, que é desnecessária mas não causa problema. O Verifier independente deu FAIL na primeira rodada (3 achados, corrigidos) e PASS na segunda. CI com os 4 jobs verdes.

- **Next step**: nenhum.
- **Blockers**: nenhum.
- **Branch**: `fix/221-docs-ambiente`. PR #288, squash-merged em `main` (`90d2bf0`). Issue #221 fechada via `Closes #221`.

## Issue #291 — senha da equipe e 2FA por papel (2026-10-11) — ENCERRADO (#298)

Decisões de @KalleoPinheiro sobre a AD-031 (#208).

- **Senha da equipe:** mínimo de **10** caracteres e recusa de senhas de uma **lista local de senhas comuns** (`src/domain/auth/{password-policy,common-passwords}.ts`), no convite, na redefinição e na troca. Quem já tem senha continua entrando até a próxima troca. O portal segue com mínimo de 8.
- **Link de convite e redefinição:** uma senha recusada **não queima o link** (`findUsableBySecretHash` antes da reivindicação atômica).
- **2FA por papel** (`mfaPolicy`): obrigatório para super_admin e company_admin, opcional para atendente e profissional, inexistente nos portais. O Admin sem fator cadastra o autenticador no próximo login.

ADR-012, ACE-RN-41/42, RM-22. Spec em `.specs/features/senha-2fa-equipe/`. AD-031 foi arquivada.

**Detalhes**: não há migração. CI com os 4 jobs verdes, E2E 237/237 e Verifier independente com PASS. Perguntas abertas para @KalleoPinheiro: (1) derrubar na hora as sessões dos Admins sem fator; (2) remover o segundo fator de um Admin que perdeu o celular (sugerido dentro da #295); (3) aplicar a lista de senhas comuns também ao portal.

- **Next step**: respostas às 3 perguntas. A tela "Minha conta" (#295) e o QR code (#250).
- **Blockers**: nenhum.
- **Branch**: `feat/291-senha-2fa-admin`. PR #298, squash-merged em `main` (`b7b8c3d`). Issue #291 fechada via `Closes #291`.

## Issue #292 — parceiro só vê dado clínico com consentimento (2026-10-11) — ENCERRADO (#300)

Decisão de @KalleoPinheiro sobre a #216 (item 2).

- **Consentimento:** o portal do parceiro só mostra condições, avaliações e consultas de um paciente indicado quando o paciente deu **consentimento específico e revogável** para aquele parceiro. Ele é registrado por paciente × parceiro, com data e versão do texto (placeholder até o texto jurídico do #216).
- **Sem consentimento:** o parceiro vê só "Atendido(a)" ou "Sem atendimento realizado".
- **Janela:** o histórico visível tem limite de **24 meses**.
- **Revogação:** o paciente revoga pelo portal e a equipe pela ficha.

**Detalhes**: CI com os 4 jobs verdes e Verifier independente com PASS (PSC-01..08). Perguntas abertas para @KalleoPinheiro: (1) consultas sem consentimento ficam ocultas, ou mostrar datas e status sem o procedimento?; (2) "atendido" significa consulta concluída nos últimos 24 meses, ou qualquer consulta já feita?; (3) o aceite é só pelo portal, ou a equipe também registra um aceite assinado em papel?

- **Next step**: texto jurídico do consentimento (#216) e respostas às 3 perguntas.
- **Blockers**: nenhum.
- **Branch**: `feat/292-consentimento-parceiro`. PR #300, squash-merged em `main` (`e8c8001`). Issue #292 fechada via `Closes #292`.

## Issue #215 — grade, taxa e ausências por papel (2026-10-11) — ENCERRADO (#299)

Decisão de @KalleoPinheiro.

- **Grade, almoço, intervalo e política/taxa de cancelamento:** só `company_admin`, nas duas camadas (proxy e handler). A leitura da agenda passou a usar `/api/schedule-config` para todos os papéis.
- **Feriados:** Admin e Atendente.
- **Ausências:** Admin e Atendente para qualquer profissional. O Profissional registra e remove só a própria (`closure-permission.ts`). Fora disso, 403 sem gravar.
- **Tela Configurações:** abre para toda a equipe, e cada papel vê só as seções permitidas.

Regras novas: AGE-RN-13 e **ACE-RN-43**. A regra nasceu como ACE-RN-41; o orquestrador renumerou no merge com a `main`, porque a #298 já ocupava a 41 e a 42.

**Detalhes**: o conflito com a `main` estava só em `docs/domains/acesso/README.md` e foi resolvido no merge commit `16e4e6d`. Depois disso, CI com os 4 jobs verdes e Verifier independente com PASS (292 testes em 13 arquivos). Pergunta aberta para @KalleoPinheiro: abrir a seção "Contas de acesso" de Configurações para Atendente e Profissional, só com os papéis de portal?

- **Next step**: resposta à pergunta aberta.
- **Blockers**: nenhum.
- **Branch**: `fix/215-permissao-grade`. PR #299, squash-merged em `main` (`bf42f1d`). Issue #215 fechada via `Closes #215`.

## Issue #294 — retenção e anonimização automática (2026-10-11) — ENCERRADO (#302)

Decisão de @KalleoPinheiro (#216, item 4). O job de cron `POST /api/retention/run` usa o mesmo `CRON_SECRET` dos lembretes e anonimiza, empresa a empresa, o que passou do prazo. **Nada é excluído do banco**; a exceção é o arquivo de foto, que é apagado do volume.

| Tipo | Prazo | Regra |
| --- | --- | --- |
| Prontuário e fotos | 20 anos após a última atividade clínica | PRO-RN-15 |
| Trilha de auditoria | 5 anos | ACE-RN-44 |
| Lista de espera | 2 anos após a resolução | AGE-RN-14 |
| Contas inativas | 2 anos após `deactivated_at` | ACE-RN-45 |

- **Execução:** idempotente (marcadores por tipo), auditada só com contagens, em lotes de 200 pacientes e 500 fotos. Cada empresa roda isolada das outras.
- **Escopo:** usa `clinicScope` em tudo, menos na listagem de empresas e na trilha da plataforma.
- **Referências:** ADR-013, RM-23, migração `0049`, runbook § 7.1 (crontab da VPS) e `vercel.json` às 06:00.

**Detalhes**: CI com os 4 jobs verdes e Verifier independente com PASS (RET-01..07). Ficam **sem processar até decisão de @KalleoPinheiro**:

1. entradas da lista de espera ainda `waiting` com o período vencido;
2. contas de parceiro inativas;
3. o cadastro do profissional;
4. textos de fatura e pagamento;
5. eventos já criados no Google Agenda;
6. o prazo de guarda dos backups, que ainda trazem o dado de antes da anonimização;
7. a reativação de uma conta anonimizada, que não é bloqueada.

- **Next step**: decisão do dono sobre os 7 pontos.
- **Blockers**: nenhum.
- **Branch**: `feat/294-retencao-anonimizacao`. PR #302, squash-merged em `main` (`a514f9e`). Issue #294 fechada via `Closes #294`.

## Issue #206 — runbook de produção na VPS Hetzner (2026-10-12) — ENCERRADO (#304)

Decisão de @KalleoPinheiro (2026-10-11): VPS Hetzner com docker compose, uma réplica, Caddy com TLS, fotos em volume, RPO 24 h / RTO 4 h e alertas por e-mail. O runbook (`docs/engineering/producao.md`, § 1–9) cobre provisionamento, TLS e `TRUSTED_PROXY_HOPS`, segredos e rotação (inclusive a chave `age`), migrações, backup/restore com teste mensal, `/etc/cron.d/vitta` (backup → lembretes → retenção), primeiro acesso e alertas. Vercel + Supabase vira "alternativa não adotada".

- **Scripts:** `scripts/backup.sh` (`pg_dump` e tar do volume `uploads` direto para `age -R`, sem dado em claro no disco, `SHA256SUMS`, cópia externa por `BACKUP_OFFSITE_CMD`, retenção local de 30 dias, `flock`); `scripts/restore.sh` (só confere sem `--confirmar`); `scripts/backup-smoke.sh` no job `docker` do CI.
- **Compose:** `docker-compose.prod.yml` + `deploy/Caddyfile`; o app deixa de expor porta direto. Sem mudança em `src/`.

**Detalhes**: CI com os 4 jobs verdes e Verifier independente com PASS (D1–D6, V1–V4), depois de um FAIL na 1ª rodada (tar das fotos vazando em claro pelo log do Docker). Ficam **para decisão de @KalleoPinheiro**:

1. provedor e local da cópia fora do servidor, e se haverá snapshot ou retenção imutável no destino;
2. localização do servidor na Hetzner (DE/FI/EUA), junto com a #216;
3. cifra do disco do servidor (LUKS pesa no RTO);
4. relay de e-mail do host para os alertas do cron (porta 25 de saída bloqueada);
5. horário dos lembretes (ponto de partida: 08:00 de São Paulo).

- **Next step**: decisão do dono sobre os 5 pontos; monitoramento segue na #212.
- **Blockers**: nenhum.
- **Branch**: `docs/206-runbook-producao`. PR #304, squash-merged em `main` (`2ed747e`). Issue #206 fechada via `Closes #206`.

## Issue #293 — direitos do titular no portal (2026-10-12) — ENCERRADO (#303)

Decisão de @KalleoPinheiro (#216, item 3; LGPD art. 18). Roadmap RM-24.

- **Cópia dos próprios dados:** o portal ganha `GET /api/portal/patient/export`, com o mesmo JSON da exportação LGPD da equipe, mas só do titular da sessão. A resposta não fica em cache, e a auditoria `read`/`export` é gravada antes de responder (POR-RN-13).
- **Pedidos de correção ou eliminação/anonimização:** o paciente faz o pedido em `/api/portal/patient/data-requests`. Pedido não muda dado, e só pode haver um pendente por tipo (`409`, com índice único parcial). O paciente acompanha a situação e a justificativa (POR-RN-14).
- **Fila do Admin de Empresa:** fica em `/pedidos-titular`. Aceitar e recusar exigem justificativa e valem uma vez só. O paciente é avisado por e-mail no endereço do cadastro, sem o conteúdo do pedido (PRO-RN-16). A auditoria é gravada antes de qualquer escrita.
- **Persistência:** tabela `data_subject_requests` (migração `0050`), com `details`/`resolution` cifrados (PRO-RN-12) e incluídos na recifragem. A retenção (#294) apaga esses textos ao anonimizar o paciente (PRO-RN-15).
- **Texto jurídico:** o aviso em `src/lib/data-rights-text.ts` é **placeholder** e depende da #216.

**Detalhes**: CI com os 4 jobs verdes, depois de update-branch com a #304. O Verifier independente deu FAIL na 1ª rodada (DT-09, corridas, auditoria) e PASS na 2ª (AC1–AC4, DT-01..DT-11). O E2E `portal-parceiro` foi ajustado (684d499) depois do merge com a #294. Ficam **para decisão de @KalleoPinheiro** (implementada a opção mais conservadora):

1. prazo de resposta ao pedido (art. 19 fala em 15 dias): hoje sem prazo nem alerta;
2. aviso por e-mail ao Admin quando chega pedido novo (hoje não há);
3. destino do aviso ao paciente: o e-mail do cadastro, não o de login do portal;
4. limites: um pendente por tipo, descrição obrigatória só na correção, até 1000 caracteres;
5. justificativa obrigatória também ao aceitar;
6. aceitar não altera dado (correção pela ficha; anonimização pela #294);
7. a cópia é completa, sem a janela de 24 meses e com as observações internas do cadastro.

- **Next step**: decisão do dono sobre os 7 pontos; texto jurídico na #216.
- **Blockers**: nenhum.
- **Branch**: `feat/293-direitos-titular`. PR #303, squash-merged em `main` (`c7f586e`). Issue #293 fechada via `Closes #293`.

## Issue #212 — observabilidade de produção (2026-10-12) — ENCERRADO (#306)

Decisões de @KalleoPinheiro (2026-10-11): VPS Hetzner, GlitchTip self-hosted, alertas por e-mail pelo canal da plataforma. Roadmap RM-25; ADR-014 (`@sentry/core` com evento montado por lista do que pode sair, sem PII).

- **Health:** `GET /api/health` (liveness sem I/O, alvo do HEALTHCHECK) e `GET /api/health/ready` (banco + todas as migrações aplicadas, `503` senão).
- **Request-id e logs:** o proxy aceita ou gera `x-request-id` e devolve em toda resposta; uma linha JSON por evento; `console.*` só no logger.
- **Erros:** `logError` sanitiza e envia o mesmo objeto ao GlitchTip; sem `GLITCHTIP_DSN`, no-op. `docker-compose.glitchtip.yml` opcional, porta só no loopback.
- **Alertas:** `POST /api/alerts/run` (cron a cada 5 min) para readiness, 5xx, lembretes sem rodar há > 26 h e falha de envio de e-mail, com um e-mail a `ALERT_EMAIL_TO` no máximo a cada 60 min. Migração `0051_job-runs` (ACE-RN-46, COM-RN-14).
- **Migração no boot (0a9a850, pelo orquestrador):** como o HEALTHCHECK deixou de tocar o banco, o container ficava healthy sem migrar e o smoke do backup/restore quebrava. `warmUpDatabase()` no `instrumentation.ts` dispara a migração em segundo plano (respeita `VITTA_MIGRATE_ON_BOOT=false`), e `backup-smoke.sh` espera o readiness.

**Detalhes**: CI com os 4 jobs verdes no head 0a9a850. O Verifier independente deu FAIL na 1ª rodada (6 achados) e PASS na 2ª (OBS-01..14). Ficam **para decisão de @KalleoPinheiro**:

1. limiares dos alertas (ponto de partida: 10 erros 5xx e 3 falhas de envio em 15 min; 60 min entre avisos iguais);
2. "falha de envio" conta só recusa/erro do provedor, não clínica sem canal configurado;
3. captura de erro no navegador (não implementada: exige DSN público, CSP e cuidado com texto da tela);
4. retenção de 30 dias dos eventos no GlitchTip;
5. qual verificador de uptime externo usar para o servidor inteiro fora;
6. interface do GlitchTip só por túnel SSH ou subdomínio pelo Caddy.

- **Next step**: decisão do dono sobre os 6 pontos.
- **Blockers**: nenhum.
- **Branch**: `feat/212-observabilidade`. PR #306, squash-merged em `main` (`9d00509`). Issue #212 fechada via `Closes #212`.

## Revisão pré-produção #183 — P1 restantes (2026-09-26) — ENCERRADO

> Arquivado em 2026-10-12: o lote saiu (#229 e seguintes), e o alvo de produção mudou para VPS Hetzner + compose (#206, PR #304). O texto abaixo é o snapshot original.

Lote P0+P1 anterior mergeado (#229). Agora #194 (`session_version`, [ADR-005](../../docs/adr/005-revogacao-de-sessao-por-versao.md)), #195 (`DATA_ENCRYPTION_KEY`, [ADR-006](../../docs/adr/006-chave-de-dados-clinicos.md)), #196 (conta de portal ↔ cadastro por FK) e #206 ([runbook](../../docs/engineering/producao.md), alvo Vercel + Supabase, VPS + compose pronto) via `tlc-implement` ([checklist](../../.checks/pre-producao-p1-restante.md)), branch `feature/trusting-johnson-yvvp0j`. Deploy exige `DATA_ENCRYPTION_KEY`; depois das migrações: `npm run db:portal-orphans` e `npm run data:reencrypt`. Next: P2/P3 (#207–#224) em outro PR.

## Sequência `/improve-codebase-architecture` (2026-09-06, 2ª rodada) — ENCERRADO

> Arquivado em 2026-10-12: #150 e #149 mergeadas; #151 fechada como not_planned; o flake da #146 foi fechado (ver #308). O texto abaixo é o snapshot original.

Novo relatório de arquitetura rodado em 2026-09-06 (hot spots: `container.ts`, `dto.ts`, `configuracoes/page.tsx`), 3 achados viraram issues via `triage-issue`, resolução via `tlc-spec-driven` um por vez.

| # | Achado | Issue | Triagem | PR | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Seam de save de rascunho duplicado em Configurações (2 adapters, não 3 como a issue original citava — `AccountsSection` tem shape diferente) | #150 | ready-for-agent | #152 | ✅ mergeada (squash) |
| 2 | Grab-bag de DTOs (`src/lib/dto.ts`, ~32 mappers rasos) | #149 | ready-for-agent | #153 | ✅ mergeada (squash) |
| 3 | Bag flat de repositórios (`src/infrastructure/container.ts`, 30 props) | #151 | ready-for-human (especulativo, decisão de valer a pena fica com humano) | — | não iniciado |

**#150 — detalhes**: hook `useSavableForm` extraído em `src/lib/use-savable-form.ts`; `ClinicInfoSection` e `ScheduleSection` consumindo. Verifier independente: PASS, 6/6 ACs, sensor 3/3 mutantes mortos. 1 gap não-bloqueante (CFG-SEAM-06, refresh pós-save não asserta refetch diretamente, pré-existente) registrado como lição candidata L-038. E2E flakou em `clinico.spec.ts:110` (issue #146, conhecido) no primeiro run — re-rodado, passou.

**#149 — detalhes**: decisão pré-spec com o usuário — DTOs continuam em `src/lib/dto/` (não `domain/*`, que violaria a camada documentada em `CONTEXT.md`). `src/lib/dto.ts` (845 linhas) virou 17 módulos por aggregate + `src/lib/dto/index.ts` como barrel de compatibilidade; zero dos 102 consumidores de `@/lib/dto` mudou (troca de arquivo por diretório é transparente pro resolver). Verifier independente: PASS limpo, 5/5 ACs, 2808/2808 testes idênticos ao baseline, 3 mappers com lógica computada confirmados byte-idênticos ao original, zero ciclo de import. E2E flakou de novo em `clinico.spec.ts:110` (2ª ocorrência na mesma sessão) — re-rodado, passou.

**Observação sobre #146**: o flake recorreu 2x na mesma sessão (PRs #152 e #153), sempre a mesma asserção (`clinico.spec.ts:130`, bloqueio de avaliação em condição resolvida), sempre passa no re-run. Reforça a suspeita de race condition já registrada na issue; candidato a subir de prioridade se recorrer numa 3ª vez.

- **Next step**: nenhum agendável sem o usuário — #151 é `ready-for-human` (decisão de valer a pena fica com humano). Próximo trabalho depende de nova demanda ou de decidir #151/#146.
- **Blockers**: nenhum.
- **Branches**: `refactor/configuracoes-savable-form-seam` e `refactor/lib-dto-split` (ambas deletadas local e remota após squash-merge). PRs #152 e #153, squash-merged em `main`. Issues #150 e #149 fechadas via `Closes #`.

## Issue #313 — runbook com as decisões de infra e ADR-015 (2026-10-12) — ENCERRADO (#316)

Decisões de @KalleoPinheiro de 2026-10-12 (AD-033) registradas na documentação:
- **ADR-015** (servidor sem LUKS): as fotos ficam em claro no disco da VPS, com risco aceito. O ADR-006 passa a apontar para ele.
- **Runbook (`producao.md`)** sem perguntas abertas de infraestrutura: Hetzner Alemanha, Storage Box com `BACKUP_OFFSITE_CMD`, `msmtp` na porta 587 com o Resend, UptimeRobot, GlitchTip por túnel SSH com 30 dias de retenção.
- **`alertas.md` e `glitchtip.md`** coerentes com essas decisões.

**Detalhes**: os 4 jobs de CI ficaram verdes e o Verifier deu PASS. Implementado pela sessão filha com o modelo Sonnet 5.5. As perguntas abertas da PR foram respondidas pelo dono no mesmo dia:
1. snapshots da Storage Box: 1 por dia, guardando os 14 mais recentes (registrado no runbook § 5);
2. os 60 min entre avisos iguais ficam;
3. a redação do ADR-015 está confirmada.

- **Next step**: nenhum.
- **Blockers**: nenhum. A base legal da transferência para a UE segue na #216.
- **Branch**: `docs/313-runbook-adr-015`. PR #316, squash-merged em `main` (`c8aa07b`). A issue #313 foi fechada manualmente, porque a PR não tinha `Closes`.

## Issue #309 — sessões do Admin sem 2FA e senha única no portal (2026-10-17) — ENCERRADO (#317)

Decisões de @KalleoPinheiro na #309 (2026-10-12) implementadas, mais a decisão delegada de 2026-10-17 sobre contas inativas:
- **Migração `0052`** soma 1 ao `session_version` de todo `company_admin` sem linha em `user_mfa`; o proxy revoga a sessão antiga em até 60 s e o Admin cai no cadastro do autenticador no próximo login (ACE-RN-49).
- **Política de senha única** (mínimo de 10 e lista de senhas comuns) para equipe, paciente e parceiro, conferida antes de ler o token (ACE-RN-48). `assertPasswordPolicy` deixou de receber o papel.
- **Contas inativas:** a migração não filtra por conta ativa. É a opção mais segura (conta reativada nunca volta com sessão anterior ao 2º fator) e sem custo, porque conta inativa não tem sessão usável. Registrado no ADR-016 e no ACE-RN-49.

**Detalhes**: o CI do GitHub estava sem cota, então o gate rodou localmente: `typecheck`, `lint`, `check:sv`, `check:docs`, `test:coverage` (96,8% de linhas), `npm run build`, E2E de produção (37/37) e E2E completo (239/239). Revisão com a skill the-judge: nenhum achado (dois `as unknown as` só em teste). A PR é de contas existentes sem schema novo além do UPDATE de dados.

- **Next step**: #295 (reset do 2º fator) e #250 seguem na fila.
- **Blockers**: nenhum. Docker smoke não rodado: o ambiente não tem daemon Docker e nenhum arquivo de imagem mudou.
- **Branch**: `feat/309-sessoes-2fa-senha-portal`. PR #317, squash-merged em `main`. Issue #309 fechada via `Closes #309`.

## Issue #311 — retenção: pontos restantes da #294 (2026-10-12) — ENCERRADO (#318)

Decisões de @KalleoPinheiro de 2026-10-12 aplicadas ao job `POST /api/retention/run` (ADR-013). **Sem migração.**
1. **Lista de espera `waiting` vencida:** vira `expired` quando o período termina, e daí contam os 2 anos (AGE-RN-15).
2. **Parceiro inativo:** anonimizado 2 anos após a desativação; o `partner_id` é solto (EQP-RN-07).
3. **Textos livres de fatura:** anonimizados junto com o paciente; valores, datas e status ficam (FIN-RN-13).
4. **Google Agenda:** os eventos do paciente anonimizado são **apagados** (AGE-RN-16). O `google_event_id` só é limpo depois de apagar, e a falha é tentada de novo na próxima execução.
5. **Reativação de conta anonimizada:** bloqueada, com `409` (ACE-RN-47).
6. **Cadastro do profissional:** guardado (EQP-RN-08). O ADR-013 ganhou uma seção datada, que inclui os backups de 30 dias.

**Detalhes**: os 4 jobs de CI ficaram verdes e o Verifier deu PASS (RES-01..RES-09). Implementado pela sessão filha com o modelo Sonnet 5.5. Ficam **para decisão de @KalleoPinheiro**:
1. o ADR-013 é `frozen`, mas ganhou a seção datada porque a issue pediu; vale manter ou abrir um ADR novo?
2. anonimizar também o **cadastro** do parceiro (`partners`)?
3. bloquear a reativação do **cadastro do paciente** anonimizado?
4. a troca de senha e o reenvio de convite em conta anonimizada também devem ser recusados?

- **Next step**: decisão do dono sobre os 4 pontos.
- **Blockers**: nenhum.
- **Branch**: `feat/311-retencao-restante`. PR #318, squash-merged em `main` (`4ad4219`). Issue #311 fechada via `Closes #311`.

## Issue #296 — Profissional: POSTs sem vínculo e saldo de pacotes (2026-10-17) — ENCERRADO (#320)

Decisões de @KalleoPinheiro de 2026-10-11 (AD-026 e AD-027):
- `POST /api/follow-ups` e `POST /api/waitlist` devolvem 403 ao Profissional para paciente sem vínculo (`assertPatientLinkedForProfessionalWrite` roda antes de gravar). Admin e Atendente não mudam.
- Nova rota `GET /api/patients/:id/packages` (família `clinical`, vínculo R4, `sessionScope`) com `PackageBalanceDto` sem campo monetário. `GET /api/packages` segue `administrative`.
- A aba Pacotes do prontuário aparece para o Profissional, sem preço.

**Detalhes**: sem migração (não colide com a 0052 da #317). Como o GitHub Actions estava sem cota, o gate do CI foi rodado localmente sobre a branch já na ponta da `main`: typecheck, lint, check:sv, check:docs, test:coverage (96,8% statements) e E2E dev e de produção. O Chromium do container é outra revisão, então os E2E usaram uma config temporária só com `executablePath`, não commitada.

- **Next step**: nenhum.
- **Blockers**: nenhum. O Atendente segue sem a aba Pacotes, porque a decisão cobre só o Profissional.
- **Branch**: `feat/296-profissional-vinculo-pacotes`. PR #320, squash-merged em `main`.

## Perguntas abertas das PRs #298–#318 e #216 (2026-10-17) — ENCERRADO (#330)

@KalleoPinheiro delegou as decisões (segurança, escalabilidade, performance, coerência com o negócio). Registro: ADR-017 (retenção, completa o ADR-013, que voltou ao texto original), ADR-018 (transferência para a UE) e AD-034 no STATE.
- **Cadastro de `partners`:** guardado (indicação, consentimento e comissões dependem dele).
- **Paciente anonimizado:** não reativa (`409`, PRO-RN-17). Único código novo.
- **Conta anonimizada:** já não recebia senha nem convite (inativa, tokens apagados); ganhou teste (ACE-RN-51).
- **Storage Box:** outra localização da UE, backup `age`-cifrado, snapshots diários com 14 guardados.
- **#306:** limiares 10/3, `delivered=false` só do provedor, sem erro do navegador, UptimeRobot, GlitchTip por túnel e 30 dias já constavam em AD-032; nova a regra de deploy **0050 antes da 0051** (runbook § 4).
- **#300:** consentimento do parceiro é do par paciente × parceiro e não acompanha troca nem inativação (POR-RN-11).
- **#216:** base técnica no ADR-018; texto jurídico segue pendente.

**Detalhes**: gate local (Actions sem cota) sobre o head rebaseado: typecheck, lint, check:sv, check:docs, test:coverage (4798 testes, 97,15% linhas), build e Playwright completo (239). ADRs 016/017 e ACE-RN-48/49 já tinham sido tomados pela #317, então os meus viraram 017/018 e ACE-RN-50.

- **Next step**: jurídico confere a Res. CD/ANPD nº 32/2026 na fonte primária, define o mecanismo para Resend/Google Agenda e entrega os textos (#216); ao receber o do consentimento do parceiro, trocar texto e versão juntos.
- **Blockers**: nenhum para o código.
- **Branch**: `claude/project-thread-kbdcsh`. PR #330.

## Issue #322 — auditoria: índice composto e paginação por cursor (2026-10-17) — ENCERRADO

`/auditoria` e a trilha de plataforma paginam por cursor (ACE-RN-51), sem `offset`.
- **Migração `0053`**: troca `idx_audit_events_clinic` por `idx_audit_events_clinic_trail (clinic_id, occurred_at desc, id desc)` e cria o índice parcial `idx_audit_events_platform_trail` (mesmo predicado de `PLATFORM_EVENT`). Os índices usam `DESC NULLS FIRST` (o padrão do `ORDER BY ... DESC`), senão o planejador não evita o `Sort`.
- **Keyset por comparação de linha** `(occurred_at, id) < (...)`: a forma `a < x OR (a = x AND b < y)` virava Bitmap Scan + Sort no `EXPLAIN`, então não serve para o índice.
- **Contrato**: `limit` + `cursor` no lugar de `offset`; `meta.nextCursor` na resposta; telas usam `useCursorPagedQuery`. `offset` enviado por clientes antigos é ignorado (vem a 1ª página).
- **Testes**: estabilidade com evento novo entre páginas (Drizzle e em memória), empate de data, cursor inválido e prova do índice por `EXPLAIN`.

**Decisão delegada**: não foi criado ADR, pois segue o padrão de cursor da #75; o ADR-010 (congelado) cita `limit/offset` e o ACE-RN-51 o supera.

- **Next step**: a umbrella #210 fecha quando seus filhos fecharem (#322 era um deles).
- **Blockers**: nenhum.

## Issue #312 — Direitos do titular: prazo de 15 dias, aviso ao Admin e resposta no e-mail de login (2026-10-17) — EM REVISÃO

Decisões de @KalleoPinheiro de 2026-10-12 sobre as perguntas abertas da #303:
- Prazo de 15 dias corridos (LGPD, art. 19), contado em dias de calendário no fuso `APP_TIMEZONE`. A fila `/pedidos-titular` mostra o dia limite e os dias restantes; vencido e a 3 dias ou menos ficam em destaque.
- O Admin de Empresa recebe e-mail a cada pedido novo (aviso e link da fila, sem o texto do pedido) e um alerta único quando falta `DATA_REQUEST_ALERT_DAYS` dias (padrão 3, 1 a 14) ou o pedido venceu sem aviso. O alerta roda dentro do cron diário `/api/reminders/run` (sem rota nem segredo novos), pelo canal de e-mail de cada clínica; sem canal, nada é marcado.
- A resposta ao paciente vai para o e-mail de login da conta do portal (`findByPortalLink`), nunca para o do cadastro; sem conta ativa, não há aviso e a resposta fica no portal.

**Detalhes**: migração `0054` (coluna `deadline_alerted_at`). Contrato do cron ganhou o campo aditivo `dataRequestDeadlines`. Docs: PRO-RN-16, POR-RN-14, `cron.md`, onboarding, `.env.example` e a spec `direitos-titular-293` (DT-12 a DT-15 e decisões). Pergunta aberta da issue (antecedência do alerta) resolvida com o ponto de partida dela: 3 dias, configurável.

- **Next step**: nenhum.
- **Blockers**: nenhum.
- **Ordem de deploy**: aplicar a migração 0054 antes de subir o código (o `SELECT` do repositório lê a coluna nova).

## Issue #295 — contas: sem senha pelo PATCH, Minha conta, trava do último admin e reset de 2FA (2026-10-17) — ENCERRADO (#334)

Decisões de @KalleoPinheiro de 2026-10-11 e 2026-10-12 (AD-024) implementadas. Registro: ADR-019, ACE-RN-11/25 reescritas e ACE-RN-52 a 53 novas.
- **PATCH sem senha:** `PATCH /api/accounts/[id]` aceita só `active` (`strict`): `password` ou campo extra dá `400`. O admin só gera o link de redefinição.
- **Minha conta:** `/minha-conta` (clínica) e `/plataforma/minha-conta` (Super Admin). `POST /api/me/password` exige a senha atual (`400` se errada), aplica a política, audita antes (`password-change`), sobe a `session_version` e renova o cookie de quem trocou: só as outras sessões caem. 5 tentativas por minuto por conta.
- **2º fator opcional:** Atendente/Profissional ligam em Minha conta (`/api/me/mfa/enroll` com senha atual, `/api/me/mfa/confirm`); 10 códigos de recuperação saem uma vez. Não existe "desligar" pela própria tela (sessão roubada não remove a defesa). Descoberta de teste: o `verify` do login responde `401` ao código errado, o que mandaria a tela de Minha conta ao login (`redirectToLoginOnExpiredSession`); por isso a confirmação tem rota própria e responde `400`.
- **Trava do último admin:** `409` (era `400`), na clínica e na plataforma; a corrida de duas desativações dá `200` e `409`. Desativar a própria conta continua `400`.
- **Reset do 2º fator (comentário de 2026-10-12):** `POST /api/accounts/[id]/reset-mfa` (Admin, matriz do ACE-RN-05, nunca a própria conta) e a ação `reset-mfa` da plataforma para o `company_admin`. Audita, derruba as sessões, apaga fator e códigos. Conta sem fator ou desativada: `409`.
- **Decisões minhas, para conferir:** (1) o Admin pode redefinir o fator de **outro** Admin da clínica (a matriz já deixa um Admin desativar outro); a própria conta não, porque quem tem sessão usa os códigos de recuperação; (2) o Super Admin cobre a clínica com um admin só; (3) Atendente/Profissional voltam a entrar só com a senha depois do reset, e religam em Minha conta; (4) senha nova igual à atual é recusada.
- **Gate:** o GitHub Actions está sem cota, então o gate rodou local sobre a branch: typecheck, lint, check:sv, check:docs, test:coverage, build de produção e Playwright. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Next step:** nenhum. A #250 (QR code no 2º fator do Super Admin) e a #297 já podem entrar.
- **Blockers**: nenhum.
- **Branch**: `claude/project-thread-l8wpq4`. PR #334.

## Issue #324 — telefone do paciente em E.164 (2026-10-17) — ENCERRADO

Paciente guarda telefone em E.164 BR (PRO-RN-18, AD-035), validado no domínio e, portanto, na API e na tela de cadastro.
- **Domínio**: `src/domain/shared/phone.ts` (`parseBrazilianPhone`) aceita máscara, `+55`/`0055`, zero de tronco, fixo e celular com 9; rejeita sem DDD, DDD inexistente, celular sem 9, tamanho errado e internacional, cada um com mensagem. DDD 55 (RS) não é confundido com DDI.
- **Legado sem migração**: `Patient.update` só valida telefone **novo**; DTO ganhou `phoneNeedsCorrection` e lista/ficha mostram "Corrigir telefone". Anonimizado não é sinalizado.
- **WhatsApp**: `whatsappLink` valida e lança `ValidationError` com o motivo (`400`); o clique só é registrado se o link nasce. `normalizeBrazilianPhone` ficou só para o gateway da Meta (some na #328).
- **Busca**: telefone digitado com máscara acha o E.164 guardado (Drizzle e memória).
- **Sem migração de banco**, então não disputa número com a 0053/0054.

**Decisão delegada**: sem DDD é rejeitado, nunca adivinhado; internacional rejeitado; parceiro fica como estava.

- **Next step**: #326 (CPF no recibo) pode seguir; pacientes legados são corrigidos pela recepção na ficha.
- **Blockers**: nenhum.


## Issue #250 — QR code no cadastro do 2º fator (2026-10-17) — ENCERRADO

Decisão de @KalleoPinheiro de 2026-10-11 implementada: o QR é gerado no navegador a partir do `otpauthUri`, sem ser gravado nem enviado; a chave em texto e o link continuam como alternativa.
- **Componente:** `src/components/otpauth-qr.tsx` (`qrcode.toDataURL`, imagem `data:` PNG). Usado no cadastro do `/login` (super_admin, company_admin e recadastro após código de recuperação) e em Minha conta (2º fator opcional, #295). Nenhuma rota nova, nenhuma requisição leva o segredo; a CSP já permitia `img-src data:`. Se a geração falhar, nada aparece e a chave/link seguem valendo.
- **Dependência:** `qrcode` 1.5.4 (aprovada na issue) e `@types/qrcode` em dev.
- **Docs:** ACE-RN-19 deixa de dizer "sem QR"; nota no ADR-008. Sem regra nem ADR novos.
- **Testes:** componente (o QR é gerado com exatamente o link recebido; falha silenciosa; muda o link, muda o QR), login e Minha conta.
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Next step:** nenhum. **Blockers:** nenhum.

## Issue #310 — Parceiro: consentimento em papel registrado pela equipe, com auditoria (2026-10-17) — ENCERRADO (#335)

Decisões de @KalleoPinheiro (2026-10-12): só o **Admin de Empresa e o Atendente** registram; o Profissional recebe `403`.
- `POST /api/patients/:id/partner-consent/paper`: aceite novo (ator `staff` = origem `papel`) com `recorded_by` (e-mail da conta) e data, auditoria `create`/`partner-consent`, idempotente. Libera o parceiro como o aceite do portal (POR-RN-11, POR-RN-16).
- **Migração `0055`**: coluna `partner_share_consents.recorded_by`. Revogação pela equipe passa a gravar `recorded_by` também.
- **Decisão delegada**: a sub-rota `partner-consent` saiu da família clínica (`route-family.ts`), senão o Atendente receberia `403` antes do handler. Efeito: o Atendente também lê o status e revoga (só reduz o compartilhamento; pedido típico de balcão). O handler de `/paper` repete a restrição por papel (ADR-002). A varredura de conformidade ganhou a lista `HANDLER_DENIED_ROLES`.
- **Decisão delegada**: o aceite em papel usa o texto vigente; trocar o texto (#216) invalida o aceite em papel como o do portal. O nome de quem lançou aparece só na ficha, nunca no portal do paciente.
- **UI**: botão "Registrar consentimento em papel" no painel da ficha, com confirmação mostrando o texto; escondido ao Profissional e enquanto a identidade carrega.

- **Next step**: o texto jurídico final (#216) invalida consentimentos já registrados; planejar a recoleta.
- **Blockers**: nenhum.
- **Ordem de deploy**: aplicar a migração 0055 antes de subir o código (o `INSERT`/`SELECT` do repositório usa a coluna nova).
## Issue #217 — Google Agenda sem dado de paciente além das iniciais (2026-10-17) — ENCERRADO

Decisão de @KalleoPinheiro de 2026-10-11 implementada: o evento leva `Consulta · J.S.` + horário + link `/agenda?consulta=<id>&em=<início>`; sem nome completo, telefone, procedimento nem observações. Criação e remarcação usam o mesmo conteúdo (bug do título "Consulta remarcada" corrigido).
- **Código:** `eventContent`/`consultationLink` em `sync-appointment-calendar.ts` (recebe `APP_URL` validado http/https por `scheduleCalendarSync`); `patientInitials` em `src/domain/patient/initials.ts`; a página `/agenda` abre o mês e os detalhes da consulta a partir do link.
- **Decisão delegada (ADR-020):** conta Google restrita a Workspace fica só como recomendação documentada, sem trava em código.
- **Docs:** AGE-RN-18, `docs/engineering/integrations/google-calendar.md` (o que é enviado + base legal + eventos antigos).
- **Testes:** payload de criação e remarcação (idêntico, sem nome/telefone/procedimento), iniciais, `APP_URL`, E2E do link.
- **Pendências para o Kalléo:** eventos criados antes da #217 mantêm o conteúdo antigo até remarcar (sem reescrita em lote; abrir issue se quiser). Docker/smoke não rodam no container (sem daemon). Nenhuma migração.
- **Next step:** nenhum. **Blockers:** nenhum.


## Issue #213 — Portal: limites anti-abuso de consultas e fotos (2026-10-17) — ENCERRADO

Números de @KalleoPinheiro (2026-10-11): 2 consultas futuras, 60 dias, 10 fotos por dia, `proxyClientMaxBodySize` ajustado.
- **Domínio:** `PORTAL_MAX_FUTURE_APPOINTMENTS`, `PORTAL_BOOKING_HORIZON_DAYS` e as asserções em `patient-self-service.ts`; `PATIENT_MAX_PHOTOS_PER_DAY` em `condition-photo.ts`; `ConditionPhotoRepository.countPatientUploadsSince` (Drizzle e memória).
- **Casos de uso:** `ScheduleOwnAppointment` (horizonte + teto), `RescheduleOwnAppointment` (horizonte), `ListAvailableSlots` (dia além do horizonte = `400`, nunca lista vazia), `assertPatientPhotoQuota` chamado pela rota de fotos depois do consentimento. Mensagens em português, `400`.
- **Config/UI:** `next.config.ts` com `proxyClientMaxBodySize: '6mb'`; a oferta da UI passou de 14 para 60 dias (`OFFER_WINDOW_DAYS`).
- **Decisões delegadas (AD-036):** o teto conta consultas de qualquer origem; "por dia" = janela móvel de 24 h; horizonte é instante; `400` e não `429`.
- **Testes:** `portal-abuse-limits.test.ts` (cada limite, bordas, cancelada/passada/equipe/outro paciente), rota de fotos, rota de agendamento/slots, repositório Drizzle (pglite), `next-config`. Os testes de rota com datas absolutas de 2027 agora fixam o relógio (`tests/support/clock.ts`), senão o horizonte de 60 dias os quebraria com o tempo.
- **Docs:** POR-RN-17 no portal, AD-036. Sem migração, sem ADR.
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Next step:** #325 (e-mail do cuidador) já não depende da #213. **Blockers:** nenhum.

## Issue #248 — CNPJ da clínica: conferir o dígito verificador (2026-10-17) — ENCERRADO

Decisão de @KalleoPinheiro de 2026-10-11 (opção b) implementada: `normalizeCnpj` confere o DV pelo módulo 11 da Receita (valor do caractere = ASCII − 48, serve ao CNPJ numérico e ao alfanumérico) e recusa com `CNPJ inválido: dígito verificador não confere` (`400`) na criação e edição pela plataforma e em `PUT /api/settings/clinic-info`.
- **Código:** `src/domain/clinic/cnpj.ts` (único ponto; os dois caminhos já passam por `Clinic.updateInfo`/`Clinic.create`).
- **Decisão delegada (CNPJ já gravado e inválido):** sem migração nem saneamento; o valor gravado segue valendo e só é recusado quando reenviado (a tela de edição reenvia o CNPJ, então o admin corrige ao editar). Motivo: migração que falha ou apaga CNPJ derruba cadastro em produção sem ganho; o impacto é corrigível pela própria clínica. Sem ADR (decisão de escopo pequeno, registrada em ACE-RN-23).
- **Fixtures:** testes e `e2e/global-setup.ts` passaram a usar CNPJs válidos; `legacy-clinic` não tem CNPJ (nada a mudar).
- **Docs:** ACE-RN-23 em `docs/domains/acesso/README.md`.
- **Testes:** `tests/domain/cnpj.test.ts` (numérico, vetor alfanumérico `12.ABC.345/01DE-35`, DV errado, formato).
- **Next step:** nenhum. **Blockers:** nenhum. Nenhuma migração.



## Issue #339 — Google Agenda: reescrita em lote dos eventos antigos (2026-10-17) — ENCERRADO

Eventos criados antes da #217 passam a ser reescritos só com iniciais, horário e link (AGE-RN-18) por um script manual; nenhum evento é apagado.
- **Código:** `MinimizeCalendarEvents` (`src/application/appointments/minimize-calendar-events.ts`), `scripts/minimize-calendar-events.ts` (`npm run calendar:minimize`); `CalendarGateway.rewriteEvent` (propaga falha, `CalendarRateLimitedError`; 404/410 = feito); `AppointmentRepository.findCalendarEventsToMinimize`/`markCalendarEventMinimized`; `publicAppUrl` extraído para `src/lib/public-app-url.ts`. Criação e remarcação também marcam o evento.
- **Migração `0056`:** coluna `appointments.calendar_minimized_at` (nula; sem backfill).
- **Decisões (AD-037):** script manual, janela = todas as consultas (a issue pede nenhum evento com dado; o coordenador sugeriu janela — desvio documentado), ordem futuro→passado, 500 por empresa por execução, rajadas de 10 + pausa de 1 s, backoff 2/4/8 s, cota persistente encerra o lote. Sem ADR novo (ADR-021 está reservado pela #308).
- **Docs:** AGE-RN-19, `integrations/google-calendar.md`, `producao.md` § 7.2.
- **Testes:** lote com falha parcial e retomada, cota/backoff, reexecução idempotente, janela `--desde`, simulação, gateway nulo, auditoria sem PII, repositório Drizzle (pglite, isolamento por empresa).
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Pendências para o Kalléo:** rodar `npm run calendar:minimize -- --confirmar` em produção por empresa depois do deploy (runbook § 7.2). O histórico de revisões do evento no Google não é alterável pela API.
- **Ordem de deploy:** aplicar a migração 0056 antes de subir o código (o `SELECT` de consultas usa a coluna nova).
- **Next step:** nenhum. **Blockers:** nenhum.

## Issue #325 — Paciente: e-mail opcional e repetível (2026-10-17) — ENCERRADO

Decisão delegada por @KalleoPinheiro (opção mais segura) implementada: o e-mail de contato deixa de identificar o paciente; o login do portal já era conta vinculada (#196).
- **Domínio/aplicação:** `Patient.email` é `string | null` (vazio vira `null`; `update` com `undefined` mantém e `null` remove); `normalizeOptionalEmail`/`validateNameAndPhone` em `person-validation.ts` (Parceiro segue com `validatePersonContact`). `CreatePatient`/`UpdatePatient` não checam mais duplicidade; `findByEmail`/`countByEmail` saíram do repositório.
- **Dados:** migração `0057` (`DROP NOT NULL` em `patients.email` + `DROP INDEX uq_patients_clinic_email`); nenhuma linha alterada, reversão exige sanear duplicados.
- **Lembretes:** paciente sem e-mail é `skipped` em `send-reminders.ts`, sem `reminder_logs` nem erro.
- **UI/API:** campo "Email (opcional)" no cadastro; lista e ficha omitem o campo vazio; `POST/PUT /api/patients` aceitam e-mail ausente/`null`; a tela de contas só sugere o e-mail do paciente se existir.
- **Decisões (ADR-023, AD-038):** sem e-mail de contato não há lembrete por e-mail (WhatsApp segue); parceiro e profissional inalterados; o convite da clínica continua sendo o único caminho para criar o login.
- **Testes:** domínio, casos de uso, repositórios (memória e pglite), lembretes, e a rota do portal (dois pacientes com o mesmo e-mail de contato isolados; paciente sem e-mail abre o portal pela conta).
- **Docs:** ADR-023, PRO-RN-01/20, POR-RN-18, COM-RN-18, `docs/README.md`, AD-038.
- **Pendências para o Kalléo:** deploy aplica a migração `0057` depois das anteriores. Docker/smoke não rodam no container (sem daemon).
- **Next step:** #329 (depende de #325). **Blockers:** nenhum.

## Issue #251 — Suspensão de clínica: registrar o motivo (2026-10-17) — ENCERRADO

Decisão de @KalleoPinheiro de 2026-10-11 implementada: suspender pede um motivo da lista fechada (inadimplência, pedido da clínica, incidente de segurança, outro) e observação opcional; só a plataforma o vê; os `company_admin` recebem e-mail ao suspender e reativar, sem o motivo.
- **Código:** `Clinic.suspend(by, at, { reason, note })` (`src/domain/clinic/clinic.ts`; reativar limpa), `SuspendClinic` e `notifyClinicStatusChange` (`src/application/platform/`), corpo validado em `POST .../suspend`, `statusReason`/`statusReasonNote` no `PlatformClinicDto`, modal de motivo em `clinic-status-section.tsx`.
- **Migração `0058`:** `clinics.status_reason`, `clinics.status_reason_note` e check da lista (nulos; sem backfill).
- **Decisões (AD-039):** motivo limpo na reativação (histórico na trilha), auditoria só com o código (`suspend:<motivo>`), aviso a todo `company_admin` ativo em melhor esforço, suspensas antigas ficam sem motivo.
- **Docs:** ACE-RN-27, ACE-RN-28 e ACE-RN-55 em `docs/domains/acesso/README.md`.
- **Testes:** domínio (lista, observação, limpeza), repositório pglite, rota (400 sem/fora da lista, auditoria sem observação, destinatários, falha do provedor, idempotência), tela (motivo obrigatório, corpo enviado, suspensa legada) e E2E de suspensão.
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Ordem de deploy:** aplicar a migração 0058 antes de subir o código (o `UPDATE` de estado usa as colunas novas). Para o aviso sair, a plataforma precisa de `RESEND_API_KEY` e `EMAIL_FROM`.

## Issue #329 — Paciente: responsável/cuidador com nome, parentesco e contato (2026-10-17) — ENCERRADO

Responsável legal ou cuidador cadastrado como entidade própria da empresa, ligada a vários pacientes; os lembretes e o termo de consentimento usam o contato dele.
- **Código:** `Guardian` (`src/domain/guardian/`), `DrizzleGuardianRepository`/`InMemoryGuardianRepository`, casos de uso em `src/application/guardians/`, rotas `/api/guardians` e `/api/guardians/[id]`, `guardianId` em `POST`/`PUT /api/patients`, `guardian` embutido em `GET /api/patients/:id` e na exportação do titular, `GuardianPanel` na ficha, `PatientRepository.findByGuardian`.
- **Migração `0059`:** tabela `guardians` + `patients.guardian_id` (FK, índice). Nenhum dado alterado.
- **Lembretes:** sem e-mail do paciente, vai ao do responsável (saudação a ele, texto em 3ª pessoa, sem portal); `ClinicReminderServices` ganhou `guardians`.
- **Documento:** o termo de consentimento imprime "Responsável legal: nome (parentesco)", CPF em branco; sem responsável, a linha em branco antiga continua.
- **Retenção:** `anonymizePatient` desfaz o vínculo e apaga o responsável sem outro paciente.
- **Decisões (ADR-024, AD-041):** só contato (sem portal), um por paciente, parentesco em lista fechada, gerência do Admin e do Atendente (Profissional só vê), exclusão com paciente ligado = `409`, trilha sem contato.
- **Testes:** domínio, casos de uso, rotas (CRUD, papéis, isolamento por empresa, auditoria, exportação), repositório Drizzle (pglite), retenção, lembretes, DTO, painel da ficha e documento (jsdom).
- **Docs:** ADR-024, PRO-RN-21, COM-RN-19, POR-RN-19, CONTEXT.md, `api.md`, AD-041.
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Pendências para o Kalléo:** aplicar a migração `0059` antes do código. Decisão aberta de produto: se o cuidador deve ter acesso ao portal (hoje não; exige novo ADR).
- **Next step:** nenhum. **Blockers:** nenhum.

## Issue #297 — Remarcação com profissional inativo e revogação no recadastro do 2FA (2026-10-17) — ENCERRADO

Decisões de @KalleoPinheiro de 2026-10-11 implementadas.
- **Remarcação:** `RescheduleAppointment` valida o profissional da consulta (ativo e da empresa) antes do horário; inativo → `400` "Profissional inativo: escolha outro profissional", inexistente → `404`. A rota `PATCH /api/appointments/[id]` passa `services.professionals`.
- **2FA:** `POST /api/me/mfa/confirm` chama `forgetSessionStatus`; o cookie anterior ao recadastro recebe `401` no proxy sem avançar o relógio além do TTL (o teste aquece o cache antes e falha sem a correção).
- **Decisão (AD-040):** a remarcação pelo portal não valida o profissional (pergunta aberta: o paciente segue podendo remarcar consulta de profissional inativo).
- **Docs:** AGE-RN-12/20 e ACE-RN-53; AD-040.
- **Testes:** `appointment-professional-validation` (ativo, inativado, sem profissional, inexistente) e `session-revocation` (recadastro).
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Next step:** nenhum. **Blockers:** nenhum. Sem migração.

## Issue #308 — causa raiz do E2E intermitente (2026-10-17)

**Causa raiz:** o `next dev` (Turbopack) compila rota sob demanda e emite `[Fast Refresh] rebuilding` por vários segundos depois que o navegador conecta o HMR. Em máquina lenta isso cai no meio do teste (modal não fecha, aba ou item não aparece, clique perdido). Os traces mostram o rebuild durante as ações.

**Prova (local, o Actions está sem cota):** `clinico.spec.ts` "registra avaliação PUSH", 20 repetições, `--retries 0`, 1 CPU: `next dev` 9 falhas em 20 (22 min); `next start` 0 em 20 (1,6 min). Aquecer as rotas no `global-setup` foi testado (10 falhas em 20) e descartado. O `--repeat-each` dos specs com horário (`slotForAttempt`) não serve para medir, como já dito na #308.

**Correção (ADR-021):** a suíte principal passa a rodar contra `next start` (`playwright.prod.config.ts`, 222 testes, sem retry); o `next dev` fica só com `ROLE_ACCOUNT_SPECS` (contas por papel, convite lido do log fora de produção) e o modo aberto de `auth.spec.ts` (26 testes). O spec do Profissional de `feriados-ausencias` foi movido para arquivo próprio. Scripts `test:e2e:prod`, `test:e2e:dev` e `test:e2e` (build + os dois). No build apareceu um segundo problema: `settle`/`openTable` usavam `waitForLoadState("networkidle")` sem teto e o prefetch de links da produção impedia a rede de ficar ociosa, estourando o timeout de 60 s nos testes do dashboard; agora há teto de 5 s.

**Validação local (2 CPUs):** suíte de produção, suíte `next dev` (26/26), `typecheck`, `lint`, `check:sv`, `check:docs`, `test:coverage`, `build`.

- **Subconjunto em `next dev`:** o `global-setup` aquece as telas e abas dos specs de papel (`e2e/support/warm-up.ts`) e a asserção da aba Pacotes do Profissional tem 30 s (a API compilava depois dos 10 s); 2 execuções seguidas em 2 CPUs deram 26/26.
- **Pendente:** o subconjunto em `next dev` segue exposto ao Fast Refresh; migrar para o build quando as contas por papel puderem ser criadas sem o log do servidor. O critério "10 execuções seguidas na `main`" fica para quando o Actions voltar (job manual ou cron).
- **Branch:** `claude/project-thread-a0mssu`.

## Issue #327 — Remoção do modo aberto (2026-10-17) — ENCERRADO

- **O que mudou:** sem `AUTH_SECRET` tudo responde 503; `VITTA_ALLOW_OPEN_MODE` removida (sem efeito, com teste). Proxy, `requireStaffSession`, identidade, fechamentos de agenda, gestão de conta, Google Agenda, emissão de documentos, canal de e-mail e responsáveis (#329) não aceitam mais sessão nula.
- **E2E:** removido o segundo `next dev` (porta 3100) e os 2 specs do modo aberto; `next dev` fica só com papéis e login (ADR-021 ajustado).
- **Docs:** ADR-002, AD-042, CONTEXT.md, AGENTS.md, onboarding, troubleshooting, `.env.example`, ACE-RN-01/26.
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke não rodam no container (sem daemon): pendente.

## Issue #297 — complemento: portal bloqueia remarcação com profissional inativo (2026-10-17) — ENCERRADO

Pergunta aberta do AD-040 decidida pelo coordenador: o paciente também não remarca consulta de profissional inativo.
- **Código:** `RescheduleOwnAppointment` recebe o repositório de profissionais (opcional) e recusa com `400` "O profissional desta consulta não está mais disponível. Entre em contato com a clínica para remarcar." (inativo ou inexistente); a rota do portal passa `services.professionals`. Cancelar não muda.
- **Docs:** POR-RN-20, AGE-RN-20, AD-040 (decidido).
- **Testes:** ativo remarca; inativado e sumido são recusados e o horário não muda.
- **Gate:** Actions sem cota; gate rodado local. Docker/smoke não rodam (sem daemon).
- **Next step:** nenhum. **Blockers:** nenhum. Sem migração.

## Issue #328 — Remoção do gateway da Meta WhatsApp (2026-10-17) — ENCERRADO

- **O que mudou:** removidos `MetaWhatsAppGateway`, `MessagingGateway`/`NullMessagingGateway` e `container.messaging` (nenhum caso de uso consumia). Variáveis `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` saem do `.env.example` e do onboarding. Lembretes por e-mail e `wa.me` intactos.
- **Mantido:** `normalizeBrazilianPhone` (domínio, usado pelo `wa.me`), com os casos de teste movidos para `reminder-content.test.ts`.
- **Docs:** `whatsapp-meta.md` reescrito como especificação do RM-14 (planejado, sem código), integrações, comunicação, arquitetura, spec de templates, AD-043. RM-14 segue em Later no roadmap.
- **Gate:** o GitHub Actions está sem cota; gate rodado local. Docker/smoke não rodam no container (sem daemon): pendente.
- **Pendências para o Kalléo:** remover `WHATSAPP_*` do ambiente de produção, se definidas (agora sem efeito).
- **Next step:** nenhum. **Blockers:** nenhum. Sem migração.

## Issue #326 — CPF no recibo para o IRPF (2026-10-17) — ENCERRADO

Recibo `REC-…` passa a trazer o **CPF de quem pagou** e o **CNPJ da empresa**; sem eles a emissão é bloqueada com orientação (FIN-RN-15, PRO-RN-22, AD-044, [ADR-025](../../docs/adr/025-cpf-no-recibo-e-protecao.md)).
- **Domínio**: `src/domain/shared/cpf.ts` (dígito verificador, recusa sequências repetidas, forma de 11 dígitos, máscara `***.***.247-**`); `Patient.cpf` opcional; `InvoicePayment.payer` (nome + CPF) informado ao receber; `src/domain/billing/receipt.ts` decide pagador e prestador e lança `ValidationError` com a orientação.
- **Bloqueio em dois lugares**: `ResolveReceipt` serve a tela (`GET /api/invoices/:id/payments/:paymentId/receipt`) e a emissão (`POST /api/documents/issue` de `recibo` agora exige `invoiceId`). Chamar a rota direto não emite recibo sem CPF/CNPJ.
- **LGPD**: `patients.cpf` e `invoice_payments.payer_cpf` cifrados (ADR-006, `data:reencrypt` cobre); API e telas da equipe só recebem a máscara; o CPF inteiro sai no recibo (leitura auditada sem o número) e na exportação do titular; portal e parceiro não recebem; anonimização apaga o CPF e os pagadores dos recebimentos (valores ficam).
- **Migração 0060** (3 colunas anuláveis: `patients.cpf`, `invoice_payments.payer_name`, `invoice_payments.payer_cpf`). Sem backfill.
- **UI**: campo CPF no cadastro (em branco na edição mantém), "Quem pagou não é o paciente" no registro do pagamento, lista mostra "pago por …", recibo mostra os dois documentos.
- **Decisões minhas (autonomia delegada), para conferir**: (1) máscara mais protetiva que a usual: só 3 dígitos do miolo; (2) prestador = só o CNPJ da empresa (sem CPF de profissional autônomo PF); (3) sem busca/unicidade por CPF, porque a cifra é aleatória; (4) pagador gravado no recebimento imutável, **sem tela para corrigir depois**; (5) reimpressão usa o CPF atual do cadastro; (6) a tela troca o CPF mas não remove (API aceita `cpf: ""`).
- **Gate**: o GitHub Actions está sem cota, então o gate rodou local sobre a branch (ver comentário da PR). Docker/smoke de imagem não rodam no container (sem daemon): pendente.
- **Next step**: se a clínica precisar corrigir pagador de recebimento já gravado, abrir ticket (ação `payer` no PATCH da fatura + tela). #326 não bloqueia mais ninguém.
- **Blockers**: nenhum.

## Issue #216 — Textos LGPD em versão prévia (2026-10-17) — PRÉVIA ENTREGUE; ISSUE CONTINUA ABERTA

Kalléo pediu que a própria thread escrevesse uma versão prévia dos textos para ele ajustar depois. Entregue só como documento (sem código):
- **`docs/legal/textos-lgpd-previa.md`** (`status: draft`, marcado em cada texto como pendente de revisão jurídica): aviso de privacidade, TCLE de tratamento, termo de imagem **separado** (+ termo opcional didático, *proposta não decidida*), consentimento do parceiro; variáveis `{{CLINICA_*}}`/`{{ENCARREGADO_*}}`; tabela de 10 pontos abertos (§ 7); procedimento de promoção ao código (§ 8). Premissas vêm das decisões de 2026-10-11/12/17 (#216, ADR-013/017/018/020).
- **[ADR-026](../../docs/adr/026-textos-lgpd-previa-nao-ligada.md) / AD-045:** a prévia **não é ligada** ao sistema e **não dispara** a invalidação de aceites do #310; `CONSENT_TEXT` `v1` e `v0-placeholder` ficam como estão. Só a promoção do texto revisado troca texto e versão juntos.
- **Docs:** índice `docs/README.md`, README de pacientes-prontuario, `CONTEXT.md` (Consent Record).
- **Sem código, sem migração.** `check:docs` rodado local; o resto do gate não se aplica (nenhum `.ts` mudou).
- **Pendências para o Kalléo:** (1) revisão jurídica; (2) decidir os pontos da § 7 (encarregado, uso didático de foto, mecanismo do art. 33 para Resend/Google Agenda, menores); (3) depois do texto fechado, abrir tickets: aceite de imagem separado (hoje o `ConsentRecord` tem um tipo só), colunas `encarregado_*`/`endereco` em `clinics`, páginas de aviso em login/portal/e-mail. **#216 não fechada; #323 segue bloqueada.**

## Issue #351 — Responsável acessa o portal em nome do paciente (2026-10-17) — ENCERRADO

O responsável (#329) ganha conta própria de portal e age em nome do paciente, sempre evidenciado ([ADR-027](../../docs/adr/027-responsavel-acessa-portal-em-nome-do-paciente.md), AD-046, POR-RN-21..23, ACE-RN-56). Decisão de @KalleoPinheiro; desenho delegado ao coordenador.
- **Código**: papel `guardian` (7º do catálogo, sem 2º fator), `user_accounts.guardian_id` único por empresa (**migração 0061**). `resolvePortalPatient` resolve o paciente pelo vínculo `patients.guardian_id` + cookie `vitta_acting_patient` revalidado a cada requisição, e grava `read`/`guardian-access` antes de seguir. Guarda nova `requirePatientPortalSession`; rotas `/api/portal/guardian/{patients,acting-for}`.
- **Fechado ao responsável (403)**: consentimento, parceiro indicador, cópia dos dados e pedidos LGPD. Foto só com o aceite do paciente.
- **Evidência**: aviso fixo "Acessando em nome de X", "Trocar paciente", cartão no portal do paciente com quem acessa e o último acesso, `detail` "pelo responsável" nas ações, concessão auditada com a atestação da equipe.
- **Equipe**: papel "Responsável do paciente" em Configurações > Contas, com a caixa de atestação. Cadastro com conta não é excluído (409); retenção anonimiza a conta com o último paciente.
- **Numeração**: ADR-026 já era da #352 (#216); este é o 027. Corrigi também a tabela "Variável" de `docs/legal/textos-lgpd-previa.md` (agora "Campo"), que quebrava `tests/docs/structure.test.ts` na main.
- **Gate**: Actions sem cota; gate local (typecheck, lint, check:sv, check:docs, test:coverage, build de produção, E2E prod e dev). Docker/smoke não rodam (sem daemon). the-judge não posta (sem `gh`): autorrevisão.
- **Pergunta aberta**: o paciente adulto revogar sozinho o acesso do responsável pelo portal (hoje, pela clínica). Texto final do consentimento (#216) não muda isto.
- **Next step**: nenhum. **Blockers**: nenhum. Deploy: aplicar a migração 0061 antes do código.

## Issue #354 — Paciente encerra sozinho o acesso do responsável (2026-10-18) — ENCERRADO

Decisão de @KalleoPinheiro: o paciente adulto revoga o responsável pelo portal ([ADR-028](../../docs/adr/028-paciente-encerra-acesso-do-responsavel.md), AD-047, POR-RN-24). Fecha a pergunta aberta da #351.
- **Código**: `patients.guardian_portal_revoked_at` (**migração 0062**); `revokeGuardianAccess` grava `update`/`guardian-access-revocation` (ator = paciente) antes e marca o paciente; `DELETE /api/portal/patient/guardian-access` (só `patient`, responsável `403`, sem responsável/já encerrado `404`). `listRepresentablePatients` e `getGuardianAccess` ignoram o revogado. Botão "Encerrar acesso" com confirmação no portal do paciente; a ficha da equipe mostra a data. Trocar ou desvincular o responsável (`Patient.update`) zera a marca: é assim que a equipe concede de novo.
- **Por paciente, não por conta**: o responsável pode representar outros pacientes; desativar a conta cortaria quem não pediu.
- **Perguntas abertas**: avisar o responsável por e-mail ao ser revogado; tratamento específico para paciente menor (hoje decide a clínica com o representante legal).
- **Next step**: nenhum. **Blockers**: nenhum. Deploy: aplicar a migração 0062 antes do código.

## Issue #355 — Sanear CNPJs antigos inválidos (2026-10-18) — ENCERRADO

Follow-up da #248: empresas gravadas antes da conferência do dígito verificador ficavam inválidas sem aviso ([ADR-029](../../docs/adr/028-cnpj-antigo-invalido-marcado-para-correcao.md), AD-048, ACE-RN-57).
- **Código**: `clinics.cnpj_review_since` (**migração 0063**); `Clinic.flagCnpjForReview`, `isValidCnpj`; caso de uso `FlagInvalidClinicCnpjs` + script `npm run clinics:cnpj-review -- [--confirmar]` (lista sem a flag; marca e audita com ela; idempotente). `updateInfo` com `cnpj` limpa a marca. Aviso em Configurações e na ficha da plataforma.
- **Decisão**: marcar, não apagar nem anular (CNPJ é obrigatório) nem corrigir (inventaria dado). Aviso, não bloqueio.
- **Gate**: Actions sem cota; gate local. Docker/smoke não rodam (sem daemon). the-judge não posta (sem `gh`): autorrevisão.
- **Pergunta aberta**: bloquear o recibo enquanto a empresa tiver a marca?
- **Deploy**: migração 0063 antes do código; depois rodar o script (producao.md §7.3), primeiro sem `--confirmar`.
- **Next step**: nenhum. **Blockers**: nenhum.

## Issue #222 — Baseline de carga (2026-10-18) — ENCERRADO

Medição de carga antes do go-live, sem mudar código da aplicação ([`docs/engineering/performance-baseline.md`](../../docs/engineering/performance-baseline.md), AD-049).
- **Scripts** `scripts/load/{profiles,seed,run}.ts`: seed por `generate_series` direto no Postgres (3 perfis: `tipica`, `multi` com 20 empresas, `issue` com 100 mil consultas e 1 milhão de eventos de auditoria; recusa host não local) e gerador de carga em TypeScript puro (sem dependência nova), 15 rotas de leitura, p50/p95/p99 em Markdown.
- **Resultado**: uso realista (30 usuários, pausa 2 s, ≈ 15 req/s) com p95 ≤ 100 ms em tudo, exceto `/api/portal/patient/slots` (460 ms com 20 profissionais; orçamento 500 ms). Zero erro. Teto com 1 processo: ≈ 165 req/s (típica) e ≈ 82 req/s (`issue`); o `next-server` satura um núcleo, o Postgres fica a ≈ 20 %.
- **Decisões minhas (autonomia delegada), para conferir**: (1) orçamento p95 ≤ 300 ms (≤ 500 ms no `/slots`) e 0 erro; (2) **não construir** os índices compostos do item 1, pois com 400 mil consultas e 2 milhões de eventos as rotas ficam em p95 ≤ 25 ms; (3) uma réplica basta para o go-live.
- **Tickets**: #360 (`/slots` com consulta por candidato) e #361 (job de lembretes, ainda não medido). O bundle caiu de 428 KB para 229 KB no maior chunk (sem tabela por página).
- **Limites**: só leitura, loopback e `fsync=off`; sem navegador, sem escrita, sem o job de lembretes (doc § 7). Repetir `tipica` na VPS definitiva.
- **Gate**: Actions sem cota; local: typecheck, lint, check:sv, check:docs, test:coverage (5 266 testes), build de produção. Nenhum arquivo de `src/` mudou, então o E2E não foi repetido. the-judge não posta (sem `gh`): autorrevisão.
- **Next step**: #360, #361. **Blockers**: nenhum. Também arquivei AD-025 (pergunta respondida em 2026-10-12) para o `STATE.md` caber em 250 linhas.

## Issue #358 — Bloquear recibo com CNPJ marcado (2026-10-18) — ENCERRADO

Fecha a pergunta aberta da #355 por decisão do coordenador (PO): recibo com CNPJ errado não vale como documento fiscal ([ADR-029](../../docs/adr/029-cnpj-antigo-invalido-marcado-para-correcao.md) atualizado, AD-048, ACE-RN-57, FIN-RN-15).
- **Código**: `resolveReceiptParties` lança `CNPJ_UNDER_REVIEW_MESSAGE` quando `cnpjReviewSince` está preenchida (depois da checagem de CNPJ ausente); vale para a tela do recibo e para `POST /api/documents/issue`. A página do recibo mostra o link "Corrigir o CNPJ nas Configurações". Recibos já emitidos (registro de emissão) não mudam; documentos clínicos não são bloqueados.
- **Sem migração.** **Gate**: local completo; Docker/smoke não rodam (sem daemon); autorrevisão.
- **Next step**: nenhum. **Blockers**: nenhum.
## Issue #216 — Textos LGPD finais ligados ao sistema (2026-10-18) — ENTREGUE; REVISÃO JURÍDICA PENDENTE

Pedido de @KalleoPinheiro: "cubra todas as informações necessárias e feche essa etapa, a revisão será feita por profissional da área depois". Supersede a prévia ([ADR-026](../../docs/adr/026-textos-lgpd-previa-nao-ligada.md)) pelo [ADR-030](../../docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md) / AD-050.
- **Textos** (`src/lib/`): TCLE de tratamento `v2`, termo de imagem `v1` (novo, à parte), consentimento do parceiro `v1`, aviso de privacidade `v1`, direitos do titular. `LEGAL_REVIEW_PENDING = true` aparece em Configurações. Guia de troca pós-revisão: [`docs/legal/textos-lgpd.md`](../../docs/legal/textos-lgpd.md) (os 9 pontos do § 7 estão fechados na § 3).
- **Código**: `purpose` em `consent_records` e `controller_snapshot` (hash do texto-base com `{{marcadores}}`); encarregado por clínica (`clinics.dpo_name/dpo_contact`, **migração 0064**); `?purpose=` nas rotas de consentimento; foto exige o termo de imagem; `/api/portal/privacy-notice`, `/api/clinic-info/legal-controller`, página pública `/privacidade`; rodapé de privacidade nos e-mails; termos impressos com clínica e encarregado.
- **Regras**: PRO-RN-23, POR-RN-25, ACE-RN-58, COM-RN-20.
- **Numeração**: a main tomou 0062, 0063 e os ADR-028 e 029 (#354, #355) durante o trabalho; renumerei para migração 0064, ADR-030, AD-050, ACE-RN-58 após rebase.
- **Efeito no deploy**: aceites antigos viram `treatment` e o hash do `v2` difere, então o paciente reaceita o TCLE e aceita o de imagem. Aplicar a migração 0064 antes do código.
- **#323** (retenção da auditoria): o texto final existe, então pode sair de `needs-info`. A revisão jurídica não bloqueia a implementação técnica.
- **Pendências humanas antes de paciente real**: revisão jurídica dos cinco textos; mecanismo do art. 33 para Resend/Google; ato do ANPD/encarregado formal.
- **Limite**: menor de idade não aceita no portal; assinatura do representante segue em papel, sem registro no sistema.
- **Next step**: nenhum técnico. **Blockers**: revisão jurídica (externa).

## Issue #363 — Teto atômico dos limites do portal (2026-10-18) — ENCERRADO

Follow-up da #213: contar e gravar eram passos separados e envios simultâneos do mesmo paciente passavam do teto em 1 ou 2 (AD-051, POR-RN-17). Sem migração e sem ADR novo.
- **Código**: `PatientRepository.findByIdForUpdate` (`SELECT … FOR UPDATE`); `TransactionScope` ganhou `patients`, `scheduleConfig`, `scheduleAvailability`, `conditions`, `conditionPhotos`. `ScheduleOwnAppointment` (agora com `TransactionManager`) tranca o paciente, confere o teto e cria a consulta no mesmo passo; novo `AddOwnConditionPhoto` faz o mesmo com a cota de fotos (a rota usa ele).
- **Testes**: concorrência real com `RowLockingTransactionManager` (imita o lock de linha em memória; sem ele o in-memory não reproduz a corrida) para consultas e fotos, mais teste SQL de que o `FOR UPDATE` é emitido (o PGlite tem uma conexão só e serializa, mesma estratégia da #192).
- **Decisão**: lock de linha em vez de restrição no banco (janela móvel de 24 h e consultas da equipe não cabem em `UNIQUE`/`CHECK`) e de lock distribuído. A foto vai ao storage dentro da transação: commit falho deixa no máximo um arquivo órfão.
- **Housekeeping**: arquivei AD-045 (substituída pelo AD-050) em `decisions-2026.md` para o `STATE.md` caber em 250 linhas.

## Issue #323 — Retenção da trilha de auditoria e runbook (2026-10-18) — ENCERRADO

Fatia da #210 item 2, destravada pela #216 (prazo final no aviso: registros de acesso e alterações, 5 anos). O job de retenção da #294 já anonimizava a trilha; faltavam a fronteira, a fonte única do prazo, o registro de cada execução e o runbook ([ADR-031](../../docs/adr/031-retencao-em-dias-inteiros-e-fonte-unica.md), AD-052, ACE-RN-44, RET-02, RET-09).
- **Código**: `retentionCutoff` conta em dias inteiros no `APP_TIMEZONE` (CC art. 132 § 3º; 29/02 termina em 01/03), para todos os tipos; o aviso de privacidade interpola `RETENTION_YEARS`; teste trava prazo e `PRIVACY_NOTICE_VERSION` juntos. `RunRetention` grava um evento de plataforma a cada execução (`clinics`, `failedClinics`, `auditTrailCutoff`); a clínica só quando algo mudou.
- **Decisões (coordenador como PO)**: prazo configurável só no código, sem variável de ambiente (o aviso não pode ficar desatualizado); trilha anonimizada continua no banco (ADR-013), expurgo/partição é decisão futura.
- **Sem migração.** Runbook: `producao.md` § 7.1 (fronteira, trocar prazo, rodar à mão, conferir, falhas, tamanho).
- **#210**: itens 1 e 4 (#240), 3 (#322, índice composto + cursor) e 2 (esta) feitos; a umbrella fecha junto.
- **Gate**: Actions sem cota; local completo. Docker/smoke não rodam (sem daemon). the-judge não posta (sem `gh`): autorrevisão.
- **Next step**: nenhum. **Blockers**: nenhum.

## Issue #359 — Testes `readiness` e `health-route` intermitentes sob carga (2026-10-18) — ENCERRADO

- **Causa raiz (medida)**: o `afterEach` fazia `vi.resetModules()` e jogava fora o PGlite aquecido no `beforeAll`; o teste seguinte reimportava `db` e a partida a frio (carregar o snapshot, ~1 s ocioso) caía dentro do prazo de 3 s do `checkReadiness`. Sob carga passava dos 3 s e a resposta vinha `database: 'fail'`.
- **Correção**: só testes. `warmDatabase()` abre o banco dentro de cada teste que usa o banco real (`tests/infrastructure/readiness.test.ts`, `tests/api/health-route.test.ts`). Prazo de produção intacto; nenhum teste pulado ou desativado.
- **Teste de suspensão (#251)**: não reproduzi a falha. 14 rodadas dos 12 arquivos de suspensão com 8 processos saturando a CPU, 6 rodadas com ordem embaralhada, suíte inteira (5258) duas vezes sob carga e `coverage`, e os 2 E2E de suspensão: tudo verde. Sem log da falha original (Actions sem cota), não há causa raiz a corrigir; nada foi alterado ali. Para fechar: colar o erro da próxima ocorrência (arquivo, asserção, `Expected/Received`). Observado de passagem: uma rodada de `test:coverage` falhou uma vez em `tests/pages/configuracoes-email-channel.test.tsx` (carregando/falha) e não repetiu em 4 rodadas sob carga nem na suíte inteira seguinte; sem a mensagem do erro, nada a corrigir ainda.
- **Gate**: Actions sem cota; gate local (typecheck, lint, check:sv, check:docs, test:coverage 5329 testes, 96,89% de linhas). Sem mudança em `src/`, então sem E2E novo. Autorrevisão no lugar do the-judge.
- **Next step**: nenhum. **Blockers**: nenhum. Sem migração.

## Issue #361 — Job de lembretes sem consulta por item (2026-10-18) — ENCERRADO

Achado no baseline de carga (PR #362). Sem migração, sem ADR (refatoração sem mudança de comportamento; regra COM-RN-21).
- **Medição** (leituras de repositório por execução, 4 e 40 pacientes com consulta amanhã, retorno vencido e metade com responsável): antes 14 e 122 (`wasSent` por consulta, `lastRecallAttempt` por retorno, `guardians.findById` por paciente sem e-mail); depois 6 e 6.
- **Código**: `ReminderLogRepository.wasSent`/`lastRecallAttempt` viraram `sentReferences`/`lastRecallAttempts` (uma consulta por lote, `IN` + `GROUP BY`, no escopo da empresa); `GuardianRepository.findByIds`; `send-reminders.ts` carrega tudo antes do laço. Destinatário (paciente, senão responsável, ADR-024) e idempotência iguais.
- **Testes**: `send-reminders-queries.test.ts` (leituras iguais com 4 e 40 pacientes, destinatários corretos), mais lote nos repositórios Drizzle e in-memory, com isolamento por empresa e canal.
- **Gate**: Actions sem cota; gate local. Docker/smoke não rodam (sem daemon); autorrevisão no lugar do the-judge.
- **Next step**: nenhum. **Blockers**: nenhum.

## Issue #360 — `/slots` do portal em lote (2026-10-18) — ENCERRADO

`ListAvailableSlots` fazia uma consulta de conflito por horário candidato e era a única rota perto do orçamento (460 ms com 20 profissionais, AD-049). Agora lê as consultas do dia uma vez (AD-053). Sem migração, sem regra de negócio nova.
- **Código**: `assertSlotAvailable` foi dividida em regras (grade, bloqueios, horário do profissional) + conflito; novo `assertSlotAvailableAmong(pool, …)` confere o candidato contra a lista já lida, com a mesma mensagem. `ListAvailableSlots` faz um `findConflicting` sobre a janela do dia (folga mínima nas pontas, mesmo `excludeId` e profissional) e chama a nova função. Agendar e remarcar não mudaram.
- **Testes**: `tests/application/list-available-slots-batch.test.ts` compara, em 8 agendas aleatórias determinísticas (com canceladas, 3 folgas mínimas, almoço), recesso e remarcação, o resultado novo com o laço antigo de `assertSlotAvailable`; e confirma 1 única leitura de conflitos por listagem.
- **Medição** (`scripts/load/`, perfil `issue`, antes e depois na mesma máquina): realista p50/p95 403/593 → 50/79 ms; saturação 4 172/4 920 → 1 622/2 169 ms; sequencial 344/406 → 44/61 ms. Zero erro. Tabela em `performance-baseline.md` § 8.
- **Housekeeping**: arquivei AD-043 em `decisions-2026.md` para o `STATE.md` caber em 250 linhas.
- **Gate**: local completo (ver PR); Docker/smoke não rodam (sem daemon); autorrevisão (sem `gh`).
- **Next step**: #361 (job de lembretes). **Blockers**: nenhum.

## Issue #371 — Aviso de revogação ao responsável (2026-10-18) — ENCERRADO

Decisão de @KalleoPinheiro sobre a pergunta aberta do ADR-028. Sem migração (AD-054; adendo no ADR-028; POR-RN-24).
- **Código**: `revokeGuardianAccess` agora recebe `guardians` e `email` e, depois de gravar a revogação, envia ao responsável um e-mail curto (nome do paciente, sem motivo nem dado clínico). Melhor esforço: sem e-mail no cadastro, canal desativado ou falha de envio/trilha não bloqueiam a revogação; o resultado (`enviado`/`não enviado`/`falha`) vai à trilha `guardian-access-revocation-notice`, sem o endereço; falha é logada com e-mail mascarado.
- **Testes**: `tests/application/revoke-guardian-access-notice.test.ts` (envio, falha, sem e-mail, canal off, falha da trilha) e asserção na rota em `tests/api/guardian-portal.test.ts`.
- **Gate**: ver PR; Actions sem cota, gate local; Docker/smoke não rodam (sem daemon); autorrevisão no lugar do the-judge.
- **Next step**: nenhum. **Blockers**: nenhum.

## Issue #372 — Paciente menor no portal pelo representante legal (2026-10-18) — ENCERRADO

Decisão de @KalleoPinheiro (2026-10-18, "Concordo" à proposta do coordenador): menor sem conta própria; o representante legal acessa com "Acessando em nome de X" e assina os termos no sistema; aos 18 anos a clínica é avisada. [ADR-032](../../docs/adr/032-paciente-menor-no-portal-pelo-representante-legal.md).
- **Código**: `src/domain/patient/majority.ts` (menor = < 18 hoje no `APP_TIMEZONE`; 29/2 → 1º/3; sem data = adulto); `canRepresentMinor` (mãe, pai, `representante_legal`); `resolvePortalPatient` dá `403` à conta própria de menor; `listRepresentablePatients` esconde o menor de quem não é representante legal; `resolveConsentSigner`/`consentSignerFor` liberam aceite e revogação de TCLE e imagem só ao representante do menor; `POST /api/accounts` recusa conta `patient` de menor e conta `guardian` que só teria menores; aviso de maioridade em `GET /api/guardians/majority` + `POST …/:patientId/keep` e cartão no painel; "Aceitar em meu nome" para o paciente que fez 18. Aviso de privacidade `v2` (item 9); TCLE e imagem sem mudança de texto, então nenhum aceite caiu. Exportação do titular leva `signedByRelationship`.
- **Migração `0065`**: `consent_records.signer_guardian_id`/`signer_relationship` (sem FK, para a evidência ficar) e `patients.majority_reviewed_at`. Só `ADD COLUMN`, nulos.
- **Regras**: POR-RN-26, POR-RN-27, ACE-RN-59; POR-RN-23 e PRO-RN-23 ajustadas; `docs/legal/textos-lgpd.md` § 1, § 3 item 7 e § 5.
- **Perguntas abertas (no ADR-032)**: o representante do menor exerce no portal o art. 18 e o consentimento do parceiro? O aceite do representante vence algum tempo após os 18?
- **Gate**: Actions sem cota; gate local (typecheck, lint, check:sv, check:docs, test:coverage, build + E2E). Docker/smoke não rodam (sem daemon). Autorrevisão no lugar do the-judge (sem `gh`).
- **Next step**: nenhum. **Blockers**: nenhum.

## Issue #375 — Direitos do menor pelo representante e prazo do aceite (2026-10-18) — ENCERRADO

Decisão de @KalleoPinheiro (2026-10-18, "Ok" às propostas do coordenador para as perguntas abertas do ADR-032): pelo portal o representante do menor pede cópia e correção e autoriza ou revoga o parceiro indicador (eliminação só na clínica); o aceite do representante perde a validade 90 dias depois dos 18 anos se o paciente não aceitar em nome próprio, e a clínica é avisada. [ADR-033](../../docs/adr/033-direitos-do-menor-pelo-representante-e-prazo-do-aceite.md), que complementa o ADR-032.
- **Código**: `resolveConsentSigner` agora também guarda `/export`, `/data-requests` (eliminação → `403`) e `/partner-consent` (+ `/revoke`); `PartnerShareConsent` grava `signer`; `majority.ts` ganha `representativeConsentExpiresOn`/`isRepresentativeConsentExpired` (sem data de nascimento = vencido); `ConsentRecord.resolveStatus` e `PartnerShareConsent.resolveStatus` recebem o titular e devolvem `representativeExpired` (TCLE, imagem, parceiro e portal do parceiro); `listMajorityReviews` também lista o adulto com aceite vigente do representante, com a data de vencimento; telas de "Meus dados", parceiro, termo e cartão da clínica ajustadas. Aviso de privacidade `v3` (item 9); termos sem mudança de texto.
- **Migração `0066`**: `partner_share_consents.signer_guardian_id`/`signer_relationship` (sem FK). Só `ADD COLUMN`, nulos.
- **Regras**: POR-RN-28 nova; POR-RN-11, 23, 26, 27 e PRO-RN-23 ajustadas; `docs/legal/textos-lgpd.md` § 1, § 3 item 7 e § 5 (perguntas do ADR-032 fechadas).
- **Limite aceito**: curatela de adulto segue pela clínica (o portal só deixa o representante assinar por menor).
- **Gate**: Actions sem cota; gate local (typecheck, lint, check:sv, check:docs, test:coverage, build + E2E). Docker/smoke não rodam (sem daemon). Autorrevisão no lugar do the-judge (sem `gh`).
- **Next step**: nenhum. **Blockers**: nenhum.

## Revisão geral da documentação (2026-10-18) — ENCERRADO

Pedido do Kalléo ("revise e atualize as documentações"): conferir os docs contra a `main` depois das PRs #356, #357, #362, #364 a #370, #373, #374 e #377. Sem mudança de código nem de comportamento; sem ADR novo (nenhum ADR aceito foi editado).
- **Conferido sem divergência**: variáveis de ambiente do código contra `.env.example` e `onboarding.md`/`producao.md`; `WHATSAPP_*` e `VITTA_ALLOW_OPEN_MODE` só aparecem como removidas; índice de ADRs (001–033, o 022 nunca existiu); scripts `calendar:minimize` (§ 7.2) e `clinics:cnpj-review` (§ 7.3); numeração (migração 0066, ADR-033, AD-054, ACE-RN-59, POR-RN-28).
- **Corrigido**: `plano-evolucao-faseado.md` ganhou RM-26 a RM-30 (LGPD go-live, responsável e menor no portal, recibo/CNPJ, baseline de carga, fim do modo aberto e do gateway Meta) que faltavam desde o RM-25; `producao.md` § 4 ganhou o resumo das migrações 0053→0066 e a ordem dos passos pós-deploy; `README.md` deixou de listar `RESEND_API_KEY`/`EMAIL_FROM` como mínimo do quick start (o código os trata como opcionais; ADR-011); `last_reviewed` de `docs/README.md`, `onboarding.md` e do plano atualizado.
- **Specs as-built** criadas em `.specs/features/` (lgpd-go-live, responsavel-e-menor-no-portal, recibo-irpf-e-cnpj, baseline-de-carga, sem-modo-aberto-e-sem-meta) porque `tests/docs/structure.test.ts` exige que todo RM entregue linke uma pasta de spec.
- **Fora do repositório**: `fila/issues.md` do projeto reescrito (única issue aberta: #376).
- **Gate**: Actions sem cota; gate local (typecheck, lint, check:sv, check:docs, test:coverage, build). Docker/smoke não rodam (sem daemon). Autorrevisão no lugar do the-judge (sem `gh`).
- **Next step**: nenhum. **Blockers**: nenhum.

## Renomeação do repositório para estomasystech (2026-10-18) — ENCERRADO

Pedido do Kalléo: o repositório virou `KalleoPinheiro/estomasystech` e as referências ao nome antigo devem acompanhar (a VPS/Coolify aponta para o repo novo). Decisão e lista do que ficou: [ADR-034](../../docs/adr/034-renomeacao-do-repositorio-para-estomasystech.md).
- **Trocado**: URLs do repositório (docs, specs, design, checks, tasks, AGENTS.md), `name` do pacote, `/opt/estomasystech` no runbook, ponte `.cursor/rules/00-estomasystech.mdc`. Sem workflow, Dockerfile ou compose com o nome antigo (nada a mudar).
- **Mantido de propósito**: rótulos de chave criptográfica, ADRs aceitos e arquivo histórico, `vitta` (banco/usuário), `VITTA_*`, `vitta_session`, marca "VittaFlow".
- **Gate**: Actions sem cota; gate local. Autorrevisão no lugar do the-judge (sem `gh`).
- **Next step**: Kalléo decide se a marca "VittaFlow" muda. **Blockers**: nenhum.

## Renomeação completa para estomasystech (2026-10-18) — ENCERRADO

Pedido do Kalléo (sem produção, pode quebrar): trocar também banco, rótulos de chave e todas as outras referências, README incluído. Decisão: [ADR-035](../../docs/adr/035-renomeacao-completa-para-estomasystech.md), com a tabela antes/depois.
- **Trocado**: banco/usuário `estomasystech`, `VITTA_*` → `ESTOMASYSTECH_*`, cookie, rótulos de chave, caminhos de backup/cron, marca "EstomaSysTech" (UI, e-mails, README, testes).
- **Intocado**: ADRs aceitos e este arquivo (nomes da época).
- **Deploy**: renomear as variáveis `VITTA_*` no Coolify/`.env`; recriar bancos de desenvolvimento (`docker compose down -v`).
- **Gate**: Actions sem cota; gate local. Autorrevisão no lugar do the-judge (sem `gh`).
- **Next step**: nenhum. **Blockers**: nenhum.

## Traefik do Coolify como único proxy de entrada (2026-10-18) — ENCERRADO

Pedido do Kalléo: o porteiro é o Traefik do Coolify e o Caddy sai do repositório. Decisão: [ADR-036](../../docs/adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md).
- **Removido**: serviço `caddy`, volumes `caddy_*`, `APP_DOMAIN`, `deploy/Caddyfile`; menções em runbook, onboarding, `.env.example`, compose base e spec.
- **Novo**: `docker-compose.prod.yml` sem portas no app/banco, `SERVICE_FQDN_APP_3000` e label `coolify.traefik.middlewares`; runbook § 3 com `TRUSTED_PROXY_HOPS=1`, Dockerfile vs compose e middlewares `@file`.
- **Intocado**: este arquivo (histórico) e o handoff do #206.
- **Pergunta aberta**: Dockerfile ou compose no Coolify (recomendado: Dockerfile + Postgres do Coolify).
- **Gate**: Actions sem cota; gate local. Docker/smoke não rodam (sem daemon). Autorrevisão no lugar do the-judge.
- **Next step**: criar o app no Coolify. **Blockers**: nenhum.

## OOM do build no Coolify e Postgres 18 na doc (2026-10-18) — ENCERRADO

Pedido do Kalléo (via coordenação): o 1º deploy no Coolify estourou memória em "Running TypeScript"; o `--max-old-space-size` do script `build` não chega ao processo filho do Next.
- **Feito**: `ENV NODE_OPTIONS=--max-old-space-size=4096` só no estágio `builder` do `Dockerfile`; runbook § 3 com a nota; Postgres 16 → 18 em `producao.md` § 3 e no README (produção usa `postgres:18-alpine`).
- **Intocado**: compose, CI e testes (continuam em Postgres 16), ADRs e este arquivo (histórico).
- **Deploy**: pode apagar a variável `NODE_OPTIONS` (Buildtime only) do Coolify após o merge.
- **Gate**: Actions sem cota; gate local. Autorrevisão no lugar do the-judge.
- **Next step**: nenhum. **Blockers**: nenhum.

## Readiness em banco nunca migrado (2026-10-18) — ENCERRADO

Achado no 1º deploy no Coolify: em banco sem migrações, a consulta a `drizzle.__drizzle_migrations` falhava com 42P01 e `/api/health/ready` dizia `database: "fail"` / `migrations: "unknown"`, em vez de `pending` (runbook § 4).
- **Feito**: `readiness.ts` trata 42P01 (também em `cause`, como o Drizzle embrulha) como nada aplicado: `ready: false`, `database: "ok"`, `migrations: "pending"`. Outros erros continuam `fail`. Dois testes novos (PGlite sem a tabela; 42P01 embrulhado vs. outro erro); runbook § 9.1 atualizado.
- **Pendência registrada na #381 (não implementada)**: o backup nativo do Coolify para o R2 não é cifrado com age como o ADR-018 exige; fechar antes de pacientes reais.
- **Gate**: Actions sem cota; gate local. Autorrevisão no lugar do the-judge.
- **Next step**: nenhum. **Blockers**: nenhum.

## Varredura pós-produção: runbook, ADRs 037 a 039 e docs (2026-10-18) — ENCERRADO

Pedido do Kalléo (via coordenação): com o sistema no ar, varrer docs, definições e operação e revalidar as entregas futuras contra o cenário real.
- **Feito**: `producao.md` ganhou § 0 (estado real), § 3.1 (release e rollback com deploy manual), § 7 reescrito para Scheduled Tasks, § 8 (bootstrap via `bash -c` por causa do zsh), § 9 ajustado ao Coolify e § 9.6 (fumaça pós-deploy somente leitura); formato compose marcado como alternativa. ADR-037 (PG18 em produção, dev a alinhar), ADR-038 (Scheduled Tasks), ADR-039 (deploy manual; rollback sem `down`). AGENTS.md, README, onboarding, architecture, integrações (cron, alertas, GlitchTip), `fix-audit-issues.md` (passo 11), roadmap (RM-31) e spec do runbook atualizados.
- **Intocado**: § 5 e docs de backup (thread "Backup cifrado e fotos"), compose, CI e código.
- **Não verificado**: a fumaça contra produção não rodou (a rede da sessão bloqueia o host); os itens de § 9.6 que dependem do Traefik ficam para o Kalléo ou uma sessão com acesso. O texto exato das tarefas agendadas veio do relato do deploy, não de leitura do painel.
- **Rollback deste lote**: só docs; reverter o commit.
- **Gate**: Actions sem cota; gate local. Autorrevisão no lugar do the-judge.
- **Next step**: PR de alinhamento PG18 em compose/CI (com daemon Docker); PR de `npm audit fix`. **Blockers**: nenhum.

## Backup cifrado do banco e das fotos no Coolify (2026-10-18) — ENCERRADO

Pedido do Kalléo (via coordenação, #381): o backup nativo do Coolify para o R2 não é cifrado com `age` (ADR-018) e o volume de fotos não tinha backup; os dois bloqueiam paciente real. Decisão: [ADR-040](../../docs/adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md) (nota no AD-033). O número 037 ficou com o Postgres 18 (#386): renumerado para 040.
- **Feito**: `scripts/backup-target.sh` (alvo do Coolify por `BACKUP_DB_CONTAINER`/`BACKUP_UPLOADS_VOLUME`, ou o compose do repositório sem eles); `backup.sh` com `BACKUP_RCLONE_DEST`; `restore.sh` recusa com o app conectado e não sobe o app sozinho; `backup-alert.sh` + units `deploy/backup/` (timer 02:00 America/Sao_Paulo, `OnFailure`); serviço `uploads-backup` removido do compose; smoke para o app antes do restore; runbook § 5 reescrito (instalação, restauração, teste mensal), linhas de backup do § 1, § 2 e § 7.
- **Teste local**: backup → apagar → restore com Postgres 16 local e um `docker` simulado (conferência, chave errada, app conectado recusado, `--confirmar`, `rclone`); `backup-smoke.sh` real não rodou (sem daemon Docker no container).
- **Kalléo roda**: runbook § 5.1, passos 1–8 (chave age no cofre, bucket R2 `eu` com trava, arquivos no servidor, primeiro backup, alerta, restauração de teste, desligar o S3 do Coolify).
- **Gate**: Actions sem cota; gate local. Autorrevisão no lugar do the-judge.
- **Next step**: restauração de teste registrada na tabela do § 5.3. **Blockers**: nenhum.


## Instalação do backup cifrado em produção (2026-10-18) — ENCERRADO

Kalléo instalou no servidor, passo a passo, o backup do ADR-040. **Ativo**: chave `age` no Bitwarden + pendrive; bucket R2 `estomasystech-backups-age` (UE, trava 30 dias, ciclo 35 em `prod/`); scripts e units no host; `msmtp` pelo Resend; primeiro backup `20261018T231224Z` no R2; timer às 02:00 de São Paulo; alerta testado.
- **Armadilhas registradas** (runbook § 5.1/§ 5.3 e o novo [`backup-passo-a-passo.md`](../../docs/engineering/backup-passo-a-passo.md)): `403` do R2 era dupla de chaves de outro token (criar outro); `rclone` do `apt` (1.60) dá `501` no R2, usar o pacote oficial 1.75+; `from` do `msmtp` só com o endereço (`from_full_name` para o nome); teste de restauração precisa de Postgres 18 local (compose ainda 16, #385); `read -rp` é de bash (Kalléo usa zsh).
- **Teste de restauração** (2026-10-18, ok): Postgres 18 local (override com `pgdata:/var/lib/postgresql`), chaves reais do cofre, 104 tabelas, health 200, 24 s; produção ainda sem paciente, a repetir com dado clínico.
- **Segurança**: checklist no runbook § 5.4.
- **Passo 8 feito** (decisão do Kalléo): backup do Coolify desligado, bucket e token antigos e dumps do app no disco apagados; filtro de IP recolocado.
- **Next step**: teste mensal com paciente real (roteiro na "Rotina do Super Admin"). **Blockers**: nenhum.


## Compose, GlitchTip e smokes em PostgreSQL 18 (#385, ADR-037) — ENCERRADO (#395)

- **Feito**: `docker-compose.yml` e `docker-compose.glitchtip.yml` em `postgres:18-alpine` com o volume em `/var/lib/postgresql` (a imagem 18 grava em `.../18/docker`); doc de onboarding, runbook § 3 e § 5.3 (o override do teste de restauração saiu), `backup-passo-a-passo.md`, baseline, arquitetura, AGENTS.md e nota no ADR-037.
- **Gate local (Docker 29.9.1 no WSL)**: `docker compose build` ok; `scripts/docker-smoke.sh` verde (providers 200, ready 200, x-request-id, gravação e persistência do volume de fotos); `scripts/backup-smoke.sh` verde (backup cifrado, restore sem `--confirmar` não altera, restore com `--confirmar`, app healthy); `check:docs`, `tests/docs`, typecheck e biome ok. Sem mudança em código TS, então a suíte de testes não foi reexecutada. O CI (Actions sem cota) roda o mesmo smoke.
- **Quem tem o `pgdata` de Postgres 16**: `docker compose down -v` (apaga o banco local) ou dump/restore, documentado no onboarding.
- **Fora**: números do baseline de carga seguem medidos em PG16 (a tabela do doc diz isso); remedir em 18 quando houver rodada nova.
- **Next step**: nenhum. **Blockers**: nenhum.


## Dry-runs de produção (#339, #355) e baseline de carga na VPS (2026-10-19) — ENCERRADO

- **#355 `clinics:cnpj-review` e #339 `calendar:minimize`** rodados sem `--confirmar` contra a produção (túnel `ssh vps`, checkout descartável, nada gravado): nenhuma empresa com CNPJ inválido; a única empresa (legado) está sem integração com o Google Agenda. Não há o que confirmar; `--confirmar` não foi executado.
- **Baseline leve** (8 req/s, 60 s por rota, sem autenticação): [`performance-baseline.md`](../../docs/engineering/performance-baseline.md) § 9. Latência dominada pela rede; os `429` em `/api/health/ready` são o limite do app (120/min por IP), não o do Traefik.
- **`rate-limit-strict`**: proposta de labels do Traefik entregue ao Kalléo (login/mfa/senha em `/api/auth/*` e autoagendamento em `/api/portal/patient/appointments` e `/waitlist`); ele aplica no painel e cola a saída do Passo 0.
- **Next step**: aplicar e provar o `rate-limit-strict`, registrando em `producao.md` § 0 e § 9.6. **Blockers**: nenhum.


## rate-limit-strict em login e autoagendamento (2026-10-19) — ENCERRADO

- **Feito**: Kalléo aplicou no painel do Coolify o roteador `strict-<id>` (labels em `producao.md` § 0) e fez o redeploy; revisão das labels antes e prova depois (60 POST em `/api/auth/login`: 5 × `401`, 55 × `429`; `/api/health` no limite geral). Rotas: `/api/auth/{login,forgot-password,set-password,mfa/verify}` e `/api/portal/patient/{appointments,waitlist}`.
- **Next step**: nenhum. **Blockers**: nenhum.


## GlitchTip ligado em produção pelo Coolify (2026-10-19) — ENCERRADO

Pedido do Kalléo: escolher ferramenta de observabilidade (GitHub Student Pack) e plano para trocar o GlitchTip. Avaliados Sentry UE (desfaria o "nada para fornecedor externo" do ADR-014), OpenObserve + OpenTelemetry (~215 MiB, sem agrupar erros; o span raiz do Next grava a URL completa) e SigNoz (pesado). Decisão do Kalléo: **GlitchTip só**, como serviço de um clique do Coolify; ADR-014 continua valendo, sem ADR novo e sem mudança de código. Medição e avaliação em `/mnt/project-files/observabilidade/`.
- **Feito no painel (Kalléo, acompanhado por RC somente leitura)**: serviço sem domínio, `127.0.0.1:8001`, cadastro fechado, retenção 30 dias, redis com tag fixa; `DATABASE_URL`/`REDIS_URL` pelo nome do container (os nomes curtos colidem com o banco e o redis do Coolify na rede `coolify`); operador, organização e projeto; `GLITCHTIP_DSN` *Runtime only* no app.
- **Prova**: `_health/` 200 de dentro do app; evento de teste 200 em `store/` e visível como issue.
- **Docs**: `producao.md` § 0, § 1, rotação e § 9.5 reescrito; `integrations/glitchtip.md`.
- **Kalléo**: 2FA do operador, regra de e-mail em *Settings → Alerts*, resolver a issue de teste; opcional trocar a Client Key (o DSN apareceu no chat).
- **Next step**: nenhum. **Blockers**: nenhum.


## Homologação na Vercel, MSW, faker e branch `staging` (2026-10-19) — EM REVISÃO

Pedido do Kalléo na thread "ambiente de desenvolvimento na Vercel". Spec: `.specs/features/homologacao-vercel/` (design, plano). ADR-041, AD-055.
- **Feito**: `APP_ENV` + trava de banco de produção (`src/lib/runtime-env.ts`, `runtime-guards.ts`, `db.ts`); MSW para Resend, Google e S3/R2 (`src/infrastructure/mocks/`, ligado por `MOCK_INTEGRATIONS=true` em `instrumentation.ts`); faixa de homologação e `noindex`; `scripts/vercel-build.ts` (migra, semeia, builda) e `vercel.json`; seed faker determinístico e idempotente (`scripts/seed/`, `npm run seed:staging`); `scripts/staging/rebuild.sh` e `staging.yml`; docs (`homologacao.md`, `producao.md` § 2, `cron.md`, onboarding, `.env.example`, `docs/README.md`, AGENTS.md).
- **Dependências**: `@faker-js/faker@10.6.0` e `msw@3.0.3`, versões exatas, `npm audit` sem achado novo (os 4 moderados de `drizzle-kit`/`esbuild` já existiam na `main`). Nunca o pacote `faker` sem escopo. O lockfile foi gerado com npm 11 (o npm 10 quebra no Arborist); só acrescenta entradas.
- **Painel (Kalléo)**: projeto Vercel com Production Branch `staging`, Neon + integração por preview, variáveis e Deployment Protection (`homologacao.md` § 5), proteger a branch `staging`. Nada foi criado na Vercel/Neon por esta thread.
- **Rollback**: remover o projeto na Vercel e a branch `staging`; produção não é afetada (sem migração de schema, sem mudança de comportamento com `APP_ENV` ausente fora da Vercel).
- **Fora**: segundo fator pré-cadastrado no seed (o primeiro login cadastra); Supabase; domínio próprio.
- **Next step**: Kalléo cumpre `homologacao.md` § 5 e confere o primeiro Preview. **Blockers**: nenhum.


## E2E fora do Actions, gate local com recibo e testes intocáveis (2026-10-19) — EM REVISÃO

Pedido do Kalléo na thread "E2E fora do Actions". Diagnóstico: `/mnt/project-files/ci/e2e-fora-do-actions.md`. ADR-042.
- **Causa**: plano Pro com 3.000 min/mês esgotados; run completo ~25 a 30 min, E2E ~60%; CI também disparava na `staging` e repetia a suíte a cada merge.
- **Feito**: `ci.yml` só com gate rápido (+ build); `docker.yml` com filtro de caminhos; `recibo-gate.yml` (recibo `E2E-GATE:` do SHA do head + integridade dos testes); `npm run gate:local` (`scripts/gate/local.ts`); regra 7 reescrita e regra 8 nova no `AGENTS.md`.
- **Regra 8 imposta por script**: `scripts/gate/test-integrity.ts` (análise pura) usada pelo hook `.claude/hooks/protect-tests.sh` (PreToolUse), `.husky/pre-push`, `gate:local` e CI. Achado proibido: teste desligado, limiar de cobertura reduzido, retry/timeout aumentado. Justificável com `TESTE-ALTERADO:`: asserção alterada, arquivo apagado, config alterada.
- **Teste alterado com motivo** (`tests/infrastructure/ci-workflow.test.ts`): C43 a C46 passaram a apontar para o `ci.yml`, o `docker.yml` e o `gate:local` porque o requisito mudou (decisão do dono em 2026-10-19); C47 e C48 novos garantem que o Actions não roda Playwright e que a `staging` não dispara CI.
- **Limite**: recibo e `TESTE-ALTERADO:` são autodeclarados; hook, `pre-push` e CI barram descuido, não um autor deliberado (ADR-042, Consequências).
- **Fora (tickets)**: 100% de cobertura, mutantes, BDD, matriz de exceções, ambiente local completo (`/mnt/project-files/ci/tickets-qualidade-de-testes.md`).
- **Next step**: Kalléo confirma se o plano permite Environment com revisor obrigatório para a trava humana; revisão em 2026-11-30. **Blockers**: nenhum.


## Versionamento com Changesets, release por tag e versão visível (2026-10-20) — EM REVISÃO

Pedido do Kalléo na thread "Versionamento e release". Design: `.design/versionamento-e-release.md` (PR #403). ADR-043.
- **Feito**: `.changeset/` (config com `privatePackages`, README com os níveis); `scripts/release/` (`check-changeset.ts`, `prepare.ts`, `publish.ts`, `lib.ts`) e os comandos `changeset`, `check:changeset`, `release:prepare`, `release:publish`; `check:changeset` também no `ci.yml` (PR); versão do `package.json` embutida no build (`next.config.ts`) e exibida em `src/components/app-version.tsx` no rodapé da barra lateral da equipe e do portal, nunca em páginas públicas; docs (`producao.md` § 3.1 com deploy da tag, `AGENTS.md`, onboarding, `.env.example`, `docs/README.md`, template de PR).
- **Testado**: unitários da regra de changeset, do CHANGELOG, das notas e da formatação da versão. `prepare` e `publish` rodados de ponta a ponta num remoto local de laboratório (branch `release/v0.2.0`, tag idempotente, falha do `gh` não esconde a tag). Não rodados contra o GitHub real: o primeiro release real é o teste.
- **Rollback deste PR**: reverter o PR; sem migração e sem mudança de comportamento além do rodapé de versão.
- **Desvio do design**: `check:changeset` não entra no `gate:local` porque `scripts/gate/` é do dono (ADR-042); roda no `ci.yml`. O PR de versão, com `package.json` e CHANGELOG, não exige changeset.
- **Docker/imagem**: smoke da imagem pulado (sem daemon na nuvem); `Dockerfile` não mudou.
- **Next step**: Kalléo roda `npm run release:prepare` quando quiser o primeiro release (`v0.2.0`), decide se `check:changeset` entra no `gate:local` e confirma o marco `1.0.0` (primeiro paciente real). **Blockers**: nenhum.


## Ambiente local completo e suíte de integração em Postgres real (2026-10-20) — EM REVISÃO

Issue #404, pedido do Kalléo junto do gate local (#409). ADR-044.
- **Feito**: `npm run ambiente:local` / `ambiente:local:down` (`scripts/ambiente/`, `docker-compose.local.yml`, projeto compose próprio, segredos descartáveis em `.ambiente-local/`); `npm run test:integracao` (`vitest.integracao.config.mts`, `tests/support/postgres-*.ts`) com um banco clonado de modelo por arquivo de teste; guarda do ADR-041 (recusa produção e banco não local, antes de tocar no Docker); docs (onboarding, homologação, AGENTS.md, ADR-044, `docs/README.md`).
- **Testes novos** (nenhum existente editado): `tests/scripts/ambiente-local.test.ts` (guarda, segredos, compose, portas, resumo) e `tests/integracao/postgres-real.integracao.ts` (PostgreSQL real com `pg_trgm`/`btree_gist`; anti-double-booking sob duas conexões concorrentes).
- **Medido**: 116 arquivos / 1898 testes passam contra PostgreSQL 16 nativo (sem Docker na nuvem), ~160 s. Com `PG_POOL_MAX=3` dois testes antigos falham por corrida do próprio teste (leem logo após o `after()` da auditoria); por isso a suíte usa 1 conexão por arquivo e a concorrência real mora em `tests/integracao/`.
- **Não validado**: compose + imagem + seed no Docker e Postgres 18 (sem daemon na nuvem). Kalléo roda `npm run ambiente:local` e `npm run test:integracao` no WSL.
- **Desvios**: `vitest.integracao.config.mts` é arquivo novo (o hook da regra 8 só protege `vitest.config.mts`); fora do `gate:local` (`scripts/gate/` é do dono).
- **Rollback**: reverter o PR; sem migração e sem mudança no app.
- **Next step**: Kalléo valida no WSL; decide se `test:integracao` entra no `gate:local`. **Blockers**: nenhum.

## Borda atrás do Traefik: cookies, cabeçalhos, 1 salto e logs (2026-10-20) — EM REVISÃO

Itens abertos da #381, pedido do Kalléo na thread "Itens abertos da #381". ADR-045.
- **Provado em produção** (somente leitura, sem login): `TRUSTED_PROXY_HOPS=1` (XFF forjado não escapa do limite de 5/min do login); rajada de 300 requisições com 60 em paralelo: `/login` 146 × `200` e 154 × `429`, `/api/health` 129 × `200` e 171 × `429`; `strict` em `/api/auth/login` 5 × `401` e 55 × `429`; cada cabeçalho de segurança uma vez só, CSP única com nonce; HTTP `307` para HTTPS; `/api/alerts/run` sem segredo `401`. Rótulos do container lidos via `docker inspect`.
- **Corrigido**: cookies que expiram (logout, OAuth do Calendar, paciente representado) saíam sem `Secure` e `SameSite`; agora `expiredCookieOptions()` (`src/lib/auth/session.ts`). Teste novo `tests/lib/cookie-options.test.ts` (nenhum teste existente alterado).
- **Decisão**: `security-headers@file` não é ligado ao roteador; o app é dono dos cabeçalhos (ADR-045).
- **Logs/GlitchTip**: auditado no código (ADR-014): sem PII em `logger.*`, e-mail mascarado, `scrubEvent`. **Não verificado**: conteúdo dos logs do container em produção (leitura não liberada na sessão).
- **Cookie de sessão pela resposta**: não coletado (exige login); coberto por teste e pelo `Set-Cookie` de criação, que já era `Secure`/`HttpOnly`/`SameSite=Lax`.
- **Next step**: Kalléo confere uma amostra dos logs em produção (§ 9.6) e o `Set-Cookie` no DevTools no próximo login. **Blockers**: nenhum.


## Cobertura de 100% nas camadas de regra (2026-10-20) — EM REVISÃO

Issue #405, decisão do Kalléo (ADR-046).
- **Feito**: testes novos para domain, application, infrastructure, lib e proxy; medido 0 lacunas nessas camadas (suíte completa: 443 arquivos, 5778 testes). Total com UI: 98,37% stmts, 95,53% branches.
- **Código simplificado sem mudar comportamento** (ramos inalcançáveis): `Clinic.status`, `condition-assessment` (soma DET), `create-account`, `patient.update`, `revoke-guardian-access`, `initials`, `reminder-content`, `staff-access`, `report-cache`, vários repositórios Drizzle/in-memory; `memoizeAvailability` e `preferred` exportados para teste.
- **Nenhum teste existente editado.** Todos os arquivos são novos (`*-cobertura.test.ts`, `*-bordas.test.ts` e afins).
- **Next step**: Kalléo sobe os limiares para 100 em `vitest.config.mts` (proposta no PR); depois #406 (mutantes). **Blockers**: nenhum.


## Testes de mutação com Stryker em domain e application (2026-10-20) — EM REVISÃO

Issue #406, pedido do Kalléo (ADR-047).
- **Feito**: `npm run test:mutacao` (`stryker.config.json`, `vitest.mutacao.config.mts`, relatório em `reports/mutation`, fora do git); placar medido **80,48%** na main (7.930 mutantes; 1.152 sobreviventes, 396 sem cobertura) e **85,98%** com os testes novos (+5,5 pontos); `thresholds.break` em 85; docs (ADR-047, AGENTS.md, onboarding, `docs/README.md`).
- **Testes novos** (nenhum existente editado): `tests/domain/mutacao/{phone,condition-assessment,schedule-config}-mutacao.test.ts` e `tests/application/mutacao/{manage-clinic-admins,mfa-login,portal-identity,data-subject-requests}-mutacao.test.ts`. Arquivos que partiram de 25 a 80 mutantes vivos chegaram a 0 a 5.
- **Desvio**: o runner usa só `tests/domain` e `tests/application` (a suíte inteira estoura o tempo da rodada inicial); mutante coberto só por API aparece como "sem cobertura". O gate (`scripts/gate/`) é do dono: proposta em `/mnt/project-files/ci/proposta-mutacao-no-gate.md`.
- **Rodar**: rodada completa ~1h20 (4 núcleos); um arquivo: `npm run test:mutacao -- --mutate <arquivo>`. `npm` 10.9 falha ao instalar (`edgesOut`); as dependências entraram com `npx npm@11`.
- **Next step**: Kalléo decide se a mutação entra no `gate:local` por diff; próximo degrau 90% (candidatos no ADR-047). **Blockers**: nenhum.


## BDD: cenário executável por regra crítica (2026-10-20) — EM REVISÃO

Issue #407, decisão do Kalléo: `describe/it` em Dado/Quando/Então + teste de rastreabilidade, sem `.feature` (ADR-048).
- **Feito**: `tests/bdd/regras-criticas.ts` (18 regras críticas em 6 domínios → arquivo + título do cenário), `tests/bdd/rastreabilidade.test.ts` (falha se a regra não existe em `docs/domains`, não tem cenário, o título não é Dado/Quando/Então ou sumiu do arquivo; com testes de que a falha acontece), `tests/support/rastreabilidade-bdd.ts`, e `tests/bdd/cenarios-criticos.test.ts` com cenários para EST-RN-02, EST-RN-03, PRO-RN-02 e POR-RN-03, que não tinham. Docs: ADR-048, `conventions.md`, `docs/README.md`.
- **Nenhum teste existente editado** (vínculo por título citado, não por tag; sem `TESTE-ALTERADO`). Os testes já estavam no formato Dado/Quando/Então, então não houve migração de formato.
- **Pergunta aberta ao dono**: quais das ~160 regras restantes são críticas (critério e lista inicial no ADR-048).
- **Next step**: T5 (matriz de exceções) reaproveita os ids; Kalléo revisa a lista de críticas. **Blockers**: nenhum.



## Matriz de casos de exceção por domínio (2026-10-20) — EM REVISÃO

Issue #408, pedido do Kalléo em 2026-10-19 (ADR-049); última da fila de qualidade de testes.
- **Feito**: `docs/domains/<d>/excecoes.md` nos 9 domínios, com as 7 categorias (entrada inválida, sem permissão, outra clínica, duplicidade, concorrência, falha de integração, estado terminal); cada linha cita `arquivo` › "título literal" do teste que a prova ou `n/a — motivo`. `tests/bdd/matriz-excecoes.test.ts` (lógica em `tests/support/matriz-excecoes.ts`, com testes de que cada falha acontece) reprova categoria sem linha, regra inexistente, arquivo ou título citado que não existe, e `n/a` sem motivo. Docs: ADR-049, `docs/README.md`, `conventions.md`, link no README de cada domínio.
- **Testes novos** (nenhum existente editado, sem `TESTE-ALTERADO`): `tests/api/estoque-excecoes.test.ts` (papéis sem permissão e saídas concorrentes), `tests/api/prontuario-excecoes.test.ts` (evolução imutável, PRO-RN-02), `tests/api/agenda-excecoes.test.ts` (dois POSTs no mesmo horário: 200 e 409, AGE-RN-02). Demais linhas usam teste que já existia.
- **`n/a`** só com motivo de arquitetura (ex.: relatório é só leitura; sem integração externa entregue em estoque e financeiro, PSP no backlog).
- **Next step**: Kalléo revisa as linhas `n/a`; caso de exceção novo é decisão de produto (pergunta aberta). **Blockers**: nenhum.


## Mutação no gate local (2026-10-20) — EM REVISÃO

Pedido do Kalléo (thread "Mutação no gate local"), com permissão para editar `scripts/gate/` (ADR-051).
- **Feito**: `gate:local` roda `test:mutacao --mutate` nos arquivos de domain/application alterados contra `origin/main`; etapa `mutacao` no recibo; `verify-receipt.ts --base-ref` exige a etapa quando o diff muda regra; `mutacao-mensal.yml` (rodada completa incremental, último dia do mês). Teste novo `tests/scripts/gate-mutacao.test.ts`; AGENTS.md, `docs/README.md`, ADR-051.
- **Pergunta aberta**: a rotina mensal consome cota do Actions (decisão dele: manter cron ou só `workflow_dispatch`).
- **Next step**: Kalléo revisa; subir `break` para 90 após rodada completa ≥ 90%. **Blockers**: nenhum.


## Fluxo de release: feat → release/vX.Y.Z → main (2026-10-20) — EM REVISÃO

Pedido do Kalléo (thread "Implantar fluxo de release"), fluxo acordado em `/mnt/project-files/fluxo/fluxo-acordado.md` (ADR-052).
- **Feito**: ADR-052 (substitui o git do ADR-041 e o release do ADR-043; ambos ganham nota de substituição parcial). `release:prepare` roda na release, confere nome × versão (hotfix: só patch) e deixa a Release em rascunho; `release:publish` exige merge commit (`--hotfix` abre exceção) e tagueia o commit da `main`; `release:sync` (`sync-main.sh`) mergeia a `main` na release aberta e aborta em conflito; `staging:rebuild --release`; `staging.yml` com gatilho em push na `main` (sync + rebuild); `recibo-gate.yml` exige recibo só com base `main` e confere `## Homologação` (seed + Dado/Quando/Então) com base `release/*`; `ci.yml` não pede changeset novo no PR `release/*`; template de PR; `homologacao.md` § 1, `producao.md` § 3.1, AGENTS.md.
- **Testes novos**: `tests/scripts/release-fluxo.test.ts` (regras puras e os scripts bash em repositórios git temporários). Nenhum teste existente editado, `scripts/gate/` intocado.
- **Fica com o Kalléo (painel)**: *Allow merge commits* no repositório; ruleset de `release/**` (PR obrigatório, CI rápido exigido, force push bloqueado, bypass para quem roda `release:sync`/Actions); depois do reset da cota, provar `staging.yml` com um push na `main`.
- **Pergunta aberta**: o `GITHUB_TOKEN` consegue dar push em `release/*` com PR obrigatório? Se o bypass do GitHub Actions não existir na lista do ruleset, usar segredo próprio ou rodar `release:sync` à mão.
- **Next step**: abrir a primeira `release/vX.Y.Z` pelo fluxo novo. **Blockers**: nenhum.


## Fundação de tema (2026-10-21) — EM REVISÃO

Issue #425, primeiro bloco da identidade visual (`.design/identidade-visual-e-tema.md`).
- **Feito**: `src/lib/theme.ts` (padrão claro + violeta, chave `estomasystech:modo`, rótulo pt-BR); `layout.tsx` renderiza `data-theme`/`data-accent` e o `ThemeScript` com o nonce da CSP (`x-nonce`); `Providers` ganha `ThemeProvider`; `ThemeToggle` (pt-BR) na barra lateral da equipe. Testes novos: `tests/lib/theme.test.ts`, `tests/components/theme-toggle.test.tsx`. Nenhum teste existente editado.
- **Decisão não crítica**: componente próprio em vez do `ThemeToggle` do pacote (texto em inglês); `package.json` segue em `^3.4.0` (o teste de versão fixa o intervalo; a 3.4.1 entra com a trava de contraste #424).
- **Atenção para #426**: o Still Void guarda modo e acento na mesma chave do `localStorage` e o valor guardado vence o do servidor; ao ligar a cor da clínica, chamar `setAccent` na montagem. O modo "automático" (`system`) não existe no pacote: #426 decide como mapeá-lo.
- **Next step**: #426 (identidade da clínica) e #428. **Blockers**: nenhum.


## Shell mobile: barra inferior e Mais (2026-10-21) — EM REVISÃO

Issue #428 (parte 1 de 2; a tela "Hoje" vai em PR separado). Base: `.design/identidade-visual-e-tema.md`.
- **Feito**: `BottomNav` (abaixo de `md`, atalhos por papel: Admin Hoje/Agenda/Pacientes/Faturas/Mais, Atendente sem Faturas, Profissional com Triagem e contador), rota `/mais` (grupos Atendimento, Gestão e Conta filtrados por `canRoleAccess`, com tema e Sair), `viewport` com `viewport-fit=cover` e `theme-color` claro/escuro, `min-h-dvh`, safe-area na barra e no conteúdo, `sv-gap: field-font-16` (campo ≥ 16px), `overscroll-behavior` e tap-highlight. Testes novos: `tests/lib/staff-shortcuts.test.ts`, `tests/components/bottom-nav.test.tsx`, `e2e/shell-mobile.spec.ts`.
- **TESTE-ALTERADO**: `e2e/sidebar-responsive.spec.ts` — o seletor `nav a` pegava os links da barra inferior (nova `<nav>`), cobertos pelo drawer; agora escopado ao `dialog` do drawer. Comportamento testado igual.
- **Decisões não críticas**: drawer do menu lateral mantido no celular (trocá-lo exigiria mexer em 5 E2E existentes; fica para o PR que fechar o shell); "Mais" é rota real (o voltar do aparelho funciona); "Ajuda e suporte" fora (não há tela; pergunta aberta ao dono); sem axe (`@axe-core/playwright` entra com a trava #424).
- **Pendente (spike do issue)**: rodapé fixo com teclado aberto e gesto de voltar em iPhone e Android reais; só se mede no aparelho.
- **Next step**: PR "Hoje" (#428 parte 2) e listas em cartões (#429). **Blockers**: nenhum.


## Tela Hoje (2026-10-21) — EM REVISÃO

Issue #428, parte 2 (a parte 1, barra inferior e Mais, foi o PR #437).
- **Feito**: a tela inicial e o item de menu "Dashboard" viram "Hoje" (com a data); a agenda de hoje ganha o bloco "Próximo atendimento" (nome completo do paciente, horário e procedimento, por `nextAppointment`) e a contagem "N de M concluídas" (`dayCounts`), em `src/lib/day-summary.ts`. Sem chamada de API nova: usa a lista do dia que a tela já busca (resumo para o Admin, agenda para os demais; o Profissional já vem restrito à própria agenda). Testes novos: `tests/lib/day-summary.test.ts` e um cenário em `tests/pages/dashboard-role.test.tsx`.
- **TESTE-ALTERADO**: o nome da tela mudou de "Dashboard" para "Hoje" (aprovado pelo dono na canvas): `tests/pages/staff-nav-role.test.tsx`, `tests/pages/staff-dashboard.test.tsx` e os títulos em `e2e/{auth,followup,plataforma,plataforma-suspensao}.spec.ts`. Só o rótulo mudou.
- **Decisão não crítica**: o estado "sem permissão para o resumo financeiro" já existe (o bloco de KPIs some para quem não tem `/api/summary`); o bloco de KPIs do mês segue abaixo.
- **Next step**: #429 (listas em cartões). **Blockers**: nenhum.


## Nome abreviado nas listas (2026-10-21) — EM REVISÃO

Issue #429 (primeira fatia). As tabelas das telas já viram cartões no celular (`Table stack` do Still Void 3.4.0, provado em `e2e/responsive-tables.spec.ts`), então esta fatia aplica a regra de exibição do nome do CONTEXT.md.
- **Feito**: `abbreviatePatientName` (`src/lib/patient-name.ts`): primeiro e último nome inteiros e iniciais dos do meio; partículas (de, da, do, das, dos, e) não viram inicial. Aplicado nas listas de Pacientes, Faturamento, Hoje (consultas e retornos), Agenda (grade e mês no celular) e lista de espera. Testes novos: `tests/lib/patient-name.test.ts` e um cenário em `tests/pages/dashboard-role.test.tsx`. **TESTE-ALTERADO**: `e2e/{agenda,faturamento,followup,layout-mobile-first,lista-espera,pacientes,responsive-tables}.spec.ts` passam a procurar o nome já abreviado nas listas (helper `e2e/support/patient-name.ts` reutiliza `abbreviatePatientName`); a verificação é a mesma, só o texto esperado muda por causa da regra nova.
- **Decisão não crítica**: pedidos do titular, auditoria, detalhes, formulários e confirmações mantêm o nome completo (identificam o titular ou a ação). Homônimos com o mesmo nome abreviado: a lista de Pacientes já mostra o nascimento em coluna; nas demais listas fica a pergunta aberta do doc de descoberta (padrão sugerido: nascimento no segundo).
- **Next step**: telas restantes do #429, uma por PR (Procedimentos/Materiais/Profissionais/Parceiros como lista + ficha, Minha conta, login), depois da trava de acessibilidade (#424). **Blockers**: nenhum.


## Homônimos nas listas (2026-10-21) — EM REVISÃO

Issue #429, fatia 2. Decisão do orquestrador por segurança do paciente (dois identificadores): quando dois nomes abreviados colidem na mesma lista, todos os que colidem mostram o nascimento (`Maria S. Lima · nasc. 12/03/1980`); registrado no CONTEXT.md.
- **Feito**: `ListAppointments`, `ListInvoices` e `ListFollowUps` devolvem `patientBirthDate`; `AppointmentDto`, `InvoiceDto` e `FollowUpDto` ganham `patientBirthDate?` só nas listas (rotas de agenda, resumo, faturas e retornos); `homonymPatientIds` e `listPatientName` (`src/lib/patient-name.ts`) aplicados em Hoje, Faturamento, grade e mês da agenda. Testes novos: `tests/lib/patient-name.test.ts` (homônimos), `tests/application/follow-ups-birth-date.test.ts`, `e2e/homonimos.spec.ts`. Nenhum teste existente editado.
- **Fora desta fatia**: lista de espera (a API não traz nascimento) e a lista de Pacientes (já tem coluna de nascimento). Dado de saúde: a data de nascimento já é visível à equipe na lista de Pacientes; as rotas continuam atrás das mesmas guardas e o Profissional só recebe a própria agenda.
- **Next step**: aguardar #427 e #424 para as telas restantes do #429. **Blockers**: nenhum.

## Logo da clínica e avatar da equipe (2026-10-21) — CONCLUÍDO (PR #441 mergeado na release/v0.2.0)

Issue #427 (bloco 3 de `.design/identidade-visual-e-tema.md`), ADR-055; migração `0067`.
- **Feito**: `clinics.logo_key` e `user_accounts.avatar_key`; `POST|DELETE /api/settings/clinic-logo` (só o Admin, família administrativa; diverge do nome `/api/clinic/logo` da issue porque a família de rota é por caminho) e `GET /api/clinic/logo` e `POST|DELETE /api/account/avatar` + `GET /api/account/avatar/[id]` (mesma clínica, conta ativa); `identity: { logoUrl, imageUploadAvailable }` em `GET /api/settings/clinic-info`, `imageUploadAvailable` também em `/api/me`, `avatarUrl` em `/api/me`, `clinicLogoUrl`/`account.avatarUrl` em `/api/auth/identity`; telas em Configurações, Minha conta e menu da equipe. SVG: `src/domain/clinic/svg-sanitizer.ts` (allowlist, reconstrói o arquivo, rejeita conteúdo ativo; 70 casos com payloads de XSS), entrega com `nosniff` + CSP `sandbox` (o proxy aplica a CSP isolada nessas rotas). Raster: `sharp` recodifica em WebP sem EXIF.
- **Spike HEIC**: o `sharp` pré-compilado não decodifica HEIC; o servidor recusa com orientação e o `accept` omite HEIC (o Safari do iOS converte para JPEG no seletor). Se quiser HEIC de verdade, `heic-convert` entra atrás do `ImageProcessor` (decisão registrada no ADR-055).
- **Testes novos** (nenhum existente editado): `tests/domain/{svg-sanitizer,identity-image}.test.ts`, `tests/application/manage-identity-image.test.ts`, `tests/infrastructure/{sharp-image-processor,identity-images-persistence}.test.ts`, `tests/api/identity-images.test.ts`, `tests/proxy-identity-images.test.ts`.
- **Pendências**: (1) varredura de arquivos de avatar órfãos no bucket após a anonimização (a chave é limpa no banco, o arquivo fica; bucket privado, nome UUID); (2) logo no login, nos comprovantes e nos e-mails é a fatia seguinte (roadmap "Logo em login e comprovantes"); (3) migração `0067` e ADR-055 conferidos contra a release no momento do merge (#426 também previa `0067`: quem mergear depois renumera).
- **Next step**: #430 depende deste. **Blockers**: nenhum.

## Identidade visual: trava de acessibilidade (#424, 2026-10-21) — EM REVISÃO

Bloco 0 da descoberta `.design/identidade-visual-e-tema.md` (release v0.2.0, ADR-052).
- **Feito**: `@still-void/ui` sobe para `^3.4.1` (tintas de texto do modo claro com folga sobre fundo tingido, still-void#28); `tests/lib/contraste-tema.test.ts` lê o `theme.css` publicado e confere, nas 4 cores × 2 modos, texto e texto secundário sobre as 4 superfícies, acento e estado como texto (superfície lisa e tinta de 10%) e `#0a0a0c` sobre o acento; `@axe-core/playwright` com `e2e/acessibilidade.spec.ts` (login e esqueci-senha, com `prefers-color-scheme` claro e escuro, 0 violações séria/crítica; o app só segue o esquema do sistema depois do #425).
- **Testes novos**, mais um ajuste com `TESTE-ALTERADO`: `tests/app/still-void-version.test.ts` passa a exigir a 3.4.1 (o #425 deixou a 3.4.0 para esta entrega). Rodado contra o build de produção.
- **Fora do escopo, pendente no Still Void**: borda de controle a 3:1 (hoje `--sv-border-strong` fica perto de 1,5:1); o teste não cobre bordas até existir um token próprio.
- **Next step**: telas novas (Hoje, Identidade, Aparência) somam rotas ao spec do axe quando chegarem (#425 a #429). **Blockers**: nenhum.


## Acessibilidade das telas da equipe (2026-10-21) — EM REVISÃO

Issue #429, fatia 3 (critério de pronto: axe sem violação séria). `e2e/acessibilidade-equipe.spec.ts` roda o axe (WCAG 2.2 AA) em 16 telas da equipe (Hoje, Mais, Pacientes, Agenda, Faturamento, Procedimentos, Materiais, Profissionais, Parceiros, Minha conta, Configurações, Relatórios, Repasses, Auditoria, Triagem, Pedidos do titular), no claro e no escuro, a 390px.
- **Achados e correções**: Hoje, `label-content-name-mismatch` nos cartões de KPI (o `aria-label` "Ver …" não continha o texto visível; agora o nome vem do conteúdo); Agenda e Faturamento, `color-contrast` do "hoje" e do filtro ativo (`text-white` sobre `bg-accent-ink` no escuro; agora `text-bg`, o mesmo par do `sv-btn--accent`) e dos dias de outros meses no calendário do celular (`opacity-60` removido, fica `text-ink-3`). As demais telas já passavam.
- **TESTE-ALTERADO**: `tests/pages/staff-dashboard.test.tsx` procura os links dos KPIs pelo texto visível (`/^Recebido no mês/`, `/^Consultas no mês/`) em vez do `aria-label` "Ver …" (critério WCAG 2.5.3: o nome acessível contém o rótulo visível).
- **Ainda fora do axe**: definir senha (precisa de token), portal do paciente e Plataforma (sessões próprias); entram numa fatia com helper de sessão. O redesenho "lista + ficha" de Procedimentos, Materiais, Profissionais e Parceiros e o hub de Configurações dependem do desenho da canvas (decisão de UX do dono) e ficam como pergunta aberta.
- **Next step**: definir/portal/plataforma no axe. **Blockers**: nenhum.

## Acessibilidade: definir senha, portal e Plataforma (2026-10-21) — EM REVISÃO

Issue #429, fatia 4. `e2e/acessibilidade-portal-plataforma.spec.ts` roda o axe (WCAG 2.2 AA), claro e escuro, a 390px: definir senha (link inválido), início do portal do paciente (sessão de paciente com `linkPortalAccount` + `sessionCookie`) e 5 telas da Plataforma (início, nova clínica, taxonomia, auditoria, minha conta; sessão do super_admin).
- **Achado e correção**: portal, `scrollable-region-focusable` nos textos de termo (`consent-card.tsx`, `partner-consent-card.tsx`): o `Prose` com `overflow-y-auto` não era focável por teclado; ganhou `tabIndex={0}`, `role="region"` e `aria-label`. As demais telas já passavam. Sem teste existente alterado.
- **Fora do axe**: definir senha com token válido (estado de formulário) e telas internas do portal além do início; ficam para quando houver helper de token.
- **Next step**: "lista + ficha" e login redesenhado seguem pausados até o Kalléo ver a canvas. **Blockers**: nenhum.

## Tema e cor por clínica (2026-10-21) — EM REVISÃO

Issue #426 (bloco 2 de `.design/identidade-visual-e-tema.md`), ADR-056; migração `0068`.
- **Feito**: `clinics.theme_mode` (`light|dark|system`) e `clinics.theme_accent` (`cyan|violet|mint|amber`) com `CHECK`; `src/domain/clinic/clinic-identity.ts` (lista fechada, validação, padrão `system` + `violet`); `UpdateClinicTheme`; `PUT /api/settings/clinic-identity` (só o Admin, auditoria `clinic-theme`; diverge do `/api/clinic/identity` da issue pelo mesmo motivo do ADR-055: família de rota por caminho); tema em `identity.theme` de `clinic-info` e `clinicTheme` de `/api/auth/identity`; seção "Identidade visual" em Configurações com prévia (Atendente e Profissional veem, não editam); o layout raiz lê a sessão e escreve `data-theme`/`data-accent`; `ClinicThemeSync` reaplica a cor da clínica a cada montagem (o valor guardado pelo pacote vencia o do servidor) e resolve `system` por `prefers-color-scheme`, ao vivo; botão claro/escuro grava a escolha do aparelho em chave própria (`estomasystech:modo-escolhido`), com cópia em memória. Seed: a clínica vizinha nasce escura e âmbar.
- **Decisão `system`**: o pacote só tem `light` e `dark`. O servidor entrega claro, o script inline (nonce da CSP) resolve antes de pintar. Aparelhos que já tinham a chave do pacote da #425 seguem o padrão da clínica até o primeiro clique.
- **TESTE-ALTERADO**: `tests/pages/configuracoes-role.test.tsx` (2 asserções): a lista de títulos do Atendente e do Profissional em Configurações ganhou "Identidade visual", porque o requisito da issue é que eles vejam a seção. Nenhum outro teste existente foi editado.
- **Testes novos**: `tests/domain/clinic-identity.test.ts`, `tests/application/update-clinic-theme.test.ts`, `tests/infrastructure/clinic-theme-persistence.test.ts`, `tests/api/clinic-theme.test.ts`, `tests/lib/{theme-clinic,clinic-theme-server,device-mode}.test.ts`, `tests/components/clinic-theme-sync.test.tsx`, `tests/pages/identity-section.test.tsx`.
- **Pendências**: a consulta da clínica a cada renderização não tem cache; limpeza de avatar órfão (fatia seguinte, LGPD) e logo em login e comprovantes seguem abertas.
- **Next step**: limpeza de avatar órfão, depois #430. **Blockers**: nenhum.

## Limpeza de avatar órfão na retenção (2026-10-21) — EM REVISÃO

Pendência do #427 (LGPD: foto de rosto é dado pessoal), sem ADR novo (completa o ADR-055).
- **Feito**: `RetentionRepository.findInactiveAvatarKeys(cutoff)` (mesmo filtro de `anonymizeInactiveAccounts`) e `RunRetention.removeAvatars`: apaga os arquivos antes de anonimizar, porque a anonimização zera a chave; falha de um arquivo vai ao log com a chave e não trava a anonimização. `ACE-RN-60` atualizada.
- **Edição em teste existente (não enfraquece)**: o helper `fakeRetention` de `tests/application/run-retention.test.ts` ganhou `findInactiveAvatarKeys`, porque o contrato `RetentionRepository` ganhou o método. Nenhuma asserção mudou.
- **Testes novos**: `tests/application/retention-avatars.test.ts`, `tests/infrastructure/retention-avatars-persistence.test.ts`.
- **Next step**: #430. **Blockers**: nenhum.


## Instalar na tela inicial e logo nos documentos (2026-10-21) — EM REVISÃO

Issue #430 (bloco 3 de `.design/identidade-visual-e-tema.md`), ADR-057; sem migração.
- **Feito**: `src/app/manifest.ts` (`standalone`, `pt-BR`, ícones 192/512/maskable) e ícone do iOS no `metadata` do layout; ícones gerados por `scripts/brand/generate-icons.ts` com tokens do Still Void; os cinco caminhos entram em `PUBLIC_PATHS` (exatos); `ClinicInfoDto.logoUrl` opcional e logo no cabeçalho de `DocumentFrame` só quando a clínica enviou.
- **Decisões**: sem service worker (nada de prontuário em cache no aparelho); manifesto e ícones são da plataforma, iguais para todas as clínicas (rota pública não sabe a clínica).
- **Perguntas abertas (produto)**: logo no login (como identificar a clínica antes de entrar, sem expor quem é cliente?) e logo em e-mail (precisa de URL pública da imagem). HEIC já respondido no ADR-055.
- **Testes novos**: `tests/lib/instalar-na-tela-inicial.test.ts`, `tests/components/document-frame-logo.test.tsx`. Nenhum teste existente alterado.
- **Next step**: aguardar decisão de produto sobre login/e-mail. **Blockers**: nenhum.

## Procedimentos em lista + ficha (2026-10-21) — EM REVISÃO

Issue #429, fatia 5, desenho aprovado pelo Kalléo na canvas (Cadastros). `/procedimentos`: título "Procedimentos"; Editar abre a ficha ao lado da lista (`lg:` duas colunas; folha de baixo no celular desde o upgrade 3.5.0), linha escolhida com `aria-selected`; Novo procedimento e Kit seguem em janela. Nenhum teste existente alterado; testes novos na página e `e2e/procedimentos-ficha.spec.ts`.
- **Pergunta aberta (regra 5)**: no celular a canvas mostra o formulário em folha de baixo; aqui a ficha empilha abaixo da lista. A folha de baixo pede um componente do Still Void (ou `sv-gap`); decidir antes de Materiais/Profissionais/Parceiros, que seguem o mesmo padrão.
- **Next step**: Materiais, Profissionais, Parceiros no mesmo padrão. **Blockers**: nenhum.

## Login redesenhado (2026-10-21) — EM REVISÃO

Issue #429, fatia 6, canvas aprovada (Entrar). `/login`: moldura em dois painéis a partir de `md` (marca do produto + formulário), só formulário no celular, botão Mostrar/Ocultar senha (fora do `<label>`, para não mudar o nome do campo), frase da LGPD junto do link de privacidade. Passos de segundo fator usam a mesma moldura. Nenhum teste existente alterado; o axe de `/login` (claro e escuro) já cobre a tela.
- **Pergunta aberta (regra 5)**: a canvas mostra logo e nome da clínica no login, mas o login não sabe a clínica de quem entra (e-mail e senha, sem subdomínio). Ficou a marca do produto. Mostrar a clínica exigiria decidir como identificá-la (subdomínio, link do convite ou depois do e-mail).
- **Next step**: hub de Configurações; Materiais/Profissionais/Parceiros depois da folha de baixo. **Blockers**: nenhum.
## Folha de baixo nas fichas (2026-10-21) — EM REVISÃO

Resolve a pergunta aberta de "Procedimentos em lista + ficha". `@still-void/ui` 3.4.1 → 3.5.0 (traz `BottomSheet` e o token `--sv-control-border`, bordas de campo mais fortes). Novo `src/components/sheet-panel.tsx`: ficha ao lado da lista a partir de 1024 px, `BottomSheet` (`closeLabel="Cancelar"`) abaixo disso; só `/procedimentos` usa por ora, é a única lista+ficha mergeada.
- **Decisão**: consulta `max-width: 1023px`; sem `matchMedia` (SSR, testes) o padrão é a ficha ao lado, o que mantém os testes existentes intactos.
- **Coordenação**: a thread de tema troca Materiais, Profissionais e Parceiros para `SheetPanel` depois que este PR entrar na release.
- **Testes novos**: `tests/components/sheet-panel.test.tsx`, `e2e/procedimentos-folha.spec.ts` (390 px). Nenhum teste existente alterado.
- **Next step**: adoção nas demais fichas. **Blockers**: nenhum.


## Parceiros e Profissionais em lista + ficha (2026-10-21) — EM REVISÃO

Issue #429, fatia 7, canvas aprovada (Cadastros). Mesmo padrão de Procedimentos, com o `SheetPanel` compartilhado: Editar abre a ficha ao lado da lista (`lg:`) ou a folha de baixo no celular; Novo parceiro/profissional segue em janela.
- **TESTE-ALTERADO**: `tests/pages/staff-operations.test.tsx` (2 testes de "fechar sem salvar"): o botão de fechar a edição passa a se chamar "Fechar ficha" (ficha ao lado da lista, desenho aprovado), em vez do "Fechar" da janela.
- Sem destaque da linha escolhida nestas duas telas (só em Procedimentos), para não ampliar a mudança.
- **Next step**: Materiais (945 linhas, estoque e movimentos, pede olhar à parte) e hub de Configurações. **Blockers**: nenhum.

## Logo do EstomaSysTech (2026-10-21) — EM REVISÃO

Pedido do Kalléo: no login, logo do sistema (não da clínica), bonita, minimalista e moderna. `src/components/brand-mark.tsx`: "E" de três barras arredondadas sobre quadrado de cantos suaves, com ponto à direita; usa `--sv-accent-ink` e `--sv-bg` (par do botão de acento, AA em todos os modos). Login: marca grande no painel (computador) e pequena acima do título (celular). `public/brand/estomasystech.svg`: arquivo estático (violeta fixo) para quem precisar fora do app.
- **Pergunta aberta (regra 5)**: ícone do app (`public/icons`, favicon, apple-touch) segue o antigo; trocar pela nova marca exige gerar PNGs e decidir cor fixa. Não feito.
- **Next step**: Materiais e hub de Configurações. **Blockers**: nenhum.

## Base do gate local na release (2026-10-21) — EM REVISÃO

Exceção pontual de @KalleoPinheiro para editar `scripts/gate/` e `.husky/pre-push`. `check:testes`, mutação do `gate:local` e `check:changeset` passam a comparar com a release aberta de que a branch descende (ADR-058); `release/*`, `hotfix/*` e `main` seguem contra `origin/main`; `GATE_BASE` vence. `pre-push` busca as releases. Regra 8 e recibo do PR release→main intactos.
- **Testes novos**: `tests/scripts/gate-base.test.ts`. Nenhum teste existente alterado.
- **Next step**: aguardar revisão. **Blockers**: nenhum.

## Materiais em lista + ficha (2026-10-21) — EM REVISÃO

Issue #429, fatia 8, canvas aprovada (Cadastros). `/materiais`: Editar abre a ficha ao lado da lista (`lg:`) ou a folha de baixo no celular, via `SheetPanel`; Novo insumo, Movimentar e Histórico seguem em janela (são ações de estoque, não ficha). Nenhum teste existente alterado.
- **Next step**: hub de Configurações. **Blockers**: nenhum.

## Hub de Configurações (2026-10-21) — EM REVISÃO

Issue #429, fatia 9, canvas aprovada (Configurações). `/configuracoes` ganha `SectionNav`: coluna de atalhos fixa ao lado (computador) e lista no topo (celular), por âncora, só com as seções que o papel vê (mesma matriz `useStaffAccess`). As seções seguem todas na mesma página.
- **Decisão**: a canvas mostra o celular como hub com telas por seção (navegar para cada uma). Fiz âncoras na mesma página porque as telas por seção mudariam rotas e quebrariam vários E2E existentes (feriados, canal de e-mail, grade de horários), que não podem ser alterados por regra 8. Se o Kalléo quiser uma tela por seção, vira um PR próprio com migração desses testes.
- Teste novo `tests/pages/configuracoes-secoes.test.tsx`; nenhum teste existente alterado.
- **Fechando o #429**: restam só o favicon/ícone do app (decisão do Kalléo) e a pergunta da tela por seção. **Blockers**: nenhum.

## Seed de staging aditivo (2026-10-21) — EM REVISÃO

Pedido do Kalléo (opção A): a staging usa a branch `main` do Neon, sem reset, então as 8 contas novas do #434 e a clínica vizinha nunca entravam. `scripts/seed/seed.ts` passa a criar só o que falta (clínica por id, conta por e-mail, profissional por registro, parceiro por e-mail, pacientes da vizinha por nome), sem apagar nem duplicar; massa pesada só em clínica sem paciente; senha reaplicada em banco já semeado; travas de `APP_ENV` e banco de produção intactas. ADR-059; `homologacao.md` § 4 atualizado.
- **Testes novos**: `tests/scripts/seed-aditivo.test.ts` (banco vazio, já completo, semeado antes do #434, termos do portal, senha trocada). Nenhum teste existente alterado.
- **Next step**: após o merge, Kalléo roda `git checkout release/v0.2.0 && git pull && npm run staging:rebuild -- --release --push` no WSL. **Blockers**: nenhum.
## Rotina mensal e checklist (#381) (2026-10-21) — EM REVISÃO

Decisões do Kalléo em 2026-10-21 sobre a #381: logs com PII mascarada (thread própria), segurança adiada (Tailscale no lugar de Proton VPN; Cloudflare só com usuários reais) e rotina mensal em opção A (checklist no runbook).
- **Feito:** `producao.md` § 7.4 com o checklist do 1º sábado. Só `.md`, então pela regra do ADR-053 não exige recibo do gate local.
- **Próximo passo (outro PR, com recibo):** workflow de lembrete mensal desligado (sem `schedule`), que abre uma issue de lembrete. Ativar depois, com o recibo do gate local.
- **Atenção:** `mutacao-mensal.yml` já tem `schedule` (último dia do mês) e vai rodar em 2026-10-31, consumindo cota; decidir se o mantém ou desliga até o reset.
- **Blockers:** nenhum.
## Favicon e ícone do app com a logo nova (2026-10-21) — EM REVISÃO

Escolha do Kalléo: opções C (branca) e D (grafite) da prévia, uma para cada cenário claro/escuro. `public/brand/favicon-grafite.svg` (aba clara) e `favicon-branco.svg` (aba escura) entram em `metadata.icons` com `media: prefers-color-scheme`, e viram caminhos públicos (`access-policy.ts`). Ícone do app instalado (manifesto 192/512/maskable) e `apple-touch-icon.png`: grafite, já que o manifesto não troca por tema. `src/app/favicon.ico`: grafite, de reserva.
- **Decisão minha**: associei grafite à aba clara e branco à aba escura (contraste com a aba). Se o Kalléo quiser o oposto, é trocar o `media` de cada um.
- Teste novo `tests/lib/favicon-por-tema.test.ts`; nenhum teste existente alterado.
- **Next step**: nenhum no #429. **Blockers**: nenhum.

## Barra lateral: bloco da clínica e do usuário (2026-10-21) — EM REVISÃO

Correção pedida pelo Kalléo (staging f42666e, desktop): avatar cortado ("C(" e "A") e nome da clínica e e-mail quebrando em várias linhas. `SidebarIdentity` agora tem logo e avatar de 32 px (iniciais com fundo `bg-accent-soft`, antes invisível sobre o painel), nome da clínica, e-mail e perfil em uma linha com reticências, e o e-mail inteiro no `title`. Teste novo `e2e/sidebar-identidade.spec.ts` (medidas e axe em claro e escuro a 1280 px).
- **TESTE-ALTERADO**: `tests/pages/staff-layout-client.test.tsx` (C42) e `e2e/layout-mobile-first.spec.ts` ("e-mail da sidebar"): o requisito de #199 (e-mail inteiro quebrando linha) mudou a pedido do Kalléo para uma linha com reticências; o endereço completo fica no `title`.
- Não consegui ver o "C(" da staging (o E2E usa iniciais "CE"); a causa provável é o logo/avatar sem `shrink-0` ou sem fundo; o novo teste mede 32x32 para travar isso. Se persistir com imagem real, preciso de uma captura.
- **Next step**: nenhum. **Blockers**: nenhum.

## Workflow do lembrete mensal (#381) (2026-10-21) — EM REVISÃO

Segundo passo da rotina mensal: `.github/workflows/rotina-mensal.yml` abre a issue «Rotina mensal de manutenção — AAAA-MM» com o checklist do `producao.md` § 7.4. **Desligado**: só `workflow_dispatch`, com o `schedule` (sábados 11:00 UTC, filtrado para o 1º sábado) comentado; job de poucos segundos, sem checkout, sem duplicar issue aberta. `producao.md` § 7.4 ganhou o passo a passo de ativação.
- **Decisão minha**: `ubuntu-24.04` (como os demais workflows) em vez de `ubuntu-latest`; sem label na issue (label inexistente faria o `gh issue create` falhar).
- **Next step**: ativar depois do reset da cota (~2026-11-01), descomentando o `schedule`. **Blockers**: nenhum.
## Mascarar dados pessoais nos logs (2026-10-21) — EM REVISÃO

Issue #381 (item logs/LGPD), decisão do Kalléo: mascarar PII nos logs e auditar/documentar sempre com dado mascarado. `emit` do logger passa `msg` por `scrubText` e os campos por `redactFields` (`src/lib/redact.ts`): chave sensível (CPF, e-mail, telefone, nome de pessoa, anamnese/diagnóstico/notas, senha, token, corpo de mensagem…) vira `[redigido]`; URL com query, Bearer/JWT, sequência opaca, e-mail e número longo viram marcador. GlitchTip: contexto, mensagem, `transaction` e tags também. ADR-060; auditoria dos 56 pontos de log em `docs/engineering/auditoria-logs-pii-2026-10.md`; runbook § 9.4 e `glitchtip.md` atualizados.
- **Decisão**: única exceção é o `link` de definição de senha fora de produção (dry-run do `NullEmailGateway`; o E2E depende dele). Teste de arquitetura C17 proíbe nome/e-mail/CPF/telefone crus em mensagem de log.
- **Testes novos**: `redact-campos`, `logger-redacao`, `error-tracker-redacao`, `log-pii-architecture`. Nenhum teste existente alterado.
- **Pergunta aberta**: o log de acesso do Traefik/Coolify pode guardar `?token=` de convite/reset; não verificado (exige olhar o servidor, via RC). Entra na rotina mensal.
- **Next step**: aguardar revisão. **Blockers**: nenhum.

## Avatar com iniciais quebradas (2026-10-22) — EM REVISÃO

Staging mostrava "C(" no logo da clínica "Clínica Homologação (fictícia)": `initialsOf` pegava o primeiro caractere da última palavra, que era o parêntese. Agora cada termo contribui com a primeira letra ou número (`\p{L}\p{N}`), termos sem letra são ignorados, e nome sem nenhuma letra dá "?". Layout: logo e avatar já têm tamanho fixo (`style` width/height) e `shrink-0` desde o PR #458; o recorte vinha só do texto, não do layout.
- Teste novo `tests/components/identity-image-iniciais.test.tsx` (parênteses, acentos, uma palavra, vazio); nenhum teste existente alterado.
- O E2E pegou (só na suíte completa, por causa de uma foto pendente criada por outro spec) contraste insuficiente em `.text-xs.truncate` da lista de triagem sobre o aviso âmbar do "Hoje": `triage-photo-list.tsx` trocou `text-ink-3` por `text-ink-2`. Falha anterior a este PR, corrigida aqui porque o gate precisa ficar verde (regra 7).
- **Next step**: Kalléo roda `staging:rebuild`. **Blockers**: nenhum.

## TIME completo na avaliação de ferida (2026-10-22) — EM REVISÃO

Issue #464 (QA staging v0.2.0, mãe #463): a avaliação de ferida não tinha Infecção/Inflamação nem Bordas/epitelização. Migração aditiva `0069` (oito colunas nulas + `CHECK`): `infection_level`, `infection_signs`, `wound_edges`, `exudate_type` e percentuais de granulação, epitelização, esfacelo e necrose. Vocabulário fechado em `src/domain/clinical/wound-time.ts` (contínuo de infecção da IWII; bordas em valor único), validação no domínio e na API, formulário com `TimeFields`, coluna "Infecção / Bordas" na tabela e no relatório impresso, seed com TIME. ADR-062, PRO-RN-24.
- **Decisão minha**: PUSH inalterado, sem regra cruzada nível × sinais, portal e parceiro sem os campos novos, pele perilesional reaproveita `skin_condition`. As 4 perguntas abertas (vocabulário, alerta de infecção, % de tecido no PUSH, conferência nível × sinais) estão no ADR-062 para o estomaterapeuta.
- **Tipo do DTO**: campos novos opcionais em `AssessmentDto` para não editar fixtures de teste existentes (regra 8).
- **Testes novos**: `wound-time`, `avaliacao-time-routes` (PGlite, roda a migração), `avaliacao-time-form`, `wound-time-summary`; nenhum teste existente alterado.
- **Seed**: a massa pesada só nasce em banco vazio (ADR-059); a staging só mostra TIME nas avaliações do seed em banco novo.
- **Next step**: Kalléo/estomaterapeuta responderem as perguntas do ADR-062. **Blockers**: nenhum.

## Pagamento acima do saldo (2026-10-22) — EM REVISÃO

Issue #466 (QA staging v0.2.0, filha de #463): no diálogo «Registrar pagamento», valor acima do saldo (ex.: 999 para saldo de R$ 120) virava `PATCH {action:"pay"}` e quitava sem aviso. O domínio e a API já recusavam `pay_partial` acima do saldo (FIN-RN-02); o furo era só a UI, que mandava `pay` para qualquer valor ≥ saldo. `PaymentForm` agora mostra «Valor maior que o saldo: o máximo é R$ X» e desabilita as formas de pagamento (também para zero e negativo); `handlePay` só usa `pay` quando o valor é exatamente o saldo, então qualquer valor fora disso chega ao servidor como parcial e é recusado.
- **Decisão**: sem crédito automático (recomendação do orquestrador). Não adicionei etapa de confirmação para o clique no meio de pagamento (agravante da issue): é mudança de UX que fica como pergunta aberta.
- **Testes novos** em `invoice-payments-ui.test.tsx`; nenhum teste existente alterado. Linha nova na matriz de exceções do financeiro.
- **Next step**: nenhum. **Blockers**: nenhum.
## Rebuild da staging dispara deploy (2026-10-22) — EM REVISÃO

A Vercel não cria deploy de Production para um SHA já construído (ex.: prévia da release), e a `staging` local herdava upstream em `origin/release/v0.2.0`, então um `git push` simples ia para a release. `scripts/staging/rebuild.sh` ganhou `--deploy` (commit vazio `chore(staging): dispara deploy de homologação` quando algum ref remoto já aponta para o SHA final), cria a `staging` com `--no-track` e publica sempre com `git push --force-with-lease --set-upstream origin HEAD:staging`.
- **Decisão**: `--deploy` é opt-in no script e padrão no `npm run staging:rebuild` e no `staging.yml`, porque `tests/scripts/release-fluxo.test.ts` (regra 8, intocável) exige staging == release ao chamar o script direto.
- **Testes novos**: `tests/scripts/staging-rebuild.test.ts`; nenhum teste existente alterado. `scripts/staging` não está sob `GATE_OWNER_EDIT` (só testes e `scripts/gate`). Runbook `homologacao.md` atualizado.
- **Next step**: Kalléo roda `npm run staging:rebuild -- --release --push` e confere o deploy de Production. **Blockers**: nenhum.
- **Desvio de processo (2026-10-22)**: o #487 foi mergeado sem the-judge e sem `gate:local`. Verificado depois, sem achados: the-judge sem problemas e `E2E-GATE: 796884b542022d46d2bd7a986ff6b8e7090bc62c pass e2e=321 etapas=typecheck,lint,sv,docs,integridade-de-testes,cobertura,build,e2e-producao,e2e-dev puladas=docker,backup min=18.9`. O `tsc` precisa de `NODE_OPTIONS=--max-old-space-size=4096` na nuvem. Regra daqui em diante: the-judge antes de todo merge e recibo em PR que não seja só `.md`.
## Profissional abre paciente da agenda (#465) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: Ana via 23 consultas de 20 pacientes e só 1 na lista; Bruno recebia 404 no paciente que atende hoje. **Causa raiz**: o vínculo profissional↔paciente (PRO-RN-08) só nasce nas rotas (`POST /api/appointments`, paciente e evolução), e o seed grava a consulta direto no repositório, sem vínculo. A regra de acesso não mudou (sem ADR): continua o mínimo necessário, por empresa.
- **Seed** (`seedProfessionalLinks`): cria o vínculo de cada par profissional/paciente da agenda; aditivo (ADR-059), em banco já semeado completa só o que falta, sem recriar a agenda. A staging corrige no próximo `staging:rebuild`.
- **Bug de código achado no caminho**: `POST /api/appointments/recurring` não concedia o vínculo (a avulsa concedia; AGE-RN-12 já pressupunha). Corrigido em melhor esforço, como a avulsa, e só quando ao menos uma ocorrência é criada. Produção ainda sem paciente real, então não há backfill de vínculos lá.
- Ana e Bruno atendem os mesmos 20 pacientes no seed; os cenários "sem vínculo" (AGE-RN-17, PRO-RN-08) passam a usar paciente sem consulta (`homologacao-cenarios.md`). Paciente exclusivo de um profissional fica para a #477.
- Testes novos: `tests/api/professional-patient-link-on-recurring.test.ts`, `tests/scripts/seed-vinculos.test.ts`. Nenhum teste existente alterado.
- **Next step**: Kalléo roda `staging:rebuild`. **Blockers**: nenhum.

## Vercel constrói só a staging (2026-10-22) — EM REVISÃO

Deploys da Vercel falhavam com `Resource provisioning failed` (limite de branches do Neon: a integração criava um branch de banco por prévia). `vercel.json` ganhou `git.deploymentEnabled` `{"**": false, "staging": true}`; ADR-062 e runbook `homologacao.md` (§ 1, § 2, § 5) atualizados.
- **Investigação do commit vazio da staging**: não há `ignoreCommand` no repo nem Ignored Build Step visível no projeto; a Vercel não tem nenhum deploy (nem `ERROR`/`CANCELED`) para o SHA `8304683`, então a causa está fora do repositório (webhook/fila). Não corrigido por código.
- **Decisão**: prévia por PR deixa de existir (ADR-062, complementa o ADR-041). `vercel.json` vale a partir do commit empurrado: branch antiga só obedece depois de trazer a release.
- **Teste novo**: `tests/infrastructure/deploy-config.test.ts` (regra do deploymentEnabled); nenhum teste existente alterado.
- **Painel (Kalléo)**: apagar branches de preview no Neon e desligar *Create a branch for every preview deployment* na integração; conferir se algum ruleset exige o check "Vercel".
- **Next step**: Kalléo roda `staging:rebuild`. **Blockers**: nenhum.

## Termos em português e ordem das medições (#470, #473) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: «granulation»/«slough» em inglês na tabela da equipe, no relatório e no portal; auditoria com `company_admin`, `invoice`, `mfa_required` e JSON cru da retenção; mensagem «Área reduziu 89%» contradizendo a tabela quando as medições têm o mesmo horário. `tissueTypeLabel` (texto livre legado fica como gravado), `ACTOR_ROLE_LABELS`, mais recursos em `RESOURCE_LABELS`, `formatAuditDetail` (códigos e resumo da retenção). O gráfico não afirma tendência quando a primeira ou a última medição de área empata em horário com a vizinha (ordem ambígua). PRO-RN-26, ACE-RN-62.
- **Decisão minha**: esconder a mensagem em vez de desempatar por id (id aleatório não é cronologia).
- **TESTE-ALTERADO**: `tests/pages/plataforma-auditoria.test.tsx` (2 asserções): a trilha agora mostra «Credenciais inválidas» no lugar do código `invalid_credentials`; o requisito mudou (#470).
- **Testes novos**: `healing-chart-ordem-ambigua`, `audit-labels-pt`.
- **Next step**: o seed repete o mesmo carimbo nas 5 avaliações; a #477 (seed) deve dar horários distintos. **Blockers**: nenhum.

## Documento bloqueado sem emissão (#468, #474, #485) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: abrir a declaração de comparecimento com a clínica incompleta gravava «emissão de documento» na auditoria (o hook de emissão rodava na montagem, mesmo com a página bloqueada); o link aparecia para consulta futura; a mensagem não dizia o campo que faltava nem linkava Configurações. Agora as 6 páginas de documento só chamam `POST /api/documents/issue` com a clínica completa (e, na declaração, com a consulta realizada); `ClinicInfoIncompleteAlert` lista o que falta (`missingClinicInfoFields`) com link para `/configuracoes#dados` e «Voltar ao início»; o detalhe da consulta só mostra o link da declaração se `completed`. AGE-RN-21.
- **Decisão minha**: correção no cliente; a rota de emissão não confere o status da consulta porque `tests/api/documents-issue.test.ts` (regra 8) emite atestado de ids inexistentes. Fica como pergunta aberta (validar também no servidor, com ajuste de teste).
- **Não tratado**: o «Carregando…» de ~5 s no primeiro quadro (#485) é do carregamento da página, não do bloqueio.
- **Testes novos**: `declaracao-comparecimento-condicoes`, `missingClinicInfoFields` em `clinic.test.ts` (só acréscimo); nenhum teste existente alterado.
- **Next step**: nenhum. **Blockers**: nenhum.

## Termos de consentimento em nome de quem assina (#469) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: o termo imprimia «Responsável técnico: responsável técnico da clínica» e seguia em primeira pessoa quando o representante legal assina pelo menor. `renderLegalText` agora omite a linha do responsável técnico e o nome do encarregado quando são o texto de preenchimento; os textos-base e seus hashes não mudaram. Cada termo ganhou variante do representante (`v2-representante`, `v1-representante`) com hash próprio; `ConsentRecord.resolveStatus/covers` aceitam lista de textos, então aceites antigos e o gate de foto seguem valendo. ADR-064, POR-RN-29.
- **Decisão minha**: variante separada em vez de reescrever o texto original (preserva aceites e os testes existentes, regra 8); sem revisão jurídica ainda (#376 deve cobrir os quatro textos).
- **Testes novos**: `consent-representative-text` (API), `consentimento-representante` (tela), `legal-text-sem-preenchimento`, `consent-record-multiplos-textos`; nenhum teste existente alterado.
- **Next step**: revisão jurídica dos quatro textos. **Blockers**: nenhum.

## Perguntas abertas do portal (#481, #483) (2026-10-22)

Duas sub-issues do QA da staging v0.2.0 são decisão de produto e não foram implementadas: #483 (autoagendamento livre ou só de retorno; a documentação dizia «entregue» sem a limitação, agora corrigida) e #481 (aceite do termo com marcação explícita; muda o fluxo coberto por testes de unidade e E2E, então vai junto com a revisão jurídica #376). Ambas ficam registradas em `docs/domains/portal/README.md` § Perguntas abertas.
- **Next step**: o PO responde as duas perguntas. **Blockers**: nenhum.

## Alerta de infecção na triagem e coerência do TIME (2026-10-22) — EM REVISÃO

Decisões clínicas do PO sobre as perguntas abertas do ADR-062 (#464/#463), registradas no ADR-063: infecção local ou pior na avaliação mais recente gera selo na fila de triagem (`infectionAlert`, sem migração); percentual de tecido fica fora do PUSH (já era assim, agora decisão); coerência nível × sinais vira aviso não bloqueante no formulário (`infectionCoherenceWarnings`); vocabulário atual aceito. PRO-RN-25.
- **Decisão minha**: agrupei os sinais em local, disseminação (eritema em expansão, linfangite, linfadenopatia) e sistêmico (febre, mal-estar) para os avisos; o estomaterapeuta pode ajustar por ADR novo.
- **Testes novos**: `wound-time-alerta-coerencia`, casos novos em `triage-photo-list`, `avaliacao-time-form` e `audit-lgpd-routes` (só acréscimo); nenhum teste existente alterado.
- **Next step**: validar na staging o selo na triagem. **Blockers**: nenhum.

## Tema da vizinha e cenários do seed (#476, #477) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: a clínica vizinha abria violeta/sistema, igual à principal, e 9 cenários do roteiro não tinham dado no seed. **#476 não era vazamento**: a gravação do tema é `UPDATE ... WHERE id` (isolada por empresa); a causa raiz era `DrizzleClinicRepository.create`, que não gravava `theme_mode`/`theme_accent`, então a vizinha do seed nunca nasceu âmbar. `create` agora grava o tema e o seed acerta a vizinha que já existe no padrão (sem desfazer uma escolha feita pela tela).
- **#477** (`scripts/seed/cenarios.ts`, aditivo, ADR-059): pausa de almoço 12:00–13:00, repasse de 40% da Ana, kits de dois procedimentos, responsável técnico da principal, consulta+fatura paga na vizinha, histórico de `paciente@` (consulta < 24 h, outra em ~10 dias, concluída com fatura pendente, condição e retorno pendente), indicação de 2 pacientes pela parceira (um com aceite). Em banco novo: anamnese com alergia e evolução SOAP, avaliações semanais com curvas distintas, fatura emitida na data da consulta, criança sem pé diabético.
- **Fora do seed (decisão minha)**: plano SAE e pacotes (domínios de outra thread) e responsável ligado a adulto (o domínio liga responsável só a menor); o roteiro (cenário 9) passa a dizer isso. Massa pesada só em banco novo: para as correções de datas e prontuário na staging, reiniciar o branch do Neon.
- **TESTE-ALTERADO**: `tests/scripts/seed-aditivo.test.ts` (helper `regressToOldSeed`): o seed agora indica pacientes pela parceira e dá consulta/fatura à vizinha; o helper que simula o seed antigo precisa limpar esses vínculos antes de apagar parceiro e pacientes. As asserções não mudaram.
- Testes novos: `seed-tema-vizinha`, `seed-roteiro-qa`. **Next step**: staging:rebuild e conferir a vizinha escura/âmbar. **Blockers**: nenhum.
## Agenda por semana e "+N mais" (#471) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: a agenda só tinha o mês, "+N mais" era um `<span>` sem ação (a 4ª consulta do dia só aparecia filtrando por profissional) e consulta cancelada ocupava uma das 3 linhas. Entregue: visão **Semana** (desktop; o celular segue no mês compacto) com blocos proporcionais à duração, sobreposição em raias, almoço sombreado, feriados/ausências, clique no bloco abre a consulta e clique na coluna começa nova consulta; no mês, "+N mais" abre diálogo com todas as consultas do dia (inclusive canceladas) e a cancelada sai das 3 linhas.
- **Decisões minhas (sem pergunta aberta)**: mês continua o padrão; semana começa no domingo como a grade do mês; cancelada não vira bloco na semana (não ocupa horário), só um aviso "N cancelada(s)" na coluna; "visão de dia" não foi feita (a semana cobre o pedido "dia/semana" e o dia seria a mesma tela com 1 coluna: fica no backlog se o PO quiser).
- Refator para caber no limite de linhas do `.tsx`: período (mês/semana) em `agenda-period.ts`, navegação em `period-nav.tsx`, cores em `status-colors.ts`.
- Testes novos: `tests/pages/agenda-visao-semana.test.tsx`; nenhum teste existente alterado (os de `staff-agenda` passam).
- **Next step**: validar a semana na staging com 4 consultas no mesmo dia. **Blockers**: nenhum.
## Margem sem kit e confirmação do pagamento (2026-10-22) — EM REVISÃO

Issue #472 e pendência do #466 (QA staging v0.2.0, filhas de #463). Relatório: `ProcedureMargin` ganhou `supplyCostKnown` (há saída de insumo vinculada a consultas do procedimento); sem isso a tela mostra «Não apurado» em Insumos, «—» na Margem e uma nota, e o rodapé soma só os procedimentos apurados. Recebimento: a forma de pagamento só seleciona; «Confirmar recebimento» mostra valor, forma, pagador e saldo restante e então grava (decisão do PO, 2026-10-22).
- **Decisão**: `marginCents` continua número na API (compatibilidade); o sinal de custo apurado é o novo campo.
- **TESTE-ALTERADO**: o requisito de negócio mudou (pagamento passou a exigir confirmação); testes que clicavam na forma e esperavam gravar ganharam o clique em «Confirmar recebimento» (`invoice-payments-ui`, `invoice-payment-in-flight`, `staff-faturamento`, `e2e/faturamento.spec.ts`); fixtures de relatório ganharam `supplyCostKnown`. Nenhuma asserção foi afrouxada.
- **Testes novos**: etapa de confirmação (resumo e não grava antes) e relatório «Não apurado».
- **Next step**: Kalléo valida na staging (rebuild). **Blockers**: nenhum.
## Auditoria sem emissão falsa (#468) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0: abrir o atestado de uma clínica sem responsável técnico gravava "emissão de documento" na auditoria, embora a tela bloqueasse. **Causa raiz**: as seis páginas de documento chamam `useDocumentIssuance` (que faz `POST /api/documents/issue`, idempotente e auditado) antes de saber se podem renderizar. Correção no cliente: a página só pede a emissão com a clínica apta (`isClinicInfoComplete`) e, no atestado, com a consulta realizada; recibo já esperava o `receipt`.
- **Por que não no servidor**: `tests/api/documents-issue.test.ts` (regra 8, intocável) emite com ids soltos em clínicas de teste sem CNPJ; validar a clínica na rota o quebraria. Registro: quem chamar a rota direto ainda consegue emitir sem as guardas da tela (o recibo continua protegido no servidor, FIN-RN-15). Pergunta aberta para o PO: endurecer a rota também (exigiria TESTE-ALTERADO).
- Eventos falsos já gravados na staging ficam (auditoria é imutável).
- Teste novo: `tests/pages/documentos-bloqueado-sem-emissao.test.tsx` (5 dos 6 casos falham sem a correção); nenhum teste existente alterado.
- **Next step**: nenhum. **Blockers**: nenhum.
## Convite e contas de acesso (#467, #475) (2026-10-22) — EM REVISÃO

QA da staging v0.2.0. **#467**: `POST /api/accounts` gravava a conta e só depois montava o link; `appUrlFromEnv()` lança em produção sem `APP_URL` https, daí 500 com conta criada, sem link e e-mail duplicado no retry. O fluxo com `APP_URL` válida e e-mail falhando já respondia 200 com o link (teste existente), então a causa na staging é a configuração. **Não consegui ler as variáveis da Vercel** (sem permissão): é hipótese forte, não confirmada; Kalléo confere `APP_URL` no painel. Correção: a checagem da URL vem antes de gravar (convite da equipe e convite de admin pela plataforma), e na Vercel, sem `APP_URL`, vale `https://$VERCEL_PROJECT_PRODUCTION_URL`.
- **#475**: coluna Papel; papel padrão Atendente (menor privilégio, decisão minha, sem pergunta aberta: Admin de Empresa continua a um clique); texto do formulário conforme o canal de e-mail (configurado, sem canal, desconhecido). O vínculo ao cadastro nas contas de portal já existia (#196): a issue estava defasada.
- Testes novos: `account-invite-app-url`, `configuracoes-contas-papel`; nenhum teste existente alterado.
- **Next step**: Kalléo confere `APP_URL` na Vercel; retestar convite `erro@` na vizinha. **Blockers**: nenhum.
## Parceiro sem CRM: "·" solto no portal (QA #463, domínio administração/plataforma)
- **O que mudou**: `src/app/portal/partner-view.tsx` monta CRM e especialidade com `partnerCredentials`, juntando com "·" só o que existe e omitindo o traço quando não há nenhum.
- **Teste novo**: `tests/pages/portal-parceiro-sem-crm.test.tsx` (4 cenários); nenhum teste existente alterado.
- **Staging (Kalléo)**: abrir o portal de um parceiro sem CRM e conferir que o cabeçalho começa em "Estomaterapia — acompanhamento…" sem "·".
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## Agenda: visão Dia (decisão do PO em 2026-10-22, sequência do #471)
- **O que mudou**: `AgendaView` ganha `'day'`; `useAgendaPeriod` calcula janela de 1 dia, rótulo ("Quinta-feira, 22 de outubro de 2026") e navegação por dia; `WeekView` aceita `dayCount` (1 ou 7) e reaproveita a grade; `PeriodNav` ganha o botão Dia. No celular segue o mês compacto.
- **Teste novo**: `tests/pages/agenda-visao-dia.test.tsx`; nenhum teste existente alterado.
- **Staging (Kalléo)**: na agenda, escolher Dia, navegar por dia, voltar para Semana/Mês e abrir uma consulta pelo bloco.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## QA P3: acabamentos de interface (#478, #479, #480, #482, #484) (2026-10-23) — EM REVISÃO
- **O que mudou**: título por tela e link de salto (`use-staff-document-title`, `skip-link`); `ErrorAlert` rola até o erro; paciente lista todos os erros e marca campos; faixa de horário da consulta não duplica o erro; menu lateral com esqueleto enquanto o papel carrega e rolagem só no menu; legenda de Repasses; consultas passadas sem desfecho (anel na agenda, aviso no detalhe, cartão em Hoje); `data-hydrated` com cursor de espera (#484, mitigação: a causa em rede lenta não foi reproduzida aqui).
- **Não feito por conflitar com teste existente (regra 8, precisa de TESTE-ALTERADO do Kalléo)**: (1) padrão «Sem retorno» ao concluir (`staff-agenda.test.tsx`, `followUpInDays: 30`); (2) telefone de parceiro com máscara (`staff-operations.test.tsx:2236`, link com nome `11955554444`); (3) índice de Configurações sem «Canal de e-mail» para Atendente (`configuracoes-secoes.test.tsx`, asserção explícita dos três atalhos).
- **Testes novos**: `staff-shell-acessibilidade`, `feedback-erro-visivel`, `patient-form-erros`, `hydration-mark`, `consulta-sem-desfecho`, `consultas-sem-desfecho-ui`; nenhum existente alterado.
- **Staging (Kalléo)**: conferir título da aba em cada tela, Tab no início da página, paciente novo com telefone e CPF inválidos, consulta passada em Hoje/agenda, menu em janela baixa, legenda em Repasses.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## QA P3: itens com TESTE-ALTERADO (#480, #481, #482, #483) (2026-10-23) — EM REVISÃO
- **O que mudou**: caixa «Li e concordo» obrigatória no aceite do termo (POR-RN-30, `consent-card.tsx`); padrão «Sem retorno» ao concluir (`appointment-detail.tsx`); telefone de parceiro mascarado (`displayBrazilianPhone`); índice de Configurações sem «Canal de e-mail» para quem não tem a seção; #483 decidido: portal só agenda retorno, agendamento livre vira roadmap pós-v0.2.0 (docs do portal e cenário 8).
- **TESTE-ALTERADO** (autorizado pelo Kalléo em 2026-10-23): `portal.test.tsx`, `portal-minor.test.tsx`, `privacy-ui.test.tsx`, `e2e/portal-paciente.spec.ts`, `e2e/portal-responsivo.spec.ts` ganharam o passo de marcar «Li e concordo» antes de clicar no botão; `staff-agenda.test.tsx` escolhe «Retorno em 30 dias» explicitamente antes de concluir; `staff-operations.test.tsx` busca o link pelo telefone mascarado; `configuracoes-secoes.test.tsx` não espera mais «Canal de e-mail» para o Atendente. Nenhuma asserção foi afrouxada.
- **Testes novos**: `portal-aceite-explicito`, `agenda-concluir-sem-retorno`, `phone-exibicao`.
- **Staging (Kalléo)**: portal com paciente-novo (caixa antes do botão), concluir consulta sem mexer no retorno, lista de parceiros com máscara, Configurações como Atendente.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## QA da staging, rodada 2: F1–F5, O2–O4 (#508–#515) (2026-10-23) — EM REVISÃO
- **O que mudou**: título da aba por segmento no servidor (`staffMetadata`, #508); botão «+ Nova consulta» desabilitado até hidratar (`useHydrated`, #509); tendência do `HealingChart` exige 24 h entre primeira e última medição, vale no portal e no prontuário (#510); termo de tratamento sem «Responsável técnico», `v3` e `v3-representante` (ADR-065, POR-RN-31, #511); menu lateral sticky com altura descontando a faixa de homologação e sem rolagem horizontal (#512, #513); auditoria traduz `guardian-access*` e o detalhe do aceite (#514); conta recém-criada entra na lista na hora (#515).
- **#509 (causa)**: não reproduzi em Chromium com build de produção (admin, Mês/Semana/Dia, 1265x952, faixa de homologação ligada) nem como profissional no `next dev`; o clique abre o modal. Provável clique antes da hidratação ou artefato da automação (a #484 já dizia «pode ser artefato»). Fica o botão desabilitado até responder e o teste E2E do clique como profissional.
- **O1 (rodapé v0.1.0)** retirado do escopo: virou a #516 (versão vinda do banco).
- **TESTE-ALTERADO** (autorizado pelo Kalléo em 2026-10-23): `consent-text.test.ts`, `consent-representative-text.test.ts`, `consentimento-representante.test.tsx`, `legal-text-sem-preenchimento.test.ts` (v3 e sem a linha do responsável técnico).
- **Testes novos**: `staff-titles`, `use-hydrated`, `audit-labels-consentimento`, `configuracoes-conta-recem-convidada`, ampliação de `healing-chart-ordem-ambigua`, E2E `sidebar-janela-baixa`, `contas-convite-lista` e o clique do botão em `papeis-profissional`.
- **Staging (Kalléo)**: título de cada aba; menu em janela de ~800 px com a faixa de homologação; portal do paciente-novo sem «Área reduziu 89%»; termo sem «Responsável técnico» (aceitar de novo); Auditoria com «Acesso do responsável»; convidar conta e ver na lista; «+ Nova consulta» no Mês e na Semana.
## QA mobile: avaliação, ficha e evolução no portal (#523, #525, #517) (2026-10-23) — EM REVISÃO
- **O que mudou**: `FormSheet` (diálogo no computador, folha de tela cheia abaixo de 768px com rodapé fixo e confirmação ao descartar) usado na avaliação de ferida/estomia, cujo estado do formulário subiu para `AssessmentSheet` para sobreviver à rotação; barra de atalhos de `z-40` para `z-20` (abaixo do fundo e da janela, vale para todas as telas); abas da ficha com `useScrollEdges` (borda esmaecida), `scroll-snap` e aba ativa centralizada (o efeito antigo não rodava porque a lista ainda não existia no primeiro render); «Termo de consentimento» e «Exportar dados» em «Mais ações» no celular e links com 44px; `HealingChart` com geometria compacta (≤ 479px), legenda com chaves e lista de medições com variação da área; rótulo visível no campo de observação da foto. Regras PRO-RN-27 e POR-RN-32.
- **Decisão minha**: a confirmação de descarte vale só no celular, como a decisão do PO descreve; no computador o `Modal` segue como estava.
- **Testes novos**: `form-sheet`, `use-scroll-edges`, `healing-chart-compacto`, `condition-progress-medicoes` e `e2e/mobile-prontuario-portal.spec.ts` (360 e 390px); nenhum teste existente alterado.
- **Staging (Kalléo)**: no celular, abrir «+ Avaliação» numa ferida (botão sempre visível, tocar Cancelar com dado preenchido), ficha com `?aba=pacotes`, menu «Mais ações», portal do paciente com duas avaliações.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## QA mobile: gaveta do menu em celular baixo (#524) (2026-10-23) — EM REVISÃO
- **O que mudou**: a lista do menu (gaveta e rail) virou `ScrollFade`, que esmaece a borda com itens escondidos; o rodapé (Tema, Sair, versão) segue fixo embaixo (estrutura do #526) e nada sobrepõe o Sair em 568, 640 e 740 px de altura (360 px de largura).
- **Testes novos**: `scroll-fade` (unidade) e 4 casos em `e2e/sidebar-janela-baixa.spec.ts`; nenhum existente alterado.
- **Staging (Kalléo)**: gaveta em celular 360x568 e 360x640: fade na base da lista, Minha conta alcançável rolando, Sair visível.

## QA mobile R2: Auditoria paginada e em cartões (#521) (2026-10-23) — EM REVISÃO
- **O que mudou**: `/auditoria` pede 25 eventos por página abaixo de 768 px e 50 acima (cursor de `/api/audit`, sem mudar a rota); a tabela empilhada (cartão) já existente continua no celular porque `layout-tabelas.spec.ts` e `responsive-tables.spec.ts` a exigem (regra 8); filtros (`paciente`, `de`, `ate`) ficam na URL via `history.replaceState` e são lidos de `useSearchParams` ao abrir; contador de eventos. Docs: ACE-RN-64.
- **Testes novos**: `tests/pages/auditoria-mobile.test.tsx`; nenhum existente alterado.
- **Staging (Kalléo)**: Auditoria em 360 px (25 eventos, Carregar mais), filtrar por período e recarregar a página (filtro permanece).
## QA mobile R2: alvos de toque no tablet e seletor de arquivo em português (#518, #519, #520) (2026-10-23) — EM REVISÃO
- **O que mudou**: `globals.css` estende a regra de 44px da lib (`.sv-btn`, `.sv-field`, abas, paginação) e dos links até `64rem`, e dá 44px ao `.sv-dialog__close` (recuando `top`/`right` para o ícone não mudar de lugar), ao `.sv-logo` e ao rótulo que envolve caixa de seleção/rádio (o desenho de 16px não muda; o alvo é o rótulo, como o `layout-mobile-first.spec.ts` já aceita). Seção `touch-target-size` de `docs/still-void-gaps.md` atualizada: a lib deveria subir o breakpoint de toque. Novo `FilePicker` (`src/components/file-picker.tsx`) em cima do `FileInput` do Still Void: botão «Escolher arquivo» + «Nenhum arquivo selecionado», usado em logo/foto da conta, fotos de evolução e foto do portal.
- **Testes novos**: `tests/components/file-picker.test.tsx`, `e2e/alvos-de-toque-tablet.spec.ts`; nenhum existente alterado.
- **Staging (Kalléo)**: em 768 px, medir botões da Agenda, Faturamento, Configurações e portal; abrir «Nova consulta» e ver o Fechar; Configurações → Logo e portal → foto mostram o seletor em português.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## Versão do sistema vinda do banco (#516) (2026-10-23) — EM REVISÃO
- **O que mudou**: tabela `app_releases` (migração 0070, ADR-066) gravada de forma idempotente no boot (`instrumentation.ts` → `recordCurrentRelease`, depois da migração); `GET /api/version` (equipe) e `GET /api/portal/version` (portal) com `{ version, releasedAt }` e `sha` só em staging/preview, cache de 5 min no processo e `Cache-Control` privado; `ReleaseVersion` no rodapé da sidebar e do portal, com fallback para o build. Causa do `v0.1.0`: o `package.json` só sobe no `release:prepare`; o build agora calcula `NEXT_PUBLIC_RELEASE_VERSION` (package.json + changesets pendentes), `0.2.0` na staging.
- **Desvio da decisão**: duas rotas, não uma. `route-guard-conformance` exige que toda rota fora de `/api/portal` seja exclusiva da equipe, e teste existente não se altera (regra 8); `/api/portal/version` serve o portal com o mesmo leitor.
- **Testes novos**: `release-version` (domain e lib), `record-release`, `current-version`, `drizzle-app-release-repository`, `app-release-service`, `api/version`, `release-version` (componente), `next-config-release`; nenhum existente alterado.
- **Pergunta aberta**: rollback por redeploy mantém a versão mais nova no rodapé até remover a linha (ADR-066, `producao.md` § 3.1). Gravar o rollback como evento?
- **Staging (Kalléo)**: rodapé da sidebar e do portal mostrando `v0.2.0 (sha)`; `GET /api/version` com sessão; sem sessão, 401.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## QA mobile R2: Configurações com índice fixo no celular (#522) (2026-10-23) — EM REVISÃO
- **Decisão do PO**: sub-rotas `/configuracoes/[secao]` adiadas para pós-v0.2.0 (custo em testes existentes, regra 8). ADR-067. Fica: página única, mesmos ids/âncoras, índice fixo no topo abaixo de `lg` (chips de 44 px), «Voltar ao índice» ao fim de cada seção, `scroll-mt-20`. ACE-RN-64.
- **Testes novos**: `tests/pages/configuracoes-indice-mobile.test.tsx`; nenhum existente alterado.
- **Staging (Kalléo)**: Configurações em 360 px: faixa fixa, tocar numa seção, «Voltar ao índice», Atendente sem «Canal de e-mail».
- **Pendente**: sub-rotas no roadmap pós-v0.2.0 (#522 fica aberta só com isso). **Blockers**: nenhum.

## Still Void 3.5.1: área de toque de 44px vem da lib (2026-10-23) — EM REVISÃO
- **O que mudou**: `@still-void/ui` `^3.5.0` → `^3.5.1`. Saiu de `globals.css` o contorno de 44px para botão, campo, aba, paginação, rótulo de caixa de seleção e Fechar do diálogo (a lib cobre abaixo de `64rem` ou ponteiro grosso, Fechar por `::after`); ficou só `.sv-logo` e os links (`a[href]`), que a lib não dimensiona. `docs/still-void-gaps.md` (`touch-target-size`) atualizado.
- **TESTE-ALTERADO**: `e2e/alvos-de-toque-tablet.spec.ts` (da #531, desta mesma entrega): o Fechar agora é medido pelo `::after` de 44×44, não pela caixa do botão, porque a lib estende a área por pseudo-elemento.
- **Staging (Kalléo)**: em 768 px, botões, campos e o Fechar de «Nova consulta» continuam com 44px.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## QA R2 validação: índice de Configurações fixo e marca inteira na gaveta (#534, #535) (2026-10-24) — EM REVISÃO
- **Causa**: o pacote põe `overflow: auto` no `SidebarInset` (`<main>`), que vira o contêiner de rolagem do `position: sticky`, mas a rolagem real é a da janela: o índice nunca grudava (#534). A marca «EstomaSysTech» mede ~144 px e o miolo do menu (painel `w-56` − `p-5` − padding do corpo) era 135 px (#535, aparecida com o `overflow-x-hidden` do #513).
- **O que mudou**: `staff-layout-client.tsx`: `SidebarInset` com `overflow-y-visible overflow-x-clip` (não cria contêiner de rolagem e ainda contém o excesso horizontal) e padding lateral do painel `px-3` (em vez de alargar para `w-60`, que estreitava o conteúdo e fez o axe `target-size` falhar em `sidebar-identidade.spec.ts`). ACE-RN-67 atualizada.
- **Testes novos**: `e2e/configuracoes-indice-e-marca-gaveta.spec.ts` (Playwright, build de produção: índice a 0 px do topo em 360/390/768 após rolar; âncora fora da faixa; main sem overflow auto; marca sem corte na gaveta 360/390 e na barra lateral 1280); nenhum existente alterado.
- **Staging (Kalléo)**: Configurações em 360 px, rolar até o fim e ver a faixa de índice fixa; abrir o menu e ver «EstomaSysTech» inteiro.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## Código do commit no rodapé só na homologação; SHA acompanha o deploy (2026-10-24) — EM REVISÃO
- **Decisão do PO** (confirmada pelo Kalléo): o código do commit não é necessário, principalmente em produção; na homologação fica. ADR-068. Já era assim em produção (`exposesSha()` e build): rodapé, `GET /api/version` e `GET /api/portal/version` só com a versão; agora com teste explícito e documentado. `git_sha` segue gravado no banco para diagnóstico, sem sair por API nem tela.
- **Bug achado**: na staging o rodapé mostrou `(aaa5023)` com o commit `302a61c` no ar. Causa: `app_releases` gravava com `ON CONFLICT (version) DO NOTHING`; como a homologação reconstrói a mesma versão a cada commit, o SHA ficava o do primeiro deploy. Correção: `DO UPDATE SET git_sha = coalesce(excluded.git_sha, git_sha)`; data e notas não mudam.
- **Testes novos**: dois casos em `tests/infrastructure/drizzle-app-release-repository.test.ts`; nenhum existente alterado.
- **Staging (Kalléo)**: depois do rebuild, rodapé com `v0.2.0 (sha)` igual ao commit da staging; produção sem código.
- **Next step**: PR na release/v0.2.0. **Blockers**: nenhum.

## Agenda: bloco de consulta curta legível (#539) (2026-10-24) — EM REVISÃO
- **Causa**: `week-view.tsx` sempre desenhava duas linhas; em 1280 px o bloco de 15/30 min (14/28 px) cortava o texto na vertical e abaixo de `64rem` o `.sv-btn` do Still Void impunha `min-height: 44px`, inflando o bloco por cima da consulta seguinte. Varredura em 360/390/768/1280 (dia, semana, mês, lista do dia no celular): só a visão Dia/Semana tinha o problema.
- **O que mudou**: `blockDensity` (≥ 45 min duas linhas; 30–44 uma linha; < 30 uma linha de 14 px) e `min-h-0 min-w-0` no bloco. AGE-RN-23. Alvo de toque (decisão do PO): bloco < 30 min ganha área de toque ≥ 24 px (WCAG 2.5.8) por `::after` sem cobrir o vizinho; `aria-label` com hora, paciente e procedimento. O celular segue com mês + lista do dia.
- **Testes novos**: `tests/pages/agenda-bloco-curto-legivel.test.tsx` e `e2e/agenda-bloco-curto-legivel.spec.ts` (mede bloco inflado e texto cortado em 768 e 1280); nenhum existente alterado.
- **Staging (Kalléo)**: Agenda → Semana/Dia com consulta de 30 min: «11:00 Meire Saraiva · Troca de bolsa…» numa linha, sem corte; consulta de 15 min idem.
- **Next step**: PR na release/v0.3.0. **Blockers**: nenhum.

## Performance do Next: linha de base, ADR-069 e tickets (#541) (2026-10-24) — EM REVISÃO
- **O que é**: só planejamento (sem código). Linha de base do front medida no build de produção local nas 4 larguras (`docs/engineering/performance-front-linha-de-base-2026-10.md`), ADR-069 proposta (dados no servidor, Server Actions, nenhum dado de clínica em cache compartilhado, imagem autenticada fora do otimizador, sem PPR enquanto a CSP usar nonce) e issue-mãe #541 com 19 sub-issues (#542 a #560) em ondas.
- **Números**: 33/34 páginas `'use client'`; dados prontos ~2,9 s em 360 (CPU 4x, 1,6 Mbps); 18/28 rotas com LCP > 2,5 s no celular; JS 195 a 239 KB gz por rota; hidratação 0 erros em 448 cargas.
- **Achado**: fotos clínicas via `next/image` sem `unoptimized` passam pelo otimizador, que busca sem a sessão (401) — #542 (P1).
- **Decisão pendente do PO**: fuso das datas = `APP_TIMEZONE` (#543, recomendado).
- **Script e brutos**: `/mnt/project-files/perf-next/` (`linha-base.spec.ts`, `.jsonl`).
- **Next step**: aceitar a ADR-069 (vira `frozen` no #544) e abrir a onda 1 (#542, #543). **Blockers**: nenhum.

## Configurações em sub-rotas (#522) (2026-10-24) — EM REVISÃO
- **O que mudou**: `/configuracoes` virou índice de cartões; cada seção é `/configuracoes/<slug>` (8 rotas) com «Voltar ao índice» no topo e corte por papel igual ao anterior. `page.tsx` de 1.118 linhas foi dividido em `clinic-info-section`, `schedule-section`, `calendar-integration-section`, `accounts-section`, `sections.ts`, `section-page.tsx` e `legacy-anchor-redirect.tsx`. `/configuracoes#<slug>` e `/configuracoes?calendar=…` (OAuth do Google) redirecionam. ADR-072 substitui o ADR-067; ACE-RN-67 reescrita.
- **Débito (#541)**: as seções seguem client com `useApiQuery`; mover dados para Server Components/Actions é da frente de performance.
- **TESTE-ALTERADO**: aprovado pelo coordenador/Kalléo (2026-10-24). Specs que renderizavam a página única trocaram só o import (`tests/support/settings-all-sections.tsx` ou a sub-rota): configuracoes-accounts, -conta-recem-convidada, -contas-papel, -role, -calendar-integration, staff-operations. `configuracoes-secoes`: href `#x` → `/configuracoes/x`. `configuracoes-indice-mobile`: «Voltar ao índice» passa de fim-de-seção a topo de cada sub-rota. E2E: agenda, canal-email, contas-convite-lista, feriados-ausencias(-profissional), layout-tabelas, responsive-tables abrem a sub-rota; `configuracoes-indice-e-marca-gaveta` troca os testes da faixa fixa (#534, sem sentido no índice) por índice curto/navegação/redirecionamento (marca na gaveta intacta).
- **Testes novos**: `tests/pages/configuracoes-ancoras-antigas.test.tsx` (redirecionamento das âncoras e do OAuth); `tests/pages/configuracoes-subrotas-papel.test.tsx` (as 8 `page.tsx` reais × Admin/Atendente/Profissional, com «sem acesso» e o controle do logo em Identidade); E2E de ausência de rolagem interna em 1280 na sub-rota.
- **Fora deste PR (revisão do the-judge, 🟡)**: apontar direto para a sub-rota o callback do Google e o alerta de dados incompletos, e trocar `window.location.replace` por `router.replace`, exigem editar specs existentes (`calendar-integration-routes`, `declaracao-comparecimento-condicoes`, mocks de `next/navigation`); o redirecionamento cobre os dois hoje.
- **Staging (Kalléo)**: Configurações em 360: índice curto, tocar numa seção, «Voltar ao índice»; abrir `/configuracoes#horarios`; Atendente só com Identidade e Feriados.
- **Next step**: PR na release/v0.3.0. **Blockers**: nenhum.
## Abertura da release v0.3.0 (2026-10-24) — EM REVISÃO
- **O que foi feito**: `release/v0.3.0` criada a partir da `main` (7ee79cd, tag v0.2.0); `staging` devolvida a igual à `main` (force-with-lease; o commit descartado era só `chore(staging): dispara deploy`); `feat/539-bloco-curto-agenda` e `feat/adr-fluxo-7-estacoes` receberam a release por merge (sem rebase), com conflito só no handoff (mantidas as duas entradas) e PRs abertos na release.
- **Rotina ADR-052**: toda `feat/*` aberta recebe `release/v0.3.0` mergeada antes do PR e antes do merge.
- **Next step**: the-judge e merge squash dos dois PRs na release. **Blockers**: nenhum.

## Corte de release em comando único e gate com ambiente fixo (#570, #571) (2026-10-24) — EM REVISÃO
- **Decisão** (Kalléo, 2026-10-24, depois da v0.2.0 com gate repetido 4x): `npm run release:cut -- --rollback=...` na release, no WSL. Ordem: pré-condições (marca `homologacao/vX.Y.Z` no SHA, TESTE-ALTERADO do lote consolidado e integridade contra a `main`), `release:prepare` primeiro, worktree limpo, gate da release uma vez, PR `release → main` com o recibo. ADR-071 (substitui o ponto do ADR-051 sobre a mutação na release).
- **O que mudou**: `scripts/release/cut.ts` + `cut-lib.ts`; `scripts/gate/ambiente.ts` (TZ=UTC, NODE_OPTIONS 8192, `POSTGRES_PORT` livre a partir de 55432 para `docker` e `backup`, projeto do compose `estomasystech-gate`, segredos descartáveis, sobras apagadas) e `plano.ts` (perfis `pr` e `release`; release sem mutação, Docker e backup obrigatórios); `verify-receipt --head-ref` no `recibo-gate.yml`. Editado com `GATE_OWNER_EDIT=1` por aval do Kalléo.
- **Causa do #571**: a etapa `docker` escolhia porta livre, mas a `backup` subia o compose sem ela, na 5432.
- **Testes novos**: `tests/scripts/gate-ambiente.test.ts`, `gate-perfil-release.test.ts`, `release-cut.test.ts`; nenhum existente alterado.
- **Pendente**: provar o `release:cut` de ponta a ponta no WSL no corte da v0.3.0 (critério de pronto da #570).
- **Next step**: the-judge e merge na release/v0.3.0. **Blockers**: nenhum.

## Filtro da agenda por status da consulta (#538) (2026-10-24) — EM REVISÃO
- **O que mudou**: chips de status em `/agenda` (multisseleção, contagem por status do período, `aria-pressed`, rolagem horizontal própria em 360/390 px); estado em `?status=` (padrão sem `cancelled` deixa a URL limpa; inválido cai no padrão; vazio = nenhum, com «Mostrar padrão»); `GET /api/appointments?status=` filtra no servidor dentro do escopo da empresa e novo `GET /api/appointments/status-counts` conta por status sem o filtro de status. Cancelada pedida pelo filtro vira bloco na grade (mês e semana/dia).
- **Decisões**: rótulo «Faltou» (o do selo, em vez de «Falta» da issue); cancelada fora do padrão muda o que a equipe vê por padrão (antes o mês mandava a cancelada para «+N mais»); a URL é lida por `useSyncExternalStore` e gravada por `history.replaceState` (sem `useSearchParams`, que os testes de página da agenda não mockam e que exigiria Suspense).
- **Testes novos** (nenhum existente alterado): `tests/domain/appointment-status-filter.test.ts`, `tests/api/agenda-filtro-status.test.ts`, `tests/infrastructure/agenda-filtro-status-in-memory.test.ts`, `tests/components/agenda-status-filter.test.tsx`, `tests/pages/agenda-filtro-status.test.tsx`, `e2e/agenda-filtro-status.spec.ts`. Pré-patch: o teste do parser nasceu vermelho (módulo inexistente).
- **Staging (Kalléo)**: ver `## Homologação` do PR.
- **Correções do the-judge**: `from`/`to` inválidos em `GET /api/appointments` e `status-counts` agora dão 400 (antes 500 com alarme de servidor), com teste novo `tests/api/agenda-periodo-invalido.test.ts` (pré-patch: 4 falhas); regra RBAC-19 da lista e da contagem num helper só (`src/lib/auth/appointment-query.ts`); chip com nome acessível «Agendada, 3 consultas» / «carregando».
- **Correção da validação**: `/agenda?status=cancelled` + clique em «Agenda» no menu deixava chips e grade filtrados com a URL limpa. A seleção deriva só de `useSearchParams()` (URL = fonte única, sem estado local nem monkeypatch do `history`); `router.replace` grava. Testes novos (pré-patch: 2 falhas) em `tests/pages/agenda-filtro-status.test.tsx` e E2E de clique no menu.
- **TESTE-ALTERADO** (aprovado pelo coordenador com o aval do Kalléo, só acrescentar `useSearchParams` aos mocks de `next/navigation`; nenhuma asserção mudou): `tests/pages/agenda-visao-semana.test.tsx`, `agenda-visao-dia.test.tsx`, `staff-agenda.test.tsx` (ganham `useSearchParams`) e `agenda-waitlist-flow.test.tsx` (ganha o mock inteiro, pois a página passou a usar o roteador).
- **Next step**: validação Playwright em thread limpa; PR na release/v0.3.0. **Blockers**: nenhum.

## Fuso explícito das datas (#563 e #543) (2026-10-24) — EM REVISÃO
- **O que mudou**: toda regra de dia/hora usa `APP_TIMEZONE` (padrão `America/Sao_Paulo`) via `time-zone.ts`: janela do profissional, `localDateKey`, grade do autoagendamento, limites de dia/mês de summary/reports/repasses, recall, corte de histórico do portal, bloqueios; `formatDate`/`formatTime`/auditoria com `timeZone`; cliente (agenda, portal, documentos, painel) por `src/lib/clinic-calendar.ts` e `NEXT_PUBLIC_APP_TIMEZONE` embutido por `next.config.ts`. Boot valida o IANA; a trava do boot ficou. ADR-073.
- **Bug achado**: `appointment-detail` preenchia a data do reagendamento com `startsAt.slice(0, 10)` (dia em UTC); agora é o dia da clínica.
- **Testes novos** (nenhum existente alterado): `tests/domain/fuso-explicito.test.ts`, `tests/lib/clinic-calendar.test.ts`, `tests/application/list-available-slots-fuso.test.ts`, `tests/lib/fuso-sem-date-local.test.ts`. Pré-patch: contra o código da release, 20 casos de fuso falham mais a suíte-guarda. Data civil (reprovação da validação): nascimento aparecia um dia antes; `formatCivilDate`, formulário envia `AAAA-MM-DD`, API aceita as duas formas (`tests/lib/data-civil.test.ts`, `tests/api/patient-birthdate-civil.test.ts`, pré-patch vermelho; sem migração). Correções da revisão: validade do pacote e filtros de auditoria no fuso da clínica (`clinicDayStart`/`clinicDayEnd`), guarda ampliada a todo `src/app`, trava do boot compara o fuso do build do cliente com o do runtime (testes novos, pré-patch vermelho).
- **Fora do escopo desta entrega**: spec E2E `console-limpo` (hidratação e CSP) e matriz de fusos do #543; Playwright com `timezoneId` em Manaus (ficam para a thread de validação / PR seguinte); fuso por empresa (decisão de produto).
- **Next step**: validação em thread limpa; merge na release/v0.3.0. **Blockers**: nenhum.

## Performance do Next, onda 1: fotos clínicas e CSP do modal (#542, #562) (2026-10-24) — MERGEADO NA RELEASE
- **Causa #542**: `next/image` sem `unoptimized` mandava `/api/photos/:id` ao otimizador, que busca sem cookie (401) e, se aceitasse, guardaria a foto em cache de disco sem escopo de empresa (ADR-069).
- **Causa #562**: o `<style>` de bloqueio de rolagem (react-remove-scroll via react-style-singleton) lê o nonce de `get-nonce`, que ninguém configurava; a CSP o bloqueava ao abrir modal e a rolagem do fundo não travava.
- **O que mudou**: `unoptimized` nas cinco imagens de foto (triagem, ficha, portal, prévia do envio); `images.localPatterns` só com `/brand/**` e `/icons/**`; `Providers` recebe o nonce de `x-nonce` (layout) e chama `setNonce` no cliente; `get-nonce` vira dependência direta (mesma versão 1.0.1 já instalada, sem segunda cópia). CSP do cabeçalho inalterada.
- **Testes novos**: `tests/components/fotos-autenticadas-sem-otimizador.test.tsx`, `tests/next-config-imagens.test.ts`, `tests/app/providers-nonce.test.tsx`, `e2e/fotos-clinicas-sem-otimizador.spec.ts`, `e2e/modal-csp.spec.ts`. Teste pré-patch: 9 dos 10 unitários falharam antes do código; depois do the-judge, `tests/app/providers-nonce-refresh.test.tsx` e `e2e/modal-csp-apos-login.spec.ts`.
- **TESTE-ALTERADO** (aprovado pelo coordenador): `tests/pages/portal.test.tsx` afirmava a URL do otimizador, que era o defeito; agora exige o `src` exato da rota do portal.
- **Correção do the-judge (F1)**: o `router.refresh()` do login trazia outro nonce e o `setNonce` o sobrescrevia; a CSP vigente é a do HTML carregado, então vale o primeiro nonce (`!getNonce()`).
- **Staging (Kalléo)**: triagem, ficha e portal mostram a miniatura da foto; abrir «+ Nova consulta» não gera erro de CSP no console e o fundo não rola atrás do modal.
- **Next step**: staging rebuild e validação limpa da v0.3.0. **Blockers**: nenhum.

## Agenda: consulta que termina às 24:00 (#580) (2026-10-25) — EM REVISÃO
- **Causa**: `assertWithinBusinessHours` exigia o mesmo dia civil no fim, então 23:00–24:00 (fim às 00:00 do dia seguinte) era recusada mesmo com a grade até 24 h. Bug latente: `assertWithinProfessionalHours` tratava qualquer fim às 00:00 como 24:00, sem conferir o dia (23:00 de hoje até 00:00 de depois de amanhã passava).
- **O que mudou**: helper único `endMinuteOfDay(início, fim)` em `business-hours.ts`: mesmo dia devolve o minuto; 00:00 do dia civil seguinte devolve 1440; qualquer outro cruzamento devolve `null` (recusa). As duas asserções usam o helper.
- **Testes novos** (nenhum existente alterado): `tests/domain/consulta-ate-meia-noite.test.ts` (23:00–24:00 e 23:30–00:00 aceitas; 23:30–00:30 e 00:00 dois dias depois recusadas, nas duas asserções; verde com TZ=UTC e TZ=Asia/Tokyo, APP_TIMEZONE=America/Sao_Paulo), `e2e/agenda-remarcar-ate-24h.spec.ts` (remarcar para 23:00 com 60 min aceito, navegador em São Paulo, Manaus e Tóquio). Pré-patch: os 9 unitários novos falham no código da release. Mutação de `business-hours.ts`: 100%.
- **Fora do escopo**: oferta de horários do autoagendamento (`list-available-slots`) não foi mexida.
- **Next step**: the-judge e validação em thread limpa; merge na release/v0.4.0. **Blockers**: nenhum.

## Console limpo nos E2E (#543, sobras) (2026-10-25) — EM REVISÃO
- **O que mudou**: `e2e/console-limpo.spec.ts` percorre as rotas do menu de cada papel (admin de empresa, atendente, profissional) mais as de configuração do admin e a ficha do paciente, em 360 e 1280 px, o portal do paciente e do parceiro (com consulta e indicação) e as telas públicas; falha em `console.error`, `console.warn`, exceção da página, violação de CSP e hydration mismatch (React 19 o reporta como erro). `npm run test:console` faz build e roda a spec no build de produção e no `next dev`. No build de produção a spec já entra em `test:e2e:prod` (o `gate:local` a cobre sem mexer em `scripts/gate/`); no `next dev` ela roda por `playwright.console.config.ts`, porque o contrato C46 (#308) fixa o `testMatch` do `test:e2e:dev` em papéis e login. Seed de horário `console-limpo-portal` registrada no fim de `SLOT_SEEDS`.
- **Sessões**: cookie assinado (vale nos dois modos; o convite das contas reais só existe no log do `next dev`). Consequência: `/minha-conta` (lê `/api/me`, 404 sem conta) e a ficha do paciente pelo profissional (sem vínculo, 404) ficam fora da spec; são lacunas declaradas, não ignoradas.
- **Revisão dos `Date.now()`/`new Date()` em `.tsx`**: nenhum causa hydration mismatch nem divergência de fuso (os formatadores usam `APP_TIMEZONE`, ADR-073); nenhum código de `src/` mudou. Detalhe no PR.
- **Next step**: the-judge em thread limpa; merge na release/v0.4.0. **Blockers**: nenhum.

## Agenda: erro visível na busca das consultas (#578) (2026-10-25) — MERGEADO NA RELEASE
- **Causa**: `useApiQuery` guardava um `data` único e só o sobrescrevia no sucesso: ao trocar de URL, ou quando a busca falhava (429), a grade seguia desenhando o recorte anterior; o erro da contagem por status era ignorado e a lista só mostrava um `ErrorAlert` genérico.
- **O que mudou**: o hook guarda o resultado junto da URL e só o devolve para a URL corrente (a falha descarta o dado). A agenda mostra, com `role="alert"`, «Não foi possível carregar as consultas.» e o botão «Tentar de novo» (refaz lista e contagem); sem dado da URL corrente a grade não é desenhada; com erro na contagem os chips mostram «—» e o nome acessível «indisponível».
- **Hipótese do 429 no `router.replace`**: não se confirmou; a seleção vem da URL (`useSearchParams`) e o E2E com 429 na busca mantém o chip marcado e a URL com o recorte escolhido.
- **Testes novos** (nenhum existente alterado): `tests/lib/use-api-query-troca-de-url.test.tsx`, `tests/pages/agenda-busca-falha.test.tsx`, `e2e/agenda-busca-falha.spec.ts` (360, 390, 768 e 1280). Pré-patch: 5 dos 5 unitários novos falham no código da release.
- **Decisão do PO (aprovação do #583)**: com `error` a grade fica escondida, inclusive numa falha ao refazer a mesma URL (o estado de erro substitui a grade); o «Carregando» na troca de chip fica como está. Aplicado no PR `fix/agenda-erro-esconde-grade`, com teste de página e E2E da falha na mesma URL.
- **Next step**: validação em thread limpa na staging. **Blockers**: nenhum.


## Agenda: semana e dia sem sumir durante a busca (#588) (2026-10-25) — EM REVISÃO
- **Causa**: a correção da #578 (#583) passou a esconder a grade enquanto a busca do período corrente não termina. Na visão Semana a coluna do dia some a cada troca, e o `agenda-bloco-curto-legivel` (que avança "Próxima semana" até achar `[data-week-day]`) passava direto da semana certa.
- **O que mudou**: no mês o «Carregando» segue como estava; em Semana e Dia a `WeekView` é desenhada com `appointments=[]` e a nova prop `loading`: colunas no lugar, `aria-busy`, texto «Carregando…» só para leitor de tela, sem «Nenhuma consulta» até a busca acabar. Nunca aparecem consultas de outro período.
- **Testes novos** (nenhum existente alterado): `tests/pages/agenda-semana-carregando.test.tsx` (pré-patch: falha no código da release), `e2e/agenda-semana-carregando.spec.ts` (768 e 1280, busca retida por rota).
- **Next step**: the-judge e validação em thread limpa; merge na release/v0.4.0. **Blockers**: nenhum.
## Agenda no celular: chips de status e seletor Mês/Dia (#582) (2026-10-25) — EM REVISÃO
- **O que mudou**: os chips de status passam de linha rolável a `flex-wrap` (os 5 à vista em 360 e 390 px); o seletor de visão aparece no celular só com **Mês** e **Dia** (sem Semana; a visão Dia é a `WeekView` com `dayCount=1`); `PeriodNav` recebe `compact` no lugar de `showViewToggle`. Se a janela encolher com a Semana aberta, a página passa para Dia.
- **Decisão do PO** (coordenador): celular com Mês e Dia, chips quebram em linhas; mobile first.
- **Testes novos** (nenhum existente alterado): `tests/components/agenda-period-nav.test.tsx`, `e2e/agenda-celular-chips-e-visao.spec.ts` (360 e 390: 5 chips visíveis, sem rolagem, seletor Mês/Dia; Dia mostra uma coluna e Mês volta ao compacto).
- **Observação**: `e2e/agenda-bloco-curto-legivel.spec.ts` (768 px) falha também na release sem esta mudança (mesmo resultado com e sem o patch): o teste avança no máximo 14 semanas até o dia da seed e, com a data de hoje, a seed fica além disso. Não mexi no teste (regra 8); fica para o coordenador decidir.
- **Next step**: the-judge e validação em thread limpa; merge na release/v0.4.0. **Blockers**: nenhum.


## Fundação server first (#544) (2026-10-25) — EM REVISÃO
- **O que mudou**: sessão no servidor por `cookies()` com a revogação do proxy e `React.cache` (`src/lib/server/session.ts`, guardas `requireStaffPage`/`requirePortalPage`/`requirePlatformPage` com `redirect('/login?next=…')` e `forbidden()`); camada de dados `src/lib/server/data/*` (`identity`, `version`, `staff-shell`), com `buildSidebarIdentity` compartilhada com `GET /api/auth/identity`; `defineAction` (guarda, `zod`, `writeScope`, auditoria obrigatória, envelope, `refresh()`) e `useAction`; limite de requisições do proxy também para `POST` com `Next-Action` (contador `action`, `ACTION_RATE_LIMIT_MAX`, padrão 120/min, independente do da API); `loading`/`error`/`not-found`/`forbidden` nos grupos `(staff)`, `portal`, `plataforma` e `documentos` sobre `src/components/route-states.tsx`; `npm run check:server-first` com allowlist de 32 páginas (no `ci.yml`; o `gate:local` fica com o Kalléo); piloto `/mais` como Server Component; o layout da equipe entrega identidade e versão no HTML (sem `/api` na carga); `SidebarSpace` reserva o lugar do menu antes da hidratação (era o CLS de ~0,18 em todo desktop, vindo do `matchMedia` do `SidebarProvider`). ADR-069 `frozen`; ADR-074 novo; `experimental.authInterrupts` ligado em `next.config.ts`.
- **Métricas** (`/mais`, admin, build de produção, régua `linha-base.spec.ts`): chamadas `/api` 1–2 → 0; CLS 0,26/0,24/0,18/0,34 (360/390/768/1280) → 0; LCP 2684/2652 ms (360/390) → 856/864 ms; JS +2 KB gz.
- **Testes novos**: `tests/lib/server/{session,define-action,data-identity,data-version-shell}.test.ts`, `tests/proxy-server-action.test.ts`, `tests/lib/use-action.test.tsx`, `tests/components/{route-states,shell-sem-api,sidebar-space}.test.tsx`, `tests/pages/mais-servidor.test.tsx`, `tests/scripts/check-server-first.test.ts`, `e2e/server-first-mais.spec.ts`. Pré-patch: os módulos novos não existem na release, então os arquivos falham por inteiro contra o código dela.
- **TESTE-ALTERADO** (aprovado pelo coordenador, commit isolado): `tests/components/bottom-nav.test.tsx` (bloco «tela Mais (#428)») renderiza `await MorePage()` com a sessão simulada; asserções idênticas. `vitest.config.mts`: alias de `server-only` para o módulo vazio do Next (só acrescenta; nenhum limiar muda).
- **Ficou fora**: o contador de triagem da barra do celular do Profissional ainda busca `/api/photos/triage` (migra com a Triagem). Nenhuma Server Action de negócio existe ainda: a primeira entra com a #545.
- **Next step**: the-judge e validação em threads limpas; merge na release/v0.4.0. **Blockers**: nenhum.

## Agenda: Mês→Dia abre no dia escolhido (#591) (2026-10-25) — EM REVISÃO
- **Causa**: `setView` ancorava a visão Dia/Semana em hoje (se no mês exibido) ou no dia 1; o dia marcado no mês compacto do celular ficava dentro do `MobileMonth` e a página não o conhecia.
- **O que mudou**: `useAgendaPeriod` ganha `chooseDay`; `MobileMonth` avisa o dia marcado por `onSelectDay` (via `CalendarGrid`); de Mês para Dia/Semana a âncora é o dia escolhido. Trocar de mês descarta a escolha. Sem dia marcado (ou no desktop, que não marca dia no mês) vale a regra de antes: hoje, se no mês, senão o dia 1.
- **Pergunta aberta (PO)**: no desktop o mês não tem dia marcado; se a Dia/Semana deve abrir num dia clicado ali, é decisão nova (hoje o clique na célula abre «Nova consulta»).
- **Testes novos** (nenhum existente alterado): `tests/pages/agenda-mes-dia-abre-no-dia-escolhido.test.tsx` (pré-patch: 4 de 5 falham), `e2e/agenda-mes-dia-abre-no-dia-escolhido.spec.ts` (360 e 1280).
- **Next step**: the-judge e validação em thread limpa; merge na release/v0.4.0. **Blockers**: nenhum.

## Casca da equipe no servidor (#545) (2026-10-25) — EM REVISÃO
- **O que mudou**: `requireStaffPageFor(href)` (`src/lib/server/session.ts`) aplica a matriz de papéis da API à tela e entra no `layout.tsx` de cada segmento de `(staff)` (agenda, auditoria, configuracoes, faturamento, materiais, minha-conta, pacientes, parceiros, pedidos-titular, procedimentos, profissionais, relatorios, repasses, triagem); papel sem acesso vê a tela de acesso negado (`forbidden.tsx`) renderizada no servidor, antes de a página montar (HTTP 200: o shell já saiu em streaming; ver errata do ADR-075). `RoleGate` deixou de ser montado em `staff-layout-client.tsx`. Os dois `<a>` de `clinic-info-incomplete-alert.tsx` viram `Link`. `defineAction` com `audit` função roda handler e auditoria na MESMA transação (`transactions.run` + `recordAuditNow`; handler grava por `tx`); falha da trilha desfaz tudo e não chama `refresh()`. Dois tipos: `AuditedActionDefinition` e `UnauditedActionDefinition` (`audit: false`). ADR-075 novo; ADR-074, `conventions.md` e domínio acesso atualizados. Identidade, papel, menu e versão já chegavam por props desde a #544 (zero `/api` da casca).
- **TESTE-ALTERADO**: ver o corpo do PR (`tests/lib/server/define-action.test.ts`, handler de `load()` passa a gravar por `tx`, contrato novo da ação auditada).
- **Ficou fora**: `role-gate.tsx` e seu teste (`tests/pages/staff-nav-role.test.tsx`) seguem no repositório, sem uso no layout; remover exige aprovação de TESTE-ALTERADO. `mais/layout.tsx` fica sem guarda de papel (rota aberta a toda a equipe, protegida pela página).
- **Next step**: the-judge e validação em threads limpas; merge na release/v0.4.0. **Blockers**: nenhum.


## Tela Hoje com dados no servidor (#548) (2026-10-25) — EM REVISÃO
- **O que mudou**: `src/app/(staff)/page.tsx` é Server Component com `<Suspense>` por bloco (`_hoje/*`); cada bloco lê pela camada `src/lib/server/data/*` (`appointments`, `month-summary`, `follow-ups`, `supplies`, `reminders`, `majority`, `triage`), compartilhada com as rotas `/api` (rotas passam a só chamar a função; R4 e escopo preservados). Ações rápidas em `hoje-actions.ts` (`resolveFollowUp`, `decideTriage`, `keepMajorityGuardian`) via `defineAction`; `defineAction` ganha `authorize` (fora da transação, para 404/R4 antes de gravar). `check:server-first`: a página sai da allowlist. ADR-075: errata do HTTP 200 («tela de acesso negado (forbidden) renderizada no servidor»).
- **R4**: `resolveFollowUp` aplica o vínculo Profissional↔Paciente (mais estrito que o PATCH antigo de retornos).
- **Testes novos**: `tests/app/hoje-actions.test.ts`, `tests/integracao/hoje-auditoria-transacional.integracao.ts` (rollback da auditoria em Postgres real).
- **TESTE-ALTERADO** (aprovado, troca de harness, cenários e asserções preservados): `tests/pages/{staff-dashboard,dashboard-role,consultas-sem-desfecho-ui,whatsapp-link-ui}.test.tsx`, um commit por arquivo; tabela de paridade no PR.
- **Correção da validação (CLS)**: triagem, maioridade e consultas sem desfecho (fallback `null`, só existem com pendência) empurravam o grid quando chegavam (CLS 0,134 em 390 px com fila real). Passam a ficar DEPOIS do grid (decisão do PO); `e2e/server-first-hoje.spec.ts` ganha o cenário do admin com 3 fotos na fila e aviso de maioridade, exigindo CLS < 0,05 nas 4 larguras (pré-patch: 0,08–0,24, falha). **TESTE-ALTERADO**: `staff-dashboard.test.tsx` (DASH-02) inverte a ordem esperada (retornos antes da fila), por esta decisão de produto.
- **2ª revalidação (CLS 0,10–0,145)**: mover os blocos não bastava; o card de retornos (esqueleto 118 px, real 405 px) chegava por último e empurrava Estoque e o resto. Decisão do PO: UMA só fronteira `<Suspense>` para KPIs, grid e pendências (mesmo flush); retornos com altura previsível (3 itens, «Ver todos (N)» via `?retornos=todos`). A spec do admin semeia 5 retornos, insumo baixo, 3 fotos e maioridade, também com CPU 4x mais lenta. **TESTE-ALTERADO**: `staff-dashboard.test.tsx` — «carregando» passa a esperar um só esqueleto e «fila de triagem carregando» passa a esperar que a triagem não tenha fronteira própria.
- **gate:local em 59139f7 (3 de 403)**: (a) axe `color-contrast`: texto `text-ink-3` do card de maioridade (4,4:1 sobre `warning-soft`) passa a `text-ink-2`; (b) axe `target-size`: a linha de retorno em duas colunas deixava o nome sobrepor o «Agendar» no meio da página; a linha passa a ser em coluna (texto e ações empilhados); (c) `responsive-tables` «pacientes»: a lista é paginada (100 por nome) e a suíte inteira passa de 100 pacientes antes de «Paciente Responsivo» (falha também sem a spec desta PR); o teste passa a buscar o paciente. **TESTE-ALTERADO** em commit isolado. As pendências reais da spec de CLS passaram a usar nomes «Zz Hoje CLS…» para ficar no fim da lista.
- **Ficou fora**: `/api/photos/triage` na barra do celular do Profissional (outra issue); `PATCH /api/follow-ups/:id` sem R4 (issue própria).
- **Next step**: revalidação em thread limpa; merge na release/v0.4.0. **Blockers**: nenhum.

## Retornos: R4 no PATCH da API (#597) (2026-10-25) — EM REVISÃO
- **Causa**: `PATCH /api/follow-ups/:id` não aplicava o vínculo Profissional↔Paciente (R4) nem auditava; achado na validação do #596 (Profissional sem vínculo cancelou retorno alheio, HTTP 200).
- **O que mudou**: regra única em `src/lib/server/follow-up-resolution.ts` (`authorizeFollowUpResolution`, `followUpResolutionAudit`), usada pela rota e por `resolveFollowUp` (Hoje), sem duplicar. Sem vínculo: `403`; retorno de outra empresa: `404`; admin/atendente inalterados. Gravação e auditoria `follow_up` na mesma transação (ADR-075). AGE-RN-25 em `docs/domains/agenda/`.
- **Decisão do PO**: sem vínculo é `403` (a issue falava em 404; vale a decisão do coordenador, coerente com AGE-RN-17 e `resolveFollowUp`).
- **Testes novos** (nenhum existente alterado): `tests/api/follow-up-patch-r4-597.test.ts`. Pré-patch: 5 de 7 falham (200 em vez de 403, sem auditoria); os de outra empresa e sem sessão já passavam e ficam como regressão.
- **Next step**: the-judge, validação em thread limpa, gate:local no WSL se o coordenador exigir, merge na release/v0.4.0. **Blockers**: nenhum.

## Agenda com dados no servidor, leituras (#551, PR 1) (2026-10-25) — EM REVISÃO
- **O que mudou**: `agenda/page.tsx` é Server Component com um só `<Suspense>`; `AgendaData` lê consultas, contagem, profissionais, grade, feriados e fila em paralelo pela camada `src/lib/server/data/*` (novas: `schedule`, `professionals`, `waitlist`; `countAppointmentsFor`), compartilhada com as rotas `/api`. O período vem da URL (`?visao`, `?dia`, `?status`, `?profissional`; `agenda-range.ts`), navegação por `router.push/replace` em transição. `loadBlock` foi para `src/lib/server/load-block.ts`. ADR-077.
- **CLS**: o mês traz as duas variantes no HTML até a hidratação (`bothLayouts`) e o botão Semana é oculto por CSS.
- **TESTE-ALTERADO** (troca de harness, cenários e asserções preservados): `tests/pages/{agenda-busca-falha,agenda-filtro-status,agenda-visao-dia,agenda-visao-semana,agenda-mes-dia-abre-no-dia-escolhido,agenda-waitlist-flow,waitlist-late-cancel-ui,staff-agenda}.test.tsx`; tabela de paridade no PR. Harness novo: `tests/support/agenda-app.tsx`.
- **Ficou para o PR 2**: Server Actions de consulta (criar, recorrente, remarcar, confirmar, cancelar, falta, concluir) com auditoria na mesma transação e teste de rollback em Postgres real; as gravações seguem por `/api`.
- **Next step**: the-judge, validação em thread limpa, gate:local no WSL; merge na release/v0.4.0. **Blockers**: nenhum.
