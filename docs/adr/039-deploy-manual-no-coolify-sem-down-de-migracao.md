---
title: "ADR 039 — Deploy manual no Coolify; rollback sem down de migração"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/engineering/producao.md, docs/adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md]
---

# ADR 039 — Deploy manual no Coolify; rollback sem down de migração

- **Data:** 2026-10-18
- **Status:** aceito.
- **Domínios afetados:** engenharia (release, deploy)

## Contexto

O recurso do app no Coolify está ligado ao GitHub App do repositório e poderia fazer deploy
automático a cada push na `main`. Hoje o GitHub Actions está sem cota (o gate roda localmente), não
há staging, as migrações não têm `down` e o app migra no boot. Um push na `main` que traga migração
redeployaria produção sem backup prévio.

## Decisão

- **Deploy manual** (botão *Deploy*), depois do backup do banco. O processo está em
  [`producao.md`](../engineering/producao.md) § 3.1.
- **Rollback** por *Redeploy* do commit anterior quando o lote não tem migração, ou quando a migração
  é só aditiva e o código antigo a ignora. Caso contrário, restauração do backup tirado antes do
  deploy (perda do que foi escrito depois) ou migração nova que desfaça a mudança.
- Cada lote declara, no handoff, qual dos dois rollbacks vale para ele.
- Reavaliar o deploy automático quando houver staging ou um gate de CI que rode no Actions.

## Consequências

- Um passo humano a mais por release; em troca, nenhum deploy acontece sem backup e sem alguém
  olhando o `/api/health/ready`.
- Merge na `main` não é deploy: a doc e o handoff dizem qual commit está em produção.
