---
title: "Roadmap — Vitta Flow"
status: living
audience: [po, stakeholder, dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: YYYY-MM-DD
---

<!--
  Destino: seção nova no TOPO de docs/plano-evolucao-faseado.md (o caminho fica, é citado em 11 arquivos).
  As seções por fase que já existem ficam abaixo, como detalhe (L2).
-->

# Roadmap — Vitta Flow

> **Fonte da verdade:** este arquivo. O GitHub Project **"Vitta Flow Roadmap"** é a *view* —
> cada linha `RM-NN` tem uma issue épica com o mesmo id no título. Divergiu? Este arquivo vence
> e o Project é corrigido.

## Como ler

| Horizonte | Significa | Compromisso |
| --- | --- | --- |
| **Now** | em execução neste trimestre | data e spec existem |
| **Next** | próximo trimestre; especificado ou em especificação | escopo, sem data firme |
| **Later** | backlog; depende de decisão de negócio ou de outra entrega | só intenção |

`status` ∈ `backlog` · `especificado` · `em-andamento` · `entregue` · `descartado`.
Item `entregue` **sempre** linka a pasta em `.specs/features/` que tem o `validation.md`/`verification.md` do Verifier.

## Now — T4 2026

| id | Item | Objetivo de negócio | status | issue | spec | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| RM-NN | Documentação em Progressive Disclosure | reduzir tempo de onboarding e tokens por tarefa de agente | especificado | #<n> | [`.specs/features/docs-progressive-disclosure/`](../.specs/features/docs-progressive-disclosure/) | — |
| RM-NN | <item> | <objetivo> | em-andamento | #<n> | <link> | RM-NN |

## Next — T1 2027

| id | Item | Objetivo de negócio | status | issue | spec | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| RM-NN | Paginação por cursor | <objetivo> | <status> | #<n> | [`.specs/features/paginacao-cursor-csp-nonce/`](../.specs/features/paginacao-cursor-csp-nonce/) | — |

## Later

| id | Item | Objetivo de negócio | status | Bloqueio |
| --- | --- | --- | --- | --- |
| RM-05 | Fase 5 — Monetização e canal | receita recorrente | backlog | decisão de PSP e preço (produto) |
| RM-NN | TISS | faturar convênios | backlog | decisão de escopo (produto) |

## Entregue

| id | Item | Entregue em | spec |
| --- | --- | --- | --- |
| RM-01 | Fase 1 — Hardening de segurança | <AAAA-MM> | [`fase-1-hardening-seguranca/`](../.specs/features/fase-1-hardening-seguranca/) |
| RM-02 | Fase 2 — Consistência transacional e performance | <AAAA-MM> | [`fase-2-consistencia-performance/`](../.specs/features/fase-2-consistencia-performance/) |
| RM-03 | Fase 3 — Compliance e UX clínico | <AAAA-MM> | [`fase-3-compliance-ux-clinico/`](../.specs/features/fase-3-compliance-ux-clinico/) |
| RM-04 | Fase 4 — Portal: auto-agendamento e recall | <AAAA-MM> | [`fase-4-portal-auto-agendamento/`](../.specs/features/fase-4-portal-auto-agendamento/) |

---

## Detalhe por fase (L2)

<!-- As seções "## Fase N — …" já existentes continuam aqui, sem mudança de conteúdo. -->

---

## Contrato repo ↔ ferramenta de gestão

| Regra | Como |
| --- | --- |
| **1 linha `RM-NN` = 1 issue épica** | título `[RM-NN] <Item>`; label `roadmap`; corpo linka a linha deste arquivo |
| Sub-tarefas | sub-issues da épica (GitHub) — nunca linhas novas aqui |
| Campos do GitHub Project | `Horizon` (Now/Next/Later), `Status` (mesmos 5 valores), `Quarter`, `Domain` (os 9 de `docs/domains/`) |
| Mudança de status | no PR que muda o estado: edita a linha aqui **e** o campo no Project |
| Jira / Linear | mesmo contrato: `RM-NN` vira o *epic key* no título; o link do epic vai na coluna `issue` |
| Notion | só leitura (embed do Project ou do arquivo renderizado); nunca fonte |
| Automação (fora do escopo atual) | Action que lê as tabelas deste arquivo e sincroniza campos do Project via `gh project item-edit` |
