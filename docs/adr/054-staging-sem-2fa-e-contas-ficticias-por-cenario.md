---
title: "ADR 054 — Staging sem segundo fator e contas fictícias por cenário"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/002-autorizacao-em-duas-camadas.md, docs/adr/008-segundo-fator-do-super-admin.md, docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/engineering/homologacao.md, docs/engineering/homologacao-cenarios.md]
---

# ADR 054 — Staging sem segundo fator e contas fictícias por cenário

- **Data:** 2026-10-21
- **Status:** aceito (decisão de @KalleoPinheiro em 2026-10-21: menos atrito para testar a staging, sem se desviar de produção; desligar o 2FA e semear contas fictícias que cubram o máximo de cenários).
- **Domínios afetados:** acesso, engenharia (homologação)

## Contexto

Testar a staging pedia cadastrar um autenticador TOTP para `super_admin` e `company_admin`, de novo a
cada reinício do banco, e o seed só tinha 5 contas (uma por papel de equipe, mais a clínica suspensa):
sem portal do paciente, do responsável e do parceiro, sem segunda clínica, sem conta inativa. Um atalho
de login sem senha foi considerado e descartado: afasta a staging do caminho real de produção e cria um
endpoint que, vazado para fora da staging, entrega qualquer papel (regra 2 do `AGENTS.md`: auth falha fechado).

## Decisão

- **Mesmo login de produção, sem o segundo fator.** Com `STAGING_DISABLE_MFA=true` **e** `APP_ENV=staging`,
  `pendingSecondFactor` (`src/app/api/auth/login/route.ts`) não pede TOTP: e-mail e senha bastam. A
  política de papéis (`MFA_POLICY`) e todo o resto do login (rate limit, clínica suspensa, auditoria,
  revogação por `session_version`) ficam como em produção.
- **Falha fechado.** Qualquer outra combinação mantém o 2FA exigido. `STAGING_DISABLE_MFA=true` com
  `APP_ENV` diferente de `staging` derruba o boot (`assertStagingMfaFlagSafe`), como `MOCK_INTEGRATIONS`
  em produção. Preview por PR fica de fora (pedido: somente staging).
- **Contas fictícias por cenário (seed).** O seed passa de 5 para 13 contas, todas
  `@homologacao.invalid` e com a mesma `STAGING_SEED_PASSWORD`, reaproveitadas para cobrir casos
  diferentes: segundo admin, segundo profissional, conta inativa, clínica vizinha (sem CNPJ, admin único,
  massa própria), paciente com os dois termos aceitos, paciente novo sem termo, responsável de menor e
  parceiro. A matriz conta × caso de validação está em
  [`homologacao-cenarios.md`](../engineering/homologacao-cenarios.md).
- **Seed continua idempotente por clínica:** contas novas só aparecem em banco novo; no `staging`,
  reinicie o branch de banco no Neon (`homologacao.md` § 1).

## Consequências

- O caminho de 2FA não é exercitado na staging (segue coberto por testes automatizados e por produção).
  Para vê-lo na staging, remova `STAGING_DISABLE_MFA` e reinicie o banco, ou use um preview.
- Risco principal: a variável ligada por engano em produção. Mitigado pelo boot que recusa e pela
  condição `APP_ENV=staging`, ambos com teste por ambiente.
- Reversível: apagar a variável na Vercel reativa o 2FA, sem migração.
