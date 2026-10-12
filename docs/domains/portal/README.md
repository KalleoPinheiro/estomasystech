---
title: "Domínio: Portal do paciente e do parceiro"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
domain: portal
---

# Portal do paciente e do parceiro

## Resumo

Área própria (`/portal`, sem o menu da clínica) para dois papéis externos: o **paciente** vê os
próprios dados e agenda, cancela ou remarca sozinho; o **parceiro** vê só os pacientes que
indicou. O papel da sessão escolhe a visão.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Patient self-service`, `Partner`, `Waitlist`, `Consent Record`, `Partner Share Consent`, `Data Subject Request`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| POR-RN-01 | Paciente e parceiro recebem `403` na API da clínica e são redirecionados para `/portal` nas páginas | `src/proxy.ts` |
| POR-RN-02 | Rotas `/api/portal/*` revalidam o papel e escopam os dados pela sessão, no servidor | `src/app/api/portal/` |
| POR-RN-03 | Paciente cancela ou remarca só até o aviso da política (padrão 24 h); dentro dele, o portal manda falar com a clínica | `src/domain/scheduling/patient-self-service.ts` |
| POR-RN-04 | Remarcar mantém procedimento, preço, profissional e duração; volta a `scheduled` | idem |
| POR-RN-05 | Auto-agendamento usa a mesma regra de disponibilidade da equipe; sem profissional, só fechamentos da empresa se aplicam | `assert-slot-available.ts` |
| POR-RN-06 | Parceiro vê consultas e evolução dos indicados — sem financeiro e sem anamnese — **só com o consentimento do paciente** (POR-RN-11) e só dos últimos 24 meses (POR-RN-12) | `src/application/portal/get-partner-portal-data.ts` |
| POR-RN-07 | Paciente nunca se autocadastra: a conta é criada pela equipe | [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) |
| POR-RN-08 | O portal identifica o titular pelo **vínculo da conta** (`user_accounts.patient_id`/`partner_id`), nunca pelo e-mail do cadastro: conta ativa, do mesmo papel da sessão e vinculada a cadastro ativo; senão `404`. Corrigir ou reaproveitar o e-mail do cadastro não muda o que a conta vê | `src/application/portal/portal-identity.ts` ([#196](https://github.com/KalleoPinheiro/vitta-flow/issues/196)) |
| POR-RN-09 | Conta `patient` exige `patientId` e conta `partner` exige `partnerId` do cadastro na mesma empresa (`400` sem vínculo, com cadastro de outra empresa ou inexistente); um acesso por cadastro. O e-mail de login é livre (ex.: de quem cuida do paciente) e não acompanha correções do cadastro | `src/application/auth/create-account.ts`, `src/app/api/accounts/route.ts` |
| POR-RN-10 | Contas de portal existentes antes do vínculo foram ligadas pelo e-mail atual, na mesma empresa (migração `0040`); as que não casaram ficam sem acesso e aparecem em `npm run db:portal-orphans` | `drizzle/0040_portal-account-link.sql`, `scripts/report-portal-orphans.ts` |
| POR-RN-11 | O parceiro só vê consultas, condições e avaliações de um paciente indicado quando o paciente deu **consentimento específico e revogável** a ele (paciente × parceiro, texto vigente). Sem consentimento, revogado, de texto antigo ou dado a outro parceiro: só aparece se o paciente foi atendido (consulta realizada na janela). O paciente autoriza e revoga pelo portal; a equipe vê e revoga pela ficha, e não autoriza. Texto provisório `v0-placeholder` até o texto do jurídico ([#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216)) | `src/domain/consent/partner-share-consent.ts`, `src/application/partners/partner-share-consent.ts`, `src/lib/partner-share-consent-text.ts` ([#292](https://github.com/KalleoPinheiro/vitta-flow/issues/292)) |
| POR-RN-12 | Janela de 24 meses no portal do parceiro, como no do paciente: consultas que terminam na janela, avaliações registradas na janela e condições abertas na janela ou com avaliação nela | `src/application/portal/get-partner-portal-data.ts` ([#292](https://github.com/KalleoPinheiro/vitta-flow/issues/292)) |
| POR-RN-13 | O paciente baixa uma cópia dos próprios dados: o mesmo JSON da exportação LGPD da equipe (PRO-RN-11), só do titular da conta da sessão, sem escolher id. Sai com `Cache-Control: no-store` e como anexo; cada download grava `read`/`export` na auditoria **antes** de responder (#293) | `src/app/api/portal/patient/export/route.ts`, `src/application/patients/load-patient-data-export.ts` |
| POR-RN-14 | O paciente pede **correção cadastral** (descrição obrigatória) ou **eliminação/anonimização** (motivo opcional). É um pedido, não uma ação: nada muda no cadastro nem no prontuário. Um pedido pendente por tipo (`409` no segundo, garantido também por índice único parcial); abrir o pedido grava `create`/`data_request` na auditoria **antes** de gravar o pedido. O paciente vê os próprios pedidos, a situação e a justificativa da clínica (#293) | `src/app/api/portal/patient/data-requests/route.ts`, `src/domain/patient/data-subject-request.ts` |
| POR-RN-15 | A senha de paciente e parceiro segue a política da equipe (ACE-RN-41, ACE-RN-47): mínimo de 10 caracteres e fora da lista de senhas comuns, ao definir (convite), redefinir e trocar, com as mesmas mensagens. Senha antiga vale até a próxima troca | [ADR-016](../../adr/016-sessoes-do-admin-sem-2fa-e-senha-unica.md), `src/domain/auth/password-policy.ts` (#309) |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Próximas consultas, retornos, evolução, histórico e faturas | entregue | `/portal` (paciente) |
| Confirmar, cancelar e remarcar | entregue | `/portal` |
| Auto-agendamento e lista de espera | entregue | `/portal` |
| Envio de foto para monitoramento remoto e consentimento | entregue | `/portal` |
| Pacientes indicados | entregue | `/portal` (parceiro) |
| Consentimento para o parceiro indicador: autorizar e revogar | entregue | `/portal` (paciente), ficha `/pacientes/[id]` (equipe revoga) |
| Meus dados (LGPD): baixar a cópia dos próprios dados e pedir correção ou eliminação. O texto do aviso é **provisório** até o jurídico entregar o definitivo ([#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216)) | entregue | `/portal` ([#293](https://github.com/KalleoPinheiro/vitta-flow/issues/293)) |
| Uso no celular: sem scroll horizontal e alvo de toque ≥ 44x44px em 390 e 375px | entregue | `/portal` ([#127](https://github.com/KalleoPinheiro/vitta-flow/issues/127)) |

Specs de execução: `.specs/features/{fase-4-portal-auto-agendamento,login-portal-p0-p3-pontuais,direitos-titular-293}/`.

## Código

| Camada | Caminho |
| --- | --- |
| casos de uso | `src/application/portal/` |
| API | `src/app/api/portal/{me,patient,partner}/`, `src/app/api/patients/[id]/partner-consent/` (ficha) |
| UI | `src/app/portal/` |
| layout mobile | regras de toque e de grid da `@still-void/ui@3.4.0`; só o alvo de toque de link segue local (`.portal-shell` em `src/app/globals.css`, lacuna `touch-target-size` em [`still-void-gaps.md`](../../still-void-gaps.md)) |
| testes | `tests/application/`, `tests/api/{portal-identity,partner-share-consent-routes,data-subject-rights}.test.ts`, `e2e/{portal-paciente,portal-parceiro,portal-responsivo,portal-direitos-titular,layout-mobile-first}.spec.ts` |

## Decisões

- [ADR-002](../../adr/002-autorizacao-em-duas-camadas.md) — proxy + revalidação no handler
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — papéis `patient` e `partner`
