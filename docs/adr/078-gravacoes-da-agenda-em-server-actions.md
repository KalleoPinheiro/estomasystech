---
title: "ADR 078 — Gravações da agenda em Server Actions: efeitos depois do commit e gancho de falha para o E2E"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
related:
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/adr/077-agenda-no-servidor-periodo-na-url.md
  - docs/domains/agenda/README.md
---

# ADR 078 — Gravações da agenda em Server Actions: efeitos depois do commit e gancho de falha para o E2E

- **Data:** 2026-10-25
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#551](https://github.com/KalleoPinheiro/estomasystech/issues/551), PR 2). Completa o [ADR-077](077-agenda-no-servidor-periodo-na-url.md) com as gravações.
- **Domínios afetados:** agenda.

## Contexto

As leituras da agenda já vêm do servidor (ADR-077). As gravações (agendar, série, remarcar, confirmar, cancelar, falta, concluir) ainda iam por `fetch('/api/appointments…')`, sem trilha de auditoria. O ADR-075 manda gravar e auditar na mesma transação.

## Decisão

1. **Sete Server Actions** em `src/app/(staff)/agenda/agenda-actions.ts`, todas por `defineAction`: `scheduleAppointment`, `scheduleRecurring`, `rescheduleAppointment`, `confirmAppointment`, `completeAppointment`, `cancelAppointment`, `markAppointmentNoShow`. O papel é o da matriz de `/api/appointments` (mesma da rota). Os schemas `zod` ficam em `src/lib/appointment-schemas.ts` e servem às rotas e às ações, sem duplicar.
2. **A consulta e o que depende dela gravam juntos com a auditoria**: o retorno de origem vira «agendado», a fatura e o consumo de pacote da conclusão, a taxa do cancelamento tardio. `TransactionScope` ganhou `professionals` (validar o profissional na mesma transação). Falhou a trilha, nada fica gravado e a mensagem de conflito/validação é a de sempre. Auditoria nova: `resourceType: appointment`, `patientId`, `detail` sem dado pessoal.
3. **Efeito best-effort fica DEPOIS do commit** (`afterCommit`): vínculo Profissional↔Paciente, sincronização com o Google Agenda, baixa do kit do procedimento e contagem de quem espera por vaga. Falha vira log e nunca desfaz a gravação. A baixa do kit não pode ir dentro da transação: ela lê a consulta concluída por outra conexão.
4. **As rotas `/api/appointments*` continuam** (API, integrações e testes de contrato); só a tela migrou. As rotas ainda não auditam; unificar é decisão à parte.
5. **Gancho de falha para o E2E** (`src/lib/server/test-faults.ts`): o navegador não consegue fazer uma leitura do servidor falhar. Com `ESTOMASYSTECH_E2E_FAULTS=1` (só nos `playwright*.config.ts`) e o cookie `e2e-fault=consultas,contagem`, a leitura nomeada lança. Sem a variável a função não faz nada.

## Alternativas

- **Tudo dentro da transação** (kit e Google): o Google seria chamado antes do commit e o kit enxergaria a consulta ainda não concluída.
- **Cookie de falha sempre ligado**: qualquer um falharia a própria leitura. Inofensivo, mas é superfície sem uso; a variável de ambiente a fecha.
- **Mock de rede no E2E**: não alcança o servidor.

## Consequências

- Toda gravação da agenda pela tela deixa trilha; antes não deixava.
- Pergunta aberta (PO): o Profissional pode confirmar/concluir consulta de paciente não vinculado? A rota nunca aplicou o R4 aqui; as ações mantêm a paridade.
