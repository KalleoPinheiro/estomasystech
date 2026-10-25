---
title: "ADR 067 — Configurações: página única com índice fixo no celular; sub-rotas ficam para depois da v0.2.0"
status: superseded
superseded_by: docs/adr/072-configuracoes-em-sub-rotas.md
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-23
related: [docs/domains/acesso/README.md, docs/adr/002-autorizacao-em-duas-camadas.md]
---

# ADR 067 — Configurações: página única com índice fixo no celular; sub-rotas ficam para depois da v0.2.0

- **Data:** 2026-10-23
- **Status:** aceito (decisão do orquestrador como Product Owner, mandato de @KalleoPinheiro de 2026-10-21).
- **Domínios afetados:** acesso

## Contexto

A segunda rodada de QA da staging ([#522](https://github.com/KalleoPinheiro/estomasystech/issues/522)) mediu `/configuracoes` em 360 px com cerca de 8.400 px de altura: nove ou mais seções numa página só, índice de links no topo que some da tela depois do primeiro scroll, sem volta ao índice. A primeira decisão foi transformar cada seção numa sub-rota (`/configuracoes/[secao]`), mas isso muda o contrato de rota e de âncora e obriga a reescrever mais de uma dezena de testes de tela e de E2E que abrem `/configuracoes` esperando todas as seções (regra 8). Para um item P3, o custo é alto demais agora.

## Decisão

1. **A página única continua**, com os mesmos `id` de seção e as mesmas âncoras (`#dados`, `#identidade`, `#privacidade`, `#horarios`, `#feriados`, `#google-agenda`, `#email`, `#contas`). As permissões por papel não mudam (o Atendente continua sem «Canal de e-mail»).
2. **No celular o índice vira uma faixa fixa no topo** («Ir para a seção»): chips que rolam na horizontal, cada um com alvo de toque de 44 px. No computador continua a coluna lateral.
3. **Cada seção termina com «Voltar ao índice»** (só abaixo de `lg`), que leva à faixa.
4. **Ao navegar por âncora a seção não fica atrás da faixa**: `scroll-margin-top` maior abaixo de `lg`.
5. **Sub-rotas `/configuracoes/[secao]` adiadas para o roadmap pós-v0.2.0**, quando o custo de migrar os testes puder ser pago. A issue #522 fica aberta só com essa parte.

## Consequências

- Nenhum link, âncora ou teste existente muda.
- A página continua longa no celular; o índice fixo e a volta ao índice resolvem a navegação, não a altura.
- Quando as sub-rotas entrarem, a regra 8 exigirá `TESTE-ALTERADO` nos testes que renderizam `<SettingsPage />` com todas as seções e nos E2E que abrem `/configuracoes`, e um novo ADR substituirá este.
