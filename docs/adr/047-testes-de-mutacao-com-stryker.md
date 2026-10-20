---
title: "ADR 047 — Testes de mutação com Stryker em domain e application"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/046-cobertura-100-nas-camadas-de-regra.md]
---

# ADR 047 — Testes de mutação com Stryker em domain e application

- **Data:** 2026-10-20
- **Status:** aceito (issue #406; pedido de @KalleoPinheiro em 2026-10-19)
- **Domínios afetados:** engenharia (testes)

## Contexto

Cobertura mede linha executada, não se o teste falharia diante de um bug. O mutante troca um operador, uma
constante ou uma condição no código e o teste precisa reprovar; mutante que sobrevive é regra sem teste de verdade.

## Decisão

- **Ferramenta:** Stryker (`@stryker-mutator/core` e `vitest-runner`), `npm run test:mutacao`, relatório em
  `reports/mutation` (HTML e JSON, fora do git). Escopo: `src/domain/**` e `src/application/**`.
- **Testes da rodada:** `vitest.mutacao.config.mts` roda só `tests/domain` e `tests/application`. A suíte inteira
  (444 arquivos, PGlite) estoura o tempo da rodada inicial do Stryker; mutante que só a camada de API cobre fica
  como "sem cobertura", o que subestima o placar em vez de inflá-lo.
- **Medição (sem número inventado):**

  | Rodada | Mutantes | Detectados | Sobreviventes | Sem cobertura | Placar |
  | --- | --- | --- | --- | --- | --- |
  | Inicial (main após #405) | 7.930 | 6.382 | 1.152 | 396 | **80,48%** |
  | Esta entrega | 7.930 | 6.818 | 924 | 188 | **85,98%** |

- **Meta em degraus de 5 pontos.** Degrau atual: **85%**, gravado em `thresholds.break` de `stryker.config.json`
  (a rodada falha abaixo dele). Próximo degrau: 90%, quando o de 85% estiver estável.
- **Sobrevivente vira teste novo, nunca exclusão do mutante** (regra 8): não se usa `mutate` com exclusões, nem
  `// Stryker disable`. Mutante equivalente (mesmo comportamento) entra numa lista curta com motivo, a decidir
  caso a caso pelo dono.
- **Onde roda:** local, quando o PR muda regra em `domain` ou `application`; não no Actions (custo: ~1h20 com 4
  núcleos) e não no `gate:local` (`scripts/gate/` é do dono). A proposta de inclusão no gate está em
  `/mnt/project-files/ci/proposta-mutacao-no-gate.md`.
- **Testes novos** em `tests/domain/mutacao/` e `tests/application/mutacao/`, com cenários Dado/Quando/Então;
  nenhum teste existente foi alterado.

## Consequências

- O placar vira medida de qualidade dos testes de regra, ao lado da cobertura (ADR-046).
- Rodada completa é lenta; para um arquivo: `npm run test:mutacao -- --mutate src/domain/shared/phone.ts`.
- Os arquivos com mais sobreviventes hoje (próximos candidatos): `image-sanitizer`, `data-subject-requests`
  (resto), `schedule-availability`, `clinic`, `majority-review`, `waitlist`, `payouts`.
