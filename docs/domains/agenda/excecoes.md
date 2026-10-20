---
title: "Agenda — matriz de exceções"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
domain: agenda
related: [docs/adr/049-matriz-de-excecoes-por-dominio.md]
---

# Agenda — matriz de exceções

> **TL;DR:** para cada categoria de exceção, o caso da agenda e o teste que o prova. Teste citado que sumiu
> ou mudou de título quebra `tests/bdd/matriz-excecoes.test.ts`. Regras em [`README.md`](README.md).

| Categoria | Caso | Regra | Teste |
| --- | --- | --- | --- |
| entrada inválida | Consulta fora da grade (fim de semana) ao marcar ou remarcar | AGE-RN-01 | `tests/api/scheduling-catalog-routes-gaps.test.ts` › "Dado horário fora da grade (fim de semana), Quando PATCH reschedule, Então retorna 400" |
| entrada inválida | Horário dentro da pausa de almoço | AGE-RN-03 | `tests/application/schedule-availability.test.ts` › "Dado pausa de almoço na clínica, Quando agendar dentro dela, Então rejeita" |
| entrada inválida | Início igual ou depois do fim | AGE-RN-01 | `tests/domain/time-slot.test.ts` › "Dado início igual ou depois do fim, Quando criar, Então lança InvalidTimeSlotError" |
| entrada inválida | Entrada na lista de espera com janela maior que 180 dias ou datas inválidas | AGE-RN-08 | `tests/domain/waitlist-policy.test.ts` › "Dado %s, Quando criar, Então ValidationError" |
| entrada inválida | Profissional inativo ou inexistente ao marcar | AGE-RN-12 | `tests/api/appointment-professional-validation.test.ts` › "Dado profissional inativo, Quando POST /api/appointments, Então 400" |
| sem permissão | Atendente na configuração da grade | AGE-RN-13 | `tests/api/schedule-permissions-routes.test.ts` › "Dado Atendente, Quando GET /api/settings/schedule, Então 403 (rota de edição do Admin)" |
| sem permissão | Profissional cadastra ausência de colega ou remove feriado | AGE-RN-13 | `tests/api/schedule-permissions-routes.test.ts` › "Dado Profissional sem vínculo, Quando cadastra ausência, Então 403" ; `tests/api/schedule-permissions-routes.test.ts` › "Dado feriado e ausência de colega, Quando o Profissional remove, Então 403 e os dois ficam" |
| sem permissão | Profissional cria retorno ou fila para paciente sem vínculo | AGE-RN-17 | `tests/api/professional-write-and-packages-296.test.ts` › "Dado paciente sem vínculo, Então o Profissional recebe 403 e nada é gravado" |
| outra clínica | Consulta de outra empresa por id, lista ou confirmação | AGE-RN-02 | `tests/api/appointment-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando PATCH (confirm) em consulta da clínica B, Então 404" |
| outra clínica | Mesmo horário em duas empresas não conflita | AGE-RN-02 | `tests/api/appointment-overlap-per-clinic.test.ts` › "C1 mesmo horário sem profissional em duas empresas: ambas 200" |
| outra clínica | Profissional de outra empresa ao marcar consulta avulsa ou série | AGE-RN-12 | `tests/api/appointment-professional-validation.test.ts` › "Dado profissional de outra empresa, Quando POST /api/appointments/recurring, Então 404 e nada é criado" |
| outra clínica | Retorno e configuração da grade de outra empresa | AGE-RN-13 | `tests/api/followup-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando PATCH em retorno da clínica B, Então falha" ; `tests/api/schedule-settings-tenant-isolation.test.ts` › "Dada clínica sem configuração salva, Quando buscar, Então retorna default sem vazar configuração de outra clínica" |
| duplicidade | Mesmo horário e profissional na mesma empresa | AGE-RN-02 | `tests/api/appointment-overlap-per-clinic.test.ts` › "C2 mesmo horário sem profissional na mesma empresa: 409" |
| duplicidade | Repetir o pedido na lista de espera não duplica | AGE-RN-08 | `tests/application/waitlist-late-cancel.test.ts` › "Dado pedido válido, Quando adicionar, Então entra na fila; repetir o mesmo pedido não duplica" |
| duplicidade | Concluir de novo não duplica a fatura | AGE-RN-05 | `tests/application/appointments.test.ts` › "Dado consulta já com fatura, Quando concluir de novo após restaurar, Então não duplica fatura" |
| duplicidade | Paciente cancela de novo uma consulta já cancelada | AGE-RN-07 | `tests/api/portal-cancel-reschedule.test.ts` › "Dado consulta já cancelada pelo paciente, Quando cancelar de novo, Então 200 sem erro (idempotente)" |
| concorrência | Dois pedidos simultâneos para o mesmo horário | AGE-RN-02 | `tests/api/agenda-excecoes.test.ts` › "Dados dois pedidos simultâneos para o mesmo horário, Quando marcar, Então um é aceito e o outro recebe 409" |
| concorrência | A exclusão do banco rejeita sobreposição e folga menor que a mínima | AGE-RN-02 | `tests/infrastructure/drizzle-repositories.test.ts` › "Dado consulta ativa, Quando inserir com folga de 10min, Então banco rejeita; com 15min, aceita" |
| falha de integração | Falha ao sincronizar com o Google Agenda não impede a operação | AGE-RN-09 | `tests/lib/calendar-sync.test.ts` › "Dado a ação agendada falha, Quando a tarefa roda, Então não lança e loga no console" |
| falha de integração | Falha ao ler a credencial do Google | AGE-RN-09 | `tests/lib/calendar-sync.test.ts` › "Dada falha ao ler a credencial, Quando a tarefa roda, Então não lança e loga no console" |
| falha de integração | Falha ao apagar evento do Google de paciente anonimizado: o id fica e o job segue | AGE-RN-16 | `tests/application/run-retention.test.ts` › "Dada falha num evento, Quando roda, Então o id fica, o job segue e o resto é apagado (RES-06)" |
| estado terminal | Confirmar, concluir ou remarcar consulta cancelada | AGE-RN-04 | `tests/domain/appointment.test.ts` › "Dado consulta cancelada, Quando confirmar, Então lança InvalidStatusTransitionError" ; `tests/domain/appointment.test.ts` › "Dado consulta cancelada, Quando remarcar, Então lança InvalidStatusTransitionError" |
| estado terminal | Cancelar ou marcar falta em consulta concluída | AGE-RN-04 | `tests/api/api-flow.test.ts` › "Dado consulta concluída, Quando PATCH cancel, Então retorna 409" ; `tests/domain/appointment.test.ts` › "Dado consulta concluída, Quando marcar falta, Então lança InvalidStatusTransitionError" |
| estado terminal | Retorno concluído não é cancelado | AGE-RN-05 | `tests/application/followups.test.ts` › "Dado retorno já concluído, Quando tentar cancelar, Então lança InvalidStatusTransitionError (bloqueada)" |
| estado terminal | Entrada resolvida da lista de espera não aceita vaga nem resolve de novo | AGE-RN-08 | `tests/domain/waitlist-policy.test.ts` › "Dado entrada resolvida, Então não aceita mais vaga e não pode ser resolvida de novo" |
