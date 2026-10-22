---
title: "ADR 061 — A Vercel constrói só a branch `staging`"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-22
related: [docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/engineering/homologacao.md]
---

# ADR 061 — A Vercel constrói só a branch `staging`

- **Data:** 2026-10-22
- **Status:** aceito (pedido do orquestrador após os deploys quebrarem com "Resource provisioning failed").
- **Domínios afetados:** engenharia (homologação)
- **Complementa:** [ADR-041](041-homologacao-na-vercel-e-branch-staging.md) (prévia por PR com branch Neon) e [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md).

## Contexto

O ADR-041 previa uma prévia por PR, cada uma com um branch de banco no Neon. Com o fluxo do ADR-052
(muitos `feat/*`, a `release/*` e as branches de agente, vários pushes por dia) toda branch gera deploy e a
integração Neon cria um branch de banco por deploy. O plano grátis estourou o limite ("Branch limit
reached") e a Vercel passou a falhar com `Resource provisioning failed` em ~1 s, antes do build. A
homologação de verdade só olha a `staging` (a release reconstruída); prévia de feature não é usada.

Também investigado: não existe `ignoreCommand` no repositório nem `commandForIgnoringBuildStep` visível
no projeto, então o Ignored Build Step **não** explica a `staging` ignorar o commit vazio `8304683`. A
Vercel nunca criou deploy para esse SHA (nenhum registro, nem `ERROR`/`CANCELED`), ou seja, o push não
virou deploy antes de qualquer regra do projeto; causa provável fora do repositório (entrega do webhook do
GitHub ou fila).

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — `git.deploymentEnabled` no `vercel.json` (escolhida) | versionado, revisado em PR; a Vercel nem cria o deploy, então a integração Neon não provisiona branch | vale a partir do commit empurrado: branch antiga só obedece depois de trazer a release |
| B — `ignoreCommand` | também versionado | o deploy já existe (fica `CANCELED`) e a provisão do banco pode rodar antes do comando; polui a lista |
| C — Ignored Build Step no painel | vale para todas as branches já | fora do repositório, não revisável |
| D — pagar Neon/Vercel Pro | mantém prévias | custo sem uso real |

## Decisão

1. `vercel.json`: `"git": { "deploymentEnabled": { "**": false, "staging": true } }`. Entre regras que
   casam, basta uma `true` para a branch ser construída; `**` cobre branches com `/`.
2. Integração Neon sem *branch for every preview deployment* (passo de painel, `homologacao.md` § 5).
3. Para ver uma feature: `npm run staging:rebuild -- --release --push` (fluxo do ADR-052).

## Consequências

- Sem URL por PR; quem revisa UI usa a staging ou o `ambiente:local`.
- O check "Vercel" deixa de aparecer nos PRs; não há ruleset exigindo-o hoje (confirmar no painel).
- Se um dia houver necessidade pontual de prévia, abrir deploy manual (`vercel deploy`) em vez de religar tudo.
