---
title: Observabilidade para produção — health, request-id, GlitchTip e alertas (#212)
type: spec
status: done
---

# Observabilidade para produção (#212) — Specification

## Problem Statement

Sem endpoint de saúde, sem log estruturado, sem captura de erros e sem alerta, falhas em produção
(banco, e-mail, cron, 5xx) só apareciam quando um usuário reclamava (#212, origem #183).

Decisões de @KalleoPinheiro (2026-10-11, comentário da issue):

| Tema | Decisão |
| --- | --- |
| Hospedagem | VPS Hetzner, `docker compose`, uma réplica (#206) |
| Health | `/api/health` (liveness, sem dependência) e `/api/health/ready` (checa o Postgres) separados |
| Logs | JSON estruturado com request-id propagado (cabeçalho de entrada/saída e em cada linha) |
| Erros | GlitchTip self-hosted no compose (SDK compatível com Sentry), scrubbing de PII obrigatório, sem DSN = no-op |
| Alertas | e-mail ao operador pelo canal da plataforma (ADR-011): 5xx acima do limiar, `ready` falhando, lembretes sem rodar em 26 h, `delivered=false` recorrente |

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| OBS-01 | `GET /api/health` **deve** responder `200` `{ status: 'ok' }` sem I/O: o proxy a deixa passar sem rate limit (que conta no banco) e sem sessão. | `tests/api/health-route.test.ts`, `tests/proxy-request-id.test.ts` |
| OBS-02 | `GET /api/health/ready` **deve** responder `200` quando `select 1` funciona e toda migração de `drizzle/meta/_journal.json` está em `drizzle.__drizzle_migrations`; senão `503`. O corpo traz só `database` (`ok`/`fail`) e `migrations` (`ok`/`pending`/`unknown`) — nada de mensagem do driver, host ou string de conexão. Sem resposta em 3 s conta como falha. | `tests/api/health-route.test.ts`, `tests/infrastructure/readiness.test.ts` |
| OBS-03 | O `HEALTHCHECK` do `Dockerfile` e o `healthcheck` do `docker-compose.yml` **devem** usar `/api/health`: banco fora do ar não marca o container como doente. | `tests/infrastructure/deploy-config.test.ts` (C10, C10b), `scripts/docker-smoke.sh` |
| OBS-04 | Toda resposta que passa pelo proxy **deve** trazer `x-request-id`. Um `x-request-id` de entrada só é aceito se casar `^[A-Za-z0-9._:-]{8,128}$`; senão o proxy gera um UUID. O id vai ao handler no cabeçalho da requisição. | `tests/proxy-request-id.test.ts`, `tests/lib/request-id.test.ts` |
| OBS-05 | Toda linha de log de `src/` **deve** ser um objeto JSON com `time`, `level`, `msg` e, durante uma requisição, `requestId`. `console.*` só existe em `src/lib/observability/logger.ts`. | `tests/lib/logger.test.ts`, `tests/lib/log-error-architecture.test.ts` |
| OBS-06 | O erro logado **deve** sair sem query/parâmetros SQL (#202), sem a 1ª linha do stack, e com e-mail e número de 8+ dígitos (CPF, CNPJ, telefone, data) trocados por marcador. | `tests/lib/log-error.test.ts`, `tests/lib/redact.test.ts` |
| OBS-07 | **Enquanto** `GLITCHTIP_DSN` estiver vazio, nenhum evento **deve** sair do processo e o app funciona igual. DSN malformado também vira no-op. | `tests/lib/error-tracker.test.ts` |
| OBS-08 | **Quando** houver DSN, cada `logError` **deve** enviar um evento montado só com: contexto, tipo, mensagem já limpa, frames do stack e as tags `requestId`/`code`/`table`. Nunca `request`, `user`, cookies, cabeçalhos, corpo, breadcrumbs, `extra`, `contexts` ou `server_name`; o `beforeSend` remove esses campos se algo os preencher. | idem |
| OBS-09 | Erro não tratado de handler, página ou action (`onRequestError`) **deve** ir ao log e ao GlitchTip com o `requestId`, o método e a rota do arquivo (não o caminho com ids), e contar como 5xx. | `tests/lib/request-error.test.ts` |
| OBS-10 | O job de lembretes **deve** gravar a hora da execução em `job_runs` ao terminar; falha ao gravar não muda a resposta. A migração `0051` cria a linha dos lembretes com a hora dela. | `tests/api/reminders-run.test.ts`, `tests/infrastructure/job-run-repository.test.ts` |
| OBS-11 | `POST /api/alerts/run` (ou `GET` com `Bearer`), com `CRON_SECRET`, **deve** avaliar os quatro alertas e mandar um e-mail por alerta ativo a `ALERT_EMAIL_TO` pelo canal da plataforma. Sem `CRON_SECRET`, `503`; segredo errado, `401`. | `tests/api/alerts-run.test.ts`, `tests/application/evaluate-alerts.test.ts` |
| OBS-12 | O mesmo alerta **não deve** sair de novo antes de 60 min enquanto continuar ativo (estado em memória do processo). Envio que falhou não conta. | `tests/application/evaluate-alerts.test.ts` |
| OBS-13 | **Se** não houver `ALERT_EMAIL_TO` ou canal da plataforma, o alerta ativo **deve** virar linha `error` no log (e evento no GlitchTip) e a resposta traz `channel: 'none'`. | idem |
| OBS-14 | O e-mail de alerta **deve** levar só o nome do alerta, a medida, o limiar, a URL da instância e a hora — nenhum dado de paciente, conta ou clínica. | idem |

## Alertas

| Alerta | Ativo quando | Fonte |
| --- | --- | --- |
| `readiness` | `/api/health/ready` falharia | mesma checagem da rota |
| `server-errors` | ≥ `ALERT_5XX_THRESHOLD` (padrão 10) erros 500 nos últimos 15 min | `handleRequest` (500) e `onRequestError` |
| `reminders-stale` | última execução dos lembretes há mais de 26 h (ou nenhuma) | `job_runs` |
| `delivery-failures` | ≥ `ALERT_DELIVERY_FAILURE_THRESHOLD` (padrão 3) falhas de envio de e-mail nos últimos 15 min | envio de convite/reset (`IssueAuthToken`) e de lembrete |

"Falha de entrega" é o envio que o provedor recusou ou que deu erro. Canal desativado (clínica sem
canal, `delivered: false` por falta de credencial) é estado configurado, não falha, e não conta.

Os contadores de 5xx e de entrega ficam em memória (uma réplica, #206): reinício do processo os
zera. O cron do host chama a rota a cada 5 min; se o app estiver fora do ar, o `curl -f` falha e o
`MAILTO` do cron avisa (producao.md § 7).

## Escopo restringido

- **Navegador fora.** A issue cita erros do navegador, mas captura no cliente exige DSN público,
  liberar o GlitchTip no `connect-src` da CSP e lidar com breadcrumbs de DOM (texto da tela =
  dado de paciente). Fica como pergunta aberta na PR, não implementado.
- **Sem métricas de latência/429.** O dono decidiu os quatro alertas; métrica sem consumidor não
  entra (YAGNI).
- **SDK base (`@sentry/core`) em vez de `@sentry/nextjs`/`@sentry/node`.** Os dois últimos ligam
  integrações automáticas (HTTP, console, contexto de request) e OpenTelemetry; aqui o evento é
  montado por lista do que pode sair, o que torna o scrubbing verificável. Registro em ADR-014.
- **Log que o próprio Next escreve** (erro não tratado, `⨯ …`) continua em texto e fora do
  nosso controle; o mesmo erro sai limpo e em JSON pelo `onRequestError`.

## Fora do escopo

Painel de métricas, tracing distribuído, alerta de disco (já no cron do host, producao.md § 9).
