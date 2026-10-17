# STATE

## Decisions

Decisões resolvidas e arquivadas (sem edição): [`.specs/archive/decisions-2026.md`](archive/decisions-2026.md) — AD-022, AD-015, AD-023, AD-029, AD-030, AD-031.

### AD-001
- **Decision**: Revogação de sessão staff usa semântica de deny-list: só bloqueia quando a conta existe em `user_accounts` E está inativa; subject sem linha (login Google via allowlist, sessões E2E forjadas, "local") continua válido.
- **Reason**: allow-list quebraria login Google (GOOGLE_ALLOWED_EMAILS não cria conta) e a suíte E2E que forja cookies.
- **Trade-off**: conta Google desativada só pela allowlist de env não é revogada em tempo real (mitigado: remoção da env + expiração de 12h).
- **Nota de 2026-09-01 (issue #21)**: a premissa mudou de forma, não de conclusão. Com o login Google e a senha mestre removidos (ADR-004), os subjects sem linha em `user_accounts` que a deny-list protegia deixaram de existir em produção — sobram só os cookies forjados pela suíte E2E e sessões de instalações antigas. A semântica de deny-list foi mantida: continua bloqueando conta existente e inativa, e nenhuma sessão perdeu proteção.
- **Scope**: proxy, lib/auth
- **Date**: 2026-08-15
- **Status**: active

### AD-002
- **Decision**: Sanitização de metadados de imagem (EXIF/XMP/comentários) implementada em TypeScript puro no domínio (parser de segmentos JPEG/chunks PNG/chunks RIFF-WebP), sem dependência nativa nova (sharp).
- **Reason**: objetivo é privacidade (GPS em foto de ferida); strip de metadados atinge isso de forma determinística e testável; sharp traria binário nativo e superfície de build.
- **Trade-off**: não re-encoda o bitmap (payload esteganográfico teórico permanece); aceito e documentado.
- **Scope**: domain/clinical, application/clinical
- **Date**: 2026-08-15
- **Status**: active

### AD-003
- **Decision**: Itens que exigem decisão de negócio (matriz RBAC fina, taxa/janela de cancelamento, escolha de PSP, cadência de relatório ao parceiro, multi-tenancy) NÃO são implementados por conta própria — ficam como fases planejadas (5–6) no docs/plano-evolucao-faseado.md.
- **Reason**: inventar requisitos de negócio viola o processo spec-driven; o usuário decide.
- **Trade-off**: brechas conhecidas (ex.: toda conta staff é admin) permanecem até a decisão.
- **Scope**: programa de evolução
- **Date**: 2026-08-15
- **Status**: active

### AD-004
- **Decision**: Falha de infraestrutura na checagem de revogação de sessão é fail-open (loga e deixa passar), diferente do fail-closed da configuração de auth.
- **Reason**: indisponibilidade momentânea do banco não pode derrubar todo acesso da equipe; a checagem é defesa em profundidade sobre sessões já autenticadas.
- **Trade-off**: janela teórica de acesso de conta revogada durante indisponibilidade do banco.
- **Scope**: proxy, lib/auth
- **Date**: 2026-08-15
- **Status**: active

### AD-005
- **Decision**: Todo workaround local que existe por ausência de componente no `@still-void/ui` é marcado no ponto do código com o comentário `sv-gap: <slug>`, e o mesmo `<slug>` tem uma seção em `docs/still-void-gaps.md`. `scripts/check-sv-adoption.sh` (`npm run check:sv`) falha se um dos lados ficar órfão, nos dois sentidos.
- **Reason**: sem a marcação, "isso é `<select>` nativo porque a lib não tem" e "isso é `<select>` nativo porque ninguém migrou" são indistinguíveis no diff — e a dívida vira invisível na revisão seguinte.
- **Trade-off**: exige disciplina de manter o documento junto do código; a exceção `<!-- sv-gap-doc-only -->` cobre a lacuna que é relato sobre a lib e não tem workaround local.
- **Scope**: src/**, docs/still-void-gaps.md, scripts/
- **Date**: 2026-08-22
- **Status**: active

### AD-006
- **Decision**: Todo utilitário de cor em `src/**/*.tsx` resolve para um token `--sv-*` pela ponte `@theme` de `globals.css`. Degrau cru de paleta Tailwind (`slate-*`, `teal-*`, `amber-*`, `emerald-*`, `sky-*`, `red-*`, `violet-*`) é proibido e falha o gate. A única exceção é cor neutra literal (`black`, `white`, `transparent`, `current`) em superfície de impressão, que precisa ignorar o tema — e leva comentário dizendo por quê.
- **Reason**: a ponte anterior remapeava `slate-*`/`teal-*` para os tokens, então a cor certa saía, mas o código mentia sobre o papel: `bg-teal-700` não diz "ação primária", e o apelido travava a leitura e a troca de accent.
- **Trade-off**: a varredura do Tailwind foi restringida a `src/` via `source("../../src")` para que blocos de código em `docs/` e `.specs/` não ressuscitem os apelidos no CSS gerado — se algum dia houver markup fora de `src/`, o `@source` precisa ser estendido.
- **Scope**: src/app/globals.css, src/**/*.tsx
- **Date**: 2026-08-22
- **Status**: active

### AD-007
- **Decision**: `npm run build` invoca o Next via `node --max-old-space-size=4096` em vez de deixar o heap no padrão do V8.
- **Reason**: o build usa ~2,5 GB de pico (medido) e o V8 dimensiona o heap padrão pela memória do host — em máquina de ~8 GB o padrão é 2.240 MB e o build worker morre com `Ineffective mark-compacts near heap limit`. O limite fica na fronteira exata da necessidade, então a falha depende da máquina, não do código.
- **Trade-off**: fixa um número que precisa subir se o pico do build crescer; a forma `node --max-old-space-size=… ./node_modules/next/dist/bin/next build` foi escolhida em vez de `NODE_OPTIONS=…` por ser portável para Windows (sem sintaxe de env do shell) — verificado que os build workers herdam o `execArgv`.
- **Scope**: package.json, Dockerfile (herda pelo `npm run build`)
- **Date**: 2026-08-22
- **Status**: active

### AD-008
- **Decision**: Os 7 findings HIGH de "segredo exposto" (GitLeaks `generic-api-key`) e os 2 de `hardcoded_secrets` (Semgrep) do scan de 2026-08-23 são falsos positivos — não há rotação de credencial nem reescrita de histórico Git.
- **Reason**: todos os valores são fixtures de teste rotuladas (`e2e/support/constants.ts`, `tests/**`); o `.env.example` versionado só contém valores vazios ou placeholder. Nenhuma credencial real chegou ao repositório.
- **Trade-off**: as constantes inline de `tests/**` continuam no código (a suíte precisa delas determinísticas e legíveis). As da suíte E2E foram externalizadas e passaram a ser geradas por execução. **Correção de 2026-08-24**: esta decisão afirmava allowlist em `.semgrepignore` — o arquivo nunca existiu e não será criado (ver AD-012). A supressão real é o `.gitleaks.toml` para execução local e o comentário inline para o GitGuard (AD-011); os findings `node_secret`/`node_password` de `tests/**` permanecem como falso positivo aceito, sem supressão.
- **Scope**: e2e, tests, configuração de scanners
- **Date**: 2026-08-23
- **Status**: active

### AD-009
- **Decision**: As 4 vulnerabilidades MODERATE de `esbuild` (via `@esbuild-kit/*` → `drizzle-kit`) são aceitas, não corrigidas.
- **Reason**: o único remédio oferecido pelo npm é downgrade major de `drizzle-kit` 0.31.10 → 0.18.1. `drizzle-kit` é CLI de migração, dev-only, fora do bundle de produção; e o advisory do `esbuild` afeta o dev-server dele, não o runtime da aplicação.
- **Trade-off**: `npm audit` segue reportando 4 MODERATE. Revisar quando o `drizzle-kit` migrar do `@esbuild-kit` (já deprecado, fundido no `tsx`).
- **Scope**: dependências
- **Date**: 2026-08-23
- **Status**: active

### AD-010
- **Decision**: A varredura de dependências fica limitada a patch/minor. Majors disponíveis (TypeScript 7, ESLint 10, `@types/node` 26, `@testing-library/jest-dom` 7, `googleapis` 176) não são aplicados.
- **Reason**: decisão do usuário; nenhum deles é necessário para fechar os findings de segurança, e cada um exigiria refactor de config/tipos com risco de cascata.
- **Trade-off**: o projeto fica uma major atrás nesses cinco pacotes. É backlog, não pendência de segurança.
- **Scope**: dependências
- **Date**: 2026-08-23
- **Status**: active

### AD-011
- **Decision**: A supressão de falso positivo que precisa alcançar o GitGuard é feita por **comentário inline** (`gitleaks:allow`, `nosemgrep`) na linha do achado, não por arquivo de configuração no repositório. O `.gitleaks.toml` permanece, mas só vale para execução local e CI própria.
- **Reason**: medido por A/B na mesma árvore — sem o `.gitleaks.toml` o gitleaks acha 7 leaks, com ele 0; ainda assim o GitGuard reportou os mesmos 7 antes e depois do PR #9. A precedência do gitleaks é `--config` > `GITLEAKS_CONFIG` > `(target)/.gitleaks.toml`, então um scanner hospedado que passa a própria config sobrepõe a do repo. O comentário inline é processado pelo detector e só é desligado pela flag global `--ignore-gitleaks-allow`.
- **Trade-off**: a justificativa fica repetida em cada linha em vez de centralizada num arquivo; em compensação ela vive ao lado do valor que a motiva, e some junto com ele se a fixture for removida.
- **Scope**: tests/, configuração de scanners
- **Date**: 2026-08-24
- **Status**: active

### AD-012
- **Decision**: Não criar `.semgrepignore`. Os findings `node_secret`/`node_password`/`node_username` das fixtures de `tests/**` ficam como falso positivo aceito e documentado, sem supressão.
- **Reason**: `.semgrepignore` exclui arquivos inteiros, não regras. Excluir `tests/` apagaria toda a cobertura Semgrep sobre a suíte para calar 2 findings que o GitGuard já deduplica — e, por AD-011, nem alcançaria o GitGuard. Verificado que o ignore default do Semgrep **não** exclui `tests/` (`--verbose` mostra `Skipped by .semgrepignore: <none>`).
- **Trade-off**: o relatório do GitGuard segue com 2 findings HIGH de `hardcoded_secrets` que nunca vão sumir; o veredito fica em `.specs/features/ruido-scanners-seguranca/spec.md` (B7).
- **Scope**: tests/, configuração de scanners
- **Date**: 2026-08-24
- **Status**: active

### AD-013
- **Decision**: Relatório de scanner externo só vira trabalho depois de reproduzido localmente. `gitleaks` (binário da release oficial) e `semgrep` (via `uv tool install`) rodam contra a árvore do commit escaneado, e `npm audit`/`npm ls` respondem pelos itens de dependência.
- **Reason**: o scan `cmt60oz29012twtz1z1duza2q` reportou 54 findings contra 35 do anterior, sugerindo regressão. A reprodução mostrou que era o mesmo conjunto com duplicação (`detect-non-literal-regexp` 18→36, um CVE do `brace-expansion` contado 2×) e que dois findings já corrigidos no PR #9 continuavam listados. Sem reproduzir, o caminho natural seria "corrigir" postcss e sharp para versões que a árvore já tinha havia um commit.
- **Trade-off**: exige instalar os scanners no ambiente (nenhum está no `package.json`, e o Semgrep depende de `uv`); em troca o confronto deixa de ser por busca dirigida e passa a ser por execução.
- **Scope**: processo de auditoria
- **Date**: 2026-08-24
- **Status**: active

### AD-014
- **Decision**: A adoção do `@still-void/ui` no VittaFlow é **port, não redesign**: quando uma release da lib passa a exportar um primitivo, o workaround local correspondente é trocado por ele; adotar um padrão de UI que o app ainda não tem (Tabs, Tooltip, DropdownMenu, AlertDialog, Badge, ThemeToggle, Prose) é feature nova e fica fora da migração.
- **Reason**: decisão do usuário em 2026-08-25, ao especificar a 2.0.1 → 3.1.0. Sem essa fronteira, "usar o máximo dos recursos da lib" vira redesenho de navegação e interação embutido numa migração de dependência — e o diff deixa de ser revisável contra um baseline de comportamento.
- **Trade-off**: recursos reais da lib (`fieldMessage` + `aria-invalid`, `Badge`, família `AlertDialog`) ficam sem adoção mesmo existindo necessidade latente; viram backlog próprio em vez de carona na migração.
- **Scope**: src/**, docs/still-void-gaps.md, migrações do design system
- **Date**: 2026-08-25
- **Status**: active

### AD-016
- **Decision**: O `Modal` do app passa a usar `closeLabel="Fechar"` nativo do `DialogContent` da `3.2.0` em vez do botão de fechar manual (`DialogClose`/`Icon` próprios); `showCloseButton={false}` sai, `DialogContent` volta ao botão nativo com `closeLabel="Fechar"`.
- **Reason**: a `3.2.0` passa a expor `DialogContentProps.closeLabel?: string`, que controla o texto do `<span className="sv-sr-only">` interno do botão de fechar nativo (antes hardcoded em inglês, `"Close dialog"`, motivo original de AD-015) — a lacuna `dialog-close-label` de `docs/still-void-gaps.md` fecha porque a lib passa a suportar i18n do rótulo sem precisar desabilitar o botão.
- **Trade-off**: efeito colateral aceito e confirmado com o usuário — a ordem de foco do modal muda, porque o botão de fechar nativo é anexado depois de `{children}` no DOM, não antes como o botão manual estava (ver commit `252df2e` e `tests/components/modal.test.tsx`). Todas as consultas de teste que usavam `getByLabelText("Fechar")` (que só resolve `aria-label`/`<label>`) migraram para `getByRole("button", { name: "Fechar" })`, já que o nome acessível agora vem do `<span className="sv-sr-only">` filho, não de um atributo `aria-label`.
- **Scope**: src/components/modal.tsx, docs/still-void-gaps.md, tests/components/modal.test.tsx, tests/pages/staff-*.test.tsx
- **Date**: 2026-08-26
- **Status**: active

### AD-017
- **Decision**: Todo filtro por `clinic_id` em repositório Drizzle passa por um helper centralizado `withTenant(table, clinicId, extra?)` (`src/infrastructure/persistence/drizzle/tenant-scope.ts`) em vez de `and(eq(table.clinicId, clinicId), extra)` repetido em cada método. `clinicId: null` (papel de sistema) faz o helper retornar `extra` sozinho, sem filtro.
- **Reason**: com ~15 repositórios e ~45 rotas tocados pela fundação de multi-tenancy (issue #19), um filtro repetido manualmente em cada método é o ponto onde "esquecer o filtro numa rota nova" (risco que a própria issue #19 pede um teste para cobrir) mais provavelmente acontece; centralizar dá ao sensor de discriminação do Verifier um único ponto por repositório para mutar e confirmar que os testes de isolamento pegam.
- **Trade-off**: todo repositório precisa importar o helper em vez de compor `and()`/`eq()` livremente; qualquer exceção (query que genuinamente precisa ignorar tenant fora do papel de sistema) precisa ser óbvia no código-review por não usar o helper.
- **Scope**: src/infrastructure/persistence/drizzle/**, todo repositório novo criado a partir de agora
- **Date**: 2026-08-30
- **Status**: active

### AD-018
- **Decision**: E-mail transacional (convite e reset de senha) usa Resend consumido pela API HTTP com `fetch`, sem SDK nem dependência npm nova, atrás da porta `EmailGateway` com implementação nula. A fábrica `buildEmailGateway()` **lança** em `NODE_ENV=production` quando faltam `RESEND_API_KEY`/`EMAIL_FROM`, e só fora de produção cai no gateway nulo (dry-run que loga o link).
- **Reason**: espelha o `MetaWhatsAppGateway`, que já é HTTP puro com timeout — o projeto ganha um canal novo sem ganhar árvore de dependência. A assimetria produção/dev é o que satisfaz ao mesmo tempo a user story 11 da #21 ("falha clara na inicialização") e a AC da #32 que exige a implementação nula "para quando não há credenciais": em produção, um canal mudo significa que ninguém consegue o primeiro acesso.
- **Trade-off**: sem SDK, features futuras do provedor (anexos, templates, webhooks de entrega) exigem escrever o request à mão; trocar de provedor mexe numa classe, não numa dependência.
- **Scope**: src/application/ports/email-gateway.ts, src/infrastructure/email/**, todo fluxo que envia e-mail
- **Date**: 2026-09-01
- **Status**: active

### AD-019
- **Decision**: Token de convite/reset é um segredo opaco de 32 bytes (`randomBytes`, base64url) que circula só no link do e-mail; `auth_tokens` guarda apenas o SHA-256 dele, com `purpose`, `account_id`, `expires_at` e `used_at`. Uso único; emitir um token invalida os anteriores não usados do mesmo propósito; link inexistente, expirado, já usado ou de conta inativa produzem a mesma mensagem (`Link inválido ou expirado — solicite um novo`). A tabela **não** tem `clinic_id`.
- **Reason**: o consumo acontece antes de existir sessão, então não há tenant de contexto — a autorização é o próprio token, e a conta alvo já carrega a empresa. Guardar só o hash impede que leitura do banco vire tomada de conta; a mensagem única impede que a resposta revele se um link já foi usado por outra pessoa ou se um endereço existe.
- **Trade-off**: um token perdido não pode ser reconstruído nem reexibido (só reemitido), e a ausência de `clinic_id` é uma exceção deliberada ao AD-017 — qualquer consulta nova nessa tabela precisa continuar sendo por `secret_hash` ou por `account_id`, nunca por listagem.
- **Scope**: src/domain/auth/auth-token.ts, src/application/auth/auth-token-flow.ts, drizzle/0023_auth-tokens.sql
- **Date**: 2026-09-01
- **Status**: active

### AD-020
- **Decision**: A primeira conta Super Admin de uma instalação nasce de `POST /api/auth/bootstrap`, guardada por duas condições independentes: o header `x-bootstrap-token` igual a `VITTA_BOOTSTRAP_TOKEN` **e** a inexistência de qualquer conta. A conta nasce sem senha usável e recebe o convite normal; quando o gateway de e-mail está desativado (dev/teste), a resposta devolve o `inviteUrl`. Como consequência, `DrizzleUserAccountRepository.save` deixou de recusar repositório de sistema e passa a gravar a empresa que a própria conta carrega (`null` para super_admin).
- **Reason**: sem allowlist e sem senha mestre não sobra caminho de primeiro acesso, e um script CLI não alcança o PGlite em memória usado por dev e pela suíte E2E. As duas guardas se cobrem: sem o segredo ninguém chama; depois da primeira conta a rota some funcionalmente, mesmo com o segredo vazado. Devolver o link quando não há canal de e-mail é o que torna o bootstrap utilizável fora de produção — em produção `buildEmailGateway` falha na inicialização sem credenciais, então o campo vem sempre nulo (AD-018).
- **Trade-off**: existe uma rota pública a mais na superfície de ataque (mitigada por rate limit, segredo e a guarda de zero contas), e uma instalação que esqueça `VITTA_BOOTSTRAP_TOKEN` fica sem caminho de bootstrap — fail-closed deliberado, coerente com a ADR-004, que já aceita que a recuperação extrema exige intervenção no banco.
- **Scope**: src/app/api/auth/bootstrap/**, src/infrastructure/persistence/drizzle/drizzle-foundation-repositories.ts, e2e/global-setup.ts
- **Date**: 2026-09-01
- **Status**: active

### AD-021
- **Decision**: `eslint.config.mjs` usa `**/` na frente de todo padrão de `globalIgnores` (`**/.next/**`, `**/.next-open-mode/**`, etc.) e ignora `.claude/worktrees/**` explicitamente.
- **Reason**: sem `**/`, o glob só bate na raiz do projeto. Checkouts de worktree aninhados em `.claude/worktrees/*/` (usados por sessões de agente em paralelo, ver `docs/agents/*`) escapavam do ignore, e o build Turbopack deles inundava `npx eslint .` com milhares de "erros" em bundles compilados do Next/React — isso, não um bug do ESLint ou de `npm run lint`, era a causa do ruído investigado nas issues #48/#49. `npm run lint`/`npx eslint .` sempre propagaram o exit code real; a suspeita registrada em AD anterior (ver handoff de `autenticacao-nativa`, linha ~171) de que um "wrapper `rtk`" mascarava o exit code não reproduziu nesta sessão — não teve como confirmar a causa raiz daquela observação, mas o sintoma descrito (`npm run lint` "sempre" exit 0 mesmo com erro) não bate com o comportamento atual, testado com erro proposital introduzido e revertido.
- **Trade-off**: nenhum — só corrige o glob para o comportamento que o comentário original já pretendia.
- **Scope**: eslint.config.mjs
- **Date**: 2026-09-02
- **Status**: active

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

### AD-026
- **Decision**: R4 nas rotas clínicas endereçadas pelo id do recurso (#186) via helper único `src/lib/auth/clinical-resource-scope.ts` (cadeia recurso→paciente + `assertPatientAccessibleToProfessional`). O `404` cita o recurso pedido, nunca o `patientId`. `GET /api/follow-ups`, `GET /api/waitlist` e `GET /api/photos/triage` filtram para o Profissional só pacientes vinculados — **padrão seguro** aplicado; a issue deixava em aberto se follow-ups/waitlist precisavam do filtro.
- **Reason**: o motivo do retorno e a fila de espera carregam nome e motivo clínico; mostrar para quem não tem vínculo contradiz RBAC-17/19.
- **Trade-off**: Profissional deixa de ver retornos/lista de espera de pacientes sem vínculo (inclusive para oferecer horário vago da própria agenda). Perguntas abertas ao produto: (1) o Profissional deve ver a lista de espera inteira para preencher horários vagos? (2) `POST /api/follow-ups` e `POST /api/waitlist` pelo Profissional para paciente sem vínculo devem ser negados? — hoje seguem permitidos (fora do escopo de #186).
- **Scope**: 13 rotas em `src/app/api/{conditions,photos,care-plans,care-plan-interventions,care-plan-outcomes,follow-ups,waitlist}`, `.checks/r4-resource-routes.md`.
- **Date**: 2026-09-26
- **Status**: resolved — respondidas por @KalleoPinheiro em 2026-10-11: (1) a lista de espera continua só com os pacientes vinculados; (2) os dois POSTs sem vínculo passam a ser negados (403). Implementação na #296: `POST /api/follow-ups` e `POST /api/waitlist` negam o Profissional sem vínculo com 403 (AGE-RN-17). **Resolvida.**

### AD-027
- **Decision**: Padrão seguro até decisão de produto — a aba "Pacotes" do prontuário fica **oculta para o Profissional** (e `/api/packages` continua `administrative`); só aparece com o papel da sessão já conhecido e diferente de `profissional`. **Pergunta aberta**: o Profissional deve ver os pacotes dos pacientes vinculados (com preço? só saldo de sessões?)
- **Reason**: pacote carrega preço (dado financeiro); a #189 deixa a pergunta aberta e indica esconder como padrão seguro (regra 5 do `AGENTS.md`). Trade-off: o Profissional não vê saldo de sessões do pacote até a decisão.
- **Scope / Date / Status**: `src/app/(staff)/pacientes/[id]/page.tsx` · 2026-09-26 · resolved — issue #189. **Resposta (2026-10-11):** o Profissional vê o nome do pacote e o saldo de sessões, sem preço, nos pacientes vinculados. Implementação na #296: a aba "Pacotes" aparece para o Profissional e lê `GET /api/patients/:id/packages` (família `clinical`, vínculo R4, DTO sem valores monetários — FIN-RN-14). **Resolvida.**

### AD-028
- **Decision**: Gateways nulos (`NullEmailGateway`, `NullMessagingGateway`) logam só metadados: canal, assunto (e-mail) ou tamanho do texto (WhatsApp) e destinatário mascarado por `src/lib/redact.ts` (`fu***@x.com`, `+55******7777`) — nunca o corpo. Exceção decidida por @KalleoPinheiro: com `NODE_ENV !== 'production'` o e-mail nulo também loga o link `/definir-senha?token=…`, porque o dev e o `e2e/global-setup.ts` definem senha por ele.
- **Reason**: mesma classe de vazamento da #202 (CWE-532, LGPD art. 46) — o corpo leva nome do paciente e data da consulta, e o link de convite/reset é credencial.
- **Trade-off**: em dev o link-credencial ainda vai para o log local (aceito pelo produto). Em produção o e-mail nulo nem é montado (`buildEmailGateway` lança), então o corte por `NODE_ENV` é defesa em profundidade. Os testes deixaram de ler o log e espiam `NullEmailGateway.prototype.send` (`tests/support/email.ts`); o E2E acha o convite no trecho do log escrito após o cadastro, porque as máscaras das contas por papel colidem.
- **Scope / Date / Status**: `src/application/ports/{email,messaging}-gateway.ts`, `src/lib/redact.ts`, `e2e/support/invite-log.ts` · 2026-09-26 · active

### AD-032
- **Decision**: @KalleoPinheiro decidiu em 2026-10-12, por questionário, as 32 perguntas abertas do bloco 1 do go-live (#291, #292, #215, #294, #206, #293, #212), quase todas pela opção recomendada. Exigem código ou doc: #309 (sessões de Admin sem 2FA caem na hora; política de senha da equipe no portal), #295 (reset do 2FA pelo Admin de Empresa, auditado), #310 (consentimento em papel registrado pela equipe), #311 (retenção: espera vencida vira expirada + 2 anos, parceiro inativo 2 anos, textos de fatura, Google Agenda, reativação bloqueada), #312 (prazo de 15 dias com alerta, e-mail ao Admin, resposta no e-mail de login) e #313 (runbook + ADR-015). Mantidos como estão: "Contas de acesso" só para o Admin; parceiro sem consentimento não vê nada e "atendido" = 24 meses; cadastro do profissional guardado; backups 30 dias; limites e justificativa dos pedidos do titular; aceite sem efeito automático; cópia completa; alertas 10/3 em 15 min; sem captura de erro do navegador; GlitchTip 30 dias só por túnel; UptimeRobot; lembretes às 08:00.
- **Reason**: regra 5 do `AGENTS.md`; cada decisão está comentada na issue de origem.
- **Scope / Date / Status**: issues #291–#294, #206, #212, #215 e #309–#313 · 2026-10-12 · active. Depois disso: na #310, o consentimento em papel é registrado pelo Admin e pelo Atendente; na #312, o alerta sai 3 dias antes

### AD-033
- **Decision**: produção na Hetzner **Alemanha**, cópia fora do servidor numa Storage Box, **sem LUKS**: as fotos ficam em claro no disco da VPS, protegidas só pelo acesso ao servidor, e o que vale são os backups `age` e os campos cifrados do ADR-006. E-mail do host por msmtp na porta 587 do Resend.
- **Trade-off**: contradiz o ADR-006, que contava com disco cifrado para as fotos; risco aceito pelo dono. Registro formal no ADR-015, que a #313 vai escrever; reabrir cifrando as fotos na aplicação.
- **Scope / Date / Status**: `docs/engineering/producao.md`, ADR-006, ADR-015 · 2026-10-12 · active. ADR-015 entregue pela #316, redação confirmada pelo dono; snapshots da Storage Box: 1 por dia, os 14 mais recentes guardados; 60 min entre avisos iguais, confirmado. Pendente: #216 (base legal da transferência para a UE)

### AD-034
- **Decision**: @KalleoPinheiro delegou em 2026-10-17 as perguntas que as PRs #298–#318 deixaram abertas, com a instrução de escolher a opção mais segura, escalável e performática que atenda o negócio. Decidido: **(a)** ADR-013 volta ao texto original; as decisões da #311 e as novas moram no [ADR-017](../docs/adr/017-retencao-decisoes-complementares.md); **(b)** cadastro de `partners` guardado (sustenta indicação, consentimento e comissões); **(c)** paciente anonimizado não reativa (`409`, PRO-RN-17, código novo); **(d)** conta anonimizada já não recebe senha nem convite (ACE-RN-50, teste novo); **(e)** Storage Box em outra localização da UE (Helsinki ou outra diferente do servidor), backup `age`-cifrado antes de sair, snapshots diários com 14 guardados; **(f)** #306: alertas 10/3 em 15 min, `delivered=false` só erro do provedor, sem captura de erro do navegador, UptimeRobot, GlitchTip por túnel SSH e 30 dias, e a regra de deploy **0050 antes da 0051** no runbook § 4; **(g)** #300: o consentimento do parceiro é do par paciente × parceiro e não acompanha troca nem inativação (POR-RN-11); **(h)** #216, parte técnica: [ADR-018](../docs/adr/018-transferencia-internacional-ue.md), UE como destino e adequação Brasil ↔ UE como base do art. 33, cláusulas-padrão da ANPD como reserva; o consentimento do parceiro segue `v0-placeholder` até o jurídico.
- **Reason**: regra 5 do `AGENTS.md` (decisão de produto é do dono) com delegação explícita; cada escolha segue o padrão das anteriores (anonimizar sem excluir, falhar fechado, não inventar texto jurídico).
- **Trade-off**: reativar o parceiro ou voltar a indicação revive um consentimento antigo (limite aceito e documentado; revogar na ficha). Resend e Google Agenda ficam sem mecanismo do art. 33 até o jurídico responder. A adequação Brasil ↔ UE foi lida de fonte secundária: o jurídico confere o ato (Res. CD/ANPD nº 32/2026) na fonte primária.
- **Fora desta decisão**: a pergunta da #317 (contas inativas na migração) e as sessões/2FA da #309 e #295, que têm thread própria; a política de senha do portal vai pela #309.
- **Scope / Date / Status**: ADR-013, ADR-017, ADR-018, `docs/engineering/producao.md`, `src/domain/patient/patient.ts` · 2026-10-17 · active. Pendente de jurídico: #216 (textos, mecanismo para Resend/Google, encarregado)

### AD-035
- **Decision**: telefone do paciente guardado em **E.164 brasileiro** (`+55…`), validado no domínio. Tolera máscara, `+55`/`0055` e zero de tronco; **sem DDD é rejeitado com mensagem, não adivinhado**; internacional é rejeitado (a clínica atende no Brasil e o `wa.me`/lembretes assumem DDI 55). Delegado por @KalleoPinheiro na #218 (pergunta 4).
- **Reason**: um formato único evita `wa.me` quebrado e duplicidade por máscara; adivinhar o DDD mandaria mensagem de saúde para a pessoa errada (LGPD).
- **Trade-off**: sem migração de dados — legado fora do padrão segue válido até alguém mudar o telefone, é sinalizado (`phoneNeedsCorrection`, selo "Corrigir telefone") e o link do WhatsApp falha com motivo se não normalizar. Parceiro e telefone da empresa ficam fora (sem pedido). Lista de DDDs fixa no código: DDD novo da Anatel exige atualizar `phone.ts`.
- **Scope / Date / Status**: PRO-RN-18, COM-RN-08, `src/domain/shared/phone.ts` · 2026-10-17 · active

### Baseline de segurança medido em `fcd6110`

Reproduza pelo procedimento de [`docs/engineering/security-scan.md`](../docs/engineering/security-scan.md).

| Medição | Valor esperado |
|---|---|
| `gitleaks dir .` sobre a árvore **sem** `.gitleaks.toml` | `no leaks found` |
| Semgrep (`p/nodejsscan` + regexp + gcm + formatstring) | 58 findings |
| — `node_secret` / `node_password` / `node_username` | 40 / 13 / 4 — falso positivo aceito (AD-012) |
| — `unsafe-formatstring` | 1 — falso positivo (B9) |
| — `detect-non-literal-regexp` | 0 |
| `npm audit` | 0 HIGH/CRITICAL; 4 MODERATE de `esbuild` (AD-009) |

Um scan GitGuard sobre `fcd6110` deve cair de 54 para ~9 findings: 2 `hardcoded_secrets`
deduplicados, 1 `unsafe-formatstring` e os 6 TRIVY obsoletos, que só somem quando o
serviço reindexar o lockfile. Acima disso, reproduza localmente antes de agir.

## Handoff

Handoffs de trabalho encerrado ficam em [`.specs/archive/handoff-2026.md`](archive/handoff-2026.md) — leia só quando precisar do histórico de uma feature. Aqui fica apenas o que está em aberto.

## Go-live — depois do bloco 1 (2026-10-12) — EM ANDAMENTO

Bloco 1 encerrado (#215, #291, #292, #293, #294, #206, #212; handoffs no arquivo). Próximo trabalho vem das decisões da AD-032:
- **Prontas para agente:** #309, #310, #311, #312, #313 e a #295, que ganhou o reset do 2FA.
- **Precisa de triagem:** #308, o E2E intermitente sem evidência no CI.
- **Bloqueada por decisão:** a #216 (jurídico).
