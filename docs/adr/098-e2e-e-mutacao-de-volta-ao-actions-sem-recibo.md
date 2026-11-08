---
title: "ADR 098 — E2E e mutação de volta ao Actions, sem recibo do gate local"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
related:
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md
  - docs/adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md
  - docs/adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md
---

# ADR 098 — E2E e mutação de volta ao Actions, sem recibo do gate local

- **Data:** 2026-11-08
- **Status:** aceito (fase 2a do ADR-097, issue #757; "OK" escrito de @KalleoPinheiro em 2026-11-08, que
  também autoriza esta issue a mexer em `scripts/gate/` e `recibo-gate.yml`, regra 8). Supera o
  [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md) no que ele decide sobre **onde o E2E roda e o
  recibo `E2E-GATE:`**, e a parte do [ADR-093](093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md) que
  tirou a mutação do PR. A política de rascunho do ADR-093 **continua valendo**.
- **Domínios afetados:** engenharia (CI, gate, fluxo de merge).

## Contexto

O ADR-042 tirou o E2E do Actions e o trocou por um recibo autodeclarado (`npm run gate:local`) porque a
cota de minutos tinha acabado. O repositório agora é público e os runners padrão não gastam cota. O
`gate-pr.yml` (ADR-084, ADR-087) já roda integração em Postgres 18 e E2E de produção e dev em shards nos PRs
contra `release/**`, mas o PR contra a `main` ainda dependia do recibo colado no corpo, e a mutação por arquivo
alterado só existia no `gate:local` e na rotina mensal. O recibo é autodeclarado: não prova nada que o
Actions não prove melhor, em ambiente limpo.

## Decisão

1. **E2E no Actions em todo PR.** O gatilho de `gate-pr.yml` passa a incluir a `main` (`release/*` e
   `hotfix/*` → `main`). O check exigido continua sendo o agregador **Gate do PR**.
2. **Mutação por arquivo alterado no Actions.** Novo job `mutacao` em `gate-pr.yml`: Stryker incremental só
   nos arquivos de regra que o diff altera (`scripts/gate-cloud/impacto.ts --mutacao`), com o `break` de
   `stryker.config.json` valendo e o cache do arquivo incremental compartilhado com a rotina mensal. Entra no
   agregador: se devia rodar e não passou, o Gate do PR reprova. Contra a `main` ela não repete, porque a
   release já mutou cada PR do lote; a rodada completa segue mensal.
3. **Sem recibo.** `recibo-gate.yml` deixa de conferir a linha `E2E-GATE:`; o PR não a carrega mais
   (`scripts/gate/verify-receipt.ts` removido). Ficam no workflow a **integridade dos testes** (regra 8) e a
   seção `## Homologação` (ADR-052). O nome do arquivo e o id do job `recibo-gate` ficam por compatibilidade
   com testes e documentos; o nome do check passa a ser **Integridade dos testes e homologação**.
4. **`gate:local` continua existindo**, opcional no loop local e usado pelo `release:cut` (perfil release,
   com Docker e backup) para gravar o selo do corte (ADR-088). Sua linha `E2E-GATE:` não é mais exigida em
   PR; `scripts/gate/receipt.ts` segue porque o corte a usa.
5. **Regra 8 intacta.** O hook, o `pre-push` e a checagem no CI (`check-test-integrity.ts`) continuam. As
   duas mudanças de teste existente deste ADR (C47 de `ci-workflow.test.ts` e a lista de jobs de
   `gate-pr-workflow.test.ts`) saem com `TESTE-ALTERADO:` no PR.

6. **Portão de risco.** Novo `portao-risco.yml` (fase 2c): `check:risco` classifica o diff e, na classe 3, o job
   `aprovacao-classe-3` fica parado no Environment protegido de mesmo nome até o dono aprovar; `portao-risco` é o
   check a exigir no ruleset. O veredito do the-judge (`check:veredito`) **não** entra na v0.6.2 (issue #764, v0.7.0): como todas as PRs saem com o login do dono, filtro por autor não prova nada; ligá-lo pede definir
   quem pode comentar (só um autor confiável) e o identificador que distingue as sessões dos agentes.

## Consequências

- Mais minutos de Actions por PR; aceito com repositório público e runners padrão. Se o repositório voltar a
  ser privado, o plano B é o fluxo do ADR-042/093.
- O E2E deixa de depender da máquina do operador e passa a rodar em ambiente limpo e independente.
- Fora do repositório (só o dono): trocar nos rulesets o check exigido antigo ("Recibo do gate local +
  integridade dos testes") por **Integridade dos testes e homologação**, exigir **Gate do PR** também na
  `main` e confirmar com um PR de teste que um E2E vermelho barra o merge.
- Também só do dono: criar o Environment `aprovacao-classe-3` com ele como revisor **antes** de exigir
  `portao-risco`; sem revisor o GitHub cria o Environment vazio e a classe 3 passaria sozinha.
- O tempo do check, medido no primeiro PR com a mutação ligada, fica registrado na issue #757.
