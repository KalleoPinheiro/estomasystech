---
title: "ADR 059 — Seed de homologação aditivo: cria o que falta, sem apagar nem duplicar"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md, docs/engineering/homologacao.md]
---

# ADR 059 — Seed de homologação aditivo: cria o que falta, sem apagar nem duplicar

- **Data:** 2026-10-21
- **Status:** aceito (opção A escolhida por @KalleoPinheiro, 2026-10-21).
- **Domínios afetados:** engenharia (homologação)

## Contexto

O seed (`npm run seed:staging`, roda no build da Vercel) só criava a massa em banco vazio: se a clínica
principal já existia, apenas reaplicava a senha das contas. A staging usa a branch `main` do Neon, que não
é reiniciada a cada release; as contas e a clínica vizinha acrescentadas pelo PR #434 (ADR-054) nunca
chegariam lá sem apagar o banco.

## Decisão

O seed passa a ser aditivo e idempotente. A cada execução, em qualquer banco:

- cria a clínica, a conta, o profissional, o parceiro e os pacientes da vizinha que **ainda não existem**
  (conta pelo e-mail, clínica pelo id, profissional pelo registro, parceiro pelo e-mail);
- nunca apaga nem duplica; conta existente não é recriada;
- em banco já semeado, reaplica `STAGING_SEED_PASSWORD` a todas as contas `@homologacao.invalid`;
- a massa pesada (40 pacientes, agenda, faturas, avaliações, estoque) só nasce se a clínica principal
  não tem paciente; as contas de portal novas reaproveitam os pacientes existentes;
- as travas ficam como estavam: recusa `APP_ENV=production` e banco de produção, exige a senha de seed.

## Consequências

- Cenário novo do seed chega à staging no próximo deploy, sem reiniciar o branch de banco.
- Massa pesada nova (por exemplo mais avaliações) ainda exige banco novo.
- Substitui a nota do ADR-041 de que "conta nova só aparece em banco novo".
