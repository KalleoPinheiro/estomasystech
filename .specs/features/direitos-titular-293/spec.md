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
| DT-09 | Descrição e justificativa **devem** ficar cifradas em repouso (PRO-RN-12) e entrar na recifragem. | `tests/infrastructure/clinical-field-encryption.test.ts`, `tests/infrastructure/reencrypt-clinical-data.test.ts` |
| DT-10 | Abrir e decidir **devem** ser write-ahead: a auditoria é gravada antes do pedido/decisão; sem trilha, nada é gravado nem enviado. Se a gravação falhar depois (corrida), fica na trilha a tentativa. | `tests/api/data-subject-rights.test.ts` (falha na auditoria) |
| DT-11 | Duas aberturas ou duas decisões simultâneas **não devem** passar juntas: índice único parcial (um pendente por titular e tipo) e update só de pedido pendente. | `tests/infrastructure/data-subject-request-repository.test.ts` |

## Decisões de escopo

| Decisão | Motivo |
| --- | --- |
| Reaproveitar a exportação existente | Carga extraída para `loadPatientDataExport` + `toPatientExportDto`; as duas rotas usam o mesmo código, então o conteúdo não diverge. |
| Aceitar não altera dado | A issue diz "pedidos que a clínica analisa". A correção é feita na ficha; a anonimização é da #294. |
| Texto do aviso provisório | Texto jurídico pendente na #216: `src/lib/data-rights-text.ts`, marcado como placeholder na tela. |
| Prazo de resposta, aviso ao Admin e destino do e-mail | Não decididos: ficam como perguntas abertas no PR, com a opção mais conservadora implementada (sem prazo automático, sem e-mail ao Admin, aviso no e-mail do cadastro). |

## Perguntas abertas para @KalleoPinheiro

Regras que a issue não fixou. Implementada a opção mais conservadora; trocar é ajuste pequeno.

1. **Prazo de resposta** ao pedido (LGPD art. 19 fala em 15 dias para a declaração completa): hoje não há prazo nem alerta; a fila mostra a data de envio, por ordem de chegada.
2. **Quem é avisado de pedido novo:** hoje ninguém por e-mail; o Admin vê a fila em "Pedidos do titular".
3. **Destino do aviso ao paciente:** e-mail do cadastro (o mesmo dos lembretes), não o de login do portal, que pode ser de quem cuida do paciente.
4. **Um pedido pendente por tipo** (`409` no segundo), descrição obrigatória só na correção, até 1000 caracteres.
5. **Justificativa obrigatória também no aceite** (a issue fala em "aceitar/recusar com justificativa").
6. **Aceitar não muda dado:** a correção é feita na ficha; a anonimização depende da #294.
7. **Cópia completa, sem a janela de 24 meses do portal**, incluindo as observações internas do cadastro, porque a decisão é "mesmo conteúdo da exportação LGPD".

## Continuação (#312) — respostas de @KalleoPinheiro em 2026-10-12

As perguntas 1 a 3 acima foram decididas; 4 a 7 foram mantidas como estão.

| ID | Requisito | Teste |
| --- | --- | --- |
| DT-12 | O pedido **deve** ter prazo de 15 dias corridos (LGPD, art. 19) a partir do recebimento, contado em dias de calendário no fuso `APP_TIMEZONE` (virada de dia da clínica). A fila **deve** mostrar o dia limite e os dias restantes e destacar o vencido. | `tests/domain/data-subject-request.test.ts`, `tests/pages/data-subject-rights-ui.test.tsx`, `tests/api/data-subject-rights.test.ts` |
| DT-13 | **Quando** o paciente abre um pedido, os Admins de Empresa ativos **devem** receber e-mail pelo canal da clínica com o aviso e o link da fila, **sem** o texto do pedido, o nome ou o e-mail do titular; falha no envio **não deve** desfazer a criação. | `tests/api/data-subject-rights.test.ts`, `tests/application/data-subject-requests.test.ts` |
| DT-14 | O job diário **deve** avisar os Admins uma vez por pedido pendente que vence em até `DATA_REQUEST_ALERT_DAYS` dias (padrão 3) ou venceu sem aviso, sem canal de e-mail nada é marcado. | `tests/application/alert-data-request-deadlines.test.ts`, `tests/api/reminders-run-data-request-deadlines.test.ts` |
| DT-15 | A resposta da clínica **deve** ir para o e-mail de login da conta do portal vinculada ao paciente, nunca para o do cadastro; sem conta ativa não há aviso. | `tests/api/data-subject-rights.test.ts` (cadastro e login diferentes), `tests/application/data-subject-requests.test.ts` |

### Decisões do #312

| Decisão | Motivo |
| --- | --- |
| Alerta de prazo dentro do cron de lembretes (`/api/reminders/run`) | O host já agenda esse cron uma vez por dia; uma rota nova exigiria novo segredo, entrada de crontab e atualização do guarda de rotas. O resumo ganha só um campo aditivo. |
| Antecedência de 3 dias, configurável por `DATA_REQUEST_ALERT_DAYS` (1 a 14) | Pergunta aberta da issue: o ponto de partida proposto nela. Valor inválido volta ao padrão em vez de derrubar o job. |
| Um alerta por pedido (`deadline_alerted_at`) e um e-mail por Admin com a contagem | Evita repetir o aviso todo dia; sem nome nem texto do pedido (dado de saúde fora do e-mail). O vencido segue destacado na fila. |
| Fuso da clínica = `APP_TIMEZONE` | Fuso por empresa continua decisão de produto em aberto (#205). |
| Sem conta de portal ativa, não envia a resposta e não cai no e-mail do cadastro | O e-mail do cadastro pode ser de outra pessoa; a resposta continua visível no portal. |
