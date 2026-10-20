---
title: "Estoque — matriz de exceções"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
domain: estoque
related: [docs/adr/049-matriz-de-excecoes-por-dominio.md]
---

# Estoque — matriz de exceções

> **TL;DR:** cada linha é um caso de exceção do estoque e o teste que o prova; `n/a` só com motivo. O teste de estrutura
> (`tests/bdd/matriz-excecoes.test.ts`) falha se a categoria some ou se o teste citado deixa de existir. Regras em
> [`README.md`](README.md).

| Categoria | Caso | Regra | Teste |
| --- | --- | --- | --- |
| entrada inválida | Saída maior que o saldo é recusada (`400`) e o saldo não muda | EST-RN-01 | `tests/api/inventory-routes.test.ts` › "Dado saída maior que o saldo, Quando POST /api/supplies/:id/movements type=out, Então retorna 400 (estoque insuficiente)" |
| entrada inválida | Movimentação sem motivo ou com preço negativo é recusada | EST-RN-02 | `tests/domain/inventory-batches.test.ts` › "Dado motivo vazio, Quando criar, Então lança ValidationError" ; `tests/domain/inventory-batches.test.ts` › "Dado unitPriceCents negativo, Quando criar, Então lança ValidationError" |
| entrada inválida | Insumo com unidade vazia, preço ou mínimo inválidos, ou corpo sem campos | — | `tests/domain/inventory-batches.test.ts` › "Dado unidade vazia, Quando criar, Então lança ValidationError" ; `tests/api/inventory-routes.test.ts` › "Dado body sem campos, Quando POST /api/supplies, Então retorna 400 com detalhe zod" |
| sem permissão | Só o Admin de Empresa cadastra insumo e movimenta (Atendente, Profissional e paciente recebem `403`, nada é gravado) | — | `tests/api/estoque-excecoes.test.ts` › "Quando cadastrar insumo ou registrar movimentação, Então 403 e nada é gravado" ; `tests/api/estoque-excecoes.test.ts` › "Dada sessão de paciente, Quando listar insumos, Então 403" |
| outra clínica | Clínica A não lista, edita nem movimenta insumo da clínica B | — | `tests/api/inventory-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando GET /api/supplies, Então lista não inclui insumo exclusivo da clínica B" ; `tests/api/inventory-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando registrar movimento em insumo da clínica B, Então falha" |
| duplicidade | Conclusão reparadora da consulta não baixa o kit de novo | EST-RN-05 | `tests/application/clinical-scores-wave2.test.ts` › "Dado kit já dispensado, Quando dispensar de novo (conclusão reparadora), Então não duplica" |
| duplicidade | Kit com o mesmo insumo repetido é recusado ao salvar | EST-RN-05 | `tests/application/clinical-scores-wave2.test.ts` › "Dado item duplicado no kit, Quando salvar, Então ValidationError" |
| concorrência | Duas baixas simultâneas: só uma passa e o saldo nunca fica negativo | EST-RN-01 | `tests/api/estoque-excecoes.test.ts` › "Dado saldo 10, Quando duas saídas de 6 chegam juntas, Então só uma passa e o saldo fica 4" ; `tests/application/inventory-followup-reports.test.ts` › "Dado snapshot com saldo mas adjustStock nulo (corrida), Quando registrar saída, Então InsufficientStockError e nenhuma movimentação salva" |
| concorrência | Editar o cadastro do insumo não desfaz uma baixa concorrente | EST-RN-06 | `tests/infrastructure/drizzle-supply-stock.test.ts` › "C22 save de insumo não sobrescreve stock_qty" |
| falha de integração | Estoque não chama serviço externo: o único vizinho é o banco, coberto pela transação e pelo ajuste condicional | — | n/a — o domínio não tem integração externa (e-mail, WhatsApp, S3 e Google Calendar ficam em outros domínios) |
| estado terminal | Insumo inativo ou inexistente no kit gera aviso e não bloqueia a conclusão da consulta | EST-RN-05 | `tests/application/relatorios-e-estoque-bordas.test.ts` › "Dado kit com insumo inexistente ou inativo, Quando concluir a consulta, Então avisa e segue sem bloquear" |
| estado terminal | Insumo desativado pode ser reativado; saldo zerado é válido | — | `tests/api/inventory-routes.test.ts` › "Dado active=true, Quando PUT /api/supplies/:id, Então reativa o insumo" ; `tests/domain/inventory-batches.test.ts` › "Dado saída exatamente igual ao estoque, Quando registrar, Então zera o estoque" |
