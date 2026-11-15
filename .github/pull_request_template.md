## O que muda

<!-- Uma ou duas frases; linke a issue (`Closes #N`) e o roadmap (`RM-NN`) quando houver. -->

## Como validar

<!-- Comandos ou passos. O CI roda typecheck, lint, check:sv, check:docs, test:coverage, build, integração, E2E e mutação. -->

<!-- Fluxo (ADR-109): branch curta da `main`, PR para a `main` já pronto, auto-merge (squash) com o CI verde. -->

<!-- Só se um teste EXISTENTE mudou porque o requisito de negócio mudou (regra 8); senão apague a linha. -->
TESTE-ALTERADO:

## Teste pré-patch (ADR-070)

<!--
  Obrigatório se o PR traz teste NOVO. Rode cada teste novo contra o código de ANTES da correção: ele tem que falhar.
  Depois restaure o código e confirme que passa. Cole o resultado abaixo, ou `n/a — <motivo>` se não há teste novo.
  Edições em testes existentes foram descartadas, salvo `TESTE-ALTERADO` (regra 8).
-->
- Testes novos: 
- SHA antes da correção: 
- Resultado no código anterior (falhou): 
- Resultado depois da correção (passou): 
- Edições em testes existentes descartadas: sim / não

## Documentação
- [ ] Comportamento mudou → `docs/domains/<d>/` atualizado (ou n/a)
- [ ] Termo de domínio novo → `CONTEXT.md`
- [ ] Decisão difícil de reverter → ADR
- [ ] Variável de ambiente nova → `docs/engineering/onboarding.md` § 4 **e** `.env.example`
- [ ] Mudou `src/`, `drizzle/` ou `Dockerfile` → `.changeset/*.md` (`npm run changeset`; ADR-043)
- [ ] `npm run check:docs` verde
