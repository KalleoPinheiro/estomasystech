---
title: Endurecimento pré-produção — X-Powered-By, profissional da consulta, 404 sem UUID, COOP/CORP (#219)
type: spec
status: done
---

# Endurecimento (#219) — Specification

## Problem Statement

Revisão pré-produção (#183) achou quatro pontos de higiene, P3: nenhum é explorável sozinho,
mas juntos aumentam a superfície. (1) Toda resposta anuncia `X-Powered-By: Next.js`. (2)
`ScheduleAppointment`, a série recorrente e a ausência aceitam `professionalId` sem conferir
empresa e status. A FK é global, então um id de outra empresa passa, e `ensureLinkBestEffort`
cria vínculo R4 com ele. (3) `NotFoundError` põe o UUID na mensagem que a UI mostra. (4) Faltam
`Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`.

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| H-01 | O app **não deve** enviar `X-Powered-By` (`poweredByHeader: false`). | `tests/next-config.test.ts` |
| H-02 | Toda rota **deve** responder com `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Resource-Policy: same-origin`. | `tests/next-config.test.ts` |
| H-03 | **Quando** a consulta (avulsa ou série) ou a ausência traz `professionalId` de outra empresa ou inexistente, o sistema **deve** responder `404` sem gravar nada nem criar vínculo. | `tests/application/appointment-professional-validation.test.ts`, `tests/api/appointment-professional-validation.test.ts` |
| H-04 | **Quando** o profissional informado está inativo, o sistema **deve** responder `400` sem gravar nada. | idem |
| H-05 | **Quando** a série recorrente tem profissional inválido, o sistema **deve** rejeitar a série inteira, sem transformar o erro em N ocorrências puladas. | idem |
| H-06 | A mensagem de `NotFoundError` **não deve** conter o id; o id fica em `entityId` e vai só para o log (`console.info` em `handleRequest`). | `tests/lib/api-response.test.ts`, `tests/lib/clinical-resource-scope.test.ts` |
| H-07 | O 404 do portal **não deve** usar o e-mail de login (`session.subject`) como `entityId`, porque ele iria para o log. | `tests/application/portal-identity-not-found.test.ts` |

## Decisões de escopo

| Decisão | Motivo |
| --- | --- |
| A remarcação fica como está | `RescheduleAppointment` não recebe `professionalId`, mantém o da consulta (validado ao marcar). Barrar remarcação quando o profissional foi inativado depois mudaria um fluxo válido de hoje: fica como pergunta aberta no PR. |
| `SetProfessionalHours` continua só checando existência | Fora do texto da issue; configurar grade de profissional inativo não cria consulta nem vínculo. |
| Validação opcional no construtor de `ScheduleAppointment` (5º argumento) | As três rotas de produção que aceitam `professionalId` passam o repositório; o portal nunca envia profissional. O teste de API garante a ligação nas rotas. |
| CORP `same-origin` em toda resposta | Fotos e demais recursos só são consumidos pelo próprio app; o único `window.open` já usa `noopener`, então COOP não quebra fluxo. |
