---
title: "PRD — VittaFlow Fase 6: Plataforma (RBAC multi-empresa e autenticação nativa)"
status: living
audience: [po, stakeholder, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# PRD — VittaFlow Fase 6: Plataforma (RBAC multi-empresa e autenticação nativa)

- **Versão:** 1.0
- **Data:** 2026-08-30
- **Status:** Especificado — pronto para execução (ver issues no GitHub)
- **Antecessores:** [prd-fase-3.md](./prd-fase-3.md) (item O1.2, que deixou "permissões por papel
  clínico" fora de escopo, e O4.4, que só entregou a ADR de multi-tenancy);
  [plano-evolucao-faseado.md](../plano-evolucao-faseado.md) (Fase 6 — Plataforma, que listava RBAC
  granular, multi-tenancy Fases 1–2 e sunset da senha master como "decisão pendente")

---

## Visão

Fecha a "decisão pendente" que travava a Fase 6 desde a PRD-FASE-3: o VittaFlow tinha só 3 papéis
(`admin`/`partner`/`patient`), com `admin` monolítico dando acesso total a qualquer conta de
equipe, e nenhuma entidade "empresa" no banco. Esta fase decide e especifica a matriz de papéis, o
modelo de multi-empresa e a substituição do login por Google por autenticação nativa. As decisões
completas estão registradas nas ADRs 001 (atualizada), 002 (atualizada), 003 e 004
(`docs/adr/`); esta PRD consolida o problema/solução/critérios de aceite de cada peça e aponta para
as issues do GitHub onde a execução é rastreada.

Diferente das fases anteriores (uma "onda" = uma branch = um commit mergeado), esta fase é grande
demais para uma entrega atômica e foi quebrada em 3 specs sequenciadas, cada uma com seus próprios
tracer-bullet tickets — ver seção "Execução" de cada item abaixo.

---

## P6.1 — Fundação de multi-tenancy

**Problema:** O VittaFlow é single-tenant — um deploy, uma clínica, nenhuma tabela `clinics`, nem
forma de isolar dado entre empresas clientes diferentes. Sem isso, "Admin de Empresa" seria a
mesma coisa que "acesso total" (P6.2 não teria o que delimitar).

**Solução:** Tabela `clinics` + coluna `clinic_id` em toda tabela que guarda dado por clínica, com
backfill do tenant legado numa única migração. Sessão carrega `clinic_id`; repositórios filtram por
empresa na camada de aplicação (Row-Level Security do Postgres fica fora de escopo, adiada para um
épico dedicado). Papel de sistema (Super Admin, formalizado em P6.2) acessa qualquer empresa, com
todo acesso cross-empresa auditado.

**Critérios de aceite:**
- Nenhuma consulta a paciente, agendamento, profissional, procedimento, prontuário clínico,
  estoque, parceiro ou conta retorna dado de empresa diferente da sessão atual.
- E-mail de paciente, e-mail de conta de login e nome de procedimento passam a ser únicos por
  empresa, não globalmente.
- Acesso cross-empresa do papel de sistema gera evento de auditoria com a empresa acessada.
- Migração faz backfill de 100% das linhas existentes sem linha órfã.

**Execução:** spec [#19](https://github.com/KalleoPinheiro/vitta-flow/issues/19); tickets
[#22–#27](https://github.com/KalleoPinheiro/vitta-flow/issues/22) (M1–M6).

## P6.2 — Modelo de papéis (RBAC)

**Problema:** Fecha o item que a PRD-FASE-3 (O1.2) já tinha deixado documentado como fora de
escopo: "permissões por papel clínico (recepção sem SOAP) — exige matriz de permissão." O papel
`admin` monolítico dá acesso total a qualquer conta de equipe, e login por senha sempre atribui
`admin` independentemente do dono da conta.

**Solução:** Catálogo fechado de 6 papéis — Super Admin, Admin de Empresa, Atendente, Profissional,
Patient, Partner — com hierarquia fixa de quem cadastra quem (nenhum papel se auto-cadastra) e
escopo de dados por papel: Atendente só operacional (agenda + cadastro de paciente/parceiro), sem
dado clínico; Profissional escopado dinamicamente a pacientes com quem tem agendamento, nota de
evolução ou que ele mesmo cadastrou; Admin de Empresa com acesso total dentro da própria empresa
(podendo haver mais de um por empresa); Super Admin cross-empresa. Corrige o bug de "senha sempre
vira admin".

**Critérios de aceite:**
- Os 6 papéis do catálogo existem e a política de autorização os reconhece.
- Hierarquia de cadastro (Super Admin → Admin de Empresa e demais; Admin de Empresa → Profissional,
  Atendente, Patient, Partner e outro Admin de Empresa; Atendente e Profissional → Patient e
  Partner) é aplicada, com rejeição clara fora dela.
- Atendente recebe 403 em rota de dado clínico.
- Profissional só acessa paciente com quem tem vínculo (cadastro, agendamento ou nota de evolução);
  transferência de caso entre profissionais preserva o histórico de acesso de cada um.

**Execução:** spec [#20](https://github.com/KalleoPinheiro/vitta-flow/issues/20); tickets
[#28–#31](https://github.com/KalleoPinheiro/vitta-flow/issues/28) (R1–R4).

## P6.3 — Autenticação nativa (remoção do login via Google)

**Problema:** Duas fontes de autenticação conflitantes — senha (corrigida em P6.2) e Google OAuth
com allowlist de e-mail fixada em variável de ambiente global (`GOOGLE_ALLOWED_EMAILS`),
incompatível com papel/acesso por empresa. Paciente e Parceiro nunca tiveram senha própria: só
logavam via Google.

**Solução:** Remove o login via Google por completo (mantendo a sincronização de Google Calendar
como integração desacoplada, conectada por conta já autenticada). Toda conta autentica com senha
própria, definida por convite enviado por e-mail no cadastro, com reset self-service também por
e-mail. Remove a senha mestre de emergência (`AUTH_PASSWORD`); primeiro Super Admin nasce por
bootstrap dedicado. Realiza também o "sunset da senha master" que a Fase 1 já tinha só avisado
(`docs/plano-evolucao-faseado.md`, Fase 6).

**Critérios de aceite:**
- Toda conta nova recebe convite por e-mail para definir a própria senha.
- Reset de senha self-service funciona por e-mail, com token de expiração curta e uso único.
- Rota de login/callback do Google e `GOOGLE_ALLOWED_EMAILS` deixam de existir; `AUTH_PASSWORD`
  deixa de existir.
- Sincronização com Google Calendar continua funcionando, através de um fluxo de conexão
  independente do login.

**Execução:** spec [#21](https://github.com/KalleoPinheiro/vitta-flow/issues/21); tickets
[#32–#35](https://github.com/KalleoPinheiro/vitta-flow/issues/32) (A1–A4).

---

## Fora de escopo desta fase

- Row-Level Security do Postgres (Fase 2 completa da ADR-001) — épico dedicado à parte.
- Onboarding self-service de empresa, billing por assinatura, domínio custom (Fase 3 da ADR-001).
- Suporte a uma pessoa com conta em mais de uma empresa (1 conta = 1 empresa).
- RBAC configurável por empresa (o catálogo de papéis é fixo, não customizável).
- TISS/convênios e paginação por cursor — seguem como backlog da Fase 6
  (`docs/plano-evolucao-faseado.md`).

## Decisões registradas

- [ADR-001](../adr/001-multi-tenancy.md) — estratégia de multi-tenancy (atualizada: Fase 1 e parte
  da Fase 2 em andamento nesta fase).
- [ADR-002](../adr/002-autorizacao-em-duas-camadas.md) — autorização em duas camadas (atualizada:
  risco residual de escopo por paciente resolvido pela ADR-003).
- [ADR-003](../adr/003-modelo-de-papeis-multi-empresa.md) — modelo de papéis multi-empresa (nova).
- [ADR-004](../adr/004-remocao-google-oauth-autenticacao.md) — remoção do Google OAuth como
  autenticação (nova).
- Glossário de domínio atualizado em [CONTEXT.md](../../CONTEXT.md) (Clinic, Role, Account
  provisioning).

## Rastreabilidade

| Origem | Item | Resolução |
|---|---|---|
| PRD-FASE-3, O1.2 | "Fora de escopo: permissões por papel clínico (recepção sem SOAP) — exige matriz de permissão" | P6.2 |
| PRD-FASE-3, O4.4 | "Multi-tenant... não cabe em uma onda com responsabilidade. Entregável desta onda: ADR" | P6.1 executa a ADR |
| plano-evolucao-faseado.md, Fase 6 | "RBAC granular de staff... decisão pendente: a matriz em si" | P6.2 |
| plano-evolucao-faseado.md, Fase 6 | "Multi-tenancy fases 1–2 do ADR 001" | P6.1 |
| plano-evolucao-faseado.md, Fase 6 | "Sunset da senha master" | P6.3 |
