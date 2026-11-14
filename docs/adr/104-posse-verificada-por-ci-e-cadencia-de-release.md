---
title: "ADR 104 — Posse de issue verificada por CI, estado da release e cadência"
status: frozen
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-14
related:
  - docs/adr/103-orquestracao-compartilhada-entre-llms.md
  - docs/adr/102-handoff-por-issue-sem-conflito.md
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/engineering/convivencia-llms.md
---

# ADR 104 — Posse de issue verificada por CI, estado da release e cadência

- **Data:** 2026-11-14
- **Status:** aceito (decisão do coordenador por delegação do @KalleoPinheiro; ele pode vetar). Emenda ao
  [ADR-103](103-orquestracao-compartilhada-entre-llms.md), que continua valendo. Issue #813.
- **Domínios afetados:** engenharia (fluxo de PR, CI, release).

## Contexto

O ADR-103 define dono único por issue, três vagas globais e handoff, e admite que o registro no Linear "não é mutex
atômico". Dois agentes (Claude e Cursor) usam o mesmo login do GitHub, então assignee e autor do commit não dizem quem
escreveu. Em 2026-11-14 o diagnóstico mostrou: nada no CI impede dois donos; issues e EST ficaram abertas depois do
merge (#733, #734, #777, #767, #799, #808); a espera pelo clique de classe 3 chegou a 130 min; os conflitos no handoff
(resolvidos pelo ADR-102) geraram dezenas de runs.

## Decisão

1. **Posse por label.** Toda issue em andamento tem **exatamente uma** label `dono:claude` ou `dono:cursor`. É a
   fonte de verdade da posse; o Linear espelha.
2. **`npm run check:posse` no CI** (`ci.yml`, em PR que não é `release/*`): todo PR fora da integração é de um
   agente e precisa trazer o trailer dos commits próprios (`Co-Authored-By: Claude` ou `Co-authored-by: Cursor
   Agent`) ou a branch `claude/*` / `cursor/*`. O corpo precisa de `Closes #N` (o título com `(#N)` também vale, para
   PR aberto antes deste ADR, como o #811; o fechamento automático por `Closes` continua o recomendado) e cada
   issue citada precisa ter exatamente uma label `dono:*` igual ao agente. O corpo e o título são lidos ao vivo pela
   API (não do payload do evento), então corrigir o corpo e rodar o check de novo destrava o PR. **Falha fechada**:
   reprova sem trailer, com os dois agentes no mesmo PR e quando a API falha. Isentos: `release/*`, `sync/*`,
   `chore/sync*`, `hotfix/*` e `dependabot/*`. Limite aceito: o trailer é declarado, não autenticado (ADR-101).
   Consequência da falha fechada: PR manual do Kalléo fora da lista de isentos precisa do trailer de um agente ou
   de uma exceção decidida por ele.
3. **Branch por agente.** Branches aceitas: `feat/<slug>` (AGENTS.md), `claude/*` e `cursor/*`. O agente vem do
   trailer em `feat/*` e também do nome nas outras duas. Ninguém empurra na branch do outro (o check acima pega o
   caso em que o outro agente deixa um commit próprio na branch).
4. **Vagas.** O teto de 3 execuções de código somadas (ADR-103) é contado pela label `em-andamento`; o estado mostra
   `n/3` e marca "acima do teto".
5. **`npm run estado`** gera `reports/estado-release.md` (ignorado pelo git): issues abertas por dono, issues sem dono
   único, PRs abertos e vagas usadas. Os dois agentes o leem ao iniciar a sessão. O arquivo **não é versionado**: um
   arquivo gerado e commitado conflitaria a cada merge, como o handoff (ADR-102), e ficaria velho.
6. **Fechamento.** PR de agente usa `Closes #N`; o merge fecha a issue, e a EST vai a "Na release" (nunca "Em
   produção" antes do deploy da tag).
7. **Cadência de release (decisão do coordenador).** Release por **lote de valor homologado**, no máximo
   **quinzenal**. Infra de release (`release-infra`: deploy, backup, portões) não bloqueia a entrega ao cliente: se
   atrasar, o lote de valor sai sem ela e a infra segue na release seguinte. A exceção do ADR-097 ao processo no meio da
   release continua restrita à coordenação (ADR-103).
8. **Cortes de pipeline avaliados e não aplicados.** (a) Cache de `node_modules` no job `escopo`: economiza ~40 s em
   ~7 min e o `npm ci` já usa o cache de pacotes do `setup-node`; não compensa o risco de cache velho num job de gate.
   (b) Filtro dos runs `skipped` do workflow Staging: o evento `deployment_status` não aceita filtro de gatilho, então
   o run existe e só o `if` dos jobs o pula; sem corte possível sem tirar o gatilho. A espera pelo clique de classe 3
   (o maior custo) continua decisão do Kalléo: aprovar em lote por janela.

## Alternativas rejeitadas

- **Arquivo `.specs/estado-release.md` versionado**: conflita e envelhece (ver 5).
- **Lock por API do Linear**: não é atômico (ADR-103).
- **Só convenção em texto**: foi o estado até hoje; sem verificação, dois donos passam.

## Consequências

- PR sem trailer, sem referência de issue (`Closes #N` ou `(#N)` no título) ou sem label `dono:*` correspondente passa
  a falhar no CI. PRs em voo precisam da label na issue antes de atualizar a branch; o #811 precisa de `Closes #769`
  no corpo para seguir a regra completa.
- É classe 3 (muda `ci.yml` e `scripts/release/`): precisa do clique do Kalléo no Environment.
- Autenticidade da autoria continua dependendo do trailer; reforçar exigiria identidades Git separadas, o que o
  Kalléo não autorizou (ADR-103).
