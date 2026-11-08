import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  classificarMigracao,
  codigoDeSaida,
  dividirInstrucoes,
  dividirPorVirgula,
  type EntradaJournal,
  formatarRelatorio,
  normalizar,
  SCHEMA_SAIDA,
  validarJournal,
  validarSoAcrescenta,
  verificar,
} from '../../scripts/release/check-migracao-lib';

const regras = (sql: string): string[] =>
  classificarMigracao('drizzle/0099_x.sql', sql).instrucoes.map((i) => i.regra);
const classe = (sql: string): string =>
  classificarMigracao('drizzle/0099_x.sql', sql).classificacao;

describe('check:migracao · leitura do SQL', () => {
  it('Dado o marcador do Drizzle, comentários e ; dentro de texto, Quando divide, Então só separa por ; fora de aspas', () => {
    const sql = [
      '-- comentário de linha',
      'CREATE TABLE "a" ("id" text);--> statement-breakpoint',
      "/* bloco */ INSERT INTO \"a\" VALUES ('x;y -- não é comentário', 'it''s');",
      'COMMENT ON TABLE "a" IS "tabela;com""aspas";',
      '/* bloco sem fim',
    ].join('\n');
    expect(dividirInstrucoes(sql)).toEqual([
      'CREATE TABLE "a" ("id" text)',
      "INSERT INTO \"a\" VALUES ('x;y -- não é comentário', 'it''s')",
      'COMMENT ON TABLE "a" IS "tabela;com""aspas"',
    ]);
  });

  it('Dado aspa sem fechamento ou arquivo vazio, Quando divide, Então não trava', () => {
    expect(dividirInstrucoes("INSERT INTO a VALUES ('aberto")).toEqual([
      "INSERT INTO a VALUES ('aberto",
    ]);
    expect(dividirInstrucoes('  \n-- só comentário')).toEqual([]);
  });

  it('Dado identificadores entre aspas, schema public e texto, Quando normaliza, Então fica comparável', () => {
    expect(
      normalizar(
        'ALTER TABLE "public"."Patients"\n ADD COLUMN "X" text DEFAULT \'Ab\'',
      ),
    ).toBe("alter table patients add column x text default ''");
  });

  it('Dado vírgulas dentro de parênteses, Quando divide ações, Então só separa as de nível zero', () => {
    expect(
      dividirPorVirgula('add a text, add constraint c check (a in (1, 2)), '),
    ).toEqual(['add a text', 'add constraint c check (a in (1, 2))']);
  });
});

