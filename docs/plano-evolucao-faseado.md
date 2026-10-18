---
title: "Plano de Evolução Faseado e Roadmap"
status: living
audience: [po, stakeholder, dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
---

# Plano de Evolução Faseado — EstomaSysTech

- **Versão:** 1.0
- **Data:** 2026-08-15
- **Origem:** análise de código (produto, segurança, performance, UX/DX) realizada nesta branch
- **Método:** spec-driven (tlc-spec-driven) — cada fase executável tem `spec.md`, `design.md` e
  `tasks.md` em `.specs/features/`, com testes derivados dos critérios de aceite, um commit
  atômico por task e validação independente (Verifier) ao final de cada fase.

---

## Princípios de priorização

1. **Segurança de dado de saúde antes de crescimento** — brechas identificadas viram incidente
   quando o sistema sair de 1 clínica confiável para N clínicas.
2. **Fundação antes de feature** — consistência transacional e guards unificados reduzem o custo
   de tudo que vem depois.
3. **Fechar loops de receita com o que já existe** — auto-agendamento reusa slots, grade e
   conflito por profissional já implementados.
4. **Decisão de negócio pendente = fase planejada, não executada** — itens que exigem escolha do
   usuário (matriz RBAC fina, taxa de cancelamento, PSP, multi-tenancy) ficam especificados como
   backlog para não inventar requisitos.

## Roadmap

> **Fonte da verdade:** esta seção. O GitHub Project é a *view*: cada linha `RM-NN` tem uma
> issue épica `[RM-NN] <Item>` com label `roadmap`. Divergiu? Esta seção vence e o Project é
> corrigido. Contrato completo em [Contrato repo ↔ ferramenta de gestão](#contrato-repo--ferramenta-de-gestão).

`status` ∈ `backlog` · `especificado` · `em-andamento` · `entregue` · `descartado`. Linha `entregue`
sempre linka a pasta de `.specs/features/` onde está a validação do Verifier.

### Now — T4 2026

| id | Item | Objetivo de negócio | status | issue | spec |
| --- | --- | --- | --- | --- | --- |
| RM-19 | Lembretes sem custo de mensageria: e-mail automático por empresa com cadência + botão `wa.me` | lembrete que chega ao paciente com R$ 0 de mensageria para a clínica | em-andamento | — | [`.tasks/lembretes-custo-zero.md`](../.tasks/lembretes-custo-zero.md) |

### Next

Nenhum item. A próxima prioridade depende das decisões pendentes listadas em **Later**.

### Later

| id | Item | Objetivo de negócio | status | issue | spec |
| --- | --- | --- | --- | --- | --- |
| RM-05 | Pagamento online (Pix/cartão) | receber sem ação manual da recepção | backlog | — | — (decisão pendente: PSP) |
| RM-15 | Relatório automático para o parceiro | fidelizar quem indica pacientes | backlog | — | — (decisão pendente: cadência e canal) |
| RM-16 | Oferta de vaga da lista de espera por WhatsApp | ocupar horário cancelado | backlog | — | — (decisão pendente: expiração da oferta) |
| RM-17 | TISS / convênios | faturar operadoras | backlog | — | — |
| RM-14 | Lembretes por WhatsApp com templates da Meta, opt-in por clínica (cadência e escopo por empresa já entregues no RM-19) | lembrete automático no WhatsApp para a clínica que aceitar o custo por mensagem | especificado | — | [`lembretes-whatsapp-templates-cadencia/`](../.specs/features/lembretes-whatsapp-templates-cadencia/) |
| RM-18 | Row-Level Security no Postgres ([ADR-001](./adr/001-multi-tenancy.md)) | isolamento de empresa também no banco | backlog | — | — |

### Entregue

| id | Item | Objetivo de negócio | status | issue | spec |
| --- | --- | --- | --- | --- | --- |
| RM-01 | Fase 1 — Hardening de segurança | proteger dado de saúde antes de crescer | entregue | — | [`fase-1-hardening-seguranca/`](../.specs/features/fase-1-hardening-seguranca/) |
| RM-02 | Fase 2 — Consistência transacional e performance | fundação antes de feature | entregue | — | [`fase-2-consistencia-performance/`](../.specs/features/fase-2-consistencia-performance/) |
| RM-03 | Fase 3 — Compliance e UX clínico | prontuário aderente a COFEN/LGPD | entregue | — | [`fase-3-compliance-ux-clinico/`](../.specs/features/fase-3-compliance-ux-clinico/) |
| RM-04 | Fase 4 — Portal: auto-agendamento e recall | fechar o loop de retorno com o que já existe | entregue | — | [`fase-4-portal-auto-agendamento/`](../.specs/features/fase-4-portal-auto-agendamento/) |
| RM-06 | RBAC: catálogo fechado de seis papéis | cada papel vê só o que precisa | entregue | [#20](https://github.com/KalleoPinheiro/estomasystech/issues/20) | [`rbac-catalogo-papeis/`](../.specs/features/rbac-catalogo-papeis/) |
| RM-07 | Multiempresa fases 1–2 (ADR-001) | vender para N clínicas | entregue | [#19](https://github.com/KalleoPinheiro/estomasystech/issues/19) | [`fundacao-multi-tenancy/`](../.specs/features/fundacao-multi-tenancy/) |
| RM-08 | Autenticação nativa, fim da senha mestre | nenhuma credencial compartilhada | entregue | [#21](https://github.com/KalleoPinheiro/estomasystech/issues/21) | [`autenticacao-nativa/`](../.specs/features/autenticacao-nativa/) |
| RM-09 | Paginação por cursor e CSP com nonce | listagens em volume alto; CSP estrita | entregue | [#75](https://github.com/KalleoPinheiro/estomasystech/issues/75) | [`paginacao-cursor-csp-nonce/`](../.specs/features/paginacao-cursor-csp-nonce/) |
| RM-10 | Auditoria UX — Fase A, padrões estruturais | estados de carregamento, confirmação e feedback consistentes | entregue | [#57](https://github.com/KalleoPinheiro/estomasystech/issues/57) | [`fase-a-padroes-estruturais/`](../.specs/features/fase-a-padroes-estruturais/) |
| RM-11 | Auditoria UX — Fase B, clínico-legal crítico | documentos clínicos válidos e autoria confiável | entregue | [#61](https://github.com/KalleoPinheiro/estomasystech/issues/61) | [`fase-b-clinico-legal-critico/`](../.specs/features/fase-b-clinico-legal-critico/) |
| RM-12 | Auditoria UX — Fase C, LGPD e segurança do dado | conformidade LGPD | entregue | [#69](https://github.com/KalleoPinheiro/estomasystech/issues/69) | [`fase-c-lgpd-seguranca-dado/`](../.specs/features/fase-c-lgpd-seguranca-dado/) |
| RM-13 | Documentação em progressive disclosure | onboarding de dev e de agente sem ler o repositório inteiro | entregue | [#173](https://github.com/KalleoPinheiro/estomasystech/pull/173) | [`docs-progressive-disclosure/`](../.specs/features/docs-progressive-disclosure/) |
| RM-20 | Portal do Super Admin: `/plataforma` para cadastrar, editar, suspender e reativar clínicas e gerir o `company_admin`; super_admin único, sem acesso clínico, com segundo fator, recuperação de emergência e trilha de auditoria de plataforma | entrar no ar com 1 clínica e abrir a segunda sem `INSERT` manual | entregue | [#214](https://github.com/KalleoPinheiro/estomasystech/issues/214) | [`portal-super-admin/`](../.specs/features/portal-super-admin/) |
| RM-21 | Canal de e-mail por clínica: cada clínica cadastra a própria chave (Resend) em `/configuracoes`; convite, redefinição e lembretes saem pelo canal dela, sem fallback para a conta da plataforma; link manual quando o e-mail não sai; `/plataforma` organizado (navegação, status do canal por clínica, importação de taxonomia) | plataforma agnóstica: a clínica responde pelo próprio custo e remetente | entregue | [#264](https://github.com/KalleoPinheiro/estomasystech/issues/264)–[#267](https://github.com/KalleoPinheiro/estomasystech/issues/267) | [`canal-por-clinica/`](../.specs/features/canal-por-clinica/) |
| RM-22 | Senha da equipe com 10+ caracteres e fora da lista de senhas comuns; segundo fator obrigatório para o Admin de Empresa e opcional para Atendente/Profissional ([ADR-012](./adr/012-segundo-fator-e-senha-da-equipe.md)); sessões do Admin sem 2FA derrubadas e mesma senha no portal ([ADR-016](./adr/016-sessoes-do-admin-sem-2fa-e-senha-unica.md), #309) | senha vazada de Admin não basta para levar os dados de uma clínica | entregue | [#291](https://github.com/KalleoPinheiro/estomasystech/issues/291) | [`senha-2fa-equipe/`](../.specs/features/senha-2fa-equipe/) |
| RM-23 | Retenção e anonimização automática: prontuário e fotos 20 anos após a última atividade, trilha de auditoria 5 anos, lista de espera e contas inativas 2 anos; ao fim, anonimiza (nunca exclui) por um job de cron idempotente e auditado só com contagens ([ADR-013](./adr/013-retencao-por-anonimizacao.md)) | dado de saúde não fica identificável para sempre (LGPD) | entregue | [#294](https://github.com/KalleoPinheiro/estomasystech/issues/294), complemento [#311](https://github.com/KalleoPinheiro/estomasystech/issues/311): fila vencida, conta de parceiro, textos de fatura, Google Agenda e reativação bloqueada | [`retencao-anonimizacao/`](../.specs/features/retencao-anonimizacao/), [`retencao-restante/`](../.specs/features/retencao-restante/) |
| RM-24 | Direitos do titular no portal (LGPD art. 18): o paciente baixa a cópia dos próprios dados e pede correção ou eliminação; o Admin de Empresa aceita ou recusa com justificativa e o paciente é avisado. Textos em vigor, com revisão jurídica pendente ([#216](https://github.com/KalleoPinheiro/estomasystech/issues/216)) | transparência e direitos do titular antes do go-live | entregue | [#293](https://github.com/KalleoPinheiro/estomasystech/issues/293) | [`direitos-titular-293/`](../.specs/features/direitos-titular-293/) |
| RM-25 | Observabilidade de produção: `/api/health` e `/api/health/ready` (HEALTHCHECK), logs JSON com `requestId` propagado, GlitchTip self-hosted com evento montado sem PII e alertas por e-mail ao operador (readiness, 5xx, lembretes sem rodar, falha de entrega) ([ADR-014](./adr/014-observabilidade-sem-pii.md)) | falha em produção chega ao operador antes da reclamação do usuário | entregue | [#212](https://github.com/KalleoPinheiro/estomasystech/issues/212) | [`observabilidade-212/`](../.specs/features/observabilidade-212/) |
| RM-26 | LGPD pronto para o go-live: textos finais ligados ao sistema, termo de imagem à parte e encarregado por clínica ([ADR-030](./adr/030-textos-lgpd-ligados-sem-revisao-juridica.md)); retenção em dias inteiros, prazos numa fonte só e retenção da trilha de auditoria ([ADR-031](./adr/031-retencao-em-dias-inteiros-e-fonte-unica.md)); Google Agenda só com iniciais e reescrita dos eventos antigos ([ADR-020](./adr/020-evento-do-google-agenda-so-com-iniciais.md)) | cumprir a LGPD antes de receber o primeiro paciente real; **revisão jurídica, art. 33 (Resend/Google) e ato da ANPD seguem pendentes** ([#376](https://github.com/KalleoPinheiro/estomasystech/issues/376)) | entregue | [#216](https://github.com/KalleoPinheiro/estomasystech/issues/216), [#323](https://github.com/KalleoPinheiro/estomasystech/issues/323), [#217](https://github.com/KalleoPinheiro/estomasystech/issues/217), [#339](https://github.com/KalleoPinheiro/estomasystech/issues/339) | [`lgpd-go-live/`](../.specs/features/lgpd-go-live/), [handoff](../.specs/archive/handoff-2026.md) |
| RM-27 | Responsável e paciente menor no portal: responsável acessa em nome do paciente, com evidência ([ADR-027](./adr/027-responsavel-acessa-portal-em-nome-do-paciente.md)); paciente encerra o acesso dele e o responsável é avisado por e-mail ([ADR-028](./adr/028-paciente-encerra-acesso-do-responsavel.md)); menor só pelo representante legal, que assina os termos, pede cópia e correção e cuida do parceiro; aceite dele vence 90 dias depois dos 18 ([ADR-032](./adr/032-paciente-menor-no-portal-pelo-representante-legal.md), [ADR-033](./adr/033-direitos-do-menor-pelo-representante-e-prazo-do-aceite.md)) | atender criança, idoso e quem depende de cuidador sem abrir mão do consentimento válido | entregue | [#329](https://github.com/KalleoPinheiro/estomasystech/issues/329), [#351](https://github.com/KalleoPinheiro/estomasystech/issues/351), [#354](https://github.com/KalleoPinheiro/estomasystech/issues/354), [#371](https://github.com/KalleoPinheiro/estomasystech/issues/371), [#372](https://github.com/KalleoPinheiro/estomasystech/issues/372), [#375](https://github.com/KalleoPinheiro/estomasystech/issues/375) | [`responsavel-e-menor-no-portal/`](../.specs/features/responsavel-e-menor-no-portal/), [handoff](../.specs/archive/handoff-2026.md) |
| RM-28 | Recibo para o IRPF com CPF do paciente/pagador cifrado e CNPJ do prestador ([ADR-025](./adr/025-cpf-no-recibo-e-protecao.md)); CNPJ antigo com dígito inválido marcado para correção e recibo bloqueado enquanto durar ([ADR-029](./adr/029-cnpj-antigo-invalido-marcado-para-correcao.md)) | paciente deduz a consulta no IRPF sem a clínica inventar dado | entregue | [#326](https://github.com/KalleoPinheiro/estomasystech/issues/326), [#248](https://github.com/KalleoPinheiro/estomasystech/issues/248), [#355](https://github.com/KalleoPinheiro/estomasystech/issues/355), [#358](https://github.com/KalleoPinheiro/estomasystech/issues/358) | [`recibo-irpf-e-cnpj/`](../.specs/features/recibo-irpf-e-cnpj/), [handoff](../.specs/archive/handoff-2026.md) |
| RM-29 | Baseline de carga com seed e medição, `/slots` do portal e job de lembretes lendo em lote, teto atômico de consultas e fotos do portal | saber o limite antes do go-live e não ficar perto dele ([`performance-baseline.md`](./engineering/performance-baseline.md)) | entregue | [#222](https://github.com/KalleoPinheiro/estomasystech/issues/222), [#360](https://github.com/KalleoPinheiro/estomasystech/issues/360), [#361](https://github.com/KalleoPinheiro/estomasystech/issues/361), [#363](https://github.com/KalleoPinheiro/estomasystech/issues/363) | [`baseline-de-carga/`](../.specs/features/baseline-de-carga/), [handoff](../.specs/archive/handoff-2026.md) |
| RM-30 | Autenticação sem modo aberto (`ESTOMASYSTECH_ALLOW_OPEN_MODE` removida) e gateway da Meta removido do código (o RM-14 segue especificado) | nenhum caminho sem autenticação e nenhum código morto com dado de saúde | entregue | [#327](https://github.com/KalleoPinheiro/estomasystech/issues/327), [#328](https://github.com/KalleoPinheiro/estomasystech/issues/328) | [`sem-modo-aberto-e-sem-meta/`](../.specs/features/sem-modo-aberto-e-sem-meta/), [handoff](../.specs/archive/handoff-2026.md) |
| RM-31 | Go-live em produção: app no ar na Hetzner via Coolify (Dockerfile + PostgreSQL 18, Traefik único, Scheduled Tasks, deploy manual) ([ADR-036](./adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md), [ADR-037](./adr/037-postgres-18-em-producao-e-alinhamento-do-dev.md), [ADR-038](./adr/038-scheduled-tasks-do-coolify-no-lugar-do-crontab.md), [ADR-039](./adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md)) | operar o sistema com dado de saúde; **paciente real só depois de backup cifrado (ADR-018), backup das fotos e art. 33 (#376); operação pendente na #381** | entregue | [#206](https://github.com/KalleoPinheiro/estomasystech/issues/206), [#381](https://github.com/KalleoPinheiro/estomasystech/issues/381) | [`runbook-producao-vps/`](../.specs/features/runbook-producao-vps/), [runbook](./engineering/producao.md) |

As seções por fase abaixo são o detalhe (L2) — escopo, decisões pendentes e critérios de cada uma.

### Registro de entrega

Cada fase entregue passou por: commits atômicos por task, gates verdes (`npm test`, `npm run lint`,
`npm run build`) e **validação independente** por um Verifier que não escreveu o código — com
checagem ancorada na spec (evidência `file:line` por critério de aceite) e sensor de discriminação
(mutações injetadas em estado descartável para provar que os testes detectam regressão).

O ciclo fix→re-verify foi exercido de verdade: a Fase 2 reprovou por um mutante sobrevivente no ramo
anti-corrida do estoque e a Fase 3 reprovou por cinco lacunas (entre elas `waitingHours` que passava
com valor fixo e a validade de pacote inalcançável pela interface). Ambas foram corrigidas e
re-verificadas. A Fase 4 passou de primeira (7/7 mutantes mortos), com três achados menores
corrigidos em seguida — inclusive a causa-raiz de um erro de tipo que escapava do gate: `npm run
build` não verifica `tests/**`, então o projeto ganhou `npm run typecheck` (`tsc --noEmit`).

**Gate recomendado antes de merge:** `npm run typecheck && npm run lint && npm run check:sv && npm run test:coverage && npm run build` — lista canônica e atual em `AGENTS.md` § Commands.

> `npm run lint` é `biome check` desde a migração de ESLint para Biome (issue #107) e propaga o exit code real. Nota histórica da era ESLint (issues #48/#49): o ruído antes observado num ambiente de sessão de agente vinha de `.claude/worktrees/**` — checkouts aninhados de sessões paralelas escapando do `globalIgnores` do antigo `eslint.config.mjs` — corrigido (AD-021 em `.specs/STATE.md`), não de um wrapper mascarando o exit code. O `biome.json` atual mantém `.claude/worktrees` fora de `files.includes`.

---

## Fase 1 — Hardening de segurança (entregue)

Fecha as brechas de maior risco com mudanças cirúrgicas, sem depender de decisão de negócio.

| Item | Origem na análise | Severidade |
|------|-------------------|------------|
| Guard de sessão unificado (`requireRole`) nas rotas do portal | UX/DX — boilerplate repetido, furo de escopo por esquecimento | Baixa (DX) / preventiva (seg.) |
| Revogação de sessão de conta staff desativada (deny-list com cache TTL no proxy) | Segurança — sessão stateless sobrevive à desativação da conta | Alta |
| Remoção de metadados EXIF/XMP de fotos no ingest (JPEG/PNG/WebP, sem dependência nova) | Segurança/LGPD — GPS da casa do paciente em foto de ferida | Alta |
| Cadeia `x-forwarded-for` confiável no rate limit (`TRUSTED_PROXY_HOPS`) | Segurança — chave de rate limit forjável | Média |
| Comparação em tempo constante no `x-cron-secret` + aviso de uso da senha master | Segurança — higiene de credenciais | Média |
| Auditoria write-ahead para exportação LGPD e exclusão de foto | Segurança — trilha não pode ser best-effort em ação crítica | Baixa |

**Fora desta fase (consciente):** RBAC granular de staff (recepção/clínico/financeiro) exige
matriz de permissões definida pelo negócio → Fase 6. A revogação de sessão usa semântica de
deny-list (só bloqueia conta que **existe e está inativa**) para não quebrar login Google
(allowlist sem linha em `user_accounts`) nem sessões E2E forjadas.

## Fase 2 — Consistência transacional e performance (entregue)

| Item | Origem na análise | Severidade |
|------|-------------------|------------|
| Unit of Work transacional (P1 documentado no projeto): `CompleteAppointment` (consulta→fatura→pacote→kit) numa transação Drizzle | Performance/correção — padrão idempotente-reparador compensa a falta de transação | Média |
| Decremento de estoque atômico (`stock_qty = stock_qty - n WHERE stock_qty >= n`) | Correção — corrida entre checagem e baixa do kit | Média |
| Batch na fila de triagem (eliminar `findById` por condição) | Performance — N+1 destoando do padrão do projeto | Baixa |
| Cache de relatório mensal para meses encerrados (imutáveis) | Performance — recálculo integral a cada acesso | Baixa |

## Fase 3 — Compliance e UX clínico (entregue)

| Item | Origem na análise | Severidade |
|------|-------------------|------------|
| Gate de consentimento no envio remoto de foto (sem aceite vigente → bloqueio com mensagem clara) | Compliance — fluxo de imagem sem base legal registrada | Média |
| Fila de triagem enriquecida: idade da pendência + último score (PUSH/DET) da condição | UX — decidir "ok" vs "antecipar" sem abrir o prontuário | Média |
| Validade de pacotes de sessões (`expiresAt` opcional; expirado não consome) | Lacuna de requisito — pacote hoje vale para sempre | Média |

**Fora desta fase (consciente):** política de cancelamento tardio/taxa exige decisão de negócio
(janela, cobrança) → Fase 6/backlog.

## Fase 4 — Portal: auto-agendamento e recall (entregue)

Fecha o loop follow-up → agendamento sem intervenção da recepção.

| Item | Descrição |
|------|-----------|
| API de slots disponíveis | Grade configurada + conflito por profissional + gap mínimo, exposta ao paciente autenticado |
| Agendamento pelo portal | Paciente agenda retorno em procedimento ativo do catálogo, escopado à própria sessão |
| Recall com destino | Mensagem de recall aponta para o portal em vez de "ligue para a clínica" |
| Follow-up fecha sozinho | Agendamento originado de follow-up marca a pendência automaticamente |

## Fase 5 — Monetização e canal (planejada — backlog)

Exige escolhas do negócio antes de executar:

- **Lembretes por WhatsApp (templates, cadência de recall, escopo por empresa):** plano de ação
  em [`.specs/features/lembretes-whatsapp-templates-cadencia/spec.md`](../.specs/features/lembretes-whatsapp-templates-cadencia/spec.md)
  — corrige envio fora da janela de 24 h da Meta, recall diário sem fim e job cross-empresa.
  **Decisão pendente:** cadência do recall, templates aprovados e número por empresa (D1–D4).

- **Pagamento online (Pix/cartão):** novo port `PaymentGateway` (mesmo padrão de
  `EmailGateway`), fatura pendente gera link/QR no portal e no lembrete. **Decisão pendente:**
  qual PSP (Mercado Pago, Stripe, Asaas) e credenciais.
- **Relatório automático para o parceiro:** resumo periódico por marco clínico (ex.: queda de
  PUSH ≥ 3) enviado ao indicador. **Decisão pendente:** cadência e canal (email/WhatsApp).
- **Lista de espera (waitlist):** cancelamento oferece o slot via WhatsApp por ordem de chegada.
  **Decisão pendente:** regras de expiração da oferta.

## Fase 6 — Plataforma (parcialmente especificada)

- **RBAC granular de staff:** ~~decisão pendente~~ **especificado** em
  [`prd-fase-6.md`](./product/prd-fase-6.md) (P6.2) e [ADR-003](./adr/003-modelo-de-papeis-multi-empresa.md)
  — catálogo fechado de 6 papéis (Super Admin, Admin de Empresa, Atendente, Profissional, Patient,
  Partner), com hierarquia de cadastro e escopo por papel. Execução: issue
  [#20](https://github.com/KalleoPinheiro/estomasystech/issues/20) e tickets #28–#31.
- **Multi-tenancy fases 1–2 do ADR 001:** ~~executar antes que o schema cresça~~ **especificado**
  em [`prd-fase-6.md`](./product/prd-fase-6.md) (P6.1) — Fase 1 (`clinics` + `clinic_id`) e a parte de
  aplicação da Fase 2 (sessão + filtro por tenant); RLS completo segue como épico dedicado à parte.
  Execução: issue [#19](https://github.com/KalleoPinheiro/estomasystech/issues/19) e tickets #22–#27.
- **Sunset da senha master:** ~~flag `AUTH_MASTER_DISABLED` + comunicação~~ ~~especificado~~
  **entregue** — remoção completa (não flag) de `AUTH_PASSWORD`, do login via Google e de
  `GOOGLE_ALLOWED_EMAILS`, com convite e reset de senha por e-mail e bootstrap do primeiro
  Super Admin. Executa [ADR-004](./adr/004-remocao-google-oauth-autenticacao.md); spec em
  [`.specs/features/autenticacao-nativa/`](../.specs/features/autenticacao-nativa/spec.md).
  Issue [#21](https://github.com/KalleoPinheiro/estomasystech/issues/21) e tickets #32–#35.
- **Portal do Super Admin:** **entregue** (RM-20) — área `/plataforma` exclusiva do super_admin
  (único, criado só pelo bootstrap, sem acesso a dado clínico), com cadastro de clínicas e do
  primeiro `company_admin`, suspensão e reativação, segundo fator (TOTP + códigos de recuperação),
  recuperação de emergência por script e trilha de auditoria de plataforma. Decisões em
  [ADR-007](./adr/007-super-admin-operador-da-plataforma.md) a
  [ADR-010](./adr/010-trilha-de-auditoria-de-plataforma.md); discovery em
  [`.design/portal-super-admin.md`](../.design/portal-super-admin.md); verificação de cada bloco
  (B1–B7) em `.checks/b*-*.verified.md`. Issue [#214](https://github.com/KalleoPinheiro/estomasystech/issues/214)
  (PRs #234, #236–#241). Issue [#243](https://github.com/KalleoPinheiro/estomasystech/issues/243)
  **entregue** — criação de clínica e convite de admin gravam a auditoria na mesma transação da
  mutação (rollback se a auditoria falhar), substituindo o `recordAudit` fire-and-forget que essas
  duas rotas ainda usavam; spec em
  [`.specs/features/fix-243-audit-write-ahead-clinics/spec.md`](../.specs/features/fix-243-audit-write-ahead-clinics/spec.md).
  Pendências posteriores: #244–#253 e a retenção da trilha na #210.
- **Canal de e-mail por clínica:** **entregue** (RM-21) — a plataforma deixa de enviar e-mail em
  nome das clínicas: cada uma cadastra a própria chave em `/configuracoes` (tabela
  `clinic_channels`, chave cifrada pela chave de dados) e, sem canal, não envia — convite e
  redefinição voltam como link manual para quem os gerou. `RESEND_API_KEY` passa a ser opcional e
  só da plataforma. `/plataforma` ganha navegação, status do canal por clínica e a tela de
  importação de taxonomia. Decisão em [ADR-011](./adr/011-canal-de-comunicacao-por-clinica.md);
  discovery em [`.design/canal-por-clinica.md`](../.design/canal-por-clinica.md); tasks C1–C4 em
  `.tasks/c*.md` com verificação em `.checks/c*.verified.md`. Issues #264–#267 (PRs #268–#274);
  decisões posteriores do dono em AD-029 e AD-030 (`.specs/archive/decisions-2026.md`).
- **TISS/convênios:** operadora no paciente, guia por atendimento, relatório por operadora com
  série de scores como evidência. Ainda backlog, sem spec.
- **Paginação por cursor** nas listagens: ~~ainda backlog, sem spec~~ **entregue** para pacientes
  e faturas (API + UI) — issue [#75](https://github.com/KalleoPinheiro/estomasystech/issues/75), spec
  em [`.specs/features/paginacao-cursor-csp-nonce/`](../.specs/features/paginacao-cursor-csp-nonce/spec.md).
  Retornos (`follow-ups`) ficaram fora por não terem hoje uma listagem paginada na UI — só um
  widget de dashboard com teto fixo; aplicar o mesmo padrão quando essa tela existir.

---

## Correção de achados de auditoria (setembro 2026)

Triagem técnica de todos os docs do projeto (ADRs, auditorias de UX/design-system/segurança,
`.specs/STATE.md`, `.specs/LESSONS.md`) cruzada com o rastreador de issues — não é uma "Fase N"
nova (nenhum item envolve decisão de produto/negócio), por isso não ganha PRD, só o plano faseado
próprio: [`plano-correcao-achados-auditoria-2026-09.md`](./plano-correcao-achados-auditoria-2026-09.md),
issues [#57](https://github.com/KalleoPinheiro/estomasystech/issues/57)–[#77](https://github.com/KalleoPinheiro/estomasystech/issues/77).

## Rastreabilidade análise → fase

Todos os pontos da análise estão cobertos: cada item de segurança/performance/UX-DX mapeia para
as fases 1–3; os itens de produto mapeiam para as fases 4–6. Nada foi descartado — itens não
executáveis sem decisão de negócio estão explicitamente registrados como backlog com a decisão
pendente nomeada.

## Critérios de conclusão por fase

Uma fase só é considerada entregue quando: (1) todos os tasks da `tasks.md` têm commit atômico;
(2) gates verdes (`npm test`, `npm run lint`, `npm run build`); (3) o Verifier independente
reporta PASS em `.specs/features/<fase>/validation.md`.

## Contrato repo ↔ ferramenta de gestão

| Regra | Como |
| --- | --- |
| 1 linha `RM-NN` = 1 issue épica | título `[RM-NN] <Item>`, label `roadmap`, corpo linka esta seção |
| Sub-tarefas | sub-issues da épica no GitHub — nunca linhas novas aqui |
| Campos do GitHub Project | `Horizon` (Now/Next/Later/Entregue), `Status` (os 5 valores acima), `Quarter`, `Domain` (os 9 de [`domains/`](./domains/)) |
| Mudança de status | no PR que muda o estado: edita a linha aqui **e** o campo no Project |
| Jira / Linear | mesmo contrato: `RM-NN` no título do epic; o link do epic vai na coluna `issue` |
| Notion | só leitura (embed do Project); nunca fonte |
| Novo id | próximo número livre; ids não são reaproveitados, item abandonado vira `descartado` |
