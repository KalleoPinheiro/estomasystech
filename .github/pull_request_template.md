## O que muda

<!-- Uma ou duas frases; linke a issue (`Closes #N`) e o roadmap (`RM-NN`) quando houver. -->

## Como validar

<!-- Comandos ou passos. O CI roda typecheck, lint, check:sv, check:docs, test:coverage e build. -->

<!-- Recibo do gate local (ADR-042): cole a linha impressa por `npm run gate:local` (sem ela o CI reprova). -->
E2E-GATE:

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
