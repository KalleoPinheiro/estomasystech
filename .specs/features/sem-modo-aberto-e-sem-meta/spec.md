---
title: Autenticação sem modo aberto e sem gateway da Meta (#327, #328)
type: spec
status: done
---

# Autenticação sem modo aberto e sem gateway da Meta (#327, #328) — as-built

Registro do que foi entregue (RM-30 em [`docs/plano-evolucao-faseado.md`](../../../docs/plano-evolucao-faseado.md)). Escrito depois da entrega, a partir do [handoff](../../archive/handoff-2026.md); a especificação original de cada issue mora nas PRs e nos ADRs citados.

## Escopo entregue

`ESTOMASYSTECH_ALLOW_OPEN_MODE` removida: sem `AUTH_SECRET` tudo responde 503 (ADR-002); `MetaWhatsAppGateway`, a porta `MessagingGateway` e `WHATSAPP_*` removidos do código, com o RM-14 mantido como especificado.

## Limites e pendências

Nenhuma.

## Onde ler

Regras: [`docs/engineering/integrations/whatsapp-meta.md`](../../../docs/engineering/integrations/whatsapp-meta.md). Passo a passo de cada issue: `.specs/archive/handoff-2026.md`.
