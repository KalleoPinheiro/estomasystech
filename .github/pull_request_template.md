## O que muda

<!-- Uma ou duas frases; linke a issue (`Closes #N`) e o roadmap (`RM-NN`) quando houver. -->

## Como validar

<!-- Comandos ou passos. O CI roda typecheck, lint, check:sv, check:docs, test:coverage e build. -->

<!-- Base do PR (ADR-052): `feat/*` → `release/vX.Y.Z` (squash, sem recibo); `release/*` ou `hotfix/*` → `main` (merge commit para a release, com recibo). -->

<!-- Recibo do gate local (ADR-042): só no PR que entra na `main`. Cole a linha impressa por `npm run gate:local` (sem ela o CI reprova). Apague no PR para `release/*`. -->
E2E-GATE:

## Homologação

<!--
  Obrigatório no PR `feat/* → release/*` que muda `src/`, `drizzle/` ou `Dockerfile` (ADR-052; o CI reprova se faltar).
  Seed: o que você acrescentou em `scripts/seed/seed.ts` (sucesso e erro), ou `n/a — <motivo>`.
  Cenários: o roteiro de quem testa na staging, em Dado/Quando/Então (um por linha), ou `Cenários: n/a — <motivo>`.
-->
Seed:
Cenários:
- Dado , Quando , Então

<!-- Só se um teste EXISTENTE mudou porque o requisito de negócio mudou (regra 8); senão apague a linha. -->
TESTE-ALTERADO:

## Documentação
- [ ] Comportamento mudou → `docs/domains/<d>/` atualizado (ou n/a)
- [ ] Termo de domínio novo → `CONTEXT.md`
- [ ] Decisão difícil de reverter → ADR
- [ ] Variável de ambiente nova → `docs/engineering/onboarding.md` § 4 **e** `.env.example`
- [ ] Mudou `src/`, `drizzle/` ou `Dockerfile` → `.changeset/*.md` (`npm run changeset`; ADR-043)
- [ ] `npm run check:docs` verde
- [ ] Cenário novo (sucesso e erro) no seed de homologação `scripts/seed/seed.ts` (ou n/a)
- [ ] Release: `npm run release:sync` em dia (a `main` já está na release) antes de abrir o PR `release → main`
