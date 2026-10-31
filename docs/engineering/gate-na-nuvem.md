---
title: "Gate na nuvem: como rodar numa thread sem o PC"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
---

# Gate na nuvem

Decisão e motivo: [ADR-084](../adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md).

## Comandos

```bash
scripts/gate-cloud.sh bg pr        # PR: incremental, em segundo plano, log em .gate/cloud.log
scripts/gate-cloud.sh bg release   # release: setup + integração + gate:local (perfil pr, sem Docker)
scripts/gate-cloud.sh status       # etapas terminadas com tempo; "fim rc=N" quando acabou
```

Rode sempre em segundo plano: a ferramenta de shell mata comando em primeiro plano aos 10 min.
A árvore precisa estar limpa (o gate vale para o SHA do HEAD). A base do diff é `GATE_BASE` ou a
release aberta ([ADR-058](../adr/058-base-do-diff-dos-gates-locais-e-a-release-aberta.md)).

## Tempos medidos (release/v0.4.0 eb27585, 4 vCPU, 15 GB)

| Etapa | Tempo |
| --- | --- |
| npm ci / typecheck / lint+sv+docs | 31 s / 48 s / ~14 s |
| cobertura completa | 566 s |
| build | 73 s |
| integração (Postgres real) | 149 s |
| E2E prod / dev | 613 s / 204 s |
| mutação (2 arquivos) | 102 s |

## Armadilhas

- Sem Docker o perfil `release` do `gate:local` recusa: a nuvem usa `GATE_PERFIL=pr`; Docker e backup
  ficam como pulados no recibo e rodam no WSL.
- A integração só passa com `PG_POOL_MAX=1` (como no `ambiente:local`).
- Playwright pede uma revisão do Chromium que a imagem pode não ter: o script cria o link.
- Servidor de uma rodada interrompida na porta 3000 derruba o E2E em 3 s: o script mata antes.
- Postgres da imagem é o 16; produção e CI usam o 18.
