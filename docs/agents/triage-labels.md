---
title: "Triage Labels"
status: living
audience: [agent, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
---

# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

## Labels de fila (ADR-070)

As sete estações do fluxo usam três labels de fila, aplicadas pelo coordenador na triagem e pela thread que assume a issue.

| Label | Significado | Quem aplica | Quem remove |
| --- | --- | --- | --- |
| `pronta` | triada, com critérios de aceite; pode ser pega por uma thread | coordenador (estação 2) | coordenador, ao fechar ou ao virar `bloqueada` |
| `em-andamento` | uma thread trabalha nesta issue; só uma por vez | thread que assume (estação 5) | a mesma thread ao abrir o PR, ou o coordenador se a thread parar |
| `bloqueada` | pausa humana: aguarda decisão, credencial ou dado do Kalléo | coordenador (estação 2) | coordenador, quando o desbloqueio chegar |

`pronta` substitui, para trabalho novo, o uso de `ready-for-agent`, que segue aceito nas issues antigas até a migração decidida pelo coordenador.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.
