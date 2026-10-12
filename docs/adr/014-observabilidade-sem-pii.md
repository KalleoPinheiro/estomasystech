---
title: "ADR 014 — Observabilidade self-hosted e sem dado pessoal"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
---

# ADR 014 — Observabilidade self-hosted e sem dado pessoal

- **Data:** 2026-10-12
- **Status:** aceito (ferramenta, destino dos dados e canal de alerta decididos pelo dono do
  produto na [#212](https://github.com/KalleoPinheiro/vitta-flow/issues/212), 2026-10-11)
- **Domínios afetados:** acesso (rotas públicas de health), comunicação (alertas por e-mail)
- **Amplia:** [ADR-011](./011-canal-de-comunicacao-por-clinica.md) — o canal da plataforma passa a
  levar também os alertas ao operador.

## Contexto

Em produção (VPS Hetzner, uma réplica, #206) falha de banco, de e-mail, de cron ou 5xx só
aparecia quando alguém reclamava: sem health check, logs em texto sem correlação, nenhum
rastreador de erros e nenhum alerta. O sistema guarda dado de saúde (LGPD art. 11): qualquer
cópia de erro fora do processo é uma cópia possível de dado pessoal. O dono decidiu: tudo
self-hosted na própria VPS (GlitchTip no compose), nada para fornecedor externo, alertas por
e-mail ao operador.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — `@sentry/nextjs` | instrumentação automática de servidor, edge e navegador | liga integrações que copiam request, cabeçalhos, console e breadcrumbs; scrubbing vira lista do que **não** pode sair, que não se prova completa; plugin de build e OpenTelemetry pesam no build já no limite de memória (AD-007) |
| B — `@sentry/node` com integrações desligadas | SDK oficial de servidor | ainda traz OpenTelemetry e instrumentação de módulos; desligar tudo é configuração que uma atualização pode religar |
| C — `@sentry/core` (SDK base) e evento montado pelo app | o evento só tem o que o app pôs nele: lista do que **pode** sair, testável; sem dependências transitivas | nada automático: erro de navegador e tracing ficam de fora |

## Decisão

**Opção C.** `src/lib/observability/` concentra tudo:

1. **Logs:** uma linha JSON por evento (`time`, `level`, `msg`, `requestId`, campos), escrita só
   por `logger.ts`. Teste de arquitetura proíbe `console.*` no resto de `src/`.
2. **Request-id:** o proxy aceita `x-request-id` bem formado do proxy reverso ou gera um UUID,
   repassa ao handler e devolve na resposta. O logger o acha no contexto do proxy ou em
   `headers()`.
3. **Erros:** `logError` sanitiza (SQL e parâmetros fora, #202; e-mail e número longo
   mascarados) e o mesmo objeto vira o evento do GlitchTip — contexto, tipo, mensagem limpa,
   frames e tags `requestId`/`code`/`table`. Nunca request, usuário, cookies, cabeçalhos, corpo,
   breadcrumbs ou `extra`; o `beforeSend` remove esses campos se algo os preencher. Sem
   `GLITCHTIP_DSN`, no-op.
4. **Alertas:** `POST /api/alerts/run`, pelo cron do host a cada 5 min, avalia readiness, 5xx,
   lembretes sem rodar e falha de entrega, e manda e-mail pelo canal da plataforma — que não
   depende do banco, então banco fora do ar ainda vira alerta. Contadores e intervalo entre
   alertas ficam em memória (uma réplica).
5. **Health:** `/api/health` sem I/O (alvo do `HEALTHCHECK`); `/api/health/ready` com banco e
   migrações (alvo do verificador externo e do alerta).

A propriedade que desqualificou A e B: com elas, provar que nenhum dado de paciente sai exige
enumerar tudo que o SDK coleta hoje **e** em cada versão futura; com C, basta ler `buildEvent`.

## Consequências

- Erro do navegador não é capturado; ligar exige DSN público, abrir o GlitchTip no `connect-src`
  da CSP e tratar breadcrumbs de DOM (pergunta aberta na #212).
- Mais de uma réplica exige mover contadores e intervalo dos alertas para o banco.
- O log de erro não tratado que o próprio Next escreve (`⨯ …`) segue em texto; o mesmo erro sai
  limpo e em JSON pelo `onRequestError`.
- A interface do GlitchTip não é pública: o operador entra por túnel SSH.
