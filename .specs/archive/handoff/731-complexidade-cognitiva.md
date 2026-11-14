## Complexidade cognitiva ≤ 10 imposta no lint (#731) (2026-11-14) — EM REVISÃO
- **O que mudou**: `biome.json` liga `complexity/noExcessiveCognitiveComplexity` (máx. 10) como `error` em `src/`. Teste fica fora (`off`), como já era o limite de linhas. O passivo (71 funções em 56 arquivos) está numa lista de `overrides` em `warn`, sem `biome-ignore`; lista e maiores complexidades em `.specs/passivo-complexidade-cognitiva.md`. Convenção atualizada em `docs/engineering/conventions.md`.
- **Prova**: função sintética com complexidade 15 em `src/lib` reprova o `biome lint` (rc 1); `npm run lint` passa no passivo (só avisos).
- **Testes**: nenhum criado ou alterado. `scripts/gate/` intocado. Só configuração e docs: sem changeset.
- **Next step**: pagar o passivo por domínio, removendo cada arquivo da lista ao refatorar. the-judge em thread nova. **Blockers**: nenhum.
