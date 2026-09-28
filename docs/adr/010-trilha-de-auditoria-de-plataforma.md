---
title: "ADR 010 — Trilha de auditoria de plataforma e repositório de auditoria escopado"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-28
---

# ADR 010 — Trilha de auditoria de plataforma e repositório de auditoria escopado

- **Data:** 2026-09-28
- **Status:** aceito (decisão do dono do produto na discovery do portal do Super Admin, pergunta 10; issues [#210](https://github.com/KalleoPinheiro/vitta-flow/issues/210) itens 1 e 4 e [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214))
- **Domínios afetados:** acesso
- **Emenda:** [ADR-009](./009-recuperacao-de-emergencia-do-super-admin.md) — o evento da recuperação deixa de cair na clínica legada e passa a ser evento de plataforma, sem mudar o script

## Contexto

`audit_events.clinic_id` era obrigatório. Evento sem empresa — login com falha (o `resourceId` é o
e-mail digitado), segundo fator e recuperação do Super Admin, importação do catálogo de taxonomia
— caía na `legacy-clinic` (`resolveActor`, `src/lib/audit.ts`). Com várias clínicas, o Admin da
clínica que ocupa a `legacy-clinic` veria as tentativas de login de todas as outras. Além disso,
`DrizzleAuditEventRepository` era montado sem empresa: cada chamador precisava lembrar de filtrar
(`POST /api/documents/issue` não filtrava). Discovery:
[`.design/portal-super-admin.md`](../../.design/portal-super-admin.md), bloco B6.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — `clinic_id` nulo = evento de plataforma, na mesma tabela | Uma trilha append-only, uma consulta; a ação do Super Admin numa clínica fica nas duas trilhas sem cópia | Voltar a `NOT NULL` exige decidir o destino dos eventos nulos |
| B — Tabela `platform_audit_events` separada | Retenção e acesso independentes | Ação do Super Admin numa clínica exigiria gravar em duas tabelas; duas trilhas para consultar |
| C — Clínica sentinela `platform` | Coluna continua `NOT NULL` | Linha falsa em `clinics`, filtrada à mão em toda leitura de clínicas |

## Decisão

**Opção A.** Migração `drizzle/0045_audit-platform-events.sql`: `clinic_id` passa a nullable (FK
mantida). Eventos antigos da `legacy-clinic` não mudam (nada em produção).

- **Atribuição.** A empresa do evento vem do ator (`session.clinicId` ou `actorOverride.clinicId`)
  ou de `clinicId` explícito (a clínica-alvo quando o Super Admin age sobre ela). Sem empresa, o
  evento é de plataforma — nunca mais a `legacy-clinic`. Login com falha é sempre de plataforma,
  mesmo que o e-mail exista numa clínica (ligar o e-mail a uma clínica antes de provar a senha
  revelaria a conta); o login barrado por clínica suspensa (senha provada) segue na clínica.
- **Repositório escopado (AD-017).** Montado com a empresa do escopo no container. Em escopo de
  clínica, lê só a clínica e grava nela o evento sem empresa; evento de outra empresa lança. Em
  escopo de sistema, grava a empresa do evento (inclusive nula) e lê tudo.
- **Trilha de plataforma** = `clinic_id is null or actor_role = 'super_admin'`, lida por
  `findPlatformTrail`, que só roda em escopo de sistema. `GET /api/platform/audit` e a tela
  `/plataforma/auditoria` — família `platform`, só o Super Admin. A ação do Super Admin numa
  clínica aparece nas duas trilhas.

B perde porque a ação do Super Admin numa clínica pertence às duas trilhas; só venceria com
retenção diferente para a plataforma (decisão ainda aberta na #210). C perde pela linha falsa.

## Consequências

**Positivas**

- Nenhum Admin de Empresa vê evento sem empresa; a trilha de cada clínica mostra o que o Super Admin
  fez nela.
- Esquecer o filtro de empresa numa leitura de auditoria deixa de ser possível: o escopo é do
  repositório.

**Negativas / custos aceitos**

- Porta sem volta: com eventos nulos gravados, `NOT NULL` só volta com uma decisão de destino.
- Retenção, índice composto `(clinic_id, occurred_at DESC)` e paginação por cursor continuam
  abertos (#210 itens 2 e 3); a trilha de plataforma usa `limit/offset` como `/api/audit`.

## Relacionado

- [ADR-001](./001-multi-tenancy.md) — escopo por empresa.
- [ADR-007](./007-super-admin-operador-da-plataforma.md) — Super Admin só na família `platform`, sem dado de paciente (a trilha de plataforma não traz paciente).
- [ADR-009](./009-recuperacao-de-emergencia-do-super-admin.md) — emendado: evento da recuperação é de plataforma.
- Checklist [`.checks/b6-auditoria-plataforma.md`](../../.checks/b6-auditoria-plataforma.md).
