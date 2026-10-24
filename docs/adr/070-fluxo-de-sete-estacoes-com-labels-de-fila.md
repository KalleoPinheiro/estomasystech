---
title: "ADR 070 — Fluxo de sete estações com labels de fila, verificação em camadas e validação em thread limpa"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related: [docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md, docs/adr/053-pr-so-de-documentacao-dispensa-recibo-do-gate-local.md, docs/agents/triage-labels.md, docs/agents/planning.md, docs/governance.md]
---

# ADR 070 — Fluxo de sete estações com labels de fila, verificação em camadas e validação em thread limpa

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
- Testes escritos pelo agente que nunca foram vistos falhando contra o código anterior, então não provavam nada.

O TLC AI Dev Flow (v1) define a mesma linha de sete estações: 1 entrada, 2 triagem, 3 pesquisa (discover),
4 plano, 5 implementação, 6 gate (revisão), 7 produção. Suas regras de base, que este ADR adota:
**o humano fica nas pontas (intenção e direção); a verificação é o gargalo, não a escrita de código;
quem produz não verifica o próprio trabalho.**

Restrições: o [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md) já define o caminho
de git (`feat/*` → `release/vX.Y.Z` → `main`); o [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)
exige recibo do gate local; a produção é deploy manual ([ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)).
Nenhuma dessas decisões muda aqui.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — manter as convenções atuais (labels soltas, thread revisa o próprio trabalho) | nada a migrar | duplicidade de trabalho e revisão sem independência continuam; nada impede dois agentes na mesma issue |
| B — sete estações com labels de fila (`pronta`, `em-andamento`, `bloqueada`), papel fixo por estação, verificação em camadas e teste pré-patch | uma issue só tem um dono por vez; a revisão tem autor diferente; o teste novo prova que pega o defeito | exige disciplina de aplicar labels, template de issue e campo de teste pré-patch no PR |
| C — automatizar a fila com GitHub Projects e bots | visão de kanban nativa | depende de Actions, que está sem cota até ~2026-11-01 ([ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)); mais uma ferramenta para manter |

## Decisão

**Opção B.** O fluxo tem sete estações. Cada uma tem um dono e uma saída verificável:

| # | Estação | Dono | Saída verificável |
| --- | --- | --- | --- |
| 1 | **Entrada** | PO (coordenador) | issue no template de entrada (seção abaixo), com escopo, critérios de aceite com valores concretos e dono; chega de pedido do Kalléo, alerta de incidente ou item do backlog |
| 2 | **Triagem** | coordenador, skill `triage` | label `pronta` (critérios observáveis e sem pergunta aberta) ou `bloqueada` (aguarda decisão ou dado humano) |
| 3 | **Pesquisa** | coordenador, skill `tlc-discover` | problema entendido, código lido, métrica de sucesso definida, antes de qualquer código |
| 4 | **Plano** | coordenador, skill `tlc-plan` | fatias verticais com resultado observável; cada fatia é um ticket pronto para thread |
| 5 | **Implementação** | thread de execução, skill `tlc-implement` | branch `feat/*` na release aberta, fatia vertical, verificações baratas primeiro, teste pré-patch no PR, PR squash com changeset, `## Homologação` e handoff |
| 6 | **Gate** | thread **nova**, `the-judge` + `npm run gate:local` | uma revisão consolidada no GitHub com citações e veredito; recibo `E2E-GATE:` do SHA atual do `gate:local` em todo PR (em `feat/*` → release, gate rápido, `test:changed` e mutação por diff; E2E completo com imagem Docker só no PR `release/*` → `main`, [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md)); validação de tela em 360/390/768/1280 |
| 7 | **Produção** | Kalléo (deploy manual, [ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)) | tag publicada e deploy feito; incidente ou feedback vira **issue nova** no template de entrada e volta à estação 1 |

### Entrada no formato único

Toda issue de trabalho novo usa o template `.github/ISSUE_TEMPLATE/entrada.md`, com três blocos obrigatórios:

1. **Escopo:** o que entra e o que fica fora, em uma frase cada.
2. **Critérios de aceite:** resultados observáveis com valores concretos (status HTTP, contagem, largura em px, texto exato). Adjetivos como "rápido" ou "adequado" reprovam a triagem.
3. **Dono:** o responsável pela estação atual (coordenador na entrada; thread, após `em-andamento`).

Issue sem os três blocos fica sem `pronta` até ser completada.

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

### Verificação em camadas

A verificação roda do mais barato ao mais caro, e o caro só entra perto do PR:

| Camada | Exemplos no projeto | Onde roda |
| --- | --- | --- |
| 1. Barata | `npm run typecheck`, `npm run lint`, testes unitários do que mudou (`npm run test:changed`) | thread de implementação, a cada fatia |
| 2. Média | `npm run test:coverage` (100% por camada de regra, [ADR-050](050-limiar-100-por-camada-e-ui-medida.md)), `check:sv`, `check:docs` | antes do PR |
| 3. Cara, perto do PR | integração contra Postgres real (`test:integracao`), navegador (`test:e2e`, `gate:local`), mutação em domain/application ([ADR-051](051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md)), revisão de segurança e LGPD | thread de gate (estação 6) |

