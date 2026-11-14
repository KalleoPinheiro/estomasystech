---
title: "ADR 106 — Neutralidade de agente: registro único de agentes para a posse"
status: frozen
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-14
related:
  - docs/adr/103-orquestracao-compartilhada-entre-llms.md
  - docs/adr/104-posse-verificada-por-ci-e-cadencia-de-release.md
  - docs/engineering/convivencia-llms.md
---

# ADR 106 — Neutralidade de agente: registro único de agentes para a posse

- **Data:** 2026-11-14
- **Status:** aceito (coordenação, a partir da decisão de @KalleoPinheiro em 2026-11-14 de trocar o Cursor pelo
  Codex como segundo agente). Emenda aos [ADR-103](103-orquestracao-compartilhada-entre-llms.md) e
  [ADR-104](104-posse-verificada-por-ci-e-cadencia-de-release.md); o ADR-105 (classe 3 automática) segue em outro PR.

## Contexto

O ADR-104 fixou a posse em `dono:claude` ou `dono:cursor`, e o `check:posse` trazia os dois nomes no código. O Kalléo
cancelou o Cursor e passa a usar o Codex. Os dois agentes nunca ficam ativos ao mesmo tempo: um assume quando os
créditos do outro acabam. A regra de convivência não pode depender do nome de um fornecedor.

## Decisão

1. **Registro único e versionado**: [`scripts/release/agentes.json`](../../scripts/release/agentes.json). Cada entrada
   tem `nome`, `situacao` (`ativo` ou `legado`), `prefixoBranch` (`<nome>/`) e `trailer` (regex do
   `Co-authored-by:`). A label de posse é sempre `dono:<nome>`.
2. **Agentes**: `claude` e `codex` ativos; `cursor` **legado**, mantido só para PRs e issues antigos (o `check:posse`
   ainda os reconhece, e o `npm run estado` omite o legado quando não há issue dele).
3. **O código não nomeia fornecedor**: `posse-lib.ts`, `check-posse.ts` e o `estado` leem o registro. Acrescentar um
   agente é **uma linha** no JSON mais um teste em `tests/scripts/release-posse.test.ts`, mais a label
   `dono:<nome>` criada no GitHub.
4. **Falha fechada preservada**: sem trailer nem prefixo de branch de agente registrado, o PR reprova; dois agentes
   no mesmo PR reprovam; issue sem exatamente uma label `dono:*` igual ao agente reprova.
5. **Fonte única das instruções**: o [`AGENTS.md`](../../AGENTS.md) é a fonte; `CLAUDE.md`, `.cursor/rules`,
   `.github/copilot-instructions.md` e arquivos equivalentes só apontam para ele. Nada é apagado.
6. **Revezamento**: o agente que entra lê o remoto, o Linear e `npm run estado`, e assume o trabalho do que saiu só
   pelo rito do ADR-105 (nova branch própria, label trocada, comentário de passagem); nunca empurra na branch do outro.

## Consequências

- Trocar de fornecedor deixa de exigir mudança de script ou de CI.
- O trailer é declarado, não autenticado (limite já aceito no ADR-104). O padrão do Codex
  (`Co-authored-by: Codex` ou `OpenAI Codex`) é uma suposição: se o agente assinar de outro jeito, ajuste a linha do
  registro; sem trailer o PR reprova, nunca passa em silêncio.
