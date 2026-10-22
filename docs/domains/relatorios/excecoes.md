---
title: "Relatórios — matriz de exceções"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
domain: relatorios
related: [docs/adr/049-matriz-de-excecoes-por-dominio.md]
---

# Relatórios — matriz de exceções

> **TL;DR:** para cada caso de exceção do domínio (entrada inválida, sem permissão, outra clínica, duplicidade, concorrência, falha de integração, estado terminal), o teste que o prova. Um teste de estrutura (`tests/bdd/matriz-excecoes.test.ts`) falha se uma categoria some, se uma regra citada não existe ou se um teste citado sumiu. Regras: [README do domínio](README.md); método: [ADR-049](../../adr/049-matriz-de-excecoes-por-dominio.md).

| Categoria | Caso | Regra | Teste |
| --- | --- | --- | --- |
| entrada inválida | Parâmetro `month` mal formatado (2026-7) ou não numérico: 400 direto, sem consultar | REL-RN-04 | `tests/api/followups-reports-routes.test.ts` › "Dado month mal formatado (2026-7), Quando GET /api/reports, Então retorna 400 direto" ; `tests/api/followups-reports-routes.test.ts` › "Dado month=abc, Quando GET /api/summary, Então retorna 400" |
| sem permissão | Relatório e painel financeiro são da família administrativa: atendente recebe 403 | — | `tests/lib/require-session.test.ts` › "Dada sessão de atendente numa rota administrative, Então 403 com mensagem distinta de STAFF_ONLY_MESSAGE" |
| outra clínica | Fatura da clínica B não muda o relatório nem o painel da clínica A; mês cacheado pela B não é servido à A | REL-RN-04 | `tests/api/cross-tenant-aggregates-isolation.test.ts` › "Dada fatura criada na clínica B, Quando a clínica A gera o relatório do mês, Então os números de A não mudam" ; `tests/api/cross-tenant-aggregates-isolation.test.ts` › "Dado mês encerrado cacheado pela clínica B, Quando a clínica A pede o mesmo mês, Então recalcula em vez de servir o cache de B" ; `tests/lib/report-cache.test.ts` › "Dado relatório cacheado por uma empresa, Quando outra empresa buscar o mesmo mês, Então não recebe o relatório alheio" |
| duplicidade | n/a — relatório é leitura agregada: não cria registro, então não há o que duplicar | — | n/a — relatório só lê e agrega; nenhuma escrita no banco |
| concorrência | n/a — leitura sem escrita; o cache é por processo e de entrada idempotente (mesma chave, mesmo conteúdo) | REL-RN-04 | n/a — relatório só lê; o pagamento concorrente é coberto no financeiro e o mês assentado só é cacheado sem pendência |
| falha de integração | Erro ao carregar o relatório: a tela mostra alerta de erro | — | `tests/pages/staff-relatorios.test.tsx` › "Dado erro ao carregar o relatório, Quando renderizar, Então exibe alerta de erro" |
| estado terminal | Só mês encerrado e assentado (sem fatura pendente, repasse a liberar ou consulta em aberto) é cacheado; mês corrente recalcula | REL-RN-04 | `tests/api/report-cache-settled.test.ts` › "Dado mês encerrado com fatura ainda pendente, Quando pedir duas vezes, Então recalcula" ; `tests/api/report-cache-settled.test.ts` › "Dado mês encerrado e assentado, Quando pedir duas vezes, Então a segunda vem do cache" ; `tests/api/followups-reports-routes.test.ts` › "Dado mês corrente requisitado duas vezes, Quando GET /api/reports, Então recalcula a cada acesso" |
| entrada inválida | Procedimento sem saída de insumo vinculada às consultas mostra «Não apurado» (custo) e «—» (margem), nunca margem igual à receita; o total soma só os apurados (#472) | REL-RN-04 | `tests/pages/staff-relatorios.test.tsx` › "Dado procedimento sem custo de insumo apurado, Quando renderizar, Então mostra Não apurado e não uma margem igual à receita" ; `tests/application/supply-cost-margin.test.ts` › "Dado saída sem vínculo, Quando gerar relatório, Então entra como custo não atribuído" |
