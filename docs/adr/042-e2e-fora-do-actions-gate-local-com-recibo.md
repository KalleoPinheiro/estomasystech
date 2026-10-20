---
title: "ADR 042 — E2E fora do Actions: gate local com recibo e testes intocáveis"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-19
related: [docs/adr/021-e2e-contra-build-de-producao.md, docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/engineering/onboarding.md, AGENTS.md]
---

# ADR 042 — E2E fora do Actions: gate local com recibo e testes intocáveis

- **Data:** 2026-10-19
- **Status:** aceito (decisão de @KalleoPinheiro em 2026-10-19; complementa o [ADR-021](021-e2e-contra-build-de-producao.md), que segue valendo para a configuração do E2E)
- **Domínios afetados:** engenharia (CI, testes, fluxo de merge)

## Contexto

O plano é GitHub Pro com 3.000 min/mês de Actions; em 2026-10-19 os 3.000 estavam usados
(US$ 18 consumidos) e o reset ocorria 13 dias depois. Todo job falhava em 2 a 3 s sem executar
passo. Um run completo custava cerca de 25 a 30 min: `ci` 7,3 (medido), Docker 3 (medido), E2E em
`next dev` ~5 a 7 e build + E2E de produção ~9 a 12 (estimados a partir de medição local de 1,5 + 5,4
e 3,5 min). O E2E era ~60% do custo, e ainda disparava em todo push na `main` e na `staging`.
O E2E usa PGlite, então não valida Postgres: quem faz isso é o job Docker.
Medição completa no diagnóstico da thread "E2E fora do Actions" (arquivos do projeto, pasta `ci/`).

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — manter tudo e subir o teto de gasto | zero mudança | paga ~US$ 18/mês só de E2E, a cota volta a acabar |
| B — tirar só o E2E de `next dev` | pouco esforço | economiza ~5 a 7 de ~27 min; não cabe na cota |
| C — E2E fora do Actions, gate local com recibo (escolhida) | ~3× menos minutos; o E2E vira trava obrigatória e auditável | recibo é autodeclarado |
| D — runner self-hosted no WSL | minutos grátis, E2E no Actions | depende do PC ligado e executa código de PR nele |

## Decisão

- **Actions** roda só o gate rápido (`ci.yml`: typecheck, lint, sv, docs, cobertura, build), em `pull_request` e em `push` na `main` (a `staging` deixa de disparar CI). O job Docker mudou para `docker.yml` e só roda quando `Dockerfile`, compose, `deploy/`, scripts de backup/smoke ou `package-lock.json` mudam.
- **E2E** não roda mais no Actions. `npm run gate:local` roda, em ordem e parando na 1ª falha: typecheck, lint, sv, docs, integridade dos testes, cobertura, build, E2E de produção, E2E em `next dev` e, com daemon Docker, o smoke da imagem e do backup. Exige árvore limpa e imprime `E2E-GATE: <sha40> pass e2e=N etapas=... puladas=... min=X`.
- **Recibo:** o corpo do PR leva essa linha. `recibo-gate.yml` (segundos, roda também em `edited`) reprova recibo ausente, de outro commit (todo push novo invalida o anterior), `fail` ou sem as etapas obrigatórias (`REQUIRED_STEPS` em `scripts/gate/receipt.ts`). Etapas Docker puladas ficam registradas; quem cobre é o `docker.yml`.
- **Regra 7 do AGENTS.md:** merge só com CI verde **e** recibo do gate para o SHA do head. Regra anterior (CI 100% verde, 2026-09-25) fica estendida, não revogada.
- **Regra 8 (testes intocáveis):** nunca editar, afrouxar, apagar ou desligar teste, reduzir limiar de cobertura ou aumentar `retries`/`timeout` para resolver problema de desenvolvimento. Imposta de forma determinística em quatro camadas, com a mesma análise (`scripts/gate/test-integrity.ts`):
  1. hook `PreToolUse` do Claude Code (`.claude/hooks/protect-tests.sh`): bloqueia antes de gravar edição de asserção em teste existente, reescrita integral de teste, `skip`/`only`/`fixme`, e qualquer escrita em config de teste e nos arquivos do próprio gate. Teste novo passa. O dono libera a própria sessão com `GATE_OWNER_EDIT=1`;
  2. `pre-push` do husky: `npm run check:testes` sobre `origin/main...HEAD`;
  3. `gate:local`: etapa `integridade-de-testes`;
  4. `recibo-gate.yml`: a mesma checagem no diff do PR.

  Achados **proibidos** (nunca passam): teste desligado, limiar de cobertura reduzido, `retries`/`timeout` aumentado. Achados **justificáveis** (asserção removida ou alterada, arquivo de teste apagado, config de teste alterada) passam só com `TESTE-ALTERADO: <motivo de negócio, 20+ caracteres>` no PR.

## Consequências

- Custo por PR cai para ~8 a 11 min (~270 a 375 execuções por mês de 3.000 min, contra ~110).
- O gate local leva ~15 a 20 min na máquina de quem faz o merge; roda uma vez antes de marcar o PR como pronto, não a cada push (no loop: `test:changed`).
- **Limite honesto:** o recibo é autodeclarado e o `TESTE-ALTERADO:` é escrito por quem abre o PR, inclusive um agente que usa a conta do dono. O hook, o `pre-push` e o CI barram o descuido e o atalho óbvio, não um autor deliberado. A trava que não depende de confiança é um Environment do GitHub com revisor obrigatório (ou um segundo revisor); fica como pergunta aberta ao dono, pois depende do plano. O the-judge confere SHA e saída do gate antes do merge.
- O E2E deixa de ser verificado em ambiente limpo e independente; a CSP estrita de produção continua coberta, pois o `gate:local` roda `csp-producao.spec.ts` sobre o build.
- Revisão: 2026-11-30, com o consumo real em Settings > Billing. Sucesso: minutos por mês abaixo de ~60% da cota por 2 meses e nenhum erro de E2E chegando à `main`.
- Seguem como trabalho separado (tickets): 100% de cobertura, mutantes, BDD por cenário de negócio, matriz de exceções e ambiente local completo com Docker e massa de testes.
