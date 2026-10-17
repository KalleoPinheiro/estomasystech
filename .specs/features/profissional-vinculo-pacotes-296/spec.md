---
title: Profissional — negar retorno/lista de espera sem vínculo e mostrar saldo de pacotes sem preço (#296)
type: spec
status: done
---

# Profissional: escrita sem vínculo e saldo de pacotes (#296) — Specification

## Problem Statement

Duas perguntas abertas de produto (AD-026, AD-027) foram respondidas por @KalleoPinheiro em
2026-10-11: o Profissional não cria retorno nem entrada na lista de espera para paciente sem
vínculo, e vê o nome do pacote e o saldo de sessões — sem preço — nos pacientes vinculados. A
lista de espera continua só com os pacientes vinculados (sem mudança).

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| PV-01 | **Quando** o Profissional faz `POST /api/follow-ups` ou `POST /api/waitlist` para paciente sem vínculo, o sistema **deve** responder `403` e não gravar nada. | `tests/api/professional-write-and-packages-296.test.ts` |
| PV-02 | **Quando** o paciente é vinculado, ambos os POSTs **devem** seguir criando; Admin e Atendente não mudam. | idem |
| PV-03 | `GET /api/patients/:id/packages` **deve** ser família `clinical` (Atendente `403`), exigir o vínculo R4 (Profissional sem vínculo `404`) e devolver nome do pacote, total, usadas, restantes, validade e situação. | idem, `tests/lib/route-family.test.ts` |
| PV-04 | O DTO dessa rota **não deve** ter nenhum campo monetário; o teste trava a lista exata de chaves. | idem |
| PV-05 | `GET /api/packages` (com preço) **deve** seguir `administrative`: o Profissional recebe `403`. | idem |
| PV-06 | A aba "Pacotes" **deve** aparecer para o Profissional, lendo a rota de saldo e sem exibir preço; o Admin segue com o preço. | `tests/pages/staff-paciente-detail.test.tsx`, `tests/pages/patient-record-role.test.tsx` |

## Fora de escopo

- Sem migração: nenhuma mudança de schema.
- Profissional vender ou editar pacote: segue só do Admin (`POST /api/packages`).
- Atendente continua sem a aba Pacotes (decisão de 2026-10-11 cobre só o Profissional).

## Perguntas abertas

Nenhuma.
