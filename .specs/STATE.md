# STATE

## Decisions

Decisões resolvidas e arquivadas (sem edição): [`.specs/archive/decisions-2026.md`](archive/decisions-2026.md) — AD-022, AD-015, AD-023, AD-024, AD-026, AD-027, AD-029, AD-030, AD-031, AD-025, AD-045.

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
- **Trade-off**: reativar o parceiro ou voltar a indicação revive um consentimento antigo (limite aceito e documentado; revogar na ficha). Resend e Google Agenda ficam sem mecanismo do art. 33 até o jurídico responder. A adequação Brasil ↔ UE foi lida de fonte secundária: o jurídico confere o ato (Res. CD/ANPD nº 32/2026) na fonte primária. **Fora desta decisão**: a pergunta da #317 (contas inativas na migração) e as sessões/2FA da #309 e #295, que têm thread própria; a política de senha do portal vai pela #309.
- **Scope / Date / Status**: ADR-013, ADR-017, ADR-018, `docs/engineering/producao.md`, `src/domain/patient/patient.ts` · 2026-10-17 · active. Pendente de jurídico: #216 (textos, mecanismo para Resend/Google, encarregado)

### AD-035
- **Decision**: telefone do paciente guardado em **E.164 brasileiro** (`+55…`), validado no domínio. Tolera máscara, `+55`/`0055` e zero de tronco; **sem DDD é rejeitado com mensagem, não adivinhado**; internacional é rejeitado (a clínica atende no Brasil e o `wa.me`/lembretes assumem DDI 55). Delegado por @KalleoPinheiro na #218 (pergunta 4). **Motivo**: um formato único evita `wa.me` quebrado e duplicidade por máscara; adivinhar o DDD mandaria mensagem de saúde para a pessoa errada (LGPD). **Custo**: sem migração de dados — legado fora do padrão segue válido até alguém mudar o telefone, é sinalizado (`phoneNeedsCorrection`, selo "Corrigir telefone") e o link do WhatsApp falha com motivo se não normalizar. Parceiro e telefone da empresa ficam fora (sem pedido). Lista de DDDs fixa no código: DDD novo da Anatel exige atualizar `phone.ts`.
- **Scope / Date / Status**: PRO-RN-18, COM-RN-08, `src/domain/shared/phone.ts` · 2026-10-17 · active

