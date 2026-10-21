---
title: "ADR 060 — Redação central de dado pessoal nos logs e no GlitchTip"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/014-observabilidade-sem-pii.md, docs/engineering/auditoria-logs-pii-2026-10.md, docs/engineering/integrations/glitchtip.md]
---

# ADR 060 — Redação central de dado pessoal nos logs e no GlitchTip

- **Data:** 2026-10-21
- **Status:** aceito (decisão de @KalleoPinheiro na [#381](https://github.com/KalleoPinheiro/estomasystech/issues/381): mascarar a PII
  e, mesmo assim, auditar e documentar, sempre com o dado já mascarado).
- **Domínios afetados:** engenharia (observabilidade), todos (qualquer um que loga)
- **Complementa:** [ADR-014](./014-observabilidade-sem-pii.md) — ele definiu *o que o GlitchTip recebe*;
  este fecha o buraco do log em si.

## Contexto

O ADR-014 garantiu que o evento do GlitchTip só tem o que `buildEvent` põe, e `logError` limpa a mensagem de
erro. Mas o logger gravava `msg` e campos como chegavam: a proteção dependia de cada chamador lembrar de usar
ids. Um `logger.info('…', { patient })` com nome, CPF ou anamnese iria direto ao stdout (e ao backup de
logs do Coolify). O sistema guarda dado de saúde (LGPD art. 11 e 46): a barreira não pode depender de
disciplina.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — só convenção + revisão | zero código | já era o estado; esquecimento vira vazamento |
| B — redação central no `emit` do logger, por **campo** e por **padrão de texto** | cobre todo chamador, inclusive os futuros; o GlitchTip herda | nome em texto livre não é detectável; chave nova fora da lista passa |
| C — B + teste de arquitetura contra PII em mensagem | fecha o texto livre pela origem | falso positivo ocasional (ajusta-se a lista do teste) |

## Decisão

**Opção C.**

1. `emit` (único caminho de `logger.*` e `logError`) passa `msg` por `scrubText` e os campos por
   `redactFields` (`src/lib/redact.ts`) **antes** de escrever. `time`, `level` e `msg` não podem ser
   sobrescritos por campo.
2. **Por campo:** chave que contém CPF, CNPJ, e-mail, telefone, nascimento, endereço, anamnese, diagnóstico,
   prontuário, evolução, observação, notas, senha, segredo, token, authorization, cookie, credencial,
   `apiKey`, hash ou DSN, nome de pessoa (`patientName`, `nome`…) ou corpo de mensagem (`body`, `text`,
   `html`, `payload`, `content`) vira `[redigido]`, qualquer que seja o valor. Ids (`patientId`) passam.
   `requestId`, `stack` (já sem mensagem) e metadados do evento passam.
3. **Por padrão de texto** (`scrubText`, também no GlitchTip): URL com query/fragmento perde a query
   (`?[redigido]`), `Bearer`/JWT/sequência opaca de 32+ caracteres, e-mail e número de 8+ dígitos viram
   marcador; UUID e número curto ficam.
4. Objetos são percorridos (profundidade 5, 50 itens, ciclo cortado); binário vira `[binário]`; `Error`
   em campo vira nome + mensagem limpa, sem stack.
5. **GlitchTip:** contexto, mensagem da exceção, `transaction` e tags passam por `scrubText` (o
   `requestId` já é validado pelo proxy). O `beforeSend` segue sendo a segunda barreira.
6. **Texto livre:** o teste de arquitetura C17 (`tests/lib/log-pii-architecture.test.ts`) reprova mensagem
   de `logger.*`/`logError` que interpole nome, e-mail, CPF, CNPJ ou telefone sem `maskEmail`/`maskPhone`.
7. **Única exceção:** o campo `link` com o link de definição de senha, só quando `NODE_ENV !== 'production'`
   (dry-run do `NullEmailGateway`; o E2E lê o convite por ele, `e2e/support/invite-log.ts`). Em produção o
   token nunca sai.

## Consequências

- Chave de log nova com dado pessoal fora das listas passa (a lista é do que **não pode**, ao contrário do
  `buildEvent`). Mitigação: ids nos campos, C17 e a auditoria de [`auditoria-logs-pii-2026-10.md`](../engineering/auditoria-logs-pii-2026-10.md),
  repetida na rotina mensal (runbook § 9.4).
- Campo com dado legítimo pode sair como `[redigido]` (ex.: uma chave `notes` operacional): renomeie a chave
  (`noteCount`) em vez de afrouxar a lista.
- O log que o Next escreve sozinho (`⨯ …`) e o log de acesso do Traefik ficam fora deste código (ver auditoria).
