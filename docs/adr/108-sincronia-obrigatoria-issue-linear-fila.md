---
title: "ADR 108 — Sincronia obrigatória entre issue do GitHub, EST do Linear e a fila de próximos passos"
status: frozen
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-14
related:
  - docs/adr/102-handoff-por-issue-sem-conflito.md
  - docs/adr/104-posse-verificada-por-ci-e-cadencia-de-release.md
  - docs/adr/107-fila-de-proximos-passos-no-handoff.md
  - docs/engineering/convivencia-llms.md
---

# ADR 108 — Sincronia obrigatória entre issue do GitHub, EST do Linear e a fila de próximos passos

- **Data:** 2026-11-14
- **Status:** aceito (issue #837; pedido de @KalleoPinheiro em 2026-11-14: quadro do Linear e issues do GitHub
  sincronizados, triados e priorizados, e a obrigação registrada para o estado não se perder). Complementa o
  [ADR-107](107-fila-de-proximos-passos-no-handoff.md), que é congelado, e por isso vem em ADR novo.
- **Domínios afetados:** engenharia (fluxo de PR, troca de agente e triagem).

## Contexto

O estado do projeto mora em três lugares: a **issue do GitHub**, a **EST do Linear** (time EST) e a fila
`PROXIMOS-PASSOS.md` (ADR-107). Os agentes se revezam e nunca atuam juntos: o que entra só enxerga o que está nesses
três lugares. Na auditoria de 2026-11-14 havia issue aberta sem triagem, EST em "Triage" de trabalho já mergeado,
versão e prioridade ausentes, `dono:*` em issue sem trabalho em andamento e EST duplicada.

A integração GitHub↔Linear tem comportamento próprio, que causou parte do desvio:

- Fechar a issue (por `Closes #N` no merge) move a EST para **"Em produção"**, mesmo que o trabalho esteja só na release.
- Mover a EST para **"Na release"** (estado "started") **reabre** a issue no GitHub (`state_reason: reopened`).
- Labels são espelhadas nos dois sentidos.

Logo, "issue fechada" e "EST Na release" não coexistem. O estado estável de trabalho entregue na release, mas ainda
não em produção, é **issue aberta + EST "Na release"**.

## Decisão

1. **Sincronia obrigatória.** Todo PR que entrega uma issue e toda troca de agente (ADR-105 § 9) deixam, no mesmo
   ciclo, coerentes: a issue, a EST, as labels e `PROXIMOS-PASSOS.md`. **Quem assume confere os quatro antes de pedir
   reserva** e corrige o que divergir; o remoto vale mais que a memória.
2. **Toda issue aberta tem EST e vice-versa**, com título equivalente. Issue nova nasce com label de versão
   (`vX.Y.Z`), prioridade (`P0`..`P3`) e domínio; a EST nova sai de "Triage" no mesmo dia.
3. **Estado da EST pela realidade:** "Planejada/Brief" (triada, pronta, sem dono), "Em andamento" (PR aberto, com
   `dono:<agente>`), "Em revisão (the-judge)" (PR em revisão), "Na release" (PR mergeado em `release/*`),
   "Em produção" só para o que está numa versão publicada (tag na `main`).
4. **`dono:<agente>` e `em-andamento` só em issue com trabalho em andamento** (PR aberto). Ao mergear, quem
   mergeia remove as duas labels da issue e da EST.
5. **Defeito "Em produção" e correção.** Depois de cada merge na release: (a) a issue fecha pelo `Closes #N` e a EST
   vai para "Em produção"; (b) mova a EST para **"Na release"**, o que reabre a issue; (c) confira que a issue
   ficou aberta, sem `dono:*`. A issue fecha de vez, e a EST vai para "Em produção", no `release:publish`. Fechar
   issue à mão para "limpar" o quadro é proibido: a integração desfaz o estado certo.
6. **Triagem.** Prioridade: **P0** risco a dado de saúde, LGPD, segurança ou perda de dado em produção; **P1** bug ou
   valor visível ao cliente da clínica; **P2** qualidade e infra de entrega que bloqueia release; **P3** melhoria e
   dívida técnica. Prontidão pela label `pronta`; dependência pela relação "bloqueada por" da EST. Onde o critério não
   decide (ambiguidade de produto ou clínica), o agente **não escolhe**: lista a pergunta com a recomendação para o
   Kalléo (regra 5 do `AGENTS.md`).
7. **Versão:** só entra na `vX.Y.Z` aberta o que já está em voo; o resto vai para a próxima, ordenado pela prioridade.

## Consequências

- O quadro deixa de depender da memória de quem coordena e sobrevive à troca de agente.
- Cada entrega ganha uma conferência curta (issue, EST, labels, fila). Na primeira entrega a regra é só texto; a
  verificação por máquina fica na [#835](https://github.com/KalleoPinheiro/estomasystech/issues/835), v0.8.0.
- O defeito da integração fica documentado; corrigi-lo na origem (automação do Linear) é decisão do Kalléo.
