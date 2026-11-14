---
title: "ADR 107 — Fila de próximos passos versionada, atualizada em todo handoff"
status: frozen
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-14
related:
  - docs/adr/102-handoff-por-issue-sem-conflito.md
  - docs/adr/104-posse-verificada-por-ci-e-cadencia-de-release.md
  - docs/engineering/convivencia-llms.md
---

# ADR 107 — Fila de próximos passos versionada, atualizada em todo handoff

- **Data:** 2026-11-14
- **Status:** aceito (issue #834; decisão de @KalleoPinheiro em 2026-11-14, a partir da dúvida se isso não deveria
  morar nas regras de handoff). É adendo ao [ADR-102](102-handoff-por-issue-sem-conflito.md), que é congelado, e por
  isso vem em ADR novo.
- **Domínios afetados:** engenharia (fluxo de PR e troca de agente).

## Contexto

O handoff por issue (ADR-102) registra o que foi feito. `npm run estado` (ADR-104) gera o estado da release. A
**ordem do que vem a seguir e o porquê** vivia na memória de quem coordena e em comentários de issue e PR. Os agentes
se revezam e nunca atuam juntos (ADR-105 § 9): o que entra não vê a memória do que saiu, comentário pode não ser lido
e o PR que o carrega pode ser mergeado e esquecido.

## Decisão

1. Existe **uma** fila ordenada, versionada em `.specs/archive/handoff/PROXIMOS-PASSOS.md`. Cada item traz a issue,
   por que está naquela posição, dependências e o que espera o Kalléo. Curta, em lista.
2. **Todo PR que entrega uma issue** atualiza a fila no mesmo PR: remove o entregue, reordena o que mudou e acrescenta
   o que surgiu. PR só de documentação que não muda a ordem não precisa tocá-la.
3. **Toda troca de agente** (ADR-105 § 9) atualiza a fila no mesmo PR ou, sem PR, num PR só de docs antes de soltar a
   reserva. Se os créditos acabarem antes do PR, quem entra reconstrói a fila a partir de
   `npm run estado` e dos PRs abertos e a atualiza no primeiro PR que abrir. Quem entra lê a fila e `reports/estado-release.md` antes de pedir reserva.
4. A fila é escrita em linguagem neutra: sem nome de fornecedor (ADR-106). Comentário em issue ou PR **não** substitui
   a fila.
5. Em divergência, valem o remoto e as issues; quem notar corrige a fila no mesmo PR.

## Consequências

- A ordem sobrevive à troca de agente, ao merge do PR e à perda da memória de sessão.
- Cada PR de entrega ganha uma edição pequena num arquivo compartilhado. Como o arquivo é único, dois PRs podem
  conflitar nele; a resolução é por linha de item e cabe a quem atualiza a branch.
- Na primeira entrega a regra é só texto. A verificação por máquina (check que barra PR sem atualizar a fila) fica na
  [#835](https://github.com/KalleoPinheiro/estomasystech/issues/835), v0.8.0.
