---
title: "Domínio: Portal do paciente e do parceiro"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
domain: portal
---

# Portal do paciente e do parceiro

## Resumo

Área própria (`/portal`, sem o menu da clínica) para dois papéis externos: o **paciente** vê os
próprios dados e agenda, cancela ou remarca sozinho; o **parceiro** vê só os pacientes que
indicou. O papel da sessão escolhe a visão.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Patient self-service`, `Partner`, `Waitlist`, `Consent Record`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| POR-RN-01 | Paciente e parceiro recebem `403` na API da clínica e são redirecionados para `/portal` nas páginas | `src/proxy.ts` |
| POR-RN-02 | Rotas `/api/portal/*` revalidam o papel e escopam os dados pela sessão, no servidor | `src/app/api/portal/` |
| POR-RN-03 | Paciente cancela ou remarca só até o aviso da política (padrão 24 h); dentro dele, o portal manda falar com a clínica | `src/domain/scheduling/patient-self-service.ts` |
| POR-RN-04 | Remarcar mantém procedimento, preço, profissional e duração; volta a `scheduled` | idem |
| POR-RN-05 | Auto-agendamento usa a mesma regra de disponibilidade da equipe; sem profissional, só fechamentos da empresa se aplicam | `assert-slot-available.ts` |
| POR-RN-06 | Parceiro vê consultas e evolução dos indicados — sem financeiro e sem anamnese | `src/application/portal/get-partner-portal-data.ts` |
| POR-RN-07 | Paciente nunca se autocadastra: a conta é criada pela equipe | [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) |
| POR-RN-08 | O portal identifica o titular pelo **vínculo da conta** (`user_accounts.patient_id`/`partner_id`), nunca pelo e-mail do cadastro: conta ativa, do mesmo papel da sessão e vinculada a cadastro ativo; senão `404`. Corrigir ou reaproveitar o e-mail do cadastro não muda o que a conta vê | `src/application/portal/portal-identity.ts` ([#196](https://github.com/KalleoPinheiro/vitta-flow/issues/196)) |
| POR-RN-09 | Conta `patient` exige `patientId` e conta `partner` exige `partnerId` do cadastro na mesma empresa (`400` sem vínculo, com cadastro de outra empresa ou inexistente); um acesso por cadastro. O e-mail de login é livre (ex.: de quem cuida do paciente) e não acompanha correções do cadastro | `src/application/auth/create-account.ts`, `src/app/api/accounts/route.ts` |
| POR-RN-10 | Contas de portal existentes antes do vínculo foram ligadas pelo e-mail atual, na mesma empresa (migração `0040`); as que não casaram ficam sem acesso e aparecem em `npm run db:portal-orphans` | `drizzle/0040_portal-account-link.sql`, `scripts/report-portal-orphans.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Próximas consultas, retornos, evolução, histórico e faturas | entregue | `/portal` (paciente) |
| Confirmar, cancelar e remarcar | entregue | `/portal` |
| Auto-agendamento e lista de espera | entregue | `/portal` |
| Envio de foto para monitoramento remoto e consentimento | entregue | `/portal` |
| Pacientes indicados | entregue | `/portal` (parceiro) |
| Uso no celular: sem scroll horizontal e alvo de toque ≥ 44x44px em 390 e 375px | entregue | `/portal` ([#127](https://github.com/KalleoPinheiro/vitta-flow/issues/127)) |

Specs de execução: `.specs/features/{fase-4-portal-auto-agendamento,login-portal-p0-p3-pontuais}/`.

## Código

| Camada | Caminho |
| --- | --- |
| casos de uso | `src/application/portal/` |
| API | `src/app/api/portal/{me,patient,partner}/` |
| UI | `src/app/portal/` |
| layout mobile | regras de toque e de grid da `@still-void/ui@3.4.0`; só o alvo de toque de link segue local (`.portal-shell` em `src/app/globals.css`, lacuna `touch-target-size` em [`still-void-gaps.md`](../../still-void-gaps.md)) |
| testes | `tests/application/`, `tests/api/portal-identity.test.ts`, `e2e/{portal-paciente,portal-parceiro,portal-responsivo,layout-mobile-first}.spec.ts` |

## Decisões

- [ADR-002](../../adr/002-autorizacao-em-duas-camadas.md) — proxy + revalidação no handler
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — papéis `patient` e `partner`
