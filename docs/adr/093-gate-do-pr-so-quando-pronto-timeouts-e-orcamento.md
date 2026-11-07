---
title: "ADR 093 — Gate do PR só quando o PR está pronto, timeouts em todo job e orçamento de minutos do Actions"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-03
related:
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md
  - docs/adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md
  - docs/adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md
  - docs/adr/088-prova-unica-do-corte-e-pre-voo-do-release-cut.md
  - docs/engineering/gate-na-nuvem.md
---

# ADR 093 — Gate do PR só quando o PR está pronto, timeouts em todo job e orçamento de minutos do Actions

- **Data:** 2026-11-03
- **Status:** aceito (pedido de implementação de @KalleoPinheiro em 2026-11-03). Altera o gatilho do
  [ADR-087](087-gate-em-jobs-paralelos-com-shards-e-cache.md). Antecipa a revisão de 2026-11-30 do
  [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md) quanto à premissa de cota. Não muda limiar
  nem teste existente (regra 8) e não toca `scripts/gate/`.
- **Onde os jobs pesados rodam** fica para um ADR posterior (runner próprio). Este ADR decide **quando**
  rodam, e só em runner hospedado do GitHub. O job `politica` guarda o nome e a saída `completo` para
  essa absorção futura.
- **Domínios afetados:** engenharia (CI, gate, custo).

## Contexto

Plano GitHub Pro, cota incluída de 3.000 min/mês no Linux de 2 núcleos (US$ 0,006/min). O `ubuntu-slim`
(1 vCPU) custa US$ 0,002/min. Cada job arredonda para cima ao minuto; falha e re-run são cobrados. O
orçamento pago acima da cota está descartado (US$ 0).

De 1º/11 a 2/11 14:33 BRT o consumo foi cerca de 2.454 min faturáveis. Uma rodada feat→release custa
cerca de 66 a 74 min. No ritmo daqueles dois dias o mês fecharia em cerca de 14× a cota. O
[ADR-087](087-gate-em-jobs-paralelos-com-shards-e-cache.md) recolocou integração, E2E e mutação em todo
push de PR para `release/**`, inclusive enquanto o PR ainda está em iteração. Vários jobs não tinham
`timeout-minutes` (o padrão do GitHub é 360).

Restrições que condicionam o desenho: job pulado conta como sucesso, inclusive em check exigido; filtro
de `paths` no gatilho deixa o check exigido pendente; merge queue não existe em repositório pessoal
privado; o `ubuntu-slim` não tem Docker nem `services:` e morre aos 15 min.

## Opções consideradas

| Opção | Decisão |
| --- | --- |
| `timeout-minutes` em todo job, pelo máximo medido mais folga | Aceita |
| `ubuntu-slim` só em política, agregadores sem checkout, escopo, impacto e recibo | Aceita |
| Recibo que pula `edited` quando o corpo não muda | Rejeitada: check pulado mascara recibo reprovado no mesmo SHA |
| Gate completo só em PR pronto; rascunho reprova (fail-closed) | Aceita |
| Label `gate:completo` para rodar o gate em rascunho | Rejeitada: qualquer label dispara e cancela uma rodada em curso |
| A mesma política no `ci.yml`, no mesmo PR | Aceita |
| Integração e E2E só no release-cut | Contingência, não esta entrega |
| Mutação só no `workflow_dispatch` (ou no corte, sem editar `release-cut.yml`) | Aceita |
| Runner na VPS de produção | Rejeitada (código de PR no host de produção) |
| Orçamento pago | Descartada (US$ 0) |

## Decisão

1. **Gatilho.** `pull_request: types: [opened, synchronize, reopened, ready_for_review]` em
   `gate-pr.yml` (`branches: ["release/**"]`) e no `ci.yml`. Sem `labeled`, sem `edited` e sem `paths`.
   O `edited` do `recibo-gate.yml` continua: o `check-homologacao.ts` lê o corpo.
