# STATE

## Decisions

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

### AD-015
- **Decision**: O `Modal` do app mantém o próprio botão de fechar (`aria-label="Fechar"`) e passa `showCloseButton={false}` ao `DialogContent` da `3.x`.
- **Reason**: o botão que a `3.0.0` passou a renderizar por padrão tem nome acessível `"Close dialog"` **hardcoded** — verificado em `dist/react/client/index.js`; `DialogContentProps` expõe só `showCloseButton`, nenhuma prop de rótulo. Numa interface pt-BR isso é regressão de acessibilidade, e o contrato do app já é asserido por `tests/components/modal.test.tsx`.
- **Trade-off**: a lacuna `dialog-close-button` continua tecnicamente fechada pela lib, mas o app não a consome; a dívida migra para uma lacuna nova, `dialog-close-label`, que é pedido de i18n na lib.
- **Scope**: src/components/modal.tsx, docs/still-void-gaps.md
- **Date**: 2026-08-25
- **Status**: superseded by AD-016

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

## Revisão pré-produção #183 — lote P0 + P1 (2026-09-26) — EM ANDAMENTO

P0 #187, #191; P1 #192, #193, #197–#203, #205 via `tlc-implement` ([checklist](../.checks/pre-producao-p0-p1.md)), branch `feature/trusting-johnson-yvvp0j`. CI (#203): jobs `build-e2e-prod` e `docker` (local: E2E prod ~26 s pós-build, smoke ~40 s; tempo real no CI a registrar após o 1º verde). Achado: `node:crypto` em `shared/id.ts` violava a CSP de produção no cliente. Next: P2/P3 (#207–#224) em outro PR.

## Sequência `/improve-codebase-architecture` (2026-09-06, 2ª rodada) — EM ANDAMENTO

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
