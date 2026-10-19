## O que muda

<!-- Uma ou duas frases; linke a issue (`Closes #N`) e o roadmap (`RM-NN`) quando houver. -->

## Como validar

<!-- Comandos ou passos; o CI roda typecheck, lint, check:sv, check:docs e test:coverage. -->

## Documentação
- [ ] Comportamento mudou → `docs/domains/<d>/` atualizado (ou n/a)
- [ ] Termo de domínio novo → `CONTEXT.md`
- [ ] Decisão difícil de reverter → ADR
- [ ] Variável de ambiente nova → `docs/engineering/onboarding.md` § 4 **e** `.env.example`
- [ ] `npm run check:docs` verde
- [ ] Cenário novo (sucesso e erro) no seed de homologação `scripts/seed/seed.ts` (ou n/a)
