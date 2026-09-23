# Plano de Evolução Faseado — VittaFlow

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

## Visão geral das fases

| Fase | Nome | Status | Spec |
|------|------|--------|------|
| 1 | Hardening de segurança | ✅ **Entregue** (Verifier PASS) | `.specs/features/fase-1-hardening-seguranca/` |
| 2 | Consistência transacional e performance | ✅ **Entregue** (PASS na iteração 1) | `.specs/features/fase-2-consistencia-performance/` |
| 3 | Compliance e UX clínico | ✅ **Entregue** (PASS na iteração 1) | `.specs/features/fase-3-compliance-ux-clinico/` |
| 4 | Portal: auto-agendamento e recall | ✅ **Entregue** (Verifier PASS) | `.specs/features/fase-4-portal-auto-agendamento/` |
| 5 | Monetização e canal | Backlog (depende de decisão de negócio) | seção 5 abaixo |
| 6 | Plataforma (RBAC fino, multi-tenancy, TISS) | RBAC, multi-tenancy Fases 1–2 e sunset da senha master: ✅ **Entregues** (Verifier PASS) — ver `.specs/features/{rbac-catalogo-papeis,fundacao-multi-tenancy,autenticacao-nativa}/`. TISS e paginação por cursor seguem backlog | `product/prd-fase-6.md`, seção 6 abaixo |

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

**Gate recomendado antes de merge:** `npm test && npm run typecheck && npm run lint && npm run check:sv && npm run build`.

> `npm run lint` (`npx eslint .`) propaga o exit code real e hoje sai limpo (issues #48/#49). O ruído antes observado num ambiente de sessão de agente vinha de `.claude/worktrees/**` — checkouts aninhados de sessões paralelas escapando do `globalIgnores` do `eslint.config.mjs` por falta de `**/` nos padrões — corrigido (AD-021 em `.specs/STATE.md`), não de um wrapper mascarando o exit code.

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
  `MessagingGateway`), fatura pendente gera link/QR no portal e no lembrete. **Decisão pendente:**
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
  [#20](https://github.com/KalleoPinheiro/vitta-flow/issues/20) e tickets #28–#31.
- **Multi-tenancy fases 1–2 do ADR 001:** ~~executar antes que o schema cresça~~ **especificado**
  em [`prd-fase-6.md`](./product/prd-fase-6.md) (P6.1) — Fase 1 (`clinics` + `clinic_id`) e a parte de
  aplicação da Fase 2 (sessão + filtro por tenant); RLS completo segue como épico dedicado à parte.
  Execução: issue [#19](https://github.com/KalleoPinheiro/vitta-flow/issues/19) e tickets #22–#27.
- **Sunset da senha master:** ~~flag `AUTH_MASTER_DISABLED` + comunicação~~ ~~especificado~~
  **entregue** — remoção completa (não flag) de `AUTH_PASSWORD`, do login via Google e de
  `GOOGLE_ALLOWED_EMAILS`, com convite e reset de senha por e-mail e bootstrap do primeiro
  Super Admin. Executa [ADR-004](./adr/004-remocao-google-oauth-autenticacao.md); spec em
  [`.specs/features/autenticacao-nativa/`](../.specs/features/autenticacao-nativa/spec.md).
  Issue [#21](https://github.com/KalleoPinheiro/vitta-flow/issues/21) e tickets #32–#35.
- **TISS/convênios:** operadora no paciente, guia por atendimento, relatório por operadora com
  série de scores como evidência. Ainda backlog, sem spec.
- **Paginação por cursor** nas listagens: ~~ainda backlog, sem spec~~ **entregue** para pacientes
  e faturas (API + UI) — issue [#75](https://github.com/KalleoPinheiro/vitta-flow/issues/75), spec
  em [`.specs/features/paginacao-cursor-csp-nonce/`](../.specs/features/paginacao-cursor-csp-nonce/spec.md).
  Retornos (`follow-ups`) ficaram fora por não terem hoje uma listagem paginada na UI — só um
  widget de dashboard com teto fixo; aplicar o mesmo padrão quando essa tela existir.

---

## Correção de achados de auditoria (setembro 2026)

Triagem técnica de todos os docs do projeto (ADRs, auditorias de UX/design-system/segurança,
`.specs/STATE.md`, `.specs/LESSONS.md`) cruzada com o rastreador de issues — não é uma "Fase N"
nova (nenhum item envolve decisão de produto/negócio), por isso não ganha PRD, só o plano faseado
próprio: [`plano-correcao-achados-auditoria-2026-09.md`](./plano-correcao-achados-auditoria-2026-09.md),
issues [#57](https://github.com/KalleoPinheiro/vitta-flow/issues/57)–[#77](https://github.com/KalleoPinheiro/vitta-flow/issues/77).

## Rastreabilidade análise → fase

Todos os pontos da análise estão cobertos: cada item de segurança/performance/UX-DX mapeia para
as fases 1–3; os itens de produto mapeiam para as fases 4–6. Nada foi descartado — itens não
executáveis sem decisão de negócio estão explicitamente registrados como backlog com a decisão
pendente nomeada.

## Critérios de conclusão por fase

Uma fase só é considerada entregue quando: (1) todos os tasks da `tasks.md` têm commit atômico;
(2) gates verdes (`npm test`, `npm run lint`, `npm run build`); (3) o Verifier independente
reporta PASS em `.specs/features/<fase>/validation.md`.
