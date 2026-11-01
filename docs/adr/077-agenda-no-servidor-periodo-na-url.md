---
title: "ADR 077 — Agenda no servidor: período na URL, navegação em transição e mês sem salto"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
related:
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/domains/agenda/README.md
---

# ADR 077 — Agenda no servidor: período na URL, navegação em transição e mês sem salto

- **Data:** 2026-10-25
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#551](https://github.com/KalleoPinheiro/estomasystech/issues/551), épico [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541)). Aplica o [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md) à agenda.
- **Domínios afetados:** agenda.

## Contexto

A agenda carregava seis leituras por `/api` depois da hidratação, com o período em estado de cliente. Para o servidor entregar a tela pronta, o servidor precisa saber qual período a pessoa quer: o período passa a vir da URL.

## Decisão

1. **A URL é a fonte do período.** `?visao=semana|dia` (mês é o padrão e não aparece), `?dia=AAAA-MM-DD`, `?status=`, `?profissional=<id>`. O padrão deixa a URL limpa (`agendaHref`). `consulta`+`em` (link do Google) e `followUpId`/`patientId`/`procedure` (retorno) continuam lidos da URL. Valor inválido cai no padrão sem erro (`parseAgendaQuery`).
2. **Uma página, um `<Suspense>`.** `page.tsx` valida a sessão e lê a URL; `AgendaData` busca em paralelo consultas, contagem, profissionais, grade, feriados e fila com `loadBlock` (falha vira mensagem, não derruba a tela) e passa tudo por props a `AgendaScreen`. O esqueleto tem o mesmo cabeçalho. Sem `/api` na carga.
3. **Navegar é trocar a URL dentro de uma transição.** Período, visão, status e profissional chamam `router.push/replace`; a tela anterior fica no lugar, `aria-busy` e opacidade reduzida marcam a espera, e a `WeekView` não desenha o período antigo. Depois de gravar (por `apiFetch`, até as Server Actions do PR seguinte), `router.refresh()` relê.
4. **Mês sem salto.** `useMediaQuery` é falso no servidor e na hidratação; para o mês não trocar de layout ao hidratar, o HTML traz as duas variantes (celular `md:hidden`, desktop `hidden md:block`) até a hidratação, e o botão Semana fica oculto por CSS (`hidden md:inline-flex`) e sai do DOM no celular depois dela. A decisão do PO vale: celular tem Mês e Dia, sem Semana; o Dia abre no dia marcado (só celular).
5. **Camada de dados compartilhada.** `listAppointmentsFor`, `countAppointmentsFor`, `listProfessionalOptions`, `loadScheduleConfig`, `listClosuresFor` e `listWaitlistFor` (`src/lib/server/data/`) servem a página e as rotas `/api` correspondentes, sem duplicar a regra (Profissional só vê a própria agenda; fila filtrada pelo vínculo, R4).

## Alternativas

- **Período em cookie ou estado do servidor**: link não compartilhável e leitura enviesada; a URL já era o contrato do filtro de status.
- **`fallback={null}` por bloco**: o conteúdo chega depois e empurra o resto (CLS), o problema da tela Hoje.
- **Renderizar só uma variante do mês no servidor**: o outro layout apareceria depois da hidratação com salto.

## Consequências

- Link, recarregar e voltar do navegador mantêm o período.
- Trocar de período custa uma ida e volta ao servidor; a transição esconde o salto, mas a resposta não é instantânea como era o estado local.
- As gravações da agenda seguem por `/api` até o PR de Server Actions (auditoria na mesma transação, ADR-075).