Nenhuma camada cara substitui a barata: se o unitário falha, a thread corrige antes de rodar o navegador.

### Teste pré-patch

Todo teste **novo** escrito pelo agente na estação 5 precisa provar que pega o defeito:

1. Rodar o teste contra o código de **antes** da correção (ou da funcionalidade). Ele tem que **falhar**.
2. Restaurar o código e rodar de novo. Ele tem que **passar**.
3. Registrar o resultado no campo **Teste pré-patch** do PR (template `.github/pull_request_template.md`): nome do teste, SHA antes, saída resumida do que falhou.

Teste que passa também no código anterior não prova nada e volta para a estação 5.

### Edições em testes existentes

A regra 8 do [AGENTS.md](../../AGENTS.md) já proíbe editar, afrouxar ou desligar teste para resolver problema de desenvolvimento.
Como complemento de processo: **edições do agente em testes existentes são descartadas**, a menos que o requisito de
negócio tenha mudado, caso em que entram com `TESTE-ALTERADO: <motivo>` no PR e passam pelo Kalléo. Quem decide se
um teste existente mudou é o gate (estação 6), não a thread que o alterou. Um conjunto verde que foi afrouxado não é prova.

### Validação e revisão

- A **estação 6 roda sempre em thread nova, de contexto limpo**, nunca na thread que implementou.
  Recebe só o problema, o PR e o que foi feito. Não corrige código: cada falha vira issue com evidência,
  a correção volta para a estação 5 em outra thread, e uma nova validação confere só os pontos reprovados.
- O `the-judge` publica **uma única revisão consolidada** no GitHub. Cada achado traz citação (arquivo e linha, ou saída de comando),
  e o veredito é `APPROVE`, `COMMENT` ou `REQUEST_CHANGES`. Não há comentários soltos fora dessa revisão.
- Validação de tela usa Playwright no build local com seed, nas larguras 360, 390, 768 e 1280 px
  (mobile first: validar 360 e 390 px antes do desktop).
- O merge na release é feito pelo coordenador, via thread, depois do `the-judge` aprovado e do recibo do `gate:local`
  ([ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)) no PR: em `feat/*` → release, gate rápido, `test:changed` e mutação por diff;
  o E2E completo com imagem Docker é exigido só no PR `release/*` → `main`. Só PR exclusivamente de `.md` de documentação,
  nos termos do [ADR-053](053-pr-so-de-documentacao-dispensa-recibo-do-gate-local.md), dispensa recibo.
  O fluxo de git continua o do [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md).

### Papel do coordenador

O coordenador é o responsável pela entrega. Ele conduz as estações 1 a 4, faz o merge na release, acompanha
as esteiras e roda o staging. Só leva ao Kalléo o que é crítico ou que só ele pode fazer: credenciais,
produção, dinheiro, jurídico, `main`, `TESTE-ALTERADO` e decisão de produto ([AGENTS.md](../../AGENTS.md) regra 5).

## Consequências

**Positivas**

- Uma issue tem um dono por vez, medido pela label `em-andamento`.
- A revisão tem autor diferente do implementador, como na imagem de referência.
- Teste novo só entra se já foi visto falhando, o que evita cobertura que não prova nada.
- Decisão de produto fica explícita na triagem (`bloqueada`), não escondida em uma thread.

**Negativas / custos aceitos**

- Mais labels, template e um campo a preencher no PR; `ready-for-agent` e `pronta` convivem até a migração.
- Cada entrega passa por uma thread extra de validação e revisão, com custo de tokens e tempo.
- Teste pré-patch exige rodar a suíte duas vezes (antes e depois da correção) para os testes novos.
- As labels `pronta` e `em-andamento` foram criadas sem cor nem descrição, pela API; `bloqueada` só será criada no primeiro uso. Ajuste visual fica como tarefa manual.

**O que esta decisão fecha:** voltar a deixar a thread autora validar o próprio trabalho, aceitar teste
novo que nunca foi visto falhando, e tratar a produção como etapa automática. Mudar isso pede um ADR novo.

## Relacionado

- [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md): caminho de git, release aberta e `main` só homologada.
- [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md): gate local com recibo; regra 8 de teste intocável.
- [ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md): deploy manual da produção.
- [ADR-050](050-limiar-100-por-camada-e-ui-medida.md) e [ADR-051](051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md): cobertura e mutação nas camadas de verificação.
- [`docs/agents/triage-labels.md`](../agents/triage-labels.md): mapeamento das labels de fila.
- [`docs/agents/planning.md`](../agents/planning.md): planejamento (estações 3 e 4).
- Issues de origem: #538 (primeira aplicação de `pronta`), #539 (`em-andamento`), #541 (frente de performance do Next).
