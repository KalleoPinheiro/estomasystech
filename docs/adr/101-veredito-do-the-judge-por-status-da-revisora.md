---
title: "ADR 101 — Veredito do the-judge pela review da thread revisora, sem API"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-09
related:
  - docs/adr/100-veredito-do-the-judge-montado-no-actions.md
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/engineering/classe-de-risco.md
---

# ADR 101 — Veredito do the-judge pela review da thread revisora, sem API

- **Data:** 2026-11-09
- **Status:** aceito (issue #796; decisão do @KalleoPinheiro: nunca haverá saldo no Console da Anthropic). **Substitui
  apenas a parte do [ADR-100](100-veredito-do-the-judge-montado-no-actions.md) que chama a API da Anthropic**
  (itens da federação de identidades e do modelo no job). O resto do ADR-100 segue: check `Veredito do the-judge`
  no ruleset, `pull_request_target`, classe 3 no Environment `aprovacao-classe-3`, `conferir-release` na release→`main`.
- **Domínios afetados:** engenharia (portões do PR).

## Contexto

O job do ADR-100 chamava a API por federação de identidades, mas isso exige saldo no Console, que não existirá. O
the-judge já roda, sem custo de API, nas threads revisoras do Claude Code. Falta só um rastro verificável dessa revisão
no GitHub.

## Decisão

1. Ao julgar, a **thread revisora** (nunca a que implementou) publica na PR uma **review COMMENT** (o autor da PR e a
   revisora usam o mesmo login, então o GitHub não permite aprovar). A **primeira linha não vazia** do corpo é o
   contrato: cita `the-judge/v1` e traz o veredito, por exemplo `## the-judge/v1 — PR #797 @ <sha> — veredito: APPROVE`
   ou `**the-judge/v1: APPROVE**`. Veredito sem `APPROVE`, ou com `REQUEST_CHANGES`, `REJECT` ou `BLOCK`, reprova.
   Não há commit status: a review é o rastro (decisão do @KalleoPinheiro, 2026-11-09).
2. O check `Veredito do the-judge` (mesmo nome, mesmo ruleset) **não chama modelo**: `scripts/release/review-judge.ts`
   lê as reviews da PR e considera só as `COMMENTED` do **head SHA** (`commit_id`) com a marca `the-judge/v1` na
   primeira linha; vale a **mais nova** e ela precisa ser `APPROVE`. Sem review do the-judge no SHA, ou com a mais nova
   reprovando, fica vermelho (falha fechado, inclusive em erro de API).
3. **Push novo** muda o SHA: a review antiga deixa de valer e a revisora julga e publica de novo. Uma review posterior
   do mesmo SHA que não seja `APPROVE` revoga a anterior.
4. Depois de publicar a review, a revisora **roda de novo** o check (re-run do workflow) para ele a ler.
5. Caminho protegido continua exigindo também o Environment `aprovacao-classe-3` (aprovação humana do dono).
6. O job perde `id-token`, a federação e as variáveis `ANTHROPIC_*` e `JUDGE_MODEL`. O Kalléo apaga a regra de
   federação, a conta de serviço e as variáveis no fim. A chave `VEREDITO_JUDGE_ATIVO` continua só como interruptor de
   introdução: o ruleset passa a depender da review quando ela for `true`.
7. PR release→`main` continua conferida por `conferir-release` (cada PR da release com o check aprovado).

## Risco aceito

Todas as threads, implementadoras e revisoras, usam o login do dono, e o GitHub não distingue quem chamou a API de
review. **Nada impede tecnicamente que a thread implementadora publique uma review `the-judge/v1 APPROVE`.** O check
prova que existe uma review do the-judge no SHA certo, não quem a escreveu.

**Mitigação (processo):** só a thread revisora publica o status; quem editou o código não aprova (regra do
coordenador); a review apontada traz o veredito do the-judge e fica no histórico da PR para auditoria; a classe 3 segue
com aprovação humana; o merge na `main` é sempre do dono. Identidade separada para a revisora (um GitHub App só dela)
fecha a lacuna e fica como evolução, se o risco deixar de ser aceitável.

## Consequências

- Custo de API zero; o veredito depende de uma thread revisora ter rodado, o que o merge já exigia por processo.
- O código de chamada ao modelo (`julgar-pr*.ts` fora de `--classificar`, `veredito-judge*.ts`) fica sem uso no
  workflow; remoção na limpeza da v0.8.0.
- Teste do workflow alterado por mudança de requisito do dono (sem API): `TESTE-ALTERADO` na PR.
