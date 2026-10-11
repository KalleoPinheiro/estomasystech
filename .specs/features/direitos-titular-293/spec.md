---
title: Direitos do titular no portal — cópia dos dados e pedidos de correção/eliminação (#293)
type: spec
status: done
---

# Direitos do titular (#293) — Specification

## Problem Statement

A exportação LGPD existe só para a equipe (`/api/patients/[id]/export`). O portal não oferece ao
paciente cópia dos próprios dados nem caminho para pedir correção ou eliminação (LGPD art. 18;
lacuna 5 da #216). Decisão de @KalleoPinheiro em 2026-10-11 (#216, item 3): o paciente **baixa**
a cópia; **correção e eliminação viram pedidos** que a clínica analisa, porque o prontuário tem
guarda legal de 20 anos.

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| DT-01 | **Quando** o paciente baixa a cópia, o sistema **deve** devolver o mesmo JSON da exportação da equipe, só do titular da conta da sessão, com `Cache-Control: no-store` e `Content-Disposition: attachment`. | `tests/api/data-subject-rights.test.ts` |
| DT-02 | Cada download **deve** gravar `read`/`export` na auditoria antes de responder. | idem |
| DT-03 | **Quando** a sessão não resolve um titular (sem conta vinculada), o sistema **deve** responder `404` sem anexo; sessão de equipe recebe `403`. | idem |
| DT-04 | **Quando** o paciente pede correção, a descrição **deve** ser obrigatória; na eliminação, opcional. Um pedido pendente por tipo (`409` no segundo). Abrir grava `create`/`data_request`. | idem, `tests/domain/data-subject-request.test.ts` |
| DT-05 | O paciente **deve** ver só os próprios pedidos, com situação e justificativa da clínica. | `tests/api/data-subject-rights.test.ts`, `tests/pages/data-subject-rights-ui.test.tsx` |
| DT-06 | A fila **deve** ser só do Admin de Empresa (família `administrative` + checagem no handler); Profissional e Atendente `403`; pedido de outra empresa não aparece e dá `404` ao decidir. | `tests/api/data-subject-rights.test.ts` |
| DT-07 | Aceitar ou recusar **deve** exigir justificativa, valer uma vez (`409` depois) e gravar `update`/`data_request`. | idem, domínio |
| DT-08 | **Quando** a clínica decide, o paciente **deve** ser avisado por e-mail no endereço do cadastro, sem conteúdo do pedido nem da justificativa; falha de envio não desfaz a decisão. | `tests/application/data-subject-requests.test.ts`, API |
| DT-09 | Descrição e justificativa **devem** ficar cifradas em repouso (PRO-RN-12) e entrar na recifragem. | `drizzle-data-subject-request-repository.ts`, `reencrypt-clinical-data.ts` |

## Decisões de escopo

| Decisão | Motivo |
| --- | --- |
| Reaproveitar a exportação existente | Carga extraída para `loadPatientDataExport` + `toPatientExportDto`; as duas rotas usam o mesmo código, então o conteúdo não diverge. |
| Aceitar não altera dado | A issue diz "pedidos que a clínica analisa". A correção é feita na ficha; a anonimização é da #294. |
| Texto do aviso provisório | Texto jurídico pendente na #216: `src/lib/data-rights-text.ts`, marcado como placeholder na tela. |
| Prazo de resposta, aviso ao Admin e destino do e-mail | Não decididos: ficam como perguntas abertas no PR, com a opção mais conservadora implementada (sem prazo automático, sem e-mail ao Admin, aviso no e-mail do cadastro). |
