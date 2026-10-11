---
title: "Domínio: Agenda"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
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
| AGE-RN-12 | Profissional informado ao marcar consulta (avulsa ou série) e ao registrar ausência precisa existir **na empresa** e estar **ativo**: de outra empresa ou inexistente dá `404`, inativo dá `400`. Na série, profissional inválido rejeita a série inteira (não vira ocorrência pulada) e nenhum vínculo R4 é criado. A remarcação não recebe profissional e mantém o da consulta (#219) | `src/application/scheduling/assert-active-professional.ts`, `schedule-appointment.ts`, `schedule-recurring-appointments.ts`, `CreateScheduleClosure` |
| AGE-RN-13 | Quem configura a agenda (#215): grade (dias, horário, folga), almoço e política/taxa de cancelamento tardio só o `company_admin` — `PUT /api/settings/schedule` é família `administrative` nas duas camadas e o handler repete a checagem (`403` "Apenas Admin de Empresa pode alterar a grade de horários"). A agenda de toda a equipe lê a grade em `GET /api/schedule-config` (`operational`). Feriado da clínica: Admin e Atendente. Ausência: Admin e Atendente para qualquer profissional; o Profissional só a própria (`professionalId` da sessão) — feriado, ausência de colega ou conta sem vínculo dão `403` "Profissional registra e remove só a própria ausência", no cadastro e na remoção, sem gravar nada | `src/lib/auth/route-family.ts`, `src/app/api/settings/schedule/route.ts`, `src/domain/scheduling/closure-permission.ts`, `src/application/scheduling/schedule-availability.ts` |
| AGE-RN-14 | Retenção da lista de espera (#294): entrada já resolvida (`scheduled`/`removed`) há mais de 2 anos (data da resolução; sem ela, a do cadastro) perde o paciente e a observação; procedimento, profissional, período, origem, status e datas ficam, e a entrada some das leituras da fila. Entrada ainda `waiting` não entra (pergunta aberta na spec) | [spec](../../../.specs/features/retencao-anonimizacao/spec.md), `src/infrastructure/persistence/drizzle/drizzle-waitlist-repository.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Calendário mensal, nova consulta, ações por status, remarcação | entregue | `/agenda` |
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

## Decisões

- [ADR-001](../../adr/001-multi-tenancy.md) — grade e política por empresa (tabela, não env)
- Integração: [Google Calendar](../../engineering/integrations/google-calendar.md)
