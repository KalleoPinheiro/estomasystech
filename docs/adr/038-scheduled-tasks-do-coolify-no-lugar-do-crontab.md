---
title: "ADR 038 — Scheduled Tasks do Coolify no lugar do crontab do host"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/engineering/producao.md, docs/engineering/integrations/cron.md]
---

# ADR 038 — Scheduled Tasks do Coolify no lugar do crontab do host

- **Data:** 2026-10-18
- **Status:** aceito. Substitui o `/etc/cron.d/estomasystech` do runbook do #206 para a produção atual.
- **Domínios afetados:** engenharia (jobs), comunicação (lembretes), retenção, observabilidade

## Contexto

O runbook do #206 agendava lembretes, retenção, alertas e backup no crontab do host, com `curl`,
`MAILTO` e `msmtp`. Com o app como recurso do Coolify (Dockerfile, sem `/opt/estomasystech`, sem
`.env` no host), não há onde pôr esse arquivo sem mexer na VPS à mão, fora do que o Coolify gerencia.

## Decisão

Três **Scheduled Tasks** no recurso do app, executadas dentro do container, com `wget` (busybox da
imagem `node:alpine`) em `POST` com o header `x-cron-secret: $CRON_SECRET` contra `$APP_URL`:

| Rota | Expressão (fuso de São Paulo, o do Coolify) |
| --- | --- |
| `/api/alerts/run` | `*/5 * * * *` |
| `/api/reminders/run` | `0 8 * * *` |
| `/api/retention/run` | `30 3 * * *` |

O segredo vem do ambiente do container: não entra na linha do comando nem em arquivo no host. A
retenção às 03:30 fica depois do backup do banco das 03:00. O backup é do Coolify (e não do
`scripts/backup.sh`), e o `flock` entre retenção e backup só volta a fazer sentido quando o backup
das fotos (`uploads`) entrar no ar.

## Consequências

- Falha de job aparece em *Scheduled Tasks → Executions* e, com a notificação ligada, por e-mail do
  Coolify; some o `MAILTO`/`msmtp` da produção (continuam documentados para o formato compose).
- O alerta "job de lembretes sem rodar" (26 h) do app continua sendo a rede de segurança dos lembretes.
- Se a tarefa de alertas parar junto com o app, só o UptimeRobot avisa: por isso ele monitora o
  `/api/health/ready` de fora.
- **Nota de 2026-10-18 (ADR-040):** o backup virou um timer do systemd do host às 02:00, cifrado (`age`), e não o do Coolify das 03:00 citado acima. A retenção às 03:30 segue depois dele (1 h 30 de folga), então o `flock` continua desnecessário. O `msmtp` existe no host só para o alerta do backup.
- Mudou o segredo `CRON_SECRET`: troca no Coolify e *Deploy*; nenhuma tarefa precisa ser editada.
