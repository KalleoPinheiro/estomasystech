---
title: "Domínio: Equipe e parceiros"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
domain: equipe-parceiros
---

# Equipe e parceiros

## Resumo

Cadastro clínico dos profissionais (registro, comissão, horário semanal, ausências) e dos
parceiros que indicam pacientes. O cadastro clínico é separado da conta de login: um
profissional ou parceiro pode ter, opcionalmente, uma conta com o papel correspondente.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Professional`, `Partner`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| EQP-RN-01 | Profissional tem registro (conselho) e regra de comissão; só o Admin edita a regra | `src/domain/professional/professional.ts` |
| EQP-RN-02 | Horário semanal do profissional: janelas por dia sem sobreposição; com janelas, a consulta dele precisa caber numa delas | `professional_availability` |
| EQP-RN-03 | Ausência do profissional bloqueia só as consultas dele | `schedule_closures` |
| EQP-RN-04 | Parceiro: nome, e-mail, CRM, especialidade; o paciente guarda "Indicado por" | `src/domain/partner/partner.ts`, `src/application/patients/assert-valid-referrer.ts` |
| EQP-RN-05 | E-mail do parceiro é único **dentro da empresa**, não no banco inteiro: o mesmo médico pode ser parceiro de duas clínicas. Gravado em minúsculas, sem espaços. Duplicado na mesma empresa (cadastro ou edição, inclusive em corrida) responde 409 `Já existe parceiro com este e-mail`, sem citar outra empresa (#211) | índice `uq_partners_clinic_email` (migração `0046`), `src/application/partners/partner-email.ts` |
| EQP-RN-06 | Indicar um paciente não dá ao parceiro acesso ao dado clínico: ele só vê condições e avaliações com o consentimento do paciente para ele, nos últimos 24 meses ([POR-RN-11](../portal/README.md), [#292](https://github.com/KalleoPinheiro/vitta-flow/issues/292)). O consentimento é do par paciente × parceiro: trocar o "Indicado por" não leva a autorização junto | `src/domain/consent/partner-share-consent.ts`, tabela `partner_share_consents` (migração `0048`) |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Cadastro de profissionais, horário e ausências | entregue | `/profissionais` |
| Cadastro de parceiros e indicação | entregue | `/parceiros` |

Specs de execução: `.specs/features/diretorios-p0-p3-pontuais/`.

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{professional,partner}/` |
| casos de uso | `src/application/partners/` (inclui o consentimento para o parceiro) |
| API | `src/app/api/{professionals,partners}/` |
| UI | `src/app/(staff)/{profissionais,parceiros}/` |
| testes | `tests/domain/`, `e2e/equipe.spec.ts` |

## Decisões

- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — vínculo dinâmico do Profissional com pacientes