2. **Política e agregador do gate.** O job `politica` (`ubuntu-slim`, sem checkout, timeout 5) calcula
   `completo = !(pull_request && draft)`. `impacto` depende dele e só roda com `completo == true`. Os
   jobs pesados continuam condicionados ao `impacto` (o `if` não traz `always()`, então o `success()`
   implícito os pula quando o `impacto` é pulado). O agregador "Gate do PR" (`if: always()`,
   `ubuntu-slim`, timeout 5) **reprova** quando `completo != true`, com a mensagem "PR em rascunho: o
   gate completo roda quando o PR for marcado como pronto". Fora isso, o que devia rodar tem de ser
   `success` e o que não devia tem de ser `skipped`.
3. **Mesma política no `ci.yml`.** Em rascunho rodam só o `escopo` (slim, timeout 10) e o job `ci`
   (`ubuntu-24.04`, timeout 15), que reprova no primeiro passo, antes de `npm run build`. Estático e
   cobertura não rodam. O build continua no job `ci`. O C43 não trava `runs-on` nem a ordem dos passos;
   o job permanece em `ubuntu-24.04` porque, com o PR pronto, ele ainda faz o build, e slim não builda.
4. **Timeouts** (máximo medido mais folga). `docker.yml`, `release-cut.yml` e `staging.yml` ficam de fora.

   | Job | Minutos |
   | --- | --- |
   | `politica`, agregador "Gate do PR", `ultimo-dia` | 5 |
   | `escopo`, `impacto`, `recibo-gate`, `estatico`, `server-first-provado` | 10 |
   | `cobertura-shard`, `cobertura`, job `ci` (build) | 15 |
   | `integracao`, `e2e-prod`, `e2e-dev` | 20 |
   | `mutacao` em `mutacao-mensal.yml` | 120 |

   O 40 da tabela do rascunho era o teto da mutação **incremental do PR** (máximo medido 26,9 min).
   Esse job saiu do PR. A rodada completa mensal mede cerca de 1h20; 40 a cortaria sempre. O teto dela
   desce de 180 para **120**.
5. **`ubuntu-slim`** só em `politica`, no agregador `gate-pr` (sem checkout), no `escopo`, no `impacto`
   e no `recibo-gate`. Nunca em job com `services:`, Docker, build, E2E ou cobertura.
6. **Mutação sai do PR.** Não há job `mutacao` no `gate-pr.yml`. A rodada completa continua em
   `mutacao-mensal.yml`, por schedule ou `workflow_dispatch` (é assim que se dispara no corte). O
   `release-cut.yml` não muda. O `gate:local` e o perfil `pr` do `gate-cloud.sh` seguem mutando o
   arquivo alterado; isso não gasta Actions.
7. **Processo.** PR para `release/**` nasce em rascunho, itera com `gate-cloud`/`gate:local` e é
   marcado pronto uma vez. Em rascunho, "Gate do PR" e `ci` ficam vermelhos de propósito. Cada push
   depois de pronto paga a rodada completa.

**Fica com o dono:** tornar "Gate do PR" check exigido em `release/**`. Sem isso, a política não
garante a cobertura antes do squash. Orçamento pago permanece descartado.

## Consequências

- O gate deixa de rodar a cada push de iteração. Nenhum job fica 6 h preso. Os jobs leves custam 1/3.
  Pulado não vira sucesso no agregador.
- PR em rascunho mostra "Gate do PR" e `ci` vermelhos. É intencional e está no `AGENTS.md`.
- Quem marca pronto cedo paga o gate de novo a cada push.
- No volume de 1º–2/11, nem todas as opções hospedadas juntas cabem nos 3.000 min. Este ADR não
  resolve sozinho o esgotamento.
- O teste novo `tests/infrastructure/gate-pr-workflow.test.ts` trava o gatilho, os timeouts, a ausência
  de `services:` e de build em slim, e a matriz do agregador (executada com `bash -e`). O C47 não muda.
- **Revisão:** 2026-11-30, junto com o ADR-042. Sucesso = abaixo de 60% da cota por 2 meses, sem bug
  escapando do gate para o corte.

## Relacionado

- [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md), [ADR-087](087-gate-em-jobs-paralelos-com-shards-e-cache.md), [ADR-088](088-prova-unica-do-corte-e-pre-voo-do-release-cut.md)
- [`docs/engineering/gate-na-nuvem.md`](../engineering/gate-na-nuvem.md)
