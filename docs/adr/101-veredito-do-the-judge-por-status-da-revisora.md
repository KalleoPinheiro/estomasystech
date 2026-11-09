---
title: "ADR 101 — Veredito do the-judge por commit status da thread revisora, sem API"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-09
related:
  - docs/adr/100-veredito-do-the-judge-montado-no-actions.md
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/engineering/classe-de-risco.md
---

# ADR 101 — Veredito do the-judge por commit status da thread revisora, sem API

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

1. Ao aprovar, a **thread revisora** (nunca a que implementou) publica no head SHA o commit status:
   `POST /repos/<dono>/<repo>/statuses/<sha>` com `context=the-judge`, `state=success`, `description` curta e
   `target_url=https://github.com/<dono>/<repo>/pull/<n>#pullrequestreview-<id>` (a review do the-judge, com o
   veredito `the-judge/v1` no corpo). Reprovação publica `failure` com o mesmo contexto.
2. O check `Veredito do the-judge` (mesmo nome, mesmo ruleset) **não chama modelo**: `scripts/release/status-judge.ts`
   exige que o status mais novo do contexto `the-judge` no SHA seja `success`, que o `target_url` aponte para uma review
   desta PR, e que a review seja do mesmo SHA, enviada e cite o `the-judge`. Sem isso, vermelho (falha fechado).
3. **Push novo** muda o SHA: o status antigo deixa de valer e a revisora julga e publica de novo. Um `failure` ou
   `pending` posterior no mesmo SHA revoga um `success`.
4. Depois de publicar o status, a revisora **roda de novo** o check (re-run do workflow) para ele ler o status.
5. Caminho protegido continua exigindo também o Environment `aprovacao-classe-3` (aprovação humana do dono).
6. O job perde `id-token`, a federação e as variáveis `ANTHROPIC_*` e `JUDGE_MODEL`. O Kalléo apaga a regra de
   federação, a conta de serviço e as variáveis no fim. A chave `VEREDITO_JUDGE_ATIVO` continua só como interruptor de
   introdução: o ruleset passa a depender do status quando ela for `true`.
7. PR release→`main` continua conferida por `conferir-release` (cada PR da release com o check aprovado).

## Risco aceito

Todas as threads, implementadoras e revisoras, usam o login do dono, e o GitHub não distingue quem chamou a API de
status. **Nada impede tecnicamente que a thread implementadora publique o status.** O check prova que existe uma
review do the-judge no SHA certo, não quem a escreveu.

**Mitigação (processo):** só a thread revisora publica o status; quem editou o código não aprova (regra do
coordenador); a review apontada traz o veredito do the-judge e fica no histórico da PR para auditoria; a classe 3 segue
com aprovação humana; o merge na `main` é sempre do dono. Identidade separada para a revisora (um GitHub App só dela)
fecha a lacuna e fica como evolução, se o risco deixar de ser aceitável.

## Consequências

- Custo de API zero; o veredito depende de uma thread revisora ter rodado, o que o merge já exigia por processo.
- O código de chamada ao modelo (`julgar-pr*.ts` fora de `--classificar`, `veredito-judge*.ts`) fica sem uso no
  workflow; remoção na limpeza da v0.8.0.
- Teste do workflow alterado por mudança de requisito do dono (sem API): `TESTE-ALTERADO` na PR.
