---
based on: spec.md
---

# Design

## Componentes (implementado)

1. **`tests/support/pglite-global-setup.ts`** (novo, Vitest `globalSetup`)
   - Constrói um PGlite temporário, roda `migrate()` com as migrations atuais (`drizzle/`) — **1x pra todo o processo de teste**, não 1x por worker nem por arquivo.
   - `client.dumpDataDir('none')` → grava num arquivo temporário (`fs.mkdtemp`).
   - `project.provide('pgliteTemplatePath', path)` — repassa o caminho aos arquivos de teste via o mecanismo nativo `provide`/`inject` do Vitest (serializável, funciona entre processos/workers sem precisar de `isolate: false`).
   - Fecha o PGlite temporário; retorna uma função de teardown que apaga o arquivo.

2. **`tests/setup.ts`** (existente, `setupFiles`)
   - `process.env.ESTOMASYSTECH_PGLITE_TEMPLATE_PATH = inject('pgliteTemplatePath')` — setado incondicionalmente (arquivos de teste setam `ESTOMASYSTECH_DB_DRIVER` no topo do próprio módulo, que só executa *depois* de `setupFiles`, então checar a env var aqui sempre veria o valor antigo).

3. **`src/infrastructure/persistence/drizzle/db.ts`** (`createPgliteDb()`)
   - Se `ESTOMASYSTECH_PGLITE_TEMPLATE_PATH` está setado: lê o arquivo, constrói `new PGlite({ loadDataDir: new Blob([buffer]), extensions... })` — **pula `migrate()`**.
   - Sem a env var (produção, ou se o `globalSetup` não rodou): comportamento idêntico ao de antes (`migrate()` completo).
   - `getDb()` continua cacheando 1 instância por processo (`globalThis`) — inalterado; cada arquivo de teste (isolamento de módulo padrão do Vitest, `isolate: true`, sem mudança) ainda ganha sua própria instância nova, só que restaurada do snapshot em vez de remontada via SQL.

4. **`tests/support/pglite-template.ts`** (novo) — mesma lógica de carregamento de snapshot (`inject` + `loadDataDir`), pros 8 arquivos de `tests/infrastructure/*` que montavam PGlite localmente (não passam por `getDb()`): `drizzle-repositories.test.ts`, `drizzle-repositories-extra.test.ts`, `drizzle-clinic-repository.test.ts`, `drizzle-clinical-inventory.test.ts`, `drizzle-taxonomy-care-plan.test.ts`, `drizzle-auth-token-repository.test.ts`, `professional-patient-link-repository.test.ts`, `consent-record-tenant-isolation.test.ts`. Trocam `new PGlite() + migrate()` local por `await createPgliteFromTemplate()`; `db.delete(schema.x)` em `beforeEach` (isolamento *dentro* do arquivo) continua igual, não é afetado.

5. **Excluídos do reuso (R4)**: `clinic-migration-backfill.test.ts`, `role-migration-backfill.test.ts` — migram uma pasta de migrations *antiga* (`priorMigrationsDir`), testam o próprio processo de backfill contra um schema anterior ao atual. Continuam construindo PGlite local do zero via `migrate()`, intocados.

6. **48 arquivos `tests/api/*.test.ts`**: zero edição de código — já usam `getDb()` via as rotas reais, ganham o snapshot automaticamente.

7. **`vitest.config.mts`**: só liga `globalSetup: ["tests/support/pglite-global-setup.ts"]`. Sem `test.projects`, sem `isolate: false` — o resto da config é inalterado.

## Isolamento

Cada arquivo continua recebendo uma instância PGlite **totalmente independente** (mesma garantia de sempre — Vitest isola módulos por arquivo por padrão), só que restaurada de um snapshot binário em vez de remontada via SQL. Não há transação, rollback nem estado compartilhado entre arquivos: zero risco de leak, porque não existe conexão/instância compartilhada pra vazar.

## Abordagens tentadas e descartadas

Ver `spec.md` § "Mecanismo (histórico da implementação)" — reusar uma única conexão PGlite viva entre arquivos via `isolate: false` (`test.projects`) + transação/rollback por arquivo foi implementado primeiro e descartado por 2 problemas reais:
1. `isolate: false` quebra `vi.mock` (Vitest só reseta o registro de mocks e cache de módulos com `isolate: true`).
2. `BEGIN` cru por arquivo conflita com `db.transaction()` que o app já usa internamente — a transação aninhada não vira `SAVEPOINT`, o `COMMIT` interno fecha a transação externa cedo.
