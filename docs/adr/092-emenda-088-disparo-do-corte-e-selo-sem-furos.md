---
title: "ADR 092 — Emenda à ADR-088: corte disparado da main, pré-voo da branch, selo sem furos"
status: draft
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-07
related:
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md
  - docs/adr/088-prova-unica-do-corte-e-pre-voo-do-release-cut.md
  - docs/adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md
  - docs/engineering/homologacao.md
---

# ADR 092 — Emenda à ADR-088: corte disparado da main, pré-voo da branch, selo sem furos

- **Data:** 2026-11-07
- **Status:** proposto. Emenda o [ADR-088](088-prova-unica-do-corte-e-pre-voo-do-release-cut.md) (congelado) sem
  mudar limiar nem teste (regra 8). Decorre da issue #663 (EST-13) e do parecer de arquitetura registrado nela.
  A decisão do ponto de disparo (item 1) é do coordenador, em 2026-11-07, e vai à aprovação de @KalleoPinheiro
  junto com este PR.
- **Domínios afetados:** engenharia (CI, release)

## Contexto

A [ADR-088](088-prova-unica-do-corte-e-pre-voo-do-release-cut.md) cobre o que a issue #663 pedia: o selo
`release-cut/gate` (check run da app `github-actions`) dispensa CI e Docker repetidos no PR `release/vX.Y.Z → main`.
A v0.5.0 será o primeiro uso real. Lendo o código da release/v0.5.0 antes do corte, sobram seis furos:

1. **Ponto de disparo ambíguo.** O `release-cut.yml` aceita `workflow_dispatch` de duas formas: escolhendo a
   `release/vX.Y.Z` em «Use workflow from» ou, a partir da `main`, informando o input `branch`. O cabeçalho do
   workflow admite as duas, `homologacao.md` (§ «Cortar pelo Actions») manda a segunda. O runbook do corte não pode
   ter dois caminhos.
2. **A validação da branch some em silêncio.** O job `cut` tem `if: startsWith(inputs.branch || github.ref_name,
   'release/v')`. Branch fora do padrão **pula o job**: o run termina sem erro e sem corte, e quem disparou
   pode ler isso como sucesso.
