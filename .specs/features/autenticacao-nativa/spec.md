# Autenticação Nativa: convite e reset por e-mail, remoção do login Google — Specification

Issue: [#21](https://github.com/KalleoPinheiro/vitta-flow/issues/21). Sub-issues (ordem cronológica obrigatória): [#32](https://github.com/KalleoPinheiro/vitta-flow/issues/32) (A1 — convite), [#34](https://github.com/KalleoPinheiro/vitta-flow/issues/34) (A2 — reset), [#33](https://github.com/KalleoPinheiro/vitta-flow/issues/33) (A3 — Calendar desacoplado), [#35](https://github.com/KalleoPinheiro/vitta-flow/issues/35) (A4 — remoção + bootstrap). Executa [ADR-004](../../../docs/adr/004-remocao-google-oauth-autenticacao.md). Depende de #20/#29 (RBAC, já mergeada).

## Problem Statement

A autenticação depende hoje de duas fontes conflitantes: uma senha mestre de deploy (`AUTH_PASSWORD`, credencial compartilhada que produz o ator `"local"` na auditoria) e Google OAuth com allowlist em variável de ambiente global (`GOOGLE_ALLOWED_EMAILS`), incompatível com papel e permissão por empresa. Paciente e Parceiro nunca tiveram senha própria: o único caminho de login deles sempre foi o Google. Não existe nenhum canal de e-mail transacional no projeto, então também não existe convite nem recuperação de senha.

## Goals

- [x] Toda conta (os 6 papéis) autentica com senha própria, definida por ela mesma a partir de um link de convite recebido por e-mail.
- [x] Reset de senha self-service por e-mail, sem depender de outra pessoa.
- [x] Google Calendar continua sincronizando, conectado por uma sessão nativa já autenticada, sem nenhuma relação com login.
- [x] Login via Google, `GOOGLE_ALLOWED_EMAILS` e `AUTH_PASSWORD` deixam de existir; fail-closed passa a depender só de `AUTH_SECRET`.
- [x] Instalação nova consegue criar a primeira conta Super Admin sem allowlist e sem senha mestre.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Mudanças no modelo de papéis ou na hierarquia de provisionamento | Entregues na issue #20 |
| Mudanças na integração de WhatsApp Business (lembretes) | Canal descartado para convite/reset na ADR-004 |
| Mudanças na sincronização de agenda além de desacoplá-la do login | ADR-004 declara a integração preservada como está |
| MFA, SSO corporativo, qualquer método além de e-mail+senha | Fora do escopo declarado da issue #21 |
| Uma pessoa com conta em mais de uma empresa | Fora do escopo declarado da issue #21 |
| UI de gestão de convites (reenviar, listar pendentes) | Não pedido por nenhuma AC; backlog |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui. As linhas abaixo foram levantadas como gray areas do domínio "backend / state / contract" (falha parcial, idempotência, fronteira de auth, ciclo de vida do dado) e resolvidas pelo agente com o default indicado, por não haver decisão de produto pendente na issue nem na ADR-004.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Provedor de e-mail transacional | Resend, consumido pela API HTTP (`POST https://api.resend.com/emails`) via `fetch`, sem dependência npm nova | A issue #21 declara explicitamente que a escolha do provedor "não é uma decisão de produto"; a ADR-004 cita Resend como exemplo. `fetch` direto espelha o `MetaWhatsAppGateway` já existente (também HTTP puro, também com timeout), então o projeto não ganha árvore de dependência nem SDK novo | y (issue #21, "Further Notes") |
| Variáveis do provedor | `RESEND_API_KEY` + `EMAIL_FROM` | Segredo nunca no código (regra do projeto); remetente varia por instalação | y |
| "Falha clara na inicialização" sem configuração de e-mail | Em produção (`NODE_ENV === "production"`), construir o gateway sem `RESEND_API_KEY`/`EMAIL_FROM` lança erro nomeando as duas variáveis. Fora de produção cai no gateway nulo (dry-run) que loga o link | Literal da user story 11 da #21 ("resulta numa falha clara na inicialização") somada à AC do #32 que exige a implementação nula "para quando não há credenciais". Produção e dev são casos distintos e precisam ser distinguíveis | y |
| Formato do token de convite/reset | 32 bytes aleatórios (`randomBytes`) em base64url compõem o segredo entregue no link; o banco guarda só o SHA-256 do segredo, com `purpose`, `account_id`, `expires_at` e `used_at` | Token opaco de alta entropia evita qualquer inferência a partir do valor (a AC de teste da #21 proíbe até testar a estrutura interna). Guardar só o hash impede que um vazamento de leitura do banco vire tomada de conta | y |
| Validade do link ("expiração curta") | 24 h para convite, 1 h para reset | A #21 pede "expiração curta" sem número. Convite precisa sobreviver a um e-mail lido no dia seguinte; reset é uma ação imediata e deliberada, então tem janela menor | y — número escolhido pelo agente, registrado aqui |
| Uso único | Consumir um token grava `used_at`; um segundo uso é rejeitado como se fosse expirado, com a mesma mensagem | AC explícita das duas sub-issues (#32 e #34) pede uso único e mensagem clara para expirado **ou** já usado — mensagens distintas revelariam se o link já foi usado por outra pessoa | y |
| Emissão de um novo token invalida os anteriores | Emitir um token de um `purpose` marca como usados os tokens anteriores não usados do mesmo `purpose` para aquela conta | Sem isso, pedir "esqueci minha senha" três vezes deixaria três links vivos por 1 h cada, ampliando a janela de um e-mail interceptado | y |
| Resposta ao pedir reset para e-mail inexistente | Mesmo corpo e mesmo status (`200`) do caso existente; nenhum e-mail é enviado | AC explícita da #34 ("não revela se a conta existe ou não") | y (issue #34) |
| Senha no cadastro de conta | `POST /api/accounts` deixa de aceitar `password`. A conta nasce com um hash inutilizável (sentinela que nenhuma senha satisfaz) e só passa a autenticar depois que o convite é consumido | A user story 1 da #21 exige que a pessoa defina a própria senha; aceitar senha no cadastro manteria o anti-padrão de "senha temporária comunicada por terceiro" que a ADR-004 diz que o convite elimina | y |
| Falha no envio do e-mail de convite durante o cadastro | A conta permanece criada e a rota responde 200 com o DTO da conta; a falha é logada. O convite pode ser reemitido pelo fluxo de reset de senha | A alternativa (desfazer o cadastro) transformaria uma indisponibilidade do provedor de e-mail numa falha de cadastro, e o fluxo de reset já cobre a reemissão | y |
| Mecanismo de bootstrap do primeiro Super Admin | Rota `POST /api/auth/bootstrap`, autenticada por um segredo de deploy (`VITTA_BOOTSTRAP_TOKEN`, header `x-bootstrap-token`) **e** só habilitada enquanto não existir nenhuma conta na instalação. Cria a conta Super Admin e emite o convite por e-mail | Um script CLI não alcançaria o banco em memória do servidor (PGlite) usado por dev/E2E, e a issue exige um caminho reproduzível. As duas guardas juntas (segredo + zero contas) fecham a janela: sem o segredo ninguém chama, e depois da primeira conta a rota some funcionalmente | y — decisão do agente, registrada como AD em `.specs/STATE.md` |
| Proteção contra força bruta no login | Mantido o `RateLimiter` já existente na rota de login (5 tentativas/min por IP), agora aplicado uniformemente porque só existe um caminho de login | User story 12 da #21 pede proteção "consistente para todos os papéis"; com o Google removido não há mais caminho que a escape | y |
| Rotas do fluxo público | `/api/auth/forgot-password`, `/api/auth/set-password` e `/api/auth/bootstrap` entram em `PUBLIC_PATHS`; as páginas `/definir-senha` e `/esqueci-senha` também | Quem usa esses fluxos, por definição, não tem sessão | y |
| Destino do fluxo OAuth do Calendar | `GET /api/integrations/google-calendar` (início) e `.../callback` (retorno), ambos exigindo sessão de equipe — fora de `/api/auth/**` | Separar por caminho torna a AC "rotas de autenticação por Google não existem mais" verificável de forma estrutural pelo teste de conformidade, em vez de por leitura | y |
| Escopo do token do Calendar | Só `https://www.googleapis.com/auth/calendar.events` (sem `openid`/`userinfo.email`) | Sem login por Google, identificar a pessoa pelo Google deixa de ter propósito; o dono do token é a sessão nativa que iniciou o fluxo. Minimização (LGPD) já era princípio declarado no módulo removido | y |
| Chave de armazenamento da credencial do Calendar | A tabela `google_accounts` é mantida como está, chaveada por e-mail — o e-mail gravado passa a ser o `subject` da sessão nativa que conectou | Preserva a credencial e o gateway já existentes (ADR-004: "não é afetado"); nenhuma migração de dado é necessária | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Convite por e-mail define a senha inicial (A1 / #32) ⭐ MVP

**User Story**: Como pessoa cadastrada no sistema em qualquer um dos 6 papéis, quero receber um e-mail de convite ao ser cadastrada, para definir minha própria senha e acessar o sistema pela primeira vez.

**Why P1**: É a fundação — o gateway de e-mail e o primitivo de token nascem aqui e são reaproveitados pelo reset (A2); sem eles, remover a senha mestre (A4) deixaria o sistema sem nenhum caminho de primeiro acesso.

**Acceptance Criteria**:

1. The system SHALL expor uma porta de e-mail transacional com uma implementação nula/dry-run, usada quando não há credenciais configuradas, que registra em log o destinatário e o conteúdo em vez de enviar. <!-- ubiquitous -->
2. WHERE o ambiente é produção e as credenciais de e-mail (`RESEND_API_KEY`, `EMAIL_FROM`) estão ausentes THEN o sistema SHALL falhar ao construir o gateway com um erro que nomeia as duas variáveis, em vez de cair silenciosamente no dry-run. <!-- optional-feature/unwanted-behavior -->
3. WHEN um token de ativação é emitido para uma conta THEN o sistema SHALL persistir apenas o hash SHA-256 do segredo, junto de propósito, conta, instante de expiração e marca de uso. <!-- event-driven -->
4. WHEN uma conta é criada via `POST /api/accounts` THEN o sistema SHALL emitir um token de convite com validade de 24 h e enviar ao e-mail da conta uma mensagem contendo o link `{APP_URL}/definir-senha?token=…`. <!-- event-driven -->
5. WHEN `POST /api/auth/set-password` recebe um token de convite válido e uma senha de no mínimo 8 caracteres THEN o sistema SHALL gravar o hash da nova senha na conta, marcar o token como usado e responder 200. <!-- event-driven -->
6. WHEN uma conta define a senha por um convite válido THEN o sistema SHALL passar a aceitar `POST /api/auth/login` com aquele e-mail e aquela senha, respondendo 200 e emitindo cookie de sessão com o papel gravado na conta. <!-- event-driven -->
7. IF `POST /api/auth/set-password` recebe um token expirado, já usado ou inexistente THEN o sistema SHALL responder 400 com a mensagem `Link inválido ou expirado — solicite um novo` e não alterar nenhuma senha. <!-- unwanted-behavior -->
8. WHILE uma conta ainda não consumiu seu convite o sistema SHALL recusar `POST /api/auth/login` para aquele e-mail com 401, qualquer que seja a senha enviada. <!-- state-driven -->
9. IF o envio do e-mail de convite falha durante `POST /api/accounts` THEN o sistema SHALL manter a conta criada, responder 200 com o DTO da conta e registrar o erro em log. <!-- unwanted-behavior -->

**Independent Test**: cadastrar uma conta via `POST /api/accounts` com o gateway de e-mail em modo espião, extrair o token do link enviado, chamar `POST /api/auth/set-password` com ele e em seguida `POST /api/auth/login` com a senha escolhida — a última precisa devolver 200 e cookie de sessão.

---

### P2: Reset de senha self-service (A2 / #34)

**User Story**: Como usuário de qualquer papel, quero pedir "esqueci minha senha" e receber um link por e-mail para definir uma nova, sem depender de outra pessoa para resetar por mim.

**Why P2**: Depende do gateway e do primitivo de token do A1. É o único caminho de recuperação depois que a senha mestre desaparece (A4).

**Acceptance Criteria**:

1. WHEN `POST /api/auth/forgot-password` recebe o e-mail de uma conta ativa THEN o sistema SHALL emitir um token de reset com validade de 1 h e enviar ao e-mail da conta uma mensagem contendo o link `{APP_URL}/definir-senha?token=…`. <!-- event-driven -->
2. WHEN `POST /api/auth/forgot-password` recebe um e-mail que não corresponde a nenhuma conta THEN o sistema SHALL responder com exatamente o mesmo status 200 e o mesmo corpo do caso em que a conta existe, sem enviar e-mail algum. <!-- event-driven -->
3. WHEN um token de reset válido é apresentado a `POST /api/auth/set-password` com uma senha nova THEN o sistema SHALL gravar a nova senha e passar a aceitar login com ela, recusando a senha anterior com 401. <!-- event-driven -->
4. IF `POST /api/auth/set-password` recebe um token de reset expirado ou já usado THEN o sistema SHALL responder 400 com a mensagem `Link inválido ou expirado — solicite um novo`. <!-- unwanted-behavior -->
5. WHEN um novo token de reset é emitido para uma conta THEN o sistema SHALL invalidar os tokens de reset anteriores ainda não usados daquela conta. <!-- event-driven -->

**Independent Test**: pedir reset para uma conta existente, capturar o link, definir uma senha nova e confirmar que o login com a senha antiga passa a responder 401 e com a nova responde 200.

---

### P3: Conexão do Google Calendar desacoplada do login (A3 / #33)

**User Story**: Como membro da equipe já autenticado por senha, quero conectar a agenda do Google da clínica por um fluxo próprio, para que a sincronização continue funcionando sem que o Google tenha qualquer papel no login.

**Why P3**: Sem bloqueio de dependência, mas precisa existir **antes** de A4 remover o callback de OAuth que hoje é o único lugar onde a credencial do Calendar é obtida.

**Acceptance Criteria**:

1. WHEN uma sessão de equipe válida chama `GET /api/integrations/google-calendar` THEN o sistema SHALL redirecionar para o consentimento do Google pedindo apenas o escopo `https://www.googleapis.com/auth/calendar.events`, com `access_type=offline`, gravando um cookie de estado anti-CSRF. <!-- event-driven -->
2. IF `GET /api/integrations/google-calendar` é chamada sem sessão THEN o sistema SHALL responder 401 e não iniciar fluxo algum. <!-- unwanted-behavior -->
3. WHEN `GET /api/integrations/google-calendar/callback` recebe um `code` com `state` que confere e um refresh token THEN o sistema SHALL persistir a credencial cifrada em `google_accounts` sob o `subject` da sessão que iniciou o fluxo. <!-- event-driven -->
4. WHEN `GET /api/integrations/google-calendar/callback` conclui com sucesso THEN o sistema SHALL manter inalterado o cookie de sessão da requisição — nenhuma sessão é criada, renovada ou trocada. <!-- event-driven -->
5. IF `GET /api/integrations/google-calendar/callback` recebe `state` ausente ou divergente do cookie THEN o sistema SHALL recusar sem persistir credencial. <!-- unwanted-behavior -->
6. WHILE existe uma credencial de Calendar conectada por esse fluxo o sistema SHALL construir o gateway de agenda a partir dela, preservando a sincronização de saída de agendamentos já existente (agendar cria, remarcar atualiza, cancelar remove o evento; não há leitura de eventos do Google). <!-- state-driven -->

**Independent Test**: com um cookie de sessão de equipe, chamar a rota de início e conferir o redirect e o escopo; em seguida chamar o callback com o `state` correto e conferir que `google_accounts` ganhou a linha e que a resposta não traz `Set-Cookie` de sessão.

---

### P4: Remoção do login Google, da allowlist e da senha mestre + bootstrap (A4 / #35)

**User Story**: Como mantenedor do sistema, quero que o login via Google, a allowlist de e-mails e a senha mestre deixem de existir, e que uma instalação nova ainda consiga criar sua primeira conta Super Admin.

**Why P4**: Depende de A1 (senha própria para todos) e de A3 (Calendar já migrado). É a entrega que fecha a ADR-004.

**Acceptance Criteria**:

1. The system SHALL não expor nenhuma rota sob `/api/auth/google` — o teste de conformidade de rotas SHALL falhar se um arquivo de rota reaparecer sob esse caminho. <!-- ubiquitous -->
2. The system SHALL não conter nenhuma leitura de `GOOGLE_ALLOWED_EMAILS` nem resolução de papel por allowlist em `src/**`. <!-- ubiquitous -->
3. The system SHALL não conter nenhuma leitura de `AUTH_PASSWORD` em `src/**`, e `POST /api/auth/login` SHALL exigir `email` e `password`. <!-- ubiquitous -->
4. IF `POST /api/auth/login` é chamada sem `email` THEN o sistema SHALL responder 401 sem conceder sessão alguma. <!-- unwanted-behavior -->
5. WHEN `AUTH_SECRET` está definido THEN o sistema SHALL considerar a autenticação configurada, independentemente de qualquer variável do Google ou de senha mestre. <!-- event-driven -->
6. IF `AUTH_SECRET` está ausente e o modo aberto não está habilitado THEN o sistema SHALL responder 503 em toda rota. <!-- unwanted-behavior -->
7. WHEN `POST /api/auth/bootstrap` recebe o header `x-bootstrap-token` correto e não existe nenhuma conta na instalação THEN o sistema SHALL criar uma conta `super_admin` com o e-mail informado e emitir o convite por e-mail. <!-- event-driven -->
8. IF `POST /api/auth/bootstrap` é chamada quando já existe ao menos uma conta THEN o sistema SHALL responder 403 e não criar conta alguma. <!-- unwanted-behavior -->
9. IF `POST /api/auth/bootstrap` é chamada com `x-bootstrap-token` ausente ou incorreto, ou com `VITTA_BOOTSTRAP_TOKEN` não configurado THEN o sistema SHALL responder 403 e não criar conta alguma. <!-- unwanted-behavior -->
10. WHILE não há login por Google a tela `/login` SHALL oferecer somente o formulário de e-mail e senha e o link para `/esqueci-senha`. <!-- state-driven -->

**Independent Test**: varrer `src/` confirmando ausência de `GOOGLE_ALLOWED_EMAILS`, `AUTH_PASSWORD` e de qualquer arquivo em `src/app/api/auth/google/`; chamar `POST /api/auth/bootstrap` numa base vazia com o header correto e confirmar a criação; repetir e confirmar 403.

---

## Edge Cases

- WHERE existe uma única rota de definição de senha, `POST /api/auth/set-password` SHALL aceitar tanto um token de convite quanto um de reset — o `purpose` decide a validade do link (24 h vs 1 h) e o alcance da invalidação em lote, nunca se a rota aceita ou recusa o token.
- IF `POST /api/auth/set-password` recebe senha com menos de 8 caracteres THEN o sistema SHALL responder 400 sem consumir o token.
- IF `POST /api/auth/forgot-password` é chamada repetidamente do mesmo IP THEN o sistema SHALL aplicar o mesmo limite de 5 tentativas por minuto usado no login.
- IF a conta alvo de um token está inativa THEN o sistema SHALL recusar a definição de senha com a mesma mensagem de link inválido.
- WHEN uma conta consome um convite THEN o sistema SHALL invalidar os demais tokens de convite não usados daquela conta.
- IF a construção do gateway de e-mail falha em produção THEN o sistema SHALL propagar o erro em vez de enviar nada silenciosamente.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-01 | P1: Convite (#32) | Tasks | Verified |
| AUTH-02 | P1: Convite (#32) | Tasks | Verified |
| AUTH-03 | P1: Convite (#32) | Tasks | Verified |
| AUTH-04 | P1: Convite (#32) | Tasks | Verified |
| AUTH-05 | P1: Convite (#32) | Tasks | Verified |
| AUTH-06 | P1: Convite (#32) | Tasks | Verified |
| AUTH-07 | P1: Convite (#32) | Tasks | Verified |
| AUTH-08 | P1: Convite (#32) | Tasks | Verified |
| AUTH-09 | P1: Convite (#32) | Tasks | Verified |
| AUTH-10 | P2: Reset (#34) | Tasks | Verified |
| AUTH-11 | P2: Reset (#34) | Tasks | Verified |
| AUTH-12 | P2: Reset (#34) | Tasks | Verified |
| AUTH-13 | P2: Reset (#34) | Tasks | Verified |
| AUTH-14 | P2: Reset (#34) | Tasks | Verified |
| AUTH-15 | P3: Calendar (#33) | Tasks | Verified |
| AUTH-16 | P3: Calendar (#33) | Tasks | Verified |
| AUTH-17 | P3: Calendar (#33) | Tasks | Verified |
| AUTH-18 | P3: Calendar (#33) | Tasks | Verified |
| AUTH-19 | P3: Calendar (#33) | Tasks | Verified |
| AUTH-20 | P3: Calendar (#33) | Tasks | Verified |
| AUTH-21 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-22 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-23 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-24 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-25 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-26 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-27 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-28 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-29 | P4: Remoção + bootstrap (#35) | Tasks | Verified |
| AUTH-30 | P4: Remoção + bootstrap (#35) | Tasks | Verified |

**ID format:** `AUTH-NN`, na ordem das ACs de cada história (P1 → AUTH-01..09, P2 → AUTH-10..14, P3 → AUTH-15..20, P4 → AUTH-21..30).

**Coverage:** 30 requisitos, 30 mapeados para tasks, 0 sem mapeamento.

---

## Success Criteria

- [x] Uma conta criada por qualquer papel autorizado recebe convite e consegue definir a própria senha e logar, sem que ninguém lhe comunique uma senha.
- [x] Nenhuma variável de ambiente concede papel ou acesso: `GOOGLE_ALLOWED_EMAILS` e `AUTH_PASSWORD` não existem mais em `src/**`.
- [x] A sincronização de agenda continua funcionando com credencial obtida pelo fluxo dedicado do Calendar.
- [x] Uma instalação vazia consegue criar seu primeiro Super Admin e, depois disso, a rota de bootstrap deixa de funcionar.
- [x] Gate completo verde: `typecheck`, `lint`, `test:coverage` (≥ 90 %), `check:sv`, `build`.
