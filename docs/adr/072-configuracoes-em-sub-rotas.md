---
title: "ADR 072 — Configurações em sub-rotas /configuracoes/<seção>, com índice em cartões"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related: [docs/domains/acesso/README.md, docs/adr/002-autorizacao-em-duas-camadas.md, docs/adr/067-configuracoes-em-pagina-unica-com-indice-fixo-no-celular.md, docs/adr/069-dados-no-servidor-e-politica-de-cache.md]
---

# ADR 072 — Configurações em sub-rotas /configuracoes/<seção>, com índice em cartões

- **Data:** 2026-10-24
- **Status:** aceito (decisão do orquestrador como Product Owner, com aval de @KalleoPinheiro em 2026-10-24). Substitui o [ADR-067](067-configuracoes-em-pagina-unica-com-indice-fixo-no-celular.md).
- **Domínios afetados:** acesso

## Contexto

O [ADR-067](067-configuracoes-em-pagina-unica-com-indice-fixo-no-celular.md) manteve a página única de Configurações (≈ 8.400 px em 360 px, 1.118 linhas em um `page.tsx`) e adiou as sub-rotas só pelo custo de migrar testes. O PO decidiu pagar esse custo na v0.3.0: a página única carrega o JavaScript e dispara as chamadas de todas as seções mesmo quando se quer uma, e o arquivo único travava a manutenção (apontado na revisão do PR #566).

## Decisão

1. `/configuracoes` é um **índice de cartões** (uma linha de apoio por seção). Cada seção é a sub-rota `/configuracoes/<slug>`; o `slug` é o mesmo `id` das âncoras antigas: `dados`, `identidade`, `privacidade`, `horarios`, `feriados`, `google-agenda`, `email`, `contas`. A lista, os rótulos e a rota de API que cada papel precisa ficam em `sections.ts` (uma só fonte para o índice e para a moldura).
2. **Cada sub-rota é uma casca de servidor fina** (`<slug>/page.tsx`) que monta a seção client correspondente; cada seção busca só os próprios dados com `useApiQuery`. A moldura (`section-page.tsx`) traz «Voltar ao índice» **no topo** e o mesmo corte por papel do índice; sem permissão mostra «Seu papel não tem acesso a esta seção.». Esconder é UX; a API continua barrando ([ADR-002](002-autorizacao-em-duas-camadas.md)).
3. **Links antigos continuam**: `/configuracoes#<slug>` leva a `/configuracoes/<slug>` (o servidor não recebe o fragmento, então o índice lê o `hash` no navegador). O retorno do OAuth do Google (`/configuracoes?calendar=…`) vai a `/configuracoes/google-agenda` com os mesmos parâmetros, onde o aviso dispara.
4. As permissões por papel não mudam (Atendente e Profissional: Identidade e Feriados e ausências).
5. **Fica de fora**: levar a busca de dados para Server Components e a escrita para Server Actions. Isso é da frente de performance ([#541](https://github.com/KalleoPinheiro/estomasystech/issues/541), [ADR-069](069-dados-no-servidor-e-politica-de-cache.md)) e muda a camada de dados, não a estrutura de rotas; as sub-rotas já deixam cada seção pronta para migrar sozinha.

## Consequências

- A tela de entrada tem poucas centenas de pixels; cada seção carrega só o próprio código.
- `TESTE-ALTERADO` (regra 8): specs que renderizavam a página única passaram a usar `tests/support/settings-all-sections.tsx` (mesmas seções, mesmo corte por papel) ou a sub-rota; os E2E que abriam `/configuracoes` esperando uma seção abrem a sub-rota dela. As verificações de comportamento não mudaram; o que saiu foi a faixa fixa do ADR-067, que não existe mais.
- Depois da #541 (dados no servidor), cada sub-rota pode virar Server Component sem mudar URL.
