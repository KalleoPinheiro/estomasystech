---
title: "ADR 001 — Estratégia de Multi-Tenancy"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# ADR 001 — Estratégia de Multi-Tenancy

- **Status:** Aceito; Fase 1 e parte da Fase 2 em andamento
- **Data:** 2026-07-18
- **Contexto:** PRD Fase 3, Onda 4 (O4.4)

## Nota de status (2026-08-30)

A reforma do sistema de login/papéis ([ADR-003](./003-modelo-de-papeis-multi-empresa.md))
deu início à Fase 1 (tabela `clinics` + `clinic_id`) e a parte da Fase 2
(sessão carrega `clinic_id`, repositórios filtram por tenant na aplicação) —
antes do previsto, porque o papel "Admin de Empresa" só faz sentido com uma
empresa real para delimitar. Row-Level Security do Postgres (o restante da
Fase 2) permanece adiada para um épico dedicado, como este documento já
recomendava ("janela dedicada com a suíte de testes atual como rede de
proteção").

## Contexto

O VittaFlow é single-tenant: um deploy = uma clínica. A visão de plataforma ("maior
ferramenta de gestão de estomaterapia") exige atender N clínicas com isolamento de
dados, onboarding self-service e billing por assinatura. São ~25 tabelas hoje; cada
migração nova sem consciência de tenant aumenta o custo da transição.

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **A. Coluna `clinic_id` + RLS** | Um banco, operação simples, benchmark agregado trivial, custo marginal por tenant ~zero | Bug de filtro = vazamento entre clínicas (mitigado por RLS no Postgres); migrações tocam todos |
| B. Schema por tenant | Isolamento forte, backup por clínica | Migração × N schemas, conexões/cache por schema, benchmark difícil |
| C. Deploy por tenant (atual replicado) | Isolamento máximo, zero refactor | Custo fixo por clínica, frota de deploys, sem dado agregado — inviabiliza o item 23 (benchmark do setor) |

## Decisão

**Opção A — coluna `clinic_id` em todas as tabelas + Row-Level Security do Postgres.**

Razões: é a única que viabiliza o fosso competitivo de longo prazo (benchmark
anonimizado do setor) com custo operacional de um banco só; RLS dá defesa em
profundidade contra o principal risco (filtro esquecido na aplicação); o padrão da
indústria SaaS B2B nesse porte.

## Plano de migração incremental

1. **Fase 0 (concluída):** convenções abaixo passam a valer para todo código novo.
2. **Fase 1 (em andamento):** tabela `clinics`; `clinic_id NOT NULL DEFAULT '<tenant-legado>'` em
   todas as tabelas via migração única; backfill trivial (um tenant).
3. **Fase 2 (parcial, em andamento):** `clinic_id` na sessão (claim no token); repositórios recebem o tenant
   pelo construtor (o container monta por request) e filtram por ele na aplicação.
   RLS (`USING (clinic_id = current_setting('app.clinic_id'))` com `SET LOCAL`
   por transação) fica para um épico dedicado à parte — só o isolamento por
   aplicação entra agora.
4. **Fase 3:** onboarding self-service (cadastro de clínica, primeira conta admin
   sem intervenção manual), billing por assinatura, domínio custom. Até lá, toda
   empresa nova é criada manualmente pelo Super Admin (ADR-003).
5. **Fase 4:** dado agregado anonimizado (benchmark) sobre o mesmo banco.

## Convenções obrigatórias desde já (custo ~zero, evitam retrabalho)

- **Nada de estado global por clínica** em `globalThis` além de conexões (o cache do
  calendar gateway precisará de chave por tenant na Fase 2 — já documentado aqui).
- **Configuração por linha, não por env**: novas configurações de negócio vão em
  tabela (como `schedule_settings`), nunca em variável de ambiente — env é global do
  deploy, tabela vira por-tenant de graça.
- **Unicidades futuras compostas**: unique novo que hoje é global (ex.: email de
  paciente, nome de procedimento) deverá virar `(clinic_id, campo)` na Fase 1 — não
  criar unique novo sem anotar isso na migração. O e-mail de login
  (`user_accounts`) segue a mesma regra: único por `clinic_id`, não
  globalmente (ADR-003) — a mesma pessoa em duas empresas precisa de duas
  contas.
- **`SET LOCAL` sempre em transação** quando a Fase 2 chegar — pool compartilhado não
  pode vazar o setting entre requests.
- **Storage de fotos**: caminho passa a ser `uploads/<clinic_id>/condition-photos/…`
  na Fase 1 (mover é barato com um tenant).

## Consequências

- A Fase 1 e a parte de aplicação da Fase 2 (sessão + filtro por `clinic_id`)
  deixaram de ser um épico à parte e entraram junto da reforma de login/papéis
  (ADR-003) — o papel Admin de Empresa não tinha o que delimitar sem elas.
- RLS (o restante da Fase 2) continua sendo o item mais arriscado — toca
  praticamente todas as queries — e permanece adiado para uma janela dedicada,
  com a suíte de testes atual como rede de proteção, como já registrado acima.
- Até a Fase 3 (onboarding self-service), deploy por clínica não é mais o
  modelo comercial interino: o mesmo banco já passa a suportar múltiplas
  empresas, só sem self-service — toda empresa nova é criada manualmente pelo
  Super Admin.

## Relacionado

- [ADR-003: Modelo de papéis multi-empresa](./003-modelo-de-papeis-multi-empresa.md)
  — motivo pelo qual a Fase 1 e parte da Fase 2 começaram agora; usa `clinic_id`
  para delimitar todo papel exceto Super Admin.
- [ADR-004: Remoção do Google OAuth como autenticação](./004-remocao-google-oauth-autenticacao.md)
  — aplica a convenção "configuração por linha, não por env" descartando a
  allowlist `GOOGLE_ALLOWED_EMAILS`.