describe('check:migracao · classificação', () => {
  it('Dado só ADD COLUMN nula, Quando classifica, Então é aditiva', () => {
    expect(classe('ALTER TABLE "patients" ADD COLUMN "nick" text;')).toBe(
      'aditiva',
    );
  });

  it('Dado ADD COLUMN NOT NULL com DEFAULT, generated ou serial, Quando classifica, Então é aditiva', () => {
    expect(
      classe('ALTER TABLE "p" ADD COLUMN "a" integer NOT NULL DEFAULT 0;'),
    ).toBe('aditiva');
    expect(
      classe(
        'ALTER TABLE "p" ADD COLUMN "a" integer GENERATED ALWAYS AS IDENTITY NOT NULL;',
      ),
    ).toBe('aditiva');
    expect(
      classe('ALTER TABLE "p" ADD COLUMN IF NOT EXISTS "a" serial NOT NULL;'),
    ).toBe('aditiva');
  });

  it('Dado ADD COLUMN NOT NULL sem DEFAULT em tabela existente, Quando classifica, Então é não aditiva', () => {
    expect(
      regras('ALTER TABLE "patients" ADD COLUMN "cpf" text NOT NULL;'),
    ).toEqual(['add-column-not-null-sem-default']);
    expect(classe('ALTER TABLE "p" ADD COLUMN "id2" text PRIMARY KEY;')).toBe(
      'nao_aditiva',
    );
  });

  it('Dado CREATE TABLE com NOT NULL e índices na tabela nova, Quando classifica, Então é aditiva', () => {
    const sql = [
      'CREATE TABLE "t" ("id" text PRIMARY KEY NOT NULL, "n" text NOT NULL);',
      'ALTER TABLE "t" ADD COLUMN "z" text NOT NULL;',
      'ALTER TABLE "t" ADD CONSTRAINT "t_fk" FOREIGN KEY ("n") REFERENCES "public"."o"("id");',
      'CREATE UNIQUE INDEX "t_u" ON "t" ("n");',
    ].join('\n');
    expect(classe(sql)).toBe('aditiva');
    expect(regras(sql)).toEqual([
      'create-table',
      'add-column',
      'constraint-em-tabela-nova',
      'create-index',
    ]);
  });

  it('Dado CREATE TYPE, SEQUENCE, SCHEMA, EXTENSION, INSERT e COMMENT, Quando classifica, Então são aditivos', () => {
    for (const sql of [
      "CREATE TYPE mood AS ENUM ('a');",
      'CREATE SEQUENCE s;',
      'CREATE SCHEMA x;',
      'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
      "INSERT INTO taxonomy (id) VALUES ('x');",
      "COMMENT ON TABLE t IS 'x';",
      'CREATE UNLOGGED TABLE u (id text);',
    ]) {
      expect(classe(sql), sql).toBe('aditiva');
    }
  });

  it('Dado DROP COLUMN, DROP TABLE ou DROP INDEX, Quando classifica, Então é não aditiva', () => {
    expect(regras('ALTER TABLE "patients" DROP COLUMN "x";')).toEqual(['drop']);
    expect(regras('DROP TABLE "x";')).toEqual(['drop']);
    expect(regras('DROP INDEX "i";')).toEqual(['drop']);
  });

  it('Dado RENAME de coluna ou tabela, Quando classifica, Então é não aditiva', () => {
    expect(regras('ALTER TABLE "a" RENAME COLUMN "x" TO "y";')).toEqual([
      'rename',
    ]);
    expect(regras('ALTER TABLE "a" RENAME TO "b";')).toEqual(['rename']);
  });

  it('Dado mudança de tipo ou ALTER TYPE, Quando classifica, Então é não aditiva', () => {
    expect(
      regras('ALTER TABLE "a" ALTER COLUMN "x" SET DATA TYPE bigint;'),
    ).toEqual(['alter-column-type']);
    expect(
      regras('ALTER TABLE "a" ALTER COLUMN "x" TYPE bigint USING x::bigint;'),
    ).toEqual(['alter-column-type']);
    expect(regras("ALTER TYPE mood ADD VALUE 'b';")).toEqual(['alter-type']);
  });

  it('Dado UPDATE, DELETE ou TRUNCATE, Quando classifica, Então é não aditiva', () => {
    expect(regras("UPDATE a SET x = 'y';")).toEqual(['update-em-massa']);
    expect(regras('DELETE FROM a;')).toEqual(['delete-em-massa']);
    expect(regras('TRUNCATE a;')).toEqual(['truncate']);
  });

  it('Dado ALTER COLUMN, Quando classifica, Então relaxar é aditivo e apertar é não aditivo', () => {
    expect(regras('ALTER TABLE a ALTER COLUMN x DROP NOT NULL;')).toEqual([
      'drop-not-null',
    ]);
    expect(regras("ALTER TABLE a ALTER COLUMN x SET DEFAULT 'v';")).toEqual([
      'set-default',
    ]);
    expect(regras('ALTER TABLE a ALTER COLUMN x SET NOT NULL;')).toEqual([
      'set-not-null',
    ]);
    expect(regras('ALTER TABLE a ALTER COLUMN x DROP DEFAULT;')).toEqual([
      'drop-default',
    ]);
    expect(regras('ALTER TABLE a ALTER COLUMN x SET STATISTICS 100;')).toEqual([
      'desconhecida',
    ]);
  });

  it('Dado ADD CONSTRAINT NOT VALID ou VALIDATE CONSTRAINT, Quando classifica, Então é aditiva', () => {
    expect(
      regras('ALTER TABLE a ADD CONSTRAINT c CHECK (x > 0) NOT VALID;'),
    ).toEqual(['add-constraint-not-valid']);
    expect(regras('ALTER TABLE a VALIDATE CONSTRAINT c;')).toEqual([
      'validate-constraint',
    ]);
  });

  it('Dado ADD CONSTRAINT que valida a tabela existente, Quando classifica, Então é não aditiva', () => {
    for (const sql of [
      'ALTER TABLE "a" ADD CONSTRAINT "c" FOREIGN KEY ("b_id") REFERENCES "b"("id");',
      'ALTER TABLE "a" ADD CONSTRAINT "c" UNIQUE ("x");',
      'ALTER TABLE "a" ADD CONSTRAINT "c" CHECK ("a"."x" > 0);',
      'ALTER TABLE "a" ADD CONSTRAINT "c" EXCLUDE USING gist (x WITH =);',
    ]) {
      expect(regras(sql), sql).toEqual(['add-constraint-sem-not-valid']);
    }
  });

  it('Dado constraint só sobre colunas criadas na mesma migração, Quando classifica, Então é aditiva', () => {
    const sql = [
      'ALTER TABLE "a" ADD COLUMN "g_id" text;',
      'ALTER TABLE "a" ADD COLUMN "k" text;',
      'ALTER TABLE "a" ADD COLUMN "st" text;',
      'ALTER TABLE "a" ADD CONSTRAINT "a_fk" FOREIGN KEY ("g_id") REFERENCES "g"("id");',
      'ALTER TABLE "a" ADD CONSTRAINT "a_u" UNIQUE ("g_id", "k");',
      'ALTER TABLE "a" ADD CONSTRAINT "a_ck" CHECK ("a"."st" IS NULL OR "a"."st" IN (\'x\'));',
      'CREATE UNIQUE INDEX "a_ui" ON "a" ("k");',
    ].join('\n');
    expect(regras(sql).slice(3)).toEqual([
      'constraint-em-colunas-novas',
      'constraint-em-colunas-novas',
      'constraint-em-colunas-novas',
      'create-unique-index',
    ]);
  });

  it('Dado constraint que mistura coluna nova e antiga, ou CHECK sem coluna qualificada, Quando classifica, Então é não aditiva', () => {
    const mista =
      'ALTER TABLE "a" ADD COLUMN "n" text;\nALTER TABLE "a" ADD CONSTRAINT "u" UNIQUE ("n", "velha");';
    expect(classe(mista)).toBe('nao_aditiva');
    const semColuna =
      'ALTER TABLE "a" ADD COLUMN "n" text;\nALTER TABLE "a" ADD CONSTRAINT "c" CHECK (n > 0);';
    expect(classe(semColuna)).toBe('nao_aditiva');
    expect(classe('ALTER TABLE "a" ADD CONSTRAINT "c" UNIQUE x;')).toBe(
      'nao_aditiva',
    );
  });

  it('Dado CREATE INDEX, Quando classifica, Então comum é aditivo e único em dado existente não', () => {
    expect(regras('CREATE INDEX "i" ON "a" ("x");')).toEqual(['create-index']);
    expect(
      regras('CREATE INDEX CONCURRENTLY IF NOT EXISTS "i" ON ONLY "a" ("x");'),
    ).toEqual(['create-index']);
    expect(regras('CREATE UNIQUE INDEX "i" ON "a" ("x");')).toEqual([
      'create-unique-index-em-tabela-existente',
    ]);
    expect(
      regras('CREATE UNIQUE INDEX "i" ON "a" USING btree (lower(x));'),
    ).toEqual(['create-unique-index-em-tabela-existente']);
    expect(regras('CREATE UNIQUE INDEX "i" ON "a";')).toEqual([
      'create-unique-index-em-tabela-existente',
    ]);
    expect(regras('CREATE INDEX sem_tabela;')).toEqual(['desconhecida']);
  });

  it('Dado ALTER TABLE com várias ações, Quando classifica, Então a pior ação decide', () => {
    expect(regras('ALTER TABLE a ADD COLUMN x text, DROP COLUMN y;')).toEqual([
      'drop',
    ]);
    expect(
      regras('ALTER TABLE a ADD COLUMN x text, ADD COLUMN z text;'),
    ).toEqual(['add-column']);
  });

  it('Dado instrução que o lint não conhece, Quando classifica, Então falha fechada como não aditiva', () => {
    for (const sql of [
      'CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;',
      'ALTER TABLE a ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ONLY;',
      'VACUUM a;',
    ]) {
      expect(
        classificarMigracao('drizzle/0099_x.sql', sql).instrucoes.some(
          (i) => i.regra === 'desconhecida',
        ),
        sql,
      ).toBe(true);
      expect(classe(sql), sql).toBe('nao_aditiva');
    }
  });

  it('Dado SQL longo, Quando classifica, Então o relatório corta o trecho em 200 caracteres', () => {
    const [i] = classificarMigracao(
      'drizzle/0099_x.sql',
      `INSERT INTO t VALUES ('${'a'.repeat(300)}', ${'1,'.repeat(200)}1);`,
    ).instrucoes;
    expect(i.sql.length).toBe(201);
    expect(i.sql.endsWith('…')).toBe(true);
  });

  it('Dado o caminho do arquivo, Quando classifica, Então devolve a tag sem diretório e extensão', () => {
    expect(
      classificarMigracao(
        'drizzle/0070_app-releases.sql',
        'CREATE TABLE a (id text);',
      ).tag,
    ).toBe('0070_app-releases');
  });
});

