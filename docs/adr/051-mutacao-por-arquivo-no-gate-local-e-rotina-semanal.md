---
title: "ADR 051 — Mutação por arquivo alterado no gate local e rotina semanal"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/047-testes-de-mutacao-com-stryker.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md]
---

# ADR 051 — Mutação por arquivo alterado no gate local e rotina semanal

- **Data:** 2026-10-20
- **Status:** aceito (decisão de @KalleoPinheiro, 2026-10-20; substitui a parte "não no `gate:local`" do ADR-047)
- **Domínios afetados:** engenharia (testes)

## Contexto

O ADR-047 deixou a mutação fora do `gate:local` porque a rodada completa leva ~1h20. Um arquivo leva de 1 a
10 minutos, então o custo é proporcional à mudança quando se muta só o que o PR alterou.

## Decisão

- **No `gate:local`:** se o diff contra `origin/main` (`GATE_BASE` troca a base) muda arquivo `.ts` de
  `src/domain/**` ou `src/application/**` (sem `.d.ts` nem `index.ts`), roda `test:mutacao -- --mutate <arquivos>`
  e falha abaixo de `thresholds.break`. O limiar vale **por arquivo alterado** (o placar do conjunto mutado).
  Etapa `mutacao`, depois do E2E.
- **No recibo e no CI:** a etapa `mutacao` entra na linha `E2E-GATE:` quando rodou. O job `recibo-gate` passa
  `--base-ref` a `verify-receipt.ts` e reprova recibo sem `mutacao` quando o diff muda regra.
- **Rotina semanal:** `.github/workflows/mutacao-semanal.yml` (domingo 06:00 UTC e `workflow_dispatch`): rodada
  completa com `--incremental` e cache do arquivo incremental, relatório como artefato. Confere o placar global
  e pega a deriva entre PRs; não bloqueia PR.
- **Degrau seguinte:** `thresholds.break` sobe para 90 depois de uma rodada completa ≥ 90%.

## Consequências

- Custo no gate só quando o PR muda regra. PR de UI, infraestrutura ou docs não paga nada.
- A primeira rodada semanal é a mais longa (~1h20+); as seguintes são incrementais. Custa minutos do plano Pro
  (3.000/mês): acompanhar, e usar só `workflow_dispatch` se pesar.
- O recibo continua autodeclarado; a trava real é o ruleset da `main`.
