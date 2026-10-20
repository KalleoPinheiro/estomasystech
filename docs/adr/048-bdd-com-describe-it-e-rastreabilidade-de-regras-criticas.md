---
title: "ADR 048 — BDD com describe/it e teste de rastreabilidade das regras críticas"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/046-cobertura-100-nas-camadas-de-regra.md]
---

# ADR 048 — BDD com describe/it e teste de rastreabilidade das regras críticas

- **Data:** 2026-10-20
- **Status:** aceito (issue #407; decisão de @KalleoPinheiro em 2026-10-20, seguindo a recomendação)
- **Domínios afetados:** engenharia (testes)

## Contexto

Os testes já se chamam `Feature / Cenário / Dado-Quando-Então`, mas nada ligava uma regra `*-RN-*` de
`docs/domains/<d>/README.md` ao cenário que a garante: uma regra podia perder o teste sem ninguém ver.

## Decisão

- **Formato:** `describe/it` em Dado/Quando/Então, com os termos do `CONTEXT.md`. Sem arquivos `.feature` nem
  runner Gherkin (`@amiceli/vitest-cucumber`, `playwright-bdd`): custo de uma segunda sintaxe e de um runner,
  para o mesmo resultado que o padrão atual do repositório.
- **Rastreabilidade:** `tests/bdd/regras-criticas.ts` lista cada regra crítica e o(s) cenário(s) que a garantem
  (arquivo + trecho literal do título). `tests/bdd/rastreabilidade.test.ts` falha se a regra não existe nas tabelas
  de `docs/domains`, se não tem cenário, se o título não está em Dado/Quando/Então ou se sumiu do arquivo.
  A lógica fica em `tests/support/rastreabilidade-bdd.ts` e tem teste próprio de que a falha acontece.
- **Ligar sem editar teste existente:** o vínculo é por título citado no manifesto, não por tag dentro do teste;
  assim a regra 8 não é tocada. Renomear um cenário citado quebra o teste de rastreabilidade, o que é o objetivo.
- **O que é crítica:** a regra cuja falha causa dano que a clínica não desfaz: vazamento ou adulteração de dado
  de saúde, dinheiro cobrado ou repassado errado, acesso entre papéis ou empresas, conflito de agenda. Regra nova com
  esse perfil entra no manifesto no mesmo PR (Definition of Done).

## Consequências

- Primeiro marco: 18 regras críticas em 6 domínios (acesso, agenda, estoque, financeiro, prontuário, portal). As
  três sem teste próprio no formato de negócio ganharam cenários em `tests/bdd/cenarios-criticos.test.ts`.
- **Pergunta aberta ao dono (não decidida aqui):** quais das demais ~160 regras entram como críticas. A lista inicial
  foi escolhida pelo critério acima, limitada a regras verificáveis em teste de domínio; regras de UI e de infraestrutura
  ficam para um segundo marco.
- Compõe com a matriz de exceções por funcionalidade (T5), que reaproveita os mesmos ids.
