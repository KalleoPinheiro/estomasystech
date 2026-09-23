---
title: "API REST"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# API REST

> **Recorte:** as rotas centrais do núcleo clínico/operacional. A lista completa é a árvore
> `src/app/api/**/route.ts`; cada domínio em [`docs/domains/`](../domains/) aponta as suas.
> Toda rota exige sessão (exceto login, bootstrap, forgot/set password e o cron) e responde no
> envelope `{ success, data, error, meta? }`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/patients` | Listar (`?search=`) / cadastrar paciente |
| GET/PUT/PATCH | `/api/patients/:id` | Buscar / atualizar / ativar-desativar |
| GET/POST | `/api/appointments` | Listar por período (`?from=&to=`) / agendar |
| PATCH | `/api/appointments/:id` | `{action: confirm\|cancel\|no_show\|complete\|reschedule}` |
| GET/POST | `/api/invoices` | Listar (`?status=&from=&to=`) / emitir fatura |
| PATCH | `/api/invoices/:id` | `{action: pay, method}` ou `{action: cancel}` |
| GET | `/api/summary` | Resumo do mês (`?month=YYYY-MM`) para o dashboard |
| GET/PUT | `/api/patients/:id/anamnesis` | Buscar / criar-atualizar anamnese |
| GET/POST | `/api/patients/:id/evolutions` | Listar / registrar evolução SOAP (imutável) |
| GET/POST | `/api/patients/:id/conditions` | Listar / criar condição (estomia ou ferida) |
| PATCH | `/api/conditions/:id` | `{action: resolve}` — marcar condição resolvida |
| GET/POST | `/api/conditions/:id/assessments` | Listar / registrar avaliação seriada |
| GET/POST | `/api/supplies` | Listar (com flag estoque baixo) / cadastrar insumo |
| PUT | `/api/supplies/:id` | Atualizar insumo (nome, mínimo, preço, ativo) |
| GET/POST | `/api/supplies/:id/movements` | Histórico / registrar entrada-saída de estoque |
| GET/POST | `/api/follow-ups` | Listar retornos (`?status=`) / criar retorno manual |
| PATCH | `/api/follow-ups/:id` | `{status: done\|cancelled}` |
| GET | `/api/reports` | Relatório gerencial do mês (`?month=YYYY-MM`) |

`PATCH /api/appointments/:id` com `{action: complete}` aceita `followUpInDays` (7/15/30/60/90) para programar retorno automático.
