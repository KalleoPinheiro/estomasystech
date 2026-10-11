---
title: Consentimento do paciente para o parceiro ver dado clínico, com janela de 24 meses (#292)
type: spec
status: done
---

# Consentimento para o parceiro (#292) — Specification

## Problem Statement

O portal do parceiro mostrava condições e avaliações de todo paciente que ele indicou, sem
consentimento específico do paciente e sem limite de tempo (#216, item 4). Decisão de
@KalleoPinheiro em 2026-10-11 (#216, item 2): o parceiro só vê dado clínico com
**consentimento específico e revogável** do paciente; sem ele, vê só que o paciente foi
atendido. O histórico visível tem **limite de 24 meses**, como no portal do paciente.

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| PSC-01 | O consentimento **deve** ser registrado por paciente × parceiro, append-only, com data, versão e hash do texto, IP e quem registrou (`patient` ou `staff`). | `tests/domain/partner-share-consent.test.ts`, `tests/infrastructure/partner-share-consent-repository.test.ts` |
| PSC-02 | **Enquanto** o paciente não tiver consentimento ativo para o parceiro, `GetPartnerPortalData` **deve** devolver o paciente sem consultas, condições e avaliações, só com `attended` (consulta realizada na janela). | `tests/application/partner-share-consent.test.ts` |
| PSC-03 | **Quando** houver consentimento ativo, `GetPartnerPortalData` **deve** devolver só consultas que terminam na janela de 24 meses, avaliações registradas na janela e condições abertas na janela ou com avaliação na janela. | idem |
| PSC-04 | Consentimento revogado, de texto antigo (hash diferente) ou dado a outro parceiro **não deve** valer. | idem, `tests/domain/partner-share-consent.test.ts` |
| PSC-05 | O paciente **deve** poder autorizar e revogar pelo portal; aceite repetido não grava outro registro. Paciente sem parceiro indicador ativo não vê o cartão (`GET` → `null`; `POST` → `404`). | `tests/api/partner-share-consent-routes.test.ts`, `tests/pages/partner-consent.test.tsx` |
| PSC-06 | A equipe **deve** poder ver o status e revogar pela ficha (`/api/patients/:id/partner-consent`, família clínica: Atendente recebe `403`; Profissional só com vínculo). A equipe **não** autoriza. | idem, `tests/api/professional-patient-scope-guard.test.ts` |
| PSC-07 | Aceite e revogação **devem** gerar evento de auditoria `partner-consent`. | `tests/api/partner-share-consent-routes.test.ts` |
| PSC-08 | O texto **deve** ser o placeholder versionado `v0-placeholder` até o texto do jurídico (#216). | `tests/lib/partner-share-consent-text.test.ts` |

## Decisões de escopo

| Decisão | Motivo |
| --- | --- |
| Tabela nova `partner_share_consents` (migração `0048`), não colunas em `consent_records` | O TCLE resolve status por paciente; misturar finalidades exigiria filtrar todo leitor atual do TCLE. Tabela vazia: o parceiro deixa de ver dado clínico até o paciente autorizar (falha fechado). |
| O consentimento vale para o "Indicado por" atual | O registro guarda o `partnerId`; trocar a indicação não leva a autorização junto. |
| "Atendido" = consulta `completed` dentro da janela de 24 meses | Sem consentimento, consulta e procedimento também ficam ocultos; o portal inteiro do parceiro respeita a mesma janela. |
| Texto fixo, sem nome do parceiro interpolado | Hash igual para todo paciente; o parceiro aparece no título do cartão e fica no registro. |
| Só o paciente autoriza | A issue fala em "paciente revoga pelo portal, a equipe pela ficha". Registrar autorização em papel pela equipe ficou como pergunta aberta no PR. |

## Fora do escopo

- Texto final do consentimento (#216, jurídico).
- Relatório automático para o parceiro (RM-15).
