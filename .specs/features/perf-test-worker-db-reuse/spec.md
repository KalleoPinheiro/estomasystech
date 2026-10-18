---
issue: 111 (mãe: #116)
scope: Large
---

# perf(test): migrar PGlite 1x pra suite via snapshot em vez de por arquivo

## Problema

140 arquivos `tests/**/*.test.ts(x)` migram o PGlite completo do zero no `beforeAll`. Suspeito de ser o maior custo de tempo/máquina da suite (`hookTimeout: 30_000` já é folga pra isso).

## Requisitos (IDs)

- **R1**: Migration do PGlite roda 1x pra toda a suite, não 1x por arquivo.
- **R2**: Cada arquivo continua isolado dos demais — sem reset best-effort (DELETE manual de tabelas) como mecanismo de limpeza entre arquivos, e sem estado compartilhado que possa vazar.
- **R3**: `npm run test` com tempo de execução mensuravelmente menor, sem baixar coverage (piso 90%) nem quebrar teste algum.
- **R4**: Testes que migram um schema *diferente* do atual (backfill de migração antiga) ficam fora do reuso — precisam de estado de schema próprio, não do banco já totalmente migrado.

## Decisão de granularidade (confirmada com usuário, 2026-09-04)

Rollback por **arquivo**, não por `it()` individual — confirmado com o usuário antes de implementar. Motivo: dezenas de testes (`api-flow.test.ts`, `consent-record-tenant-isolation.test.ts`, etc.) encadeiam estado propositalmente entre `it()`s do mesmo arquivo — rollback por teste quebraria isso sem relação com o objetivo de #111.

## Mecanismo (histórico da implementação)

A ideia inicial (BEGIN/ROLLBACK cru por arquivo num PGlite reusado entre arquivos via `isolate:false`) foi tentada e **descartada por 2 motivos concretos, achados na prática**:
1. `isolate:false` quebra `vi.mock` de forma sutil (módulo já resolvido na fase de coleta do Vitest fica em cache "real", não mockado, na fase de execução — documentado no próprio código-fonte do Vitest: `mocker.reset()`/`resetModules()` só rodam com `isolate: true`).
2. BEGIN cru por arquivo conflita com `db.transaction()` que o próprio app já usa internamente (ex.: completar consulta + gerar fatura) — a transação aninhada não vira SAVEPOINT (drizzle só faz isso quando o código aninha via o `tx` retornado, não quando chama `db.transaction()` de novo por fora) e o COMMIT interno fecha a transação externa cedo, vazando/perdendo estado entre arquivos. Reproduzido rodando 2 arquivos no mesmo worker.

**Mecanismo final**: `tests/support/pglite-global-setup.ts` (Vitest `globalSetup`) migra o PGlite 1x pra todo o processo de teste e guarda um dump (`dumpDataDir`) num arquivo temporário, repassado aos arquivos via `provide`/`inject`. Cada arquivo (via `getDb()` com `ESTOMASYSTECH_DB_DRIVER=pglite`, ou via `tests/support/pglite-template.ts` nos 8 arquivos de `tests/infrastructure` que antes montavam PGlite localmente) carrega esse dump com `loadDataDir` em vez de rodar `migrate()` — continua ganhando uma instância PGlite **nova e isolada por arquivo**, exatamente como antes, só que restaurada de um snapshot binário em vez de remontada via SQL. Isolamento entre arquivos fica automaticamente perfeito (instâncias totalmente independentes) e o `db.transaction()` do app funciona sem nenhuma ressalva. Sem `isolate:false`, sem `test.projects`, sem risco de mock vazando.

## Fora de escopo (fica pra #112-115, issue-mãe #116)

`vitest --changed`, corte de e2e redundante, builders/factories de domínio, e2e no CI.

## Critério de aceite

- [x] R1: migration roda 1x pra todo o processo (mais forte que "1x por worker").
- [x] R2: isolamento entre arquivos garantido por instâncias PGlite independentes (snapshot), sem DELETE best-effort.
- [x] R3: `npm run test` 147s → 98s (~34% mais rápido), 2750/2750 testes, sem quebrar nada.
- [x] R4: `clinic-migration-backfill.test.ts`/`role-migration-backfill.test.ts` intocados (schema antigo).
- [x] `npm run test:coverage --no-file-parallelism` verde: 96,48/90,59/96,52/96,69% (piso 90%), 167/167 arquivos, 2750/2750 testes.
- [x] `npm run typecheck` e `npx biome check` verdes.