### AD-036
- **Decision**: limites anti-abuso do portal (#213), números de @KalleoPinheiro (2026-10-11): 2 consultas futuras, 60 dias, 10 fotos/dia e `proxyClientMaxBodySize` 6 MB. Delegado: o teto conta consultas futuras ativas de qualquer origem (a agenda é uma só); "por dia" é janela móvel de 24 h; o horizonte é instante e a UI passou de 14 para 60 dias; estouro responde `400` com mensagem clara. Trade-off: paciente com duas consultas da equipe não agenda outra sozinho; checagem não atômica pode passar do teto por 1–2 unidades. POR-RN-17 · 2026-10-17 · active

### AD-037
- **Decision**: reescrita em lote dos eventos antigos do Google Agenda (#339) por **script manual** (`npm run calendar:minimize`), sem endpoint nem job no deploy (zero superfície de autenticação nova). Cobre **todas** as consultas com evento, não só as futuras: o critério da issue é nenhum evento com dado de saúde, e o passado também fica em calendário de terceiro; ordem do mais futuro ao mais antigo e teto de 500 por empresa por execução tratam volume e cota. Só `patch`, nunca `delete`; idempotência por `appointments.calendar_minimized_at` (migração `0056`), gravada só após o sucesso. Trade-off: a empresa precisa rodar o comando (`producao.md` § 7.2); o histórico de revisões do evento no Google não é alterável pela API. AGE-RN-19 · 2026-10-17 · active

### AD-038
- **Decision**: e-mail de contato do paciente **opcional e repetível** na empresa (#325, delegado, opção mais segura); o portal segue sem identificá-lo por ele (POR-RN-08) e o login é a conta de e-mail único criada por convite. Migração `0057` solta `NOT NULL` e o índice único, sem alterar dados; `findByEmail`/`countByEmail` saem do repositório de pacientes; lembrete sem e-mail é pulado. Trade-off: sem e-mail não há lembrete por e-mail (WhatsApp segue); reverter exige sanear duplicados. ADR-023, PRO-RN-20, POR-RN-18, COM-RN-18 · 2026-10-17 · active

### AD-039
- **Decision**: suspensão de clínica com **motivo obrigatório** (#251), números de @KalleoPinheiro (2026-10-11): lista fechada (inadimplência, pedido da clínica, incidente de segurança, outro) + observação opcional, visíveis só na plataforma (nunca na mensagem de login, ACE-RN-28); `company_admin` recebe e-mail ao suspender e reativar, sem o motivo, pelo canal da plataforma (ADR-011). Delegado: o motivo vive em `clinics.status_reason`/`status_reason_note` (migração `0058`) e é **limpo na reativação** (o histórico fica na trilha); a auditoria grava só o **código** (`suspend:non_payment`), porque a observação livre pode citar pessoa; o aviso vai a todo `company_admin` ativo, em melhor esforço (falha de envio não desfaz a suspensão); suspensas antes da #251 ficam sem motivo, sem backfill inventado. Trade-off: sem canal da plataforma configurado o aviso não sai. ACE-RN-27, ACE-RN-55 · 2026-10-17 · active

### AD-040
- **Decision**: remarcação bloqueada para profissional inativo e revogação imediata no recadastro do 2º fator (#297), decididas por @KalleoPinheiro (2026-10-11). `RescheduleAppointment` recebe o repositório de profissionais (opcional, como em `ScheduleAppointment`) e reusa `assertActiveProfessional` com a mensagem "Profissional inativo: escolha outro profissional" (`400`); `POST /api/me/mfa/confirm` chama `forgetSessionStatus` como logout, set-password e PATCH de conta. Pergunta aberta sobre a remarcação **pelo portal** **decidida** pelo coordenador (autonomia de @KalleoPinheiro): também é bloqueada, com mensagem pedindo contato com a clínica (`400`; POR-RN-20), porque consulta sem profissional ativo seria atendimento fantasma; cancelar segue livre. Trade-off: o paciente depende da clínica para trocar de profissional; a equipe resolve o impasse trocando de profissional ou reativando o cadastro. AGE-RN-20, POR-RN-20, ACE-RN-53 · 2026-10-17 · active

### AD-041
- **Decision**: responsável/cuidador do paciente (#329, delegado) como **entidade `Guardian` por empresa**, só de contato, ligada a `patients.guardian_id` (migração `0059`); um por paciente, reutilizável entre pacientes da família. Gerência do Admin e do Atendente; o Profissional vê embutido na ficha. Lembrete usa o e-mail do responsável quando o paciente não tem o próprio (sem portal); o termo imprime nome e parentesco; a retenção apaga o responsável com o último paciente; a exportação do titular o inclui. Trade-off: sem login do cuidador no portal e sem segundo responsável (novo ADR). ADR-024, PRO-RN-21, COM-RN-19, POR-RN-19 · 2026-10-17 · active

### AD-042
- **Decision**: remover o **modo aberto** (#327, delegado ao coordenador como PO/arquiteto): `VITTA_ALLOW_OPEN_MODE` deixa de existir; sem `AUTH_SECRET` tudo responde 503 em qualquer ambiente (regra 2 do AGENTS.md). `AuthMode` perde `open`, `requireStaffSession` devolve sempre `Session` (sem `session: null`), a identidade da sidebar sempre tem `account`, e `canManageClosure`/`accountManager`/`assertCanManageGuardians` deixam de ter ramo permissivo para ator nulo (endurece: antes um ator nulo gerenciava tudo). O segundo servidor `next dev` (porta 3100) e `NEXT_DIST_DIR` saíram do E2E; os 2 specs do modo aberto foram removidos e o 503 sem `AUTH_SECRET` (mesmo com a variável antiga) é coberto por testes de unidade do proxy, da guarda e da política. Mantido de propósito: helpers genéricos que aceitam sessão nula (`sessionScope`, `recordAudit`, `writeClinicId`) servem a fluxos sem sessão (login, cron, bootstrap). Trade-off: não há mais navegação sem login em dev; use o bootstrap (`VITTA_BOOTSTRAP_TOKEN`). ADR-002, ACE-RN-01 · 2026-10-17 · active

### AD-044
- **Decision**: CPF do paciente **opcional** e validado (dígito verificador), **cifrado** em repouso e **mascarado** (`***.***.247-**`) em toda API e tela da equipe; **obrigatório só para emitir recibo**, que traz o CPF de quem pagou e o CNPJ da empresa (FIN-RN-15, PRO-RN-20). Pagador diferente do paciente (nome + CPF) é informado ao registrar o pagamento. O CPF inteiro sai só no recibo (auditado sem o número) e na exportação do titular; nunca no portal, em log ou na trilha. Anonimização apaga o CPF e os pagadores. Delegado por @KalleoPinheiro na #218 (pergunta 2); detalhes e trade-offs no [ADR-021](../docs/adr/021-cpf-no-recibo-e-protecao.md).
- **Trade-off** (o recibo só serve ao IRPF com esses documentos, e CPF é dado pessoal ligado a saúde, então fica o mais restrito possível): sem busca nem unicidade por CPF (cifra aleatória); reimpressão usa o CPF atual do cadastro; pagador do recebimento não é editável depois (recebimento imutável); a tela troca o CPF mas não o remove. Prestador é só a empresa (CNPJ): recibo de profissional autônomo PF fica fora. Escopo: PRO-RN-20, FIN-RN-15, migração 0056, `src/domain/shared/cpf.ts`, `src/domain/billing/receipt.ts` · 2026-10-17 · active

### AD-046
- **Decision**: o responsável do paciente acessa o portal **em nome dele** (#351, [ADR-027](../docs/adr/027-responsavel-acessa-portal-em-nome-do-paciente.md)), por decisão de @KalleoPinheiro (2026-10-17) com a exigência de evidência; desenho delegado ao coordenador: papel `guardian` com conta própria (migração `0061`), concedida pelo Admin de Empresa ou Atendente com **atestação** de que o paciente autorizou; o responsável escolhe o paciente, a tela mostra "Acessando em nome de X" o tempo todo, cada requisição grava `guardian-access` antes de seguir (ator = responsável, titular = paciente) e o paciente vê quem tem acesso e o último acesso. **Trade-off**: consentimento, parceiro indicador, cópia dos dados e pedidos LGPD ficam `403` para o responsável; foto só com o aceite do paciente; a prova é a atestação da equipe, sem convite ao paciente; um `read` por requisição enche a trilha. Pergunta aberta: o paciente adulto revogar sozinho o acesso pelo portal. POR-RN-21..23, ACE-RN-56 · 2026-10-17 · active

### AD-047
- **Decision**: o paciente adulto **revoga sozinho**, pelo portal, o acesso do responsável (#354, [ADR-028](../docs/adr/028-paciente-encerra-acesso-do-responsavel.md)), por decisão de @KalleoPinheiro (2026-10-18). Marca **por paciente** (`patients.guardian_portal_revoked_at`, migração `0062`), não desativação da conta: o responsável pode representar outros pacientes e o contato dele (ADR-024) continua. Trilha `guardian-access-revocation` (ator = paciente) antes de gravar. Só a equipe concede de novo, desvinculando e vinculando o responsável. **Trade-off**: o responsável não é avisado; religar é ato manual da equipe. POR-RN-24 · 2026-10-18 · active

### AD-048
- **Decision**: CNPJ antigo com dígito verificador inválido (#355, follow-up da #248) é **marcado para correção**, nunca apagado, anulado nem "consertado" (o CNPJ é obrigatório e o erro pode estar em qualquer dígito). Coluna `clinics.cnpj_review_since` (migração `0063`), script manual `npm run clinics:cnpj-review -- [--confirmar]`, auditoria sem o CNPJ, aviso em Configurações e na plataforma; salvar CNPJ válido limpa. **Trade-off**: documentos clínicos só avisam; o **recibo é bloqueado** (#358, decisão do coordenador como PO: recibo com CNPJ errado não vale como documento fiscal; já emitidos não mudam); sem job automático (script rodado uma vez no deploy). Delegado por @KalleoPinheiro; [ADR-029](../docs/adr/028-cnpj-antigo-invalido-marcado-para-correcao.md), ACE-RN-57 · 2026-10-18 · active

### AD-049
- **Decision**: orçamento de latência do go-live (#222), adotado pelo coordenador com a autonomia delegada por @KalleoPinheiro (2026-10-18): em uso realista (30 usuários simultâneos, pausa de 2 s, ≈ 15 req/s) toda rota de leitura fica com **p95 ≤ 300 ms**, o `/api/portal/patient/slots` com **p95 ≤ 500 ms**, e **0 erro** em qualquer cenário. Baseline medido em build de produção (`node .next/standalone/server.js`, Postgres 16, 4 vCPU): todas as rotas cumprem, com p95 ≤ 100 ms exceto `/slots` (460 ms com 20 profissionais e 100 mil consultas); teto de ≈ 165 req/s (típica) e ≈ 82 req/s (100 mil consultas) com 1 processo. **Índices compostos da #222 item 1: não construir**: com 20 empresas, 400 mil consultas e 2 milhões de eventos as rotas ficam em p95 ≤ 25 ms; revisar acima de ≈ 1 milhão de consultas por empresa. **Trade-off**: medição só de leitura, em loopback e com `fsync=off`; escrita, job de lembretes e navegador ficam fora (ver § 7 do doc). Método, tabelas e como reproduzir em [`docs/engineering/performance-baseline.md`](../docs/engineering/performance-baseline.md), scripts em `scripts/load/` · 2026-10-18 · active

### AD-050
- **Decision**: os textos LGPD da #216 saem da prévia e ficam **ligados ao sistema** (@KalleoPinheiro, 2026-10-18: "cubra todas as informações necessárias e feche essa etapa, a revisão será feita por profissional da área"), supersede AD-045. Pendências do § 7 fechadas pela opção mais segura (tabela em `docs/legal/textos-lgpd.md` § 3): termo de **imagem à parte** (`purpose`), encarregado por clínica com queda no contato da clínica, hash do texto-base + `controller_snapshot`, aviso público `/privacidade`, rodapé de privacidade nos e-mails. **Trade-off**: aceites antigos viram `treatment` e o paciente reaceita o TCLE `v2` e o de imagem; revisão jurídica ainda pendente, sinalizada por `LEGAL_REVIEW_PENDING`. [ADR-030](../docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md), PRO-RN-23, POR-RN-25, ACE-RN-58, COM-RN-20 · 2026-10-18 · active

### AD-051
- **Decision**: o teto de consultas futuras e a cota diária de fotos do portal (#363, follow-up da #213) são **atômicos por paciente**: contagem e gravação rodam na mesma transação, que tranca a linha do paciente (`SELECT … FOR UPDATE`). Escolhido, com a autonomia delegada por @KalleoPinheiro (2026-10-18), em vez de restrição no banco (o limite é janela móvel de 24 h e inclui consultas da equipe, que não cabem em `UNIQUE`/`CHECK`) e de lock distribuído (Postgres já basta). **Trade-off**: envios do mesmo paciente passam a ser em fila (só dele); a foto vai ao storage dentro da transação, então um commit que falhe deixa no máximo um arquivo órfão, nunca linha sem arquivo. POR-RN-17 · 2026-10-18 · active

### AD-052
- **Decision**: prazo de retenção contado em **dias inteiros** no `APP_TIMEZONE` (CC art. 132 § 3º): o último dia do prazo fica inteiro e o dado sai no dia seguinte; vale para todos os tipos (#323). Prazos numa **fonte única** (`RETENTION_YEARS`), lida pelo aviso de privacidade; mudar exige subir `PRIVACY_NOTICE_VERSION` (teste trava), sem variável de ambiente. A plataforma ganha um evento `retention` **a cada execução**, mesmo sem nada vencido. **Trade-off**: o dado sai até 1 dia depois do que saía; a trilha anonimizada continua ocupando espaço. Coordenador como PO; [ADR-031](../docs/adr/031-retencao-em-dias-inteiros-e-fonte-unica.md), ACE-RN-44 · 2026-10-18 · active

### AD-053
- **Decision**: o `/slots` do portal (#360) lê as consultas do dia **uma vez** (`findConflicting` sobre a janela inteira do dia, com a folga mínima nas pontas) e confere cada candidato em memória (`assertSlotAvailableAmong`), em vez de uma consulta por horário. A regra continua única: `assertSlotAvailable` (agendar/remarcar) e `assertSlotAvailableAmong` compartilham grade, bloqueios, horário do profissional e a mensagem de conflito; testes de equivalência comparam os dois caminhos em 8 agendas aleatórias, com remarcação. Escolhido, com a autonomia delegada por @KalleoPinheiro, em vez de cache entre requisições (invalidação arriscada, disponibilidade defasada) e de SQL de janelas livres (duplicaria a regra no banco). **Resultado** (perfil `issue`, mesma máquina): realista p50/p95 403/593 → 50/79 ms; saturação 4 172/4 920 → 1 622/2 169 ms. Sem migração · 2026-10-18 · active

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

Um scan GitGuard sobre `fcd6110` deve cair de 54 para ~9 findings: 2 `hardcoded_secrets` deduplicados, 1 `unsafe-formatstring` e os 6 TRIVY obsoletos, que só somem quando o serviço reindexar o lockfile. Acima disso, reproduza localmente antes de agir.

## Handoff
Handoffs de trabalho encerrado ficam em [`.specs/archive/handoff-2026.md`](archive/handoff-2026.md) — leia só quando precisar do histórico de uma feature. Aqui fica apenas o que está em aberto: #308 (E2E intermitente, em investigação) e #216 (jurídico); o resto da fila segue pelo coordenador do projeto.
