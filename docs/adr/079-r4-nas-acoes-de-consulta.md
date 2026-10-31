---
title: "ADR 079 — R4 nas ações de consulta e série com paciente da empresa"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
related:
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/adr/078-gravacoes-da-agenda-em-server-actions.md
  - docs/domains/agenda/README.md
  - docs/domains/acesso/README.md
---

# ADR 079 — R4 nas ações de consulta e série com paciente da empresa

- **Data:** 2026-10-31
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issues [#603](https://github.com/KalleoPinheiro/estomasystech/issues/603) e [#605](https://github.com/KalleoPinheiro/estomasystech/issues/605)). Resolve a pergunta aberta do [ADR-078](078-gravacoes-da-agenda-em-server-actions.md).
- **Domínios afetados:** agenda, acesso.

## Contexto

Confirmar, concluir, cancelar, marcar falta e remarcar não aplicavam a R4: o Profissional agia sobre consulta de paciente sem vínculo com ele. Agendar com o `professionalId` de outro profissional concedia vínculo a quem não agendou. E a série semanal com paciente inexistente ou de outra empresa respondia sucesso com tudo pulado e ainda auditava o id alheio (#605).

## Decisão

1. **Cinco atos sobre a consulta** (confirmar, concluir, cancelar, falta, remarcar): consulta de outra empresa ou inexistente é `404` (o escopo de empresa não a enxerga); Profissional sem vínculo com o paciente é `403`, com a mensagem de `assertPatientLinkedForProfessionalWrite`. Os demais papéis passam. A guarda roda antes da transação: a tentativa negada não grava nem audita.
2. **Agendar, avulso ou série:** o Profissional só agenda no próprio `professionalId` (`403` com o de outro). `professionalId` ausente segue permitido. **Não** se exige vínculo prévio: é agendando que o Profissional ganha paciente novo, e essa regra de produto ninguém decidiu (pergunta aberta (PO), registrada na doc).
3. **Série confere o paciente antes das ocorrências** (`ScheduleAppointment.assertPatient`, também usado pelo agendamento avulso): inexistente ou de outra empresa é `404`, inativo é `400`. Contrato: `POST /api/appointments/recurring` com paciente inexistente deixa de ser `200` com tudo pulado e vira `404`. Série válida com tudo pulado por conflito segue sucesso.
4. **Um só lugar para a regra:** `src/lib/server/appointment-authorization.ts` (`authorizeAppointmentAct`, `assertProfessionalActsAsSelf`). A Server Action usa por `authorize:` do `defineAction`; a rota chama direto, como em `follow-up-resolution.ts` (#597).

## Alternativas

- **Exigir vínculo para agendar:** impediria o Profissional de pegar paciente novo; decisão de produto não tomada (regra 5).
- **Só não auditar série sem sessão criada:** esconderia o sintoma e manteria a série "bem-sucedida" para paciente alheio.

## Consequências

- Profissional sem vínculo deixa de operar consulta alheia pela tela e pela API.
- Cliente da rota de série que dependia do `200` com tudo pulado para paciente inexistente passa a receber `404`.
