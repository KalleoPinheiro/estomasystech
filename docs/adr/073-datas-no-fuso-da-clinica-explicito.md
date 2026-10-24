---
title: "ADR 073 — Datas e horas no fuso da clínica (APP_TIMEZONE), explícito, nunca no do processo nem no do aparelho"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related: [docs/domains/agenda/README.md, docs/domains/portal/README.md, docs/adr/069-dados-no-servidor-e-politica-de-cache.md]
---

# ADR 073 — Datas e horas no fuso da clínica, explícito

- **Data:** 2026-10-24
- **Status:** aceito (decisão do orquestrador como PO/arquiteto; issues [#563](https://github.com/KalleoPinheiro/estomasystech/issues/563) e [#543](https://github.com/KalleoPinheiro/estomasystech/issues/543)).
- **Domínios afetados:** agenda, portal, financeiro, comunicação, relatórios

## Contexto

O #205 tornou explícito o fuso só na grade da agenda, nos lembretes e nos documentos. O resto (janela do profissional, dia de feriado, autoagendamento, limites de dia e mês de resumo, relatórios e repasses) lia o `Date` local e só estava certo porque o boot alinha `process.env.TZ` a `APP_TIMEZONE`. A suíte roda em UTC, então nunca provou São Paulo. No navegador, agenda e portal usavam o fuso do aparelho: quem estivesse em Manaus via e gravava horários deslocados, e a mesma data renderizada no servidor e hidratada em outro fuso dava erro de hidratação (#543).

## Decisão

1. **Fuso único da aplicação: `APP_TIMEZONE`** (IANA, padrão `America/Sao_Paulo`), validado no boot (`alignProcessTimeZone` recusa identificador inválido). Não é fuso por empresa (decisão de produto em aberto); as assinaturas aceitam `timeZone` opcional para quando houver.
2. **Toda regra de dia/hora usa `src/domain/shared/time-zone.ts`** (`Intl`, zero dependência): `zonedParts`, `zonedInstant`, `startOfZonedDay`, `startOfZonedDayAfter`, `startOfZonedMonth`, `zonedMonthKey`, `zonedDateKey`, `shiftZonedMonths`. Proibido ler/gravar partes de `Date` local (`getHours`, `setDate`, `new Date(y, m, d)`...) ou `toLocale*String` sem `timeZone` em `src/domain`, `src/application`, `src/app` e `src/lib` (a agenda, que desenha células de calendário, é a única exceção por pasta). Datas digitadas no navegador (validade do pacote, filtros de auditoria) viram instante por `clinicDayStart`/`clinicDayEnd`. Um teste (`tests/lib/fuso-sem-date-local.test.ts`) varre essas pastas; a allowlist exige justificativa.
3. **Cliente:** o fuso chega pelo `NEXT_PUBLIC_APP_TIMEZONE`, embutido no build por `next.config.ts` a partir de `APP_TIMEZONE` (sem segredo, mesmo padrão). `formatDate`/`formatTime` e o calendário (`src/lib/clinic-calendar.ts`) usam esse fuso e locale `pt-BR`; servidor e cliente renderizam o mesmo texto. **Data civil** (só dia, ex.: nascimento) não passa por conversão de fuso em nenhuma camada: o formulário envia `AAAA-MM-DD`, a API grava a meia-noite UTC desse dia (aceita também o ISO com hora, de clientes antigos) e `formatCivilDate` exibe o dia do valor sem fuso. Sem migração: o que já está gravado à meia-noite UTC é lido corretamente. As "células de calendário" da grade são só desenho; a conversão para instantes passa sempre por `clinic-calendar`.
4. **A trava do boot continua** como defesa em profundidade (não remover) e também recusa subir em produção se o fuso fixado no build do cliente (`NEXT_PUBLIC_APP_TIMEZONE`) divergir do `APP_TIMEZONE` do runtime.
5. **Testes:** continuam em UTC; os casos novos trocam `process.env.TZ` (UTC, São Paulo, Tóquio) com `APP_TIMEZONE=America/Sao_Paulo`, cobrem meia-noite/virada de dia e de mês e `America/New_York` (horário de verão).

## Alternativas

- Manter só a trava do boot: regras não testáveis em SP e clínica fora de SP impossível.
- `date-fns-tz`/Temporal: API melhor, mas dependência nova ou polyfill.

## Consequências

- Mudar o fuso passa a ser trocar `APP_TIMEZONE` (no build, para o cliente); sem env obrigatória nova.
- Fica para depois: spec E2E permanente de console limpo (hidratação e CSP) do #543 e a matriz de fusos; Playwright com `timezoneId` em Manaus.