const entrada = (
  idx: number,
  when: number,
  tag = `${String(idx).padStart(4, '0')}_x`,
): EntradaJournal => ({
  idx,
  version: '7',
  when,
  tag,
  breakpoints: true,
});
const arquivosDe = (es: readonly EntradaJournal[]): string[] =>
  es.map((e) => `${e.tag}.sql`);

describe('check:migracao · journal', () => {
  it('Dado journal em ordem com um arquivo por tag, Quando valida, Então não há erro', () => {
    const j = [entrada(0, 10), entrada(1, 20)];
    expect(validarJournal(j, arquivosDe(j))).toEqual([]);
  });

  it('Dado when fora de ordem (caso 0050/0051), Quando valida, Então reprova', () => {
    const j = [entrada(0, 20), entrada(1, 10)];
    const erros = validarJournal(j, arquivosDe(j));
    expect(erros.map((e) => e.codigo)).toEqual(['journal-when-fora-de-ordem']);
    expect(erros[0].mensagem).toContain('0001_x');
  });

  it('Dado when igual ao da anterior, Quando valida, Então reprova', () => {
    const j = [entrada(0, 10), entrada(1, 10)];
    expect(validarJournal(j, arquivosDe(j)).map((e) => e.codigo)).toEqual([
      'journal-when-fora-de-ordem',
    ]);
  });

  it('Dado idx fora da posição ou tag com prefixo errado, Quando valida, Então reprova', () => {
    const j = [
      entrada(0, 10),
      entrada(5, 20, '0001_x'),
      entrada(2, 30, 'sem-prefixo'),
    ];
    const codigos = validarJournal(j, arquivosDe(j)).map((e) => e.codigo);
    expect(codigos).toEqual([
      'journal-idx',
      'journal-tag-prefixo',
      'journal-tag-prefixo',
    ]);
  });

  it('Dado tag repetida, Quando valida, Então reprova', () => {
    const j = [entrada(0, 10), entrada(1, 20, '0000_x')];
    expect(validarJournal(j, ['0000_x.sql']).map((e) => e.codigo)).toContain(
      'journal-tag-duplicada',
    );
  });

  it('Dado tag sem arquivo e arquivo sem tag, Quando valida, Então reprova os dois', () => {
    const erros = validarJournal([entrada(0, 10)], ['0001_nova.sql']);
    expect(erros.map((e) => e.codigo)).toEqual([
      'journal-sem-arquivo',
      'arquivo-sem-journal',
    ]);
    expect(erros[1].arquivo).toBe('drizzle/0001_nova.sql');
  });

  it('Dado journal que só ganhou entradas no fim, Quando compara com a base, Então passa', () => {
    expect(
      validarSoAcrescenta([entrada(0, 10)], [entrada(0, 10), entrada(1, 20)]),
    ).toEqual([]);
    expect(validarSoAcrescenta([], [entrada(0, 10)])).toEqual([]);
  });

  it('Dado entrada da base alterada ou removida, Quando compara, Então reprova', () => {
    expect(
      validarSoAcrescenta([entrada(0, 10)], [entrada(0, 11)]).map(
        (e) => e.codigo,
      ),
    ).toEqual(['journal-nao-so-acrescenta']);
    expect(
      validarSoAcrescenta(
        [entrada(0, 10), entrada(1, 20)],
        [entrada(0, 10)],
      ).map((e) => e.codigo),
    ).toEqual(['journal-nao-so-acrescenta']);
    expect(
      validarSoAcrescenta([entrada(0, 10)], [entrada(0, 10, '0000_outra')]),
    ).toHaveLength(1);
  });
});

