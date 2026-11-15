---
title: "ADR 109 — Fluxo de entrega simplificado: main, CI como revisor, staging automática e produção em um clique"
status: living
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-15
related:
  - docs/adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md
  - docs/adr/095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md
---

# ADR 109 — Fluxo de entrega simplificado

- **Data:** 2026-11-15
- **Status:** aceito (aprovação de @KalleoPinheiro em 2026-11-14: "simplificação é o caminho").
- **Domínios afetados:** engenharia (git, CI, release).

## Contexto

O fluxo anterior (branch de release por versão, `release:cut`, marca de homologação, cliques por PR, sessão
revisora separada, labels de posse e handoff por issue) consumiu mais tempo e tokens do que entregou valor à
clínica. O dono trabalha sozinho e quer incluir qualquer mudança com a certeza de que é rápido e seguro.

## Decisão

1. Uma mudança, uma sessão, um PR: branch curta da `main`, PR para a `main`.
2. O CI é o revisor (testes, cobertura, integração, compatibilidade de migração, E2E, mutação por arquivo
   alterado, integridade dos testes). Passou, o auto-merge (squash) entra.
3. Só o perigoso pede mais: o "Portão de risco" (classe 3: auth, cifra, escopo de empresa, auditoria, migração não
   aditiva, workflows, portão, deploy e backup) exige o clique do dono, depois da revisão the-judge na sessão.
   O the-judge deixa de ser portão mecânico; o check "Veredito do the-judge" fica como casca que passa, só porque
   o ruleset da `main` ainda o exige (o dono pode tirá-lo do ruleset e apagar `veredito-judge.yml`).
4. A `staging` é reconstruída a cada entrada na `main` e a validação logada (3 papéis, 360/390/768/1280) roda sozinha.
5. Produção com um clique: `release:prepare` numa branch curta, PR `chore(release)` normal, backup, workflow
   "Release deploy" (tag + fumaça) e deploy no Coolify; rollback em `producao.md` § 3.1.
6. Um único arquivo de passagem de bastão: `.specs/archive/handoff/PROXIMOS-PASSOS.md`.

## Substitui

[ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md) (release aberta e `main` só homologada),
[097](097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md),
[101](101-veredito-do-the-judge-por-status-da-revisora.md), [102](102-handoff-por-issue-sem-conflito.md),
[103](103-orquestracao-compartilhada-entre-llms.md), [104](104-posse-verificada-por-ci-e-cadencia-de-release.md),
[105](105-classe-3-dividida-em-3a-automatica-e-3b-humana.md), [106](106-neutralidade-de-agente-no-registro-de-posse.md),
[107](107-fila-de-proximos-passos-no-handoff.md) (a fila continua, como único arquivo) e
[108](108-sincronia-obrigatoria-issue-linear-fila.md) (a integração GitHub↔Linear continua; a obrigação por PR sai).
Seguem valendo o [ADR-098](098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md) (E2E e mutação no Actions, regra 8),
o ADR-095 (tag e fumaça) e o ADR-099 (validação logada, sem a marca). O [ADR-093](093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md) (política de rascunho, timeouts) segue valendo.

## O que sai

Scripts `release:cut`, `release:preflight`, `release:sync`, `check:posse`, `check:handoff`, `handoff:agregar`,
`estado`, `check:veredito`, prova do corte e `conferir-release`; workflow `release-cut.yml`; marca
`homologacao/vX.Y.Z`; seção `## Homologação` do PR. Os testes deles saíram junto (regra 8, `TESTE-ALTERADO`).
O `gate:local` continua opcional; seu perfil de release fica sem uso e pode ser podado depois.

## Consequências

- Menos portas, mais confiança no CI: a proteção do cliente é mecânica (testes, cobertura, migração, E2E, staging,
  backup e rollback), não ritual.
- Risco aceito: mudança comum não tem segundo par de olhos; o perigoso tem o clique do dono.
- Pergunta aberta do dono: tirar "Veredito do the-judge" do ruleset da `main`.
