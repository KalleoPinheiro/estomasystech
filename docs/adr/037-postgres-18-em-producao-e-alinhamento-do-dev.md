---
title: "ADR 037 — PostgreSQL 18 em produção e alinhamento do desenvolvimento"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/engineering/producao.md, docs/adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md]
---

# ADR 037 — PostgreSQL 18 em produção e alinhamento do desenvolvimento

- **Data:** 2026-10-18
- **Status:** aceito. Fecha a pergunta aberta do [ADR-036](036-traefik-do-coolify-como-unico-proxy-de-entrada.md) (Dockerfile ou compose no Coolify).
- **Domínios afetados:** engenharia (banco, deploy)

## Contexto

O primeiro deploy no Coolify usou o formato **Dockerfile + PostgreSQL gerenciado pelo Coolify**,
com `postgres:18-alpine`, privado, e backup diário às 03:00 para o R2. O repositório, porém,
desenvolve e testa contra outra coisa: `docker-compose.yml` (db e helper de backup) e
`docker-compose.glitchtip.yml` em `postgres:16-alpine`, o smoke do container no CI e o baseline de
carga em Postgres 16, e os testes de unidade e integração em PGlite. Produção e desenvolvimento
ficaram em majors diferentes.

## Decisão

- **Produção: PostgreSQL 18**, gerenciado pelo Coolify. Dockerfile + banco do Coolify é o formato
  adotado; o `docker-compose.prod.yml` fica como alternativa suportada, não como alvo.
- **Alinhar o desenvolvimento a 18** (`docker-compose.yml`, helper `uploads-backup`,
  `docker-compose.glitchtip.yml`, smoke do CI e baseline), em **PR próprio que rode com daemon
  Docker**: a imagem 18 guarda os dados em `/var/lib/postgresql/18/docker` e espera o volume em
  `/var/lib/postgresql` (não mais em `.../data`), então o volume do compose muda e quem tem o
  `pgdata` antigo precisa recriá-lo (`docker compose down -v`) ou migrar por dump. Isso não pode ser
  validado sem Docker, e a conferência de CI vermelho é regra inviolável (AGENTS.md, regra 7).
- Até o alinhamento, a doc diz as duas coisas com todas as letras: produção em 18, compose e CI em 16.
- As 66 migrações aplicaram sem ajuste em 18 no primeiro deploy (2026-10-18). O ganho do alinhamento
  é eliminar a diferença entre o banco que testamos e o que serve pacientes.

## Consequências

- Tarefa de acompanhamento aberta no GitHub para o alinhamento (compose, glitchtip, smoke, baseline, docs).
- Os scripts `backup.sh`/`restore.sh` (formato compose) usam `pg_dump`/`pg_restore` do container do
  banco: ao trocar a imagem, o cliente acompanha o servidor.
- Restaurar um backup do Coolify (PG18) em um compose PG16 **não funciona** (dump de major maior);
  uma razão a mais para alinhar antes de qualquer ensaio de restauração fora do Coolify.
