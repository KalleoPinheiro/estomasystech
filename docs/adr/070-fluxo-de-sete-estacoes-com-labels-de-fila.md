---
title: "ADR 070 — Fluxo de sete estações com labels de fila e validação em thread limpa"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related: [docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md, docs/agents/triage-labels.md, docs/agents/planning.md, docs/governance.md]
---

# ADR 070 — Fluxo de sete estações com labels de fila e validação em thread limpa

- **Data:** 2026-10-24
- **Status:** aceito (decisão do PO, aprovada por @KalleoPinheiro em 2026-10-24, thread "Adotar o fluxo das 7 estações").
- **Domínios afetados:** engenharia (fluxo de trabalho, issues, PRs)

## Contexto

O trabalho do projeto passa por um caminho que hoje não tem nome: a issue entra, é triada, é planejada,
é implementada por uma thread, é revisada, entra na release e vai para produção. Até 2026-10-24 cada
etapa vivia em uma convenção própria: labels com significado diferente em issues antigas (`ready-for-agent`,
`needs-triage`), revisão e validação feitas pela própria thread que implementou, e planejamento espalhado
entre a sessão do coordenador e as threads. Sintomas registrados:

- Duas threads pegando a mesma issue, porque nada na issue dizia "alguém está trabalhando".
- PRs mergeados sem `the-judge` ou sem gate local (#487, #537), porque a revisão não era etapa separada.
- Validação feita pela thread autora, que tende a confirmar o próprio trabalho.

A imagem de referência do fluxo ("How the factory runs") define sete estações numa linha:
1 entrada, 2 triagem, 3 pesquisa (discover), 4 plano, 5 implementação, 6 gate (revisão), 7 produção.
Ela também fixa a regra que motiva este ADR: **quem produz não verifica o próprio trabalho**, e a
revisão independente acontece em thread nova.

Restrições: o [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md) já define o caminho
de git (`feat/*` → `release/vX.Y.Z` → `main`); o [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)
exige recibo do gate local; a produção é deploy manual ([ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)).
Nenhuma dessas decisões muda aqui.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — manter as convenções atuais (labels soltas, thread revisa o próprio trabalho) | nada a migrar | duplicidade de trabalho e revisão sem independência continuam; nada impede dois agentes na mesma issue |
| B — sete estações com labels de fila (`pronta`, `em-andamento`, `bloqueada`) e papel fixo por estação | uma issue só tem um dono por vez; a revisão tem autor diferente; o fluxo cabe numa imagem | exige disciplina de aplicar e remover labels; labels novas convivem com `ready-for-agent` por um tempo |
| C — automatizar a fila com GitHub Projects e bots | visão de kanban nativa | depende de Actions, que está sem cota até ~2026-11-01 ([ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)); mais uma ferramenta para manter |

## Decisão

**Opção B.** O fluxo tem sete estações. Cada uma tem um dono e uma saída verificável:

| # | Estação | Dono | Saída verificável |
| --- | --- | --- | --- |
| 1 | **Entrada** | PO (coordenador) | issue com escopo, critérios de aceite e dono; chega de pedido do Kalléo, alerta de incidente ou item do backlog |
| 2 | **Triagem** | coordenador, skill `triage` | label `pronta` (com critérios de aceite e sem pergunta aberta) ou `bloqueada` (aguarda decisão ou dado humano) |
| 3 | **Pesquisa** | coordenador, skill `tlc-discover` | problema entendido, código lido, métrica de sucesso definida, antes de qualquer código |
| 4 | **Plano** | coordenador, skill `tlc-plan` | fatias verticais com resultado observável; cada fatia é um ticket pronto para thread |
| 5 | **Implementação** | thread de execução, skill `tlc-implement` | branch `feat/*` na release aberta, PR squash com changeset, `## Homologação` e handoff |
| 6 | **Gate** | thread **nova**, `the-judge` + `npm run gate:local` | parecer da revisão em PR e recibo `E2E-GATE:` do SHA atual; validação de tela em 360/390/768/1280 |
| 7 | **Produção** | Kalléo (deploy manual, [ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)) | tag publicada e deploy feito; incidente ou feedback vira **issue nova** que volta à estação 1 |

### Labels de fila

| Label | Quando aplicar | Quem aplica | Quem remove |
| --- | --- | --- | --- |
| `pronta` | triada, com critérios de aceite, pode ser pega por uma thread | coordenador (estação 2) | coordenador ao fechar a issue ou ao virar `bloqueada` |
| `em-andamento` | uma thread está trabalhando nesta issue; trava para não haver duas threads na mesma issue | thread que assume a issue (estação 5) | a mesma thread ao abrir o PR, ou o coordenador se a thread parar |
| `bloqueada` | pausa humana: aguarda decisão de produto, credencial ou dado que só o Kalléo tem | coordenador (estação 2) | coordenador quando o desbloqueio chegar |

Regras de uso:

1. **Uma thread por issue.** Antes de começar, a thread confere que a issue está `pronta` e sem `em-andamento`.
   Se o label já existe, a thread não começa e avisa o coordenador.
2. **`bloqueada` pausa, não cancela.** Ao desbloquear, a issue volta a `pronta` e o coordenador revalida os critérios.
3. **Legado.** `ready-for-agent` (usado em #541–#562 antes deste ADR) equivale a `pronta` e continua
   aceito até o coordenador migrar as issues. Nenhuma label existente é removida por este ADR.
4. **Estações 2, 3 e 4 ficam na sessão do coordenador.** Threads recebem tarefa já planejada e não decidem escopo.

### Validação e revisão

- A **estação 6 roda sempre em thread nova, de contexto limpo**, nunca na thread que implementou.
  Recebe só o problema, o PR e o que foi feito. Não corrige código: cada falha vira issue com evidência,
  a correção volta para a estação 5 em outra thread, e uma nova validação confere só os pontos reprovados.
- Validação de tela usa Playwright no build local com seed, nas larguras 360, 390, 768 e 1280 px
  (mobile first, regra do projeto: validar 360 e 390 px antes do desktop).
- O merge é feito pelo coordenador, via thread, depois do gate local com recibo ([ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md))
  e do `the-judge` aprovado. Só PR exclusivamente de `.md` dispensa recibo ([ADR-053](053-pr-so-de-documentacao-dispensa-recibo-do-gate-local.md)).
  O fluxo de git continua o do [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md).

### Papel do coordenador

O coordenador é o responsável pela entrega. Ele conduz as estações 1 a 4, faz o merge na release, acompanha
as esteiras e roda o staging. Só leva ao Kalléo o que é crítico ou que só ele pode fazer: credenciais,
produção, dinheiro, jurídico, `main`, `TESTE-ALTERADO` e decisão de produto ([AGENTS.md](../../AGENTS.md) regra 5).

## Consequências

**Positivas**

- Uma issue tem um dono por vez, medido pela label `em-andamento`.
- A revisão tem autor diferente do implementador, como na imagem de referência.
- Decisão de produto fica explícita na triagem (`bloqueada`), não escondida em uma thread.

**Negativas / custos aceitos**

- Mais labels para manter; `ready-for-agent` e `pronta` convivem até a migração.
- Cada entrega passa por uma thread extra de validação e revisão, com custo de tokens e tempo.
- As labels `pronta` e `em-andamento` foram criadas sem cor nem descrição, pela API; `bloqueada` só será criada no primeiro uso. Ajuste visual fica como tarefa manual.

**O que esta decisão fecha:** voltar a deixar a thread autora validar o próprio trabalho, e tratar a
produção como etapa automática. Mudar isso pede um ADR novo.

## Relacionado

- [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md): caminho de git, release aberta e `main` só homologada.
- [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md): gate local com recibo.
- [ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md): deploy manual da produção.
- [`docs/agents/triage-labels.md`](../agents/triage-labels.md): mapeamento das labels de fila.
- [`docs/agents/planning.md`](../agents/planning.md): planejamento (estações 3 e 4).
- Issues de origem: #538 (primeira aplicação de `pronta`), #539 (`em-andamento`), #541 (frente de performance do Next).