const base = [entrada(0, 10)];
const comNova = [entrada(0, 10), entrada(1, 20, '0001_nova')];

function rodar(
  sql: string,
  extra: Partial<Parameters<typeof verificar>[0]> = {},
): ReturnType<typeof verificar> {
  return verificar({
    base: 'origin/release/v0.6.2',
    journal: comNova,
    journalBase: base,
    arquivosSql: ['0000_x.sql', '0001_nova.sql'],
    analisar: ['drizzle/0001_nova.sql'],
    alterados: [],
    lerSql: () => sql,
    ...extra,
  });
}

describe('check:migracao · relatório', () => {
  it('Dado migração só com ADD COLUMN nula, Quando verifica, Então ok e aditiva, no formato v1', () => {
    const r = rodar('ALTER TABLE "patients" ADD COLUMN "nick" text;');
    expect(r).toMatchObject({
      schema: SCHEMA_SAIDA,
      ok: true,
      classificacao: 'aditiva',
      erros: [],
    });
    expect(r.schema).toBe('check-migracao/v1');
    expect(r.migracoes).toEqual([
      {
        arquivo: 'drizzle/0001_nova.sql',
        tag: '0001_nova',
        classificacao: 'aditiva',
        instrucoes: [
          {
            classificacao: 'aditiva',
            regra: 'add-column',
            motivo: 'coluna nula ou com DEFAULT',
            sql: 'alter table patients add column nick text',
          },
        ],
      },
    ]);
    expect(codigoDeSaida(r, true)).toBe(0);
  });

  it('Dado migração com DROP COLUMN, Quando verifica, Então não aditiva sem reprovar por padrão', () => {
    const r = rodar('ALTER TABLE "patients" DROP COLUMN "nick";');
    expect(r.ok).toBe(true);
    expect(r.classificacao).toBe('nao_aditiva');
    expect(codigoDeSaida(r, false)).toBe(0);
    expect(codigoDeSaida(r, true)).toBe(1);
  });

  it('Dado when fora de ordem no journal, Quando verifica, Então reprova com código 1', () => {
    const r = rodar('SELECT 1;', {
      journal: [entrada(0, 10), entrada(1, 5, '0001_nova')],
    });
    expect(r.ok).toBe(false);
    expect(r.erros.map((e) => e.codigo)).toEqual([
      'journal-when-fora-de-ordem',
    ]);
    expect(codigoDeSaida(r, false)).toBe(1);
  });

  it('Dado migração antiga alterada no diff, Quando verifica, Então reprova', () => {
    const r = rodar('ALTER TABLE a ADD COLUMN x text;', {
      alterados: ['drizzle/0000_x.sql'],
    });
    expect(r.erros).toEqual([
      expect.objectContaining({
        codigo: 'migracao-existente-alterada',
        arquivo: 'drizzle/0000_x.sql',
      }),
    ]);
  });

  it('Dado diff sem migração, Quando verifica, Então a classificação é nenhuma', () => {
    const r = rodar('', {
      analisar: [],
      journal: base,
      arquivosSql: ['0000_x.sql'],
    });
    expect(r).toMatchObject({
      ok: true,
      classificacao: 'nenhuma',
      migracoes: [],
    });
    expect(codigoDeSaida(r, true)).toBe(0);
  });

  it('Dado base sem journal, Quando verifica, Então não compara o append-only', () => {
    expect(
      rodar('ALTER TABLE a ADD COLUMN x text;', {
        journalBase: null,
        base: null,
      }).ok,
    ).toBe(true);
  });

  it('Dado várias migrações fora de ordem, Quando verifica, Então devolve ordenado pelo caminho', () => {
    const r = rodar('ALTER TABLE a ADD COLUMN x text;', {
      analisar: ['drizzle/0002_b.sql', 'drizzle/0001_a.sql'],
    });
    expect(r.migracoes.map((m) => m.tag)).toEqual(['0001_a', '0002_b']);
  });

  it('Dado o relatório, Quando formata, Então lista só as instruções não aditivas e os erros', () => {
    const r = rodar('ALTER TABLE a ADD COLUMN x text;\nDROP TABLE b;', {
      alterados: ['drizzle/0000_x.sql'],
    });
    const texto = formatarRelatorio(r);
    expect(texto).toContain(
      'check:migracao (base origin/release/v0.6.2): nao_aditiva',
    );
    expect(texto).toContain('✗ drizzle/0001_nova.sql: nao_aditiva');
    expect(texto).toContain(
      '[drop] remover quebra o código antigo: drop table b',
    );
    expect(texto).not.toContain('add-column');
    expect(texto).toContain('✗ [migracao-existente-alterada]');
    expect(
      formatarRelatorio(
        rodar('ALTER TABLE a ADD COLUMN x text;', { base: null }),
      ),
    ).toContain(
      'check:migracao (base n/d): aditiva\n  ✓ drizzle/0001_nova.sql: aditiva',
    );
  });
});

