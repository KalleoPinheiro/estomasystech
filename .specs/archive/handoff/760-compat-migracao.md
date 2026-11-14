## Teste de compatibilidade da migração com o código anterior em Postgres 18 (#760) (2026-11-14) — EM REVISÃO
- **O que entrou**: job `compat-migracao` no `gate-pr.yml` (roda só quando o diff toca `drizzle/*.sql`, saída `rodar_compat` do `impacto`), `scripts/release/compat-migracao.sh` (`precisa` e `rodar`) e a conferência no agregador `Gate do PR`. O job roda a suíte de integração da base (worktree) sobre o `drizzle/` do HEAD.
- **Prova local** (Postgres 16 local, suíte de 151 arquivos): migração `ADD COLUMN` nula em `patients` passou (2210 testes); migração `DROP COLUMN notes` reprovou (288 testes falharam, `column "notes" does not exist`). Rodada ~2 min.
- **Testes**: novo `tests/scripts/release-compat-migracao.test.ts`. `TESTE-ALTERADO` em `tests/infrastructure/gate-pr-workflow.test.ts`: a tabela `TIMEOUTS` ganhou `compat-migracao: 25` (job novo; nada afrouxado).
- **Classe 3**: mexe em workflow do gate. Precisa do clique do Kalléo.
- **Docs**: `docs/engineering/migracoes-aditivas.md` (seção nova; "Fora do escopo" removida).
- **Next step**: the-judge em thread nova; conferir no Actions o run com um PR que toque `drizzle/*.sql`. **Blockers**: nenhum.
