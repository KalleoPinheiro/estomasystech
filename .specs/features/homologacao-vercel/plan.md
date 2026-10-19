# Plano: homologação na Vercel

Fonte: `design.md` (decisão committed por Kalléo, 2026-10-19). Corte: 1 tarefa, 4 PRs de revisão em ordem fixa A -> B -> C -> D (B só faz sentido depois de A; C e D dependem de `APP_ENV` de B). Sem migração de schema, sem portas de mão única além das de `Decisions`. Evidência de tamanho: convenção do repo (`.specs/features/*`, um PR por issue).

## Criteria
1. `APP_ENV` fora de `production|staging|preview|development` ou ausente com `VERCEL` definido: o app recusa subir (erro `APP_ENV obrigatório na Vercel`).
2. `DATABASE_URL` cujo host está em `PRODUCTION_DB_HOSTS` com `APP_ENV` diferente de `production`: `getDb()` lança `Banco de produção recusado fora de production`; build da Vercel sai com código 1 pelo mesmo motivo.
3. Com `MOCK_INTEGRATIONS=true` e `APP_ENV` em `staging|preview|development`, `POST https://api.resend.com/emails` devolve 200 `{id}` do MSW e nada sai; com `APP_ENV=production` o mock é recusado (lança no boot).
4. Chamadas ao Google (OAuth e Calendar) e ao endpoint S3 configurado respondem pelo MSW com o mesmo contrato usado pelos gateways; erro simulado por cabeçalho/e-mail reservado devolve 500/403.
5. `npm run seed:staging` é idempotente (2ª execução: `já semeado`, nada alterado) e determinístico (`faker.seed`): 2 clínicas (uma suspensa), contas dos 3 papéis de equipe + Super Admin + admin da clínica suspensa (2º fator cadastrado no primeiro login), ≥ 40 pacientes (incluindo menor com responsável, sem consentimento, com imagem), avaliações TIME seriadas, agenda com conflito/feriado/ausência, faturas pagas/abertas/estornadas, estoque com lote vencido e zerado.
6. O seed recusa rodar com `APP_ENV=production` ou host em `PRODUCTION_DB_HOSTS`, e grava dados clínicos cifrados (o `DATA_ENCRYPTION_KEY` de homologação, nunca o de produção).
7. `vercel-build.mjs` em `staging`/`preview`: migra, semeia e roda `next build`; em `production` ou sem `APP_ENV`: só `next build` sem tocar banco.
8. Toda página em homologação mostra a faixa "Homologação - dados fictícios" e responde `X-Robots-Tag: noindex`; em produção a faixa não aparece.
9. `scripts/staging/rebuild.sh <branches>` recria `staging` de `origin/main` e mergeia as branches informadas; conflito aborta o merge, não publica e aponta a branch (exit 1).
10. `ci.yml` roda em PR para `staging` e push em `staging`; `staging.yml` faz fumaça `GET /api/health/ready` na URL de homologação após o deploy.
11. `@faker-js/faker` e `msw` fixados exatos em `devDependencies` e `npm audit --omit=dev` continua sem vulnerabilidade; `faker` sem escopo não existe no lockfile.

## Observable (superfícies)
- tela: faixa de homologação (loading/empty/erro/não autorizado: n/a, é texto estático).
- API: nenhuma nova. Health existente reaproveitada.
- comando: `seed:staging` (saída: contadores por entidade, exit 1 em recusa, parcial -> transação única, nada parcial), `staging:rebuild`, `vercel-build`.
- documento: `homologacao.md` (passos do painel Vercel/Neon, lista de variáveis, contas de teste fictícias).

## Swept
validation: crit. 1, 2, 6. falhas: crit. 7 (migração falha derruba o build). idempotência/retry: crit. 5. autorização: n/a, nada novo; seed usa os papéis existentes. concorrência: n/a, ambiente de um operador; build serializado pela Vercel. ciclo de dados: crit. 5/6, ambiente descartável, `staging` recria o banco. dependência externa: crit. 3, 4. transições de estado: n/a. observabilidade: GlitchTip desligado em homologação (sem DSN); logs da Vercel.

## Decided (portas difíceis)
`APP_ENV` como contrato de ambiente; branch `staging` como convenção de equipe. Demais itens reversíveis em `design.md`.

## Unresolved
| # | Pergunta | Kind | Padrão adotado | 
|---|---|---|---|
| 1 | Painel: instalar integração Neon-Vercel, criar projeto Vercel ligado ao repo, `noindex`/Vercel Authentication, envs | blocks go-live | Kalléo faz no painel; passos em `homologacao.md` |
| 2 | Branch protegida `staging` no GitHub | blocks go-live | Kalléo ativa na UI |
| 3 | Banco `staging` recriado a cada `rebuild` ou só quando há migração colidente | open | recria só sob pedido (`--reset-db`) |

## PRs
A: docs + ADR 041 + rebuild.sh + templates e CI. B: `APP_ENV`, guardas, `vercel-build.mjs`, `vercel.json`, faixa. C: MSW. D: seed faker.