describe('check:migracao · linha de comando', () => {
  const raiz = path.resolve(import.meta.dirname, '../..');
  const dir = mkdtempSync(path.join(tmpdir(), 'check-migracao-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const git = (...args: string[]): void => {
    const r = spawnSync(
      'git',
      ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(r.stderr);
  };
  const escrever = (arquivo: string, texto: string): void => {
    mkdirSync(path.dirname(path.join(dir, arquivo)), { recursive: true });
    writeFileSync(path.join(dir, arquivo), texto);
  };
  const journal = (es: EntradaJournal[]): string =>
    JSON.stringify({ version: '7', dialect: 'postgresql', entries: es });
  const cli = (...args: string[]) =>
    spawnSync(
      path.join(raiz, 'node_modules/.bin/tsx'),
      [path.join(raiz, 'scripts/release/check-migracao.ts'), ...args],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );

  it('Dado um repo com migração nova aditiva e depois uma com DROP, Quando roda o CLI, Então JSON e código de saída batem', () => {
    git('init', '-q', '-b', 'main');
    escrever('drizzle/0000_x.sql', 'CREATE TABLE a (id text);');
    escrever('drizzle/meta/_journal.json', journal(base));
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('tag', 'base');

    escrever('drizzle/0001_nova.sql', 'ALTER TABLE a ADD COLUMN nick text;');
    escrever('drizzle/meta/_journal.json', journal(comNova));
    git('add', '-A');
    git('commit', '-q', '-m', 'aditiva');

    const ok = cli('--base', 'base', '--json');
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({
      schema: 'check-migracao/v1',
      ok: true,
      classificacao: 'aditiva',
    });
    expect(cli('--base', 'base').stdout).toContain(
      'check:migracao (base base): aditiva',
    );

    escrever('drizzle/0001_nova.sql', 'ALTER TABLE a DROP COLUMN nick;');
    git('add', '-A');
    git('commit', '-q', '-m', 'drop');
    expect(cli('--base', 'base', '--json').status).toBe(0);
    expect(cli('--base', 'base', '--exigir-aditiva').status).toBe(1);
    expect(
      JSON.parse(cli('--base', 'base', '--all', '--json').stdout).migracoes,
    ).toHaveLength(2);

    escrever('drizzle/0000_x.sql', 'CREATE TABLE a (id text, x text);');
    git('add', '-A');
    git('commit', '-q', '-m', 'altera antiga');
    const alterada = cli('--base', 'base', '--json');
    expect(alterada.status).toBe(1);
    expect(JSON.parse(alterada.stdout).erros[0].codigo).toBe(
      'migracao-existente-alterada',
    );
  });

  it('Dado base inexistente, Quando roda o CLI, Então falha com mensagem', () => {
    const r = cli('--base', 'nao-existe');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('git diff contra nao-existe falhou');
  });
});
