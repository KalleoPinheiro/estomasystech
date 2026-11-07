# ADR-093 — quando os jobs de CI rodam

**Approved**: 2026-11-03 - user: "Implemente o ADR-093 (QUANDO os jobs de CI rodam) do Estomasystech, só em runners hospedados do GitHub."

## Intent

O Actions do plano Pro (3.000 min/mês, orçamento US$ 0) está quase no fim. Cada rodada completa custa ~66 min. O gate e o CI deixam de rodar o pipeline pesado em todo push de PR ainda em rascunho. O PR nasce em rascunho; "Gate do PR" e `ci` ficam vermelhos de propósito até alguém marcar pronto uma vez.

## Out of scope

`infra/ci-runner/`, job `rota`, `RUNNER_PESADO`, batimento, `runs-on` por expressão, ADR-094, `runner.arch` em chaves de cache, `docker.yml`, `release-cut.yml`, `staging.yml`, `scripts/gate/`.