3. **`check:dynamic-import` fica sem cobertura no PR provado.** No PR provado, `estatico` é pulado e só o
   `server-first-provado` roda; o selo não cobre `check:dynamic-import` (a convenção da #646), então a trava
   deixa de valer exatamente no PR que vai para a `main`. Nada reprova se alguém acrescentar um step ao
   `estatico` e esquecer de decidir se o selo o cobre.
4. **Selo recusado é mudo.** `prova-corte.ts` loga o motivo em stderr e segue com `provado=false`. O PR roda tudo
   (falha fechada, correto), mas ninguém vê por que o selo não valeu, e cortar do lugar errado desliga o selo sem aviso.
5. **Consulta frágil.** `prova-corte.ts` lê `check-runs?per_page=100` sem paginar (o selo pode estar na página 2
   num commit com muitos checks) e identifica a app pelo `slug` (`github-actions`), não pelo id numérico.
6. **Steps de prova sem `shell: bash` explícito**, dependendo do padrão do runner.

## Opções consideradas

Para o ponto de disparo (o único ponto de produto; os demais são correções diretas):

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Disparar da `main` com `branch=release/vX.Y.Z`, validando o input contra `release/v*` | A definição do workflow vem da `main` protegida (só entra por PR de release/hotfix, com bypass do dono); `homologacao.md` já manda isso | Um input a mais para digitar; erro de digitação precisa falhar alto (item 2) |
| B — Disparar da própria `release/vX.Y.Z` e exigir que a ref seja `release/v*` | Sem input; a ref é a branch | O workflow que roda com `RELEASE_CUT_TOKEN` (PAT com bypass) e `checks: write` é o da branch, que pode ter sido alterado por qualquer PR já mergeado nela; o selo prova o SHA, mas quem o grava é código não revisado como a `main` |
| C — Aceitar as duas | Flexível | Dois caminhos no runbook e o furo da B continua aberto |

## Decisão

**Opção A.** O corte é disparado **da `main`**, com o input `branch=release/vX.Y.Z`, e o input é validado contra o
padrão `^release/v[0-9]+\.[0-9]+\.[0-9]+` **em falha alta**, antes de qualquer outro passo.

Por que A: o workflow carrega segredo com bypass de ruleset e permissão de escrever o selo que dispensa o CI do PR.
A definição que o executa tem de vir da ref mais protegida do repositório, não de uma branch que recebe PRs
squash de agentes. A opção B cria um caminho em que alterar o `release-cut.yml` numa feature, e deixá-la entrar
na release, muda o código que corta e sela a própria release. A opção A elimina esse caminho sem custo além de digitar o input.

As demais correções, todas na mesma emenda:

1. **Validação da branch em falha alta, antes de qualquer checkout.** O input `branch` passa a ser obrigatório e
   perde o fallback para `github.ref_name`. O primeiro step do job `cut`, antes do `checkout` e do `npm ci`, é um
   step próprio (`shell: bash`, sem dependência) que falha com `::error` quando `github.ref` não é `refs/heads/main`
   ou quando `inputs.branch` está vazio ou não casa com o padrão. O `release:preflight` repete a checagem do padrão
   (defesa em profundidade, e cobre o corte local). O `if` do job sai: branch errada vira vermelho, não «skipped».
   O `dry_run` roda da `main` como o corte real, então exercita o mesmo caminho.
2. **Job `server-first-provado` vira `fora-do-selo`** e roda `check:server-first` **e** `check:dynamic-import`,
   os dois checks que nem o selo nem o `gate:local` cobrem. O `ci` continua exigindo que ele passe quando o PR é
   provado. Um teste de estrutura sobre `ci.yml` reprova se algum step do `estatico` não estiver coberto pelo selo
   (lista de etapas do ADR-088) nem rodar no `fora-do-selo`. Ficam fora da regra, por lista explícita no teste, os
   steps que o próprio `ci.yml` pula em `release/*` (hoje o «Changeset», que não se aplica ao PR release→main).
3. **Selo recusado vira `::warning`** com o motivo, e vai ao step summary do job `escopo`. Continua falha fechada:
   roda tudo.
4. **Consulta dos check runs** paginada (`gh api --paginate`) e conferindo o `app.id` numérico da app
   `github-actions` (15368), além do `slug`. Qualquer divergência recusa o selo.
5. **`shell: bash`** explícito nos steps de prova de `ci.yml` e `docker.yml`.
6. **`ci` segue como o único check exigido** do ruleset da `main`.

Validação sem gastar cota do Actions: fixtures reais (respostas de `check-runs` paginadas, selo de outra app,
selo ausente), `actionlint` e um `dry_run` do corte. A implementação vai em PR próprio de código (changeset e
testes), **depois** deste ADR aceito e **antes** do corte da v0.5.0.

## Consequências

**Positivas**

- Um único caminho de corte no runbook; o workflow que sela vem sempre da `main`.
- Branch errada deixa de ser sucesso aparente.
- A trava de `import()` dinâmico vale também no PR release→main.
- O selo recusado explica o porquê, e a consulta não perde o selo por paginação.

**Negativas / custos aceitos**

- Digitar `branch=release/vX.Y.Z` a cada corte (o `dry_run` pega o erro em ~1 min).
- Quem tem escrita e permissão de workflows ainda pode alterar o `ci.yml` de um PR; o nível de confiança é o da
  ADR-088 (dono único, ruleset com bypass dele). Esta emenda não o amplia.

**O que esta decisão fecha:** cortar a partir de uma branch de release. Voltar a isso exige novo ADR que prove o
workflow da branch com a mesma proteção da `main`.

## Implementação

Entrou no PR de código seguinte ao deste ADR (EST-13): `release-cut.yml` com o input `branch` obrigatório, sem
fallback e sem `if` de job, e o step «Validar o disparo» como primeiro do job; `ci.yml` com o job `fora-do-selo`;
`prova-corte.ts` paginando e conferindo `app.id` (15368, lido de um check run real da API do repositório);
`release:preflight` repetindo a checagem no Actions; testes em `tests/infrastructure/ci-fora-do-selo.test.ts` e
`tests/scripts/release-prova-corte-adr092.test.ts`. O `dry_run` real roda uma vez, depois do merge na release.

## Relacionado

- [ADR-088](088-prova-unica-do-corte-e-pre-voo-do-release-cut.md), emendado aqui; [ADR-071](071-corte-de-release-em-comando-unico.md);
  [ADR-093](093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md)
- Issue #663; Linear EST-13
