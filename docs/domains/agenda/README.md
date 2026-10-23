---
title: "Domínio: Agenda"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
domain: agenda
---

# Agenda

## Resumo

Consultas da empresa: marcar, confirmar, concluir, remarcar, cancelar, registrar falta — sempre
dentro da grade de horário, sem conflito e respeitando ausências. Inclui recall de retornos,
lista de espera e política de cancelamento. Fronteira: o que a consulta gera de cobrança é do
[financeiro](../financeiro/README.md); o que o paciente faz no portal é do [portal](../portal/README.md).

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Appointment`, `Procedure`, `Follow-up`, `Schedule settings`, `Cancellation policy`, `Waitlist`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| AGE-RN-01 | Consulta só dentro da grade da empresa, na hora de parede de `APP_TIMEZONE` (padrão `America/Sao_Paulo`), nunca no fuso do processo; fora dela, `400` (#205) | `src/domain/scheduling/business-hours.ts`, `schedule-config.ts`, `src/domain/shared/time-zone.ts` |
| AGE-RN-02 | Folga mínima entre consultas (padrão 15 min, expandida para os dois lados); conflito dá `409`; cancelada/falta libera o horário. O conflito é **por empresa e profissional** — consultas de empresas diferentes nunca conflitam (#187) | `TimeSlot.expand`, trigger `endsAtBuffered`, constraint `appointments_no_overlap` (`clinic_id`, profissional, intervalo — migração `0038`) |
| AGE-RN-03 | Uma regra em todo lugar — grade → almoço → fechamentos → horário do profissional → folga | `src/application/appointments/assert-slot-available.ts` |
| AGE-RN-04 | Estados: `scheduled → confirmed → completed`, com desvios para `cancelled`/`no_show`; transição inválida é rejeitada | `src/domain/scheduling/appointment.ts` |
| AGE-RN-05 | Concluir gera fatura pendente (idempotente) e pode programar retorno em 7/15/30/60/90 dias | `src/application/appointments/complete-appointment.ts` |
| AGE-RN-06 | Fechamento da empresa bloqueia o dia; ausência do profissional bloqueia só ele; registrar fechamento nunca cancela consultas | `src/domain/scheduling/schedule-availability.ts` |
| AGE-RN-07 | Cancelamento a pedido do paciente dentro do aviso (padrão 24 h) é tardio; taxa opcional vira fatura pendente, nunca comissão | `cancellationPolicy`, `cancel-appointment-by-staff.ts` |
| AGE-RN-08 | Lista de espera: janela ≤ 180 dias, sem duplicar; o sistema nunca agenda sozinho | `src/domain/scheduling/waitlist.ts` |
| AGE-RN-09 | Falha do Google Calendar nunca impede a operação | `src/application/appointments/sync-appointment-calendar.ts` |
| AGE-RN-10 | Profissional vê em `GET /api/follow-ups` e `GET /api/waitlist` só os pacientes vinculados (R4, #186); os demais papéis veem a fila inteira da empresa | `src/lib/auth/clinical-resource-scope.ts` (`linkedPatientFilter`) |
| AGE-RN-11 | Agenda e lista de espera leem profissionais (`{ id, fullName, active }`) e procedimentos (`{ id, name, priceCents, durationMinutes, active }`) por `GET /api/options/*`, liberado a toda a equipe e sem comissão nem kit; o cadastro (`/api/professionals`, `/api/procedures`) continua só do Admin. Lista auxiliar que falha vira alerta no formulário, nunca campo escondido (#188) | `src/app/api/options/`, `src/app/(staff)/agenda/appointment-form.tsx` |
| AGE-RN-12 | Profissional informado ao marcar consulta (avulsa ou série) e ao registrar ausência precisa existir **na empresa** e estar **ativo**: de outra empresa ou inexistente dá `404`, inativo dá `400`. Na série, profissional inválido rejeita a série inteira (não vira ocorrência pulada) e nenhum vínculo R4 é criado. A remarcação não recebe profissional e mantém o da consulta (#219); se esse profissional foi inativado depois de marcar, a remarcação pela equipe é barrada (AGE-RN-20) | `src/application/scheduling/assert-active-professional.ts`, `schedule-appointment.ts`, `schedule-recurring-appointments.ts`, `CreateScheduleClosure` |
| AGE-RN-13 | Quem configura a agenda (#215): grade (dias, horário, folga), almoço e política/taxa de cancelamento tardio só o `company_admin` — `PUT /api/settings/schedule` é família `administrative` nas duas camadas e o handler repete a checagem (`403` "Apenas Admin de Empresa pode alterar a grade de horários"). A agenda de toda a equipe lê a grade em `GET /api/schedule-config` (`operational`). Feriado da clínica: Admin e Atendente. Ausência: Admin e Atendente para qualquer profissional; o Profissional só a própria (`professionalId` da sessão) — feriado, ausência de colega ou conta sem vínculo dão `403` "Profissional registra e remove só a própria ausência", no cadastro e na remoção, sem gravar nada | `src/lib/auth/route-family.ts`, `src/app/api/settings/schedule/route.ts`, `src/domain/scheduling/closure-permission.ts`, `src/application/scheduling/schedule-availability.ts` |
| AGE-RN-14 | Retenção da lista de espera (#294): entrada já resolvida (`scheduled`/`removed`) há mais de 2 anos (data da resolução; sem ela, a do cadastro) perde o paciente e a observação; procedimento, profissional, período, origem, status e datas ficam, e a entrada some das leituras da fila. Entrada `waiting` entra pela AGE-RN-15 | [spec](../../../.specs/features/retencao-anonimizacao/spec.md), `src/infrastructure/persistence/drizzle/drizzle-waitlist-repository.ts` |
| AGE-RN-15 | Fila expirada (#311): entrada `waiting` cujo período desejado terminou (último dia anterior a hoje, no fuso da aplicação) vira `expired` pelo job de retenção, com a resolução no fim do período; sai da fila de espera e dos horários vagos. Daí contam os 2 anos da AGE-RN-14 e ela é anonimizada como as resolvidas. Período vigente (último dia = hoje ou futuro) não expira | [spec](../../../.specs/features/retencao-restante/spec.md), `src/infrastructure/persistence/drizzle/drizzle-retention-repository.ts` |
| AGE-RN-16 | Google Agenda e retenção (#311): ao anonimizar o paciente, o job apaga no Google Agenda da clínica cada evento criado para as consultas dele e só então limpa `appointments.google_event_id` (nulo = feito). Falha é logada e o id fica: a próxima execução tenta de novo, sem interromper o job. Sem integração configurada nada é apagado nem limpo. Relaciona com a [#217](https://github.com/KalleoPinheiro/estomasystech/issues/217) | [spec](../../../.specs/features/retencao-restante/spec.md), `src/application/retention/run-retention.ts`, `src/application/ports/calendar-gateway.ts` (`purgeEvent`) |
| AGE-RN-17 | Profissional não cria retorno (`POST /api/follow-ups`) nem entrada na lista de espera (`POST /api/waitlist`) para paciente sem vínculo: `403` (AD-026, #296); com vínculo segue 201. A leitura de paciente sem vínculo continua `404` (AGE-RN-10) | `assertPatientLinkedForProfessionalWrite` em `src/lib/auth/professional-patient-scope.ts` |
| AGE-RN-18 | Evento no Google Agenda (#217): só iniciais do paciente (`Consulta · J.S.`), horário e link para a consulta no EstomaSysTech; sem nome completo, telefone, procedimento ou observações. Mesmo conteúdo na criação e na remarcação (corrige o título `Consulta remarcada` que apagava o paciente). O link `/agenda?consulta=<id>&em=<início>` abre o mês e os detalhes da consulta. Eventos anteriores são reescritos em lote pela AGE-RN-19 (ou na remarcação) | [integração](../../engineering/integrations/google-calendar.md#o-que-vai-para-o-google-217-age-rn-18), `src/application/appointments/sync-appointment-calendar.ts`, `src/domain/patient/initials.ts`, [ADR-020](../../adr/020-evento-do-google-agenda-so-com-iniciais.md) |
| AGE-RN-19 | Reescrita em lote dos eventos antigos (#339, [AD-037](../../../.specs/STATE.md)): `npm run calendar:minimize` troca título e descrição de **cada** consulta com `google_event_id` pelo conteúdo da AGE-RN-18 (só `patch`; **nunca apaga** evento), das mais recentes/futuras para as mais antigas, até 500 por empresa por execução. Idempotente: `appointments.calendar_minimized_at` marca o evento depois de reescrito (a criação e a remarcação também marcam), então reexecutar não toca no que está feito; falha de um evento não interrompe o lote e ele volta na execução seguinte. Cota do Google: rajadas de 10 com pausa de 1 s e backoff 2/4/8 s; cota que persiste encerra o lote. Sem `--confirmar` só conta. Auditoria por empresa com contagens (`calendar-minimization`), logs sem PII. Manual, nunca automático no deploy | [integração](../../engineering/integrations/google-calendar.md#reescrita-em-lote-dos-eventos-antigos-339-age-rn-19), [runbook](../../engineering/producao.md#72-reescrita-dos-eventos-antigos-do-google-agenda-339), `src/application/appointments/minimize-calendar-events.ts`, `scripts/minimize-calendar-events.ts` |
| AGE-RN-20 | Remarcar (`PATCH /api/appointments/[id]` com `action: reschedule`) consulta cujo profissional foi **inativado depois de marcar** → `400` "Profissional inativo: escolha outro profissional"; profissional que não existe mais na empresa → `404`; consulta sem profissional remarca normal. A validação roda antes da checagem de horário e nada é gravado. A equipe só tira a consulta do impasse trocando de profissional (cancelar e marcar de novo) ou reativando o cadastro. A remarcação **pelo portal** também é barrada, com mensagem de contato com a clínica (POR-RN-20) | [AD-040](../../../.specs/STATE.md), `src/application/appointments/reschedule-appointment.ts`, `tests/application/appointment-professional-validation.test.ts` (#297) |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Calendário mensal, nova consulta, ações por status, remarcação | entregue | `/agenda` |
| Visão semanal (#471): botão Mês/Semana/Dia no desktop (a visão Dia reaproveita a grade com uma só coluna, com navegação dia a dia); blocos do tamanho da duração do procedimento no horário real, consultas sobrepostas lado a lado, almoço sombreado, feriados e ausências; cancelada não ocupa horário (só um aviso na coluna). No mês, a cancelada não ocupa uma das 3 linhas do dia e "+N mais" abre a lista completa do dia. No celular segue o mês compacto | entregue | `/agenda`, `src/app/(staff)/agenda/week-view.tsx`, `week-layout.ts` |
| Seleção de paciente por busca (nome, e-mail ou telefone; 20 resultados) em nova consulta e lista de espera — sem teto de 100 pacientes (#197). Mesmo seletor no Faturamento (fatura avulsa e pacote) e no filtro da Auditoria | entregue | `src/components/patient-picker.tsx` |
| Agenda no celular (abaixo de 768px): mês compacto de 7 colunas com ponto no dia que tem consulta e, abaixo, a lista das consultas do dia escolhido (hoje por padrão); "Agendar neste dia" só em dia válido | entregue | `/agenda` (`mobile-month.tsx`) |
| Consultas recorrentes | entregue | `/agenda` |
| Grade, almoço, política de cancelamento, feriados e ausências | entregue | Configurações, Profissionais — Atendente e Profissional veem só "Feriados e ausências"; o Profissional, só com o próprio nome em "Quem" e "Remover" só nas próprias ausências (#215) |
| Lista de espera | entregue | `/agenda` → Lista de espera |
| Recall de retornos | entregue | dashboard, `/api/follow-ups` |
| Catálogo de procedimentos (preço, duração, kit) | entregue | `/procedimentos` |

Specs de execução: `.specs/features/{agenda-p1-p3-pontuais,catalogo-p0-p3-pontuais}/`; itens N6 8a–8c em `.specs/archive/handoff-2026.md`.

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{scheduling,followup,catalog}/` |
| casos de uso | `src/application/{appointments,scheduling,followups}/` |
| API | `src/app/api/{appointments,follow-ups,procedures,waitlist,settings,options,schedule-config}/` |
| UI | `src/app/(staff)/{agenda,procedimentos}/` |
| testes | `tests/domain/`, `tests/application/`, `tests/api/options-routes.test.ts`, `tests/api/schedule-permissions-routes.test.ts`, `e2e/{agenda,followup,lista-espera,feriados-ausencias,layout-mobile-first,papeis-atendente}.spec.ts` |
| exceções | [`excecoes.md`](excecoes.md) — matriz de casos de exceção e o teste de cada um |

## Decisões

- [ADR-001](../../adr/001-multi-tenancy.md) — grade e política por empresa (tabela, não env)
- Integração: [Google Calendar](../../engineering/integrations/google-calendar.md)
