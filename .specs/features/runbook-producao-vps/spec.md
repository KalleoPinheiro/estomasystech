---
title: Runbook de produção na VPS Hetzner + backup/restore cifrado (#206)
status: draft
issue: 206
audience: [agent, dev, ops]
---

# Runbook de produção na VPS Hetzner — Specification

## Problem Statement

O runbook (`docs/engineering/producao.md`) tinha Vercel + Supabase como alvo e deixava em aberto
RPO/RTO, fotos, cron e alertas. Em 2026-10-11 o dono do produto decidiu (comentário na #206):
VPS Hetzner com o `docker-compose.yml` (app + Postgres), uma réplica, proxy com TLS; fotos em
volume local; RPO 24 h / RTO 4 h com backup diário cifrado do banco e do volume, 30 dias fora do
servidor e teste de restauração mensal; alertas por e-mail; pendência LGPD art. 33 na #216.
Não havia script de backup nem de restore versionado.

## Goals

- [ ] Runbook com provisionamento, TLS (Traefik do Coolify, ADR-036), `TRUSTED_PROXY_HOPS`, segredos e rotação,
      migrações, cron (lembretes, backup e retenção #294, que entrou na `main` pelo PR #302), primeiro acesso, backup/restore e
      monitoramento (#212), apontando a #216.
- [ ] `scripts/backup.sh`: dump do Postgres e tar do volume `uploads`, cifrados com `age`
      (chave pública no servidor), sem dado em claro no disco, cópia fora do servidor por
      comando configurável, retenção local de 30 dias, códigos de saída distintos.
- [ ] `scripts/restore.sh`: confere sem alterar; `--confirmar` substitui banco e fotos e sobe o app.
- [ ] `scripts/backup-smoke.sh` prova o ciclo backup → apagar → restore contra o compose, no CI.
- [ ] `docker-compose.prod.yml`: Traefik do Coolify terminando TLS; app e banco sem porta no host (Caddy removido, ADR-036).

## Out of Scope

| Item | Motivo |
| --- | --- |
| Provedor do destino fora do servidor | Não decidido: fica em `BACKUP_OFFSITE_CMD`, pergunta aberta no runbook § 1 |
| Ferramenta de monitoramento e alerta de "backup não rodou" | #212 |
| Base legal da transferência internacional | #216 (jurídico) |
| Mudança em código de aplicação | Não necessária |

## Decisions

| Decisão | Motivo |
| --- | --- |
| `age` em vez de `gpg` | Chave pública simples no servidor, privada fora; sem keyring nem trust model |
| Dois arquivos cifrados por backup (`db.dump.age`, `uploads.tar.age`) em vez de um tar único | Cada dump sai do container direto para o `age`: o dado em claro nunca é gravado no disco |
| Destino fora do servidor como comando (`BACKUP_OFFSITE_CMD`) | Provedor não decidido; não inventar credencial nem provedor |
| Override de produção (`docker-compose.prod.yml`), não no `docker-compose.yml` | O compose base continua servindo o dev e o smoke do CI sem domínio nem TLS |
| `ports: !reset []` no app em produção | App exposto direto aceitaria HTTP e `x-forwarded-for` forjado (rate limit por IP) |
| Restore apaga e recria o banco (`DROP DATABASE … WITH (FORCE)`) | `pg_restore --clean` deixaria objetos criados depois do backup |
