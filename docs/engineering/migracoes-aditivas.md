---
title: "Migrações aditivas: o lint check:migracao"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
---

# Migrações aditivas (`npm run check:migracao`)

**Por quê.** O app migra no boot e o container antigo atende até o novo ficar `healthy`
([`producao.md`](producao.md) § 3.1 e § 4): por alguns segundos o **código antigo roda sobre o esquema
novo**. Migrações não têm `down` (ADR-039). Só migração compatível com o código anterior permite deploy e
rollback sem humano. Regra: expandir, migrar, contrair, em releases separadas. Origem: fase 2b da proposta de fluxo enxuto (2026-11-08, issue #755).

O lint é determinístico (sem LLM, sem rede) e **falha fechado**: SQL que ele não reconhece conta como não aditivo.

## Uso

```bash
npm run check:migracao                          # migrações novas do diff contra a base
npm run check:migracao -- --json                # relatório para máquina (classificador de risco)
npm run check:migracao -- --exigir-aditiva      # sai com 1 também se houver migração não aditiva
npm run check:migracao -- --all                 # classifica todas as migrações (auditoria)
npm run check:migracao -- --base origin/main    # base explícita (padrão: a mesma do check:changeset)
```

Código de saída: `1` quando há **erro estrutural** (`erros` não vazio). Migração não aditiva **não reprova
por si**: ela é decisão humana de classe 3 do classificador de risco. Use `--exigir-aditiva` onde ela deva reprovar.

## O que é aditivo

| Aditivo (classe 2) | Não aditivo (classe 3) |
| --- | --- |
| `CREATE TABLE`, `CREATE TYPE/SEQUENCE/SCHEMA/EXTENSION` | `DROP` de qualquer coisa, `TRUNCATE` |
| `ADD COLUMN` nula ou com `DEFAULT` (ou `GENERATED`/`serial`) | `ADD COLUMN ... NOT NULL` sem `DEFAULT` em tabela existente |
| `CREATE INDEX` comum (com ou sem `CONCURRENTLY`) | `CREATE UNIQUE INDEX` em tabela existente |
| `ADD CONSTRAINT ... NOT VALID`, `VALIDATE CONSTRAINT` | `ADD CONSTRAINT` (FK, CHECK, UNIQUE, EXCLUDE) sem `NOT VALID` |
| `ALTER COLUMN ... DROP NOT NULL`, `SET DEFAULT` | `ALTER COLUMN ... SET NOT NULL`, `DROP DEFAULT`, mudar tipo |
| `INSERT`, `COMMENT ON` | `RENAME`, `ALTER TYPE`, `UPDATE`, `DELETE` |
| — | qualquer instrução não reconhecida (função, trigger, RLS...) |

Exceção: **nada do que a própria migração cria conta contra ela.** Constraint, índice único ou `NOT NULL` sobre
tabela criada na mesma migração, ou só sobre colunas adicionadas nela (caso típico do Drizzle: `ADD COLUMN
guardian_id` seguido de `ADD CONSTRAINT ... FOREIGN KEY (guardian_id)`), é aditivo: não há linha antiga a validar
nem código antigo que a conheça. Em `ALTER TABLE` com várias ações, a pior decide.

O Drizzle roda a migração em transação, onde `CREATE INDEX CONCURRENTLY` falha; por isso o índice comum
sem `CONCURRENTLY` também é aceito.

## Conferências do journal (`drizzle/meta/_journal.json`)

Todas reprovam: `journal-idx` (idx fora da posição), `journal-tag-prefixo`, `journal-tag-duplicada`,
`journal-when-fora-de-ordem` (o `when` precisa crescer estritamente: é o caso 0050/0051 de `producao.md` § 4),
`journal-sem-arquivo`, `arquivo-sem-journal`, `journal-nao-so-acrescenta` (entrada da base mudou ou sumiu) e
`migracao-existente-alterada` (um `drizzle/*.sql` que já existia na base foi editado, removido ou renomeado:
corrija com migração nova).

## Formato da saída JSON (`schema: "check-migracao/v1"`)

```jsonc
{
  "schema": "check-migracao/v1",
  "base": "origin/release/v0.6.2",
  "ok": true,                        // false se houver "erros"
  "classificacao": "aditiva",        // "nenhuma" | "aditiva" | "nao_aditiva" (pior das migrações novas)
  "migracoes": [{
    "arquivo": "drizzle/0071_x.sql", "tag": "0071_x",
    "classificacao": "aditiva",      // "aditiva" | "nao_aditiva"
    "instrucoes": [{ "classificacao": "aditiva", "regra": "add-column", "motivo": "...", "sql": "alter table ..." }]
  }],
  "erros": [{ "codigo": "journal-when-fora-de-ordem", "mensagem": "...", "arquivo": "opcional" }]
}
```

Regras (`regra`): `create-table`, `create-objeto-novo`, `add-column`, `add-column-not-null-sem-default`,
`create-index`, `create-unique-index`, `create-unique-index-em-tabela-existente`, `add-constraint-not-valid`,
`constraint-em-tabela-nova`, `constraint-em-colunas-novas`, `add-constraint-sem-not-valid`, `validate-constraint`,
`drop-not-null`, `set-default`, `set-not-null`, `drop-default`, `alter-column-type`, `drop`, `rename`, `truncate`,
`update-em-massa`, `delete-em-massa`, `alter-type`, `insert`, `comment`, `desconhecida`.
Mapeamento sugerido ao classificador de risco (ADR-095, proposta § 5): `nenhuma` → classe 1, `aditiva` → classe 2,
`nao_aditiva` ou `ok: false` → classe 3. Contrato versionado: mudar campo exige novo `schema`.

## Fora do escopo desta entrega

O **teste de compatibilidade em Postgres 18** (aplicar a migração nova e rodar a suíte de integração do commit
anterior contra o esquema novo) depende de job de CI próprio e fica na issue de acompanhamento. O lint cobre a
parte estática; aquele teste prova o que o lint só presume.
