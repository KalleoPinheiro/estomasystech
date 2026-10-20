---
title: "ADR 049 — Matriz de casos de exceção por domínio, com teste de estrutura"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/048-bdd-com-describe-it-e-rastreabilidade-de-regras-criticas.md]
---

# ADR 049 — Matriz de casos de exceção por domínio, com teste de estrutura

- **Data:** 2026-10-20
- **Status:** aceito (issue #408, derivada do ADR-042; pedido do Kalléo em 2026-10-19: validar todos os casos de exceção)
- **Domínios afetados:** todos (documentação e testes)

## Contexto

Caminhos de erro, concorrência e borda eram testados domínio a domínio, sem uma lista única: não dava para
responder "o que acontece com entrada inválida, outra empresa ou duplicidade em agenda, financeiro, portal?"
sem ler centenas de testes, e um caso podia ficar sem teste sem ninguém ver.

## Decisão

**Uma tabela por domínio, em `docs/domains/<d>/excecoes.md`, e um teste de estrutura que a cruza com os testes.**

- **Categorias fixas** (todas obrigatórias em cada domínio): entrada inválida, sem permissão, outra clínica,
  duplicidade, concorrência, falha de integração, estado terminal. Cada categoria tem uma ou mais linhas com
  `Caso`, `Regra` (id `*-RN-*` do README do domínio, ou `—`) e `Teste`.
- **Coluna Teste:** `` `arquivo.test.ts` › "trecho literal do título" `` (o mesmo vínculo por título do
  [ADR-048](048-bdd-com-describe-it-e-rastreabilidade-de-regras-criticas.md), sem editar teste existente) ou
  `n/a — motivo`, com o motivo específico do domínio (ex.: relatório é só leitura).
- **Teste de estrutura:** `tests/bdd/matriz-excecoes.test.ts` falha se um domínio não tem a matriz, falta
  categoria, a regra citada não existe nas tabelas de `docs/domains`, o arquivo ou o título citado não existe, ou
  uma linha não cita teste nem `n/a` com motivo. A lógica está em `tests/support/matriz-excecoes.ts` e tem teste
  próprio de que cada falha acontece.
- **Lacuna vira teste novo:** caso aplicável sem teste ganhou teste novo em `*-excecoes.test.ts` (regra 8: nenhum
  teste existente foi alterado); nunca vira `n/a`.
- **Definition of Done:** funcionalidade nova que cria um caminho de exceção atualiza a matriz do domínio no mesmo PR.

## Consequências

- `n/a` é a única saída para categoria que não se aplica, e o motivo fica escrito e revisável.
- Renomear um teste citado quebra o teste de estrutura, o que é o objetivo (mesmo custo do ADR-048).
- A matriz mostra o que **existe**; o conjunto de casos por categoria é o que o domínio já expõe, não uma
  especificação nova. Caso de exceção novo é decisão de produto e entra como pergunta aberta.
