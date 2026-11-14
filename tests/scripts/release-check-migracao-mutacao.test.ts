import { describe, expect, it } from 'vitest';
import {
  classificarMigracao,
  type EntradaJournal,
  validarJournal,
  validarSoAcrescenta,
  verificar,
} from '../../scripts/release/check-migracao-lib';

// Cenários que fecham as lacunas apontadas pelo Stryker (#761): cada regra explica o motivo, cada padrão
// é ancorado no início da instrução e o contexto da migração (tabelas e colunas novas) é lido por inteiro.

const analisar = (sql: string) =>
  classificarMigracao('drizzle/0099_x.sql', sql).instrucoes;
const ultima = (sql: string) => analisar(sql).at(-1);

describe('check:migracao · cada regra diz a regra e o motivo', () => {
  const casos: Array<[string, string, string, 'aditiva' | 'nao_aditiva']> = [
    ['DROP TABLE a', 'drop', 'DROP', 'nao_aditiva'],
    ['TRUNCATE a', 'truncate', 'TRUNCATE', 'nao_aditiva'],
    ['UPDATE a SET b = 1', 'update-em-massa', 'UPDATE', 'nao_aditiva'],
    ['DELETE FROM a', 'delete-em-massa', 'DELETE', 'nao_aditiva'],
    ["ALTER TYPE t ADD VALUE 'x'", 'alter-type', 'ALTER TYPE', 'nao_aditiva'],
    ['CREATE TABLE a (id text)', 'create-table', 'CREATE TABLE', 'aditiva'],
    [
      'CREATE UNLOGGED TABLE a (id text)',
      'create-table',
      'UNLOGGED',
      'aditiva',
    ],
    ['CREATE TEMP TABLE a (id text)', 'create-table', 'TEMP', 'aditiva'],
    [
      'CREATE TEMPORARY TABLE a (id text)',
      'create-table',
      'TEMPORARY',
      'aditiva',
    ],
    [
      "CREATE TYPE t AS ENUM ('a')",
      'create-objeto-novo',
      'CREATE TYPE',
      'aditiva',
    ],
    ['CREATE SEQUENCE s', 'create-objeto-novo', 'SEQUENCE', 'aditiva'],
    ['CREATE SCHEMA s', 'create-objeto-novo', 'SCHEMA', 'aditiva'],
    ['CREATE EXTENSION e', 'create-objeto-novo', 'EXTENSION', 'aditiva'],
    ['INSERT INTO a VALUES (1)', 'insert', 'INSERT', 'aditiva'],
    ["COMMENT ON TABLE a IS 'x'", 'comment', 'COMMENT', 'aditiva'],
    ['ALTER TABLE a RENAME COLUMN b TO c', 'rename', 'RENAME', 'nao_aditiva'],
    ['ALTER TABLE a DROP COLUMN b', 'drop', 'DROP COLUMN', 'nao_aditiva'],
    ['ALTER TABLE a ADD COLUMN b text', 'add-column', 'ADD COLUMN', 'aditiva'],
    [
      'ALTER TABLE a ADD COLUMN b text NOT NULL',
      'add-column-not-null-sem-default',
      'ADD NOT NULL',
      'nao_aditiva',
    ],
    [
      'ALTER TABLE a ALTER COLUMN b SET NOT NULL',
      'set-not-null',
      'SET NOT NULL',
      'nao_aditiva',
    ],
    [
      'ALTER TABLE a ALTER COLUMN b DROP NOT NULL',
      'drop-not-null',
      'DROP NOT NULL',
      'aditiva',
    ],
    [
      'ALTER TABLE a ALTER COLUMN b SET DEFAULT 1',
      'set-default',
      'SET DEFAULT',
      'aditiva',
    ],
    [
      'ALTER TABLE a ALTER COLUMN b DROP DEFAULT',
      'drop-default',
      'DROP DEFAULT',
      'nao_aditiva',
    ],
    [
      'ALTER TABLE a ALTER COLUMN b TYPE int',
      'alter-column-type',
      'TYPE',
      'nao_aditiva',
    ],
    [
      'ALTER TABLE a ALTER b SET DATA TYPE int',
      'alter-column-type',
      'SET DATA TYPE',
      'nao_aditiva',
    ],
    [
      'ALTER TABLE a VALIDATE CONSTRAINT k',
      'validate-constraint',
      'VALIDATE',
      'aditiva',
    ],
    [
      'ALTER TABLE a ADD CONSTRAINT k CHECK (a.b > 0) NOT VALID',
      'add-constraint-not-valid',
      'NOT VALID',
      'aditiva',
    ],
    [
      'ALTER TABLE a ADD CONSTRAINT k UNIQUE (b)',
      'add-constraint-sem-not-valid',
      'sem NOT VALID',
      'nao_aditiva',
    ],
    ['CREATE INDEX i ON a (b)', 'create-index', 'índice comum', 'aditiva'],
    [
      'CREATE UNIQUE INDEX i ON a (b)',
      'create-unique-index-em-tabela-existente',
      'único existente',
      'nao_aditiva',
    ],
    ['SELECT 1', 'desconhecida', 'desconhecida', 'nao_aditiva'],
  ];
  it.each(casos)(
    'Dado «%s», Quando classifica, Então é %s com motivo explicado (%s)',
    (sql, regra, _rotulo, classe) => {
      const i = ultima(sql);
      expect(i?.regra).toBe(regra);
      expect(i?.classificacao).toBe(classe);
      expect(i?.motivo.length).toBeGreaterThan(10);
    },
  );

  it('Dado uma tabela e um índice novos, Quando classifica, Então os motivos também são explicados', () => {
    const [, idx] = analisar(
      'CREATE TABLE a (id text); CREATE INDEX i ON a (id);',
    );
    expect(idx.regra).toBe('create-index');
    expect(idx.motivo.length).toBeGreaterThan(10);
    const [, col] = analisar(
      'CREATE TABLE a (id text); ALTER TABLE a ADD COLUMN b text NOT NULL;',
    );
    expect(col.regra).toBe('add-column');
    expect(col.motivo.length).toBeGreaterThan(10);
    const [, c1] = analisar(
      'CREATE TABLE a (id text); ALTER TABLE a ADD CONSTRAINT k UNIQUE (id);',
    );
    expect(c1.regra).toBe('constraint-em-tabela-nova');
    expect(c1.motivo.length).toBeGreaterThan(10);
    const c2 = ultima(
      'ALTER TABLE a ADD COLUMN b text; ALTER TABLE a ADD CONSTRAINT k UNIQUE (b);',
    );
    expect(c2?.regra).toBe('constraint-em-colunas-novas');
    expect(c2?.motivo.length).toBeGreaterThan(10);
    const [, u] = analisar(
      'ALTER TABLE a ADD COLUMN b text; CREATE UNIQUE INDEX i ON a (b);',
    );
    expect(u.regra).toBe('create-unique-index');
    expect(u.motivo.length).toBeGreaterThan(10);
  });
});

describe('check:migracao · os padrões começam no início da instrução', () => {
  it.each([
    'x drop table a',
    'x truncate a',
    'x update a set b = 1',
    'x delete from a',
    'x alter type t add value',
    'x create table a (id text)',
    'x create type t',
    'x insert into a values (1)',
    'x comment on table a is',
    'x create index i on a (b)',
    'x create unique index i on a (b)',
    'x alter table a add column b text',
  ])(
    'Dado «%s», Quando classifica, Então não reconhece como regra conhecida',
    (sql) => {
      expect(ultima(sql)?.regra).toBe('desconhecida');
    },
  );

  it.each([
    'truncatex a',
    'updatex a set b = 1',
    'deletex from a',
    'alter typex t',
    'insert intox a',
    'comment onx a',
    'create typex t',
    'create indexx i on a (b)',
  ])(
    'Dado «%s», Quando classifica, Então a palavra inteira é exigida',
    (sql) => {
      expect(ultima(sql)?.regra).toBe('desconhecida');
    },
  );

  it('Dado ações de ALTER TABLE coladas a outras palavras, Quando classifica, Então não as reconhece', () => {
    expect(ultima('ALTER TABLE a renamex b')?.regra).toBe('desconhecida');
    expect(ultima('ALTER TABLE a dropx b')?.regra).toBe('desconhecida');
    expect(ultima('ALTER TABLE a validate constraintx k')?.regra).toBe(
      'desconhecida',
    );
    expect(ultima('ALTER TABLE a x add column b text')?.regra).toBe(
      'desconhecida',
    );
    expect(ultima('ALTER TABLE a x alter column b set not null')?.regra).toBe(
      'desconhecida',
    );
    expect(ultima('ALTER TABLE a ALTER COLUMN b SET NOT NULL x')?.regra).toBe(
      'desconhecida',
    );
    expect(ultima('ALTER TABLE a ALTER COLUMN b DROP NOT NULL x')?.regra).toBe(
      'desconhecida',
    );
    expect(ultima('ALTER TABLE a ALTER COLUMN b DROP DEFAULT x')?.regra).toBe(
      'desconhecida',
    );
  });

  it('Dado ALTER sem o nome da coluna, Quando classifica, Então é desconhecida', () => {
    expect(ultima('ALTER TABLE a ALTER COLUMN')?.regra).toBe('desconhecida');
    expect(ultima('ALTER TABLE a ALTER b ')?.regra).toBe('desconhecida');
  });
});

describe('check:migracao · o que a migração cria vale para as instruções seguintes', () => {
  it('Dado CREATE TABLE com variantes (UNLOGGED, TEMP, IF NOT EXISTS), Quando há constraint nela, Então é tabela nova', () => {
    for (const criar of [
      'CREATE UNLOGGED TABLE IF NOT EXISTS t (id text)',
      'CREATE TEMP TABLE t (id text)',
      'CREATE TEMPORARY TABLE t (id text)',
    ]) {
      expect(
        ultima(`${criar}; ALTER TABLE t ADD CONSTRAINT k UNIQUE (id);`)?.regra,
      ).toBe('constraint-em-tabela-nova');
    }
  });

  it('Dado um CREATE TABLE que não está no início, Quando há constraint, Então a tabela não conta como nova', () => {
    expect(
      ultima(
        'x create table t (id text); ALTER TABLE t ADD CONSTRAINT k UNIQUE (id);',
      )?.regra,
    ).toBe('add-constraint-sem-not-valid');
  });

  it('Dado ALTER TABLE com IF EXISTS e ONLY, Quando adiciona coluna e índice único, Então a coluna é nova', () => {
    expect(
      ultima(
        'ALTER TABLE IF EXISTS ONLY t ADD COLUMN IF NOT EXISTS c text; CREATE UNIQUE INDEX i ON t (c);',
      )?.regra,
    ).toBe('create-unique-index');
    expect(
      ultima('ALTER TABLE t ADD c text; CREATE UNIQUE INDEX i ON t (c);')
        ?.regra,
    ).toBe('create-unique-index');
  });

  it('Dado um ALTER TABLE que não está no início, Quando o índice único usa a coluna, Então ela não conta como nova', () => {
    expect(
      ultima(
        'x alter table t add column c text; CREATE UNIQUE INDEX i ON t (c);',
      )?.regra,
    ).toBe('create-unique-index-em-tabela-existente');
  });

  it('Dado ADD CONSTRAINT, Quando um índice único cita «constraint», Então ela não é lida como coluna nova', () => {
    expect(
      ultima(
        'ALTER TABLE t ADD CONSTRAINT k UNIQUE (a); CREATE UNIQUE INDEX i ON t (constraint);',
      )?.regra,
    ).toBe('create-unique-index-em-tabela-existente');
    for (const forma of [
      'ADD UNIQUE (a)',
      'ADD PRIMARY KEY (a)',
      'ADD FOREIGN KEY (a) REFERENCES u (id)',
      'ADD CHECK (a > 0)',
    ]) {
      expect(
        ultima(
          `ALTER TABLE t ${forma}; CREATE UNIQUE INDEX i ON t (${forma.split(' ')[1]});`,
        )?.regra,
      ).toBe('create-unique-index-em-tabela-existente');
    }
  });

  it('Dado uma ação sem coluna, Quando um índice único cita «undefined», Então não há coluna nova com esse nome', () => {
    expect(
      ultima(
        'ALTER TABLE t DROP COLUMN c; CREATE UNIQUE INDEX i ON t (undefined);',
      )?.regra,
    ).toBe('create-unique-index-em-tabela-existente');
  });

  it('Dado colunas novas qualificadas pela tabela, Quando a constraint as cita, Então são novas', () => {
    expect(
      ultima(
        'ALTER TABLE t ADD COLUMN c text; ALTER TABLE t ADD CONSTRAINT k UNIQUE (t.c);',
      )?.regra,
    ).toBe('constraint-em-colunas-novas');
  });

  it('Dado CHECK sobre colunas novas de tabela com esquema, Quando classifica, Então é aditiva', () => {
    expect(
      ultima(
        'ALTER TABLE app.t ADD COLUMN c int; ALTER TABLE app.t ADD CONSTRAINT k CHECK (app.t.c > 0);',
      )?.regra,
    ).toBe('constraint-em-colunas-novas');
    expect(
      ultima(
        'ALTER TABLE t ADD COLUMN c int; ALTER TABLE t ADD CONSTRAINT k CHECK (t.c > 0);',
      )?.regra,
    ).toBe('constraint-em-colunas-novas');
    expect(
      ultima(
        'ALTER TABLE t ADD COLUMN c int; ALTER TABLE t ADD CONSTRAINT k CHECK (t.d > 0);',
      )?.regra,
    ).toBe('add-constraint-sem-not-valid');
  });

  it('Dado índice único só em colunas de grupo parcial, Quando classifica, Então exige todas novas', () => {
    expect(
      ultima(
        'ALTER TABLE t ADD COLUMN c text; CREATE UNIQUE INDEX i ON t (c, d);',
      )?.regra,
    ).toBe('create-unique-index-em-tabela-existente');
  });
});

describe('check:migracao · leitura do SQL e relatório', () => {
  it('Dado comentário de linha e de bloco, Quando divide, Então o bloco vira espaço e o texto não cola', () => {
    const [i] = analisar('ALTER/* c */TABLE a ADD COLUMN b text;');
    expect(i.sql).toBe('alter table a add column b text');
    const [j] = analisar('ALTER TABLE a ADD COLUMN b text; -- fim');
    expect(j.regra).toBe('add-column');
    const [k, l] = analisar(
      '-- só comentário\nDROP TABLE a; /* x */ DROP TABLE b;',
    );
    expect([k.regra, l.regra]).toEqual(['drop', 'drop']);
    expect(analisar('-- sem quebra no fim')).toEqual([]);
    expect(analisar('DROP TABLE a /* sem fim').map((x) => x.sql)).toEqual([
      'drop table a',
    ]);
  });

  it('Dado o marcador do Drizzle, Quando divide, Então ele não vira instrução', () => {
    const r = analisar(
      'CREATE TABLE a (id text);--> statement-breakpoint\nDROP TABLE a;',
    );
    expect(r.map((x) => x.regra)).toEqual(['create-table', 'drop']);
  });

  it('Dado aspas duplicadas no fim do arquivo, Quando divide, Então não entra em laço', () => {
    expect(analisar("COMMENT ON TABLE a IS 'x''")).toHaveLength(1);
    expect(analisar('COMMENT ON TABLE "a"""')).toHaveLength(1);
  });

  it('Dado SQL no limite de 200 caracteres, Quando classifica, Então só corta acima dele', () => {
    const base = 'insert into a values (';
    const exato = `${base}${'1'.repeat(200 - base.length - 1)})`;
    expect(exato).toHaveLength(200);
    expect(ultima(exato)?.sql).toBe(exato);
    const longo = `${base}${'1'.repeat(200 - base.length)})`;
    expect(ultima(longo)?.sql).toBe(`${longo.slice(0, 200)}…`);
  });

  it('Dado o caminho do arquivo, Quando classifica, Então a tag é o nome sem diretório nem .sql', () => {
    expect(
      classificarMigracao('drizzle/sub/0007_nome.sql', 'SELECT 1').tag,
    ).toBe('0007_nome');
    expect(classificarMigracao('0007_nome.sql.sql', 'SELECT 1').tag).toBe(
      '0007_nome.sql',
    );
    expect(classificarMigracao('a.sqlx/0007_n.sql', 'SELECT 1').tag).toBe(
      '0007_n',
    );
    expect(classificarMigracao('0007_n.sqlx', 'SELECT 1').tag).toBe(
      '0007_n.sqlx',
    );
  });

  it('Dado uma migração com uma única instrução não aditiva entre aditivas, Quando verifica, Então a geral é não aditiva', () => {
    const r = verificar({
      base: 'main',
      journal: [],
      journalBase: null,
      arquivosSql: [],
      analisar: ['drizzle/0001_a.sql', 'drizzle/0002_b.sql'],
      alterados: [],
      lerSql: (c) =>
        c.includes('0001') ? 'CREATE TABLE a (id text)' : 'DROP TABLE a',
    });
    expect(r.classificacao).toBe('nao_aditiva');
    const so = verificar({
      base: 'main',
      journal: [],
      journalBase: null,
      arquivosSql: [],
      analisar: ['drizzle/0001_a.sql'],
      alterados: [],
      lerSql: () => 'CREATE TABLE a (id text)',
    });
    expect(so.classificacao).toBe('aditiva');
  });
});

describe('check:migracao · journal explica cada erro', () => {
  const e = (idx: number, tag: string, when: number): EntradaJournal => ({
    idx,
    tag,
    when,
  });

  it('Dado idx fora de posição, Quando valida, Então a mensagem cita a tag, o idx e a posição', () => {
    const erros = validarJournal([e(1, '0001_a', 1)], ['0001_a.sql']);
    const idx = erros.find((x) => x.codigo === 'journal-idx');
    expect(idx?.mensagem).toBe('entrada 0001_a: idx 1 na posição 0');
  });

  it('Dado tag sem prefixo do idx, Quando valida, Então a mensagem cita a tag e o prefixo esperado', () => {
    const erros = validarJournal([e(0, 'a_0000', 1)], ['a_0000.sql']);
    expect(
      erros.find((x) => x.codigo === 'journal-tag-prefixo')?.mensagem,
    ).toBe('tag a_0000 não começa com o idx 0000');
    const outro = validarJournal([e(0, '0005_a', 1)], ['0005_a.sql']);
    expect(
      outro.find((x) => x.codigo === 'journal-tag-prefixo')?.mensagem,
    ).toBe('tag 0005_a não começa com o idx 0000');
    expect(
      validarJournal([e(0, '00000_a', 1)], ['00000_a.sql']).map(
        (x) => x.codigo,
      ),
    ).toContain('journal-tag-prefixo');
    expect(
      validarJournal([e(0, 'x0000_a', 1)], ['x0000_a.sql']).map(
        (x) => x.codigo,
      ),
    ).toContain('journal-tag-prefixo');
  });

  it('Dado tag repetida, Quando valida, Então a mensagem cita a tag', () => {
    const erros = validarJournal(
      [e(0, '0000_a', 1), e(1, '0000_a', 2)],
      ['0000_a.sql'],
    );
    expect(
      erros.find((x) => x.codigo === 'journal-tag-duplicada')?.mensagem,
    ).toBe('tag 0000_a repetida no journal');
  });

  it('Dado tag sem arquivo, Quando valida, Então a mensagem cita a tag e o arquivo', () => {
    const erros = validarJournal([e(0, '0000_a', 1)], []);
    expect(
      erros.find((x) => x.codigo === 'journal-sem-arquivo')?.mensagem,
    ).toBe('o journal lista 0000_a, mas não há 0000_a.sql');
  });

  it('Dado arquivo fora do journal, Quando valida, Então os arquivos saem em ordem, com .sql e o caminho', () => {
    const erros = validarJournal(
      [],
      ['0002_b.sql', '0001_a.sql.sql', '0003_c.sqlx'],
    );
    expect(erros.map((x) => x.arquivo)).toEqual([
      'drizzle/0001_a.sql.sql',
      'drizzle/0002_b.sql',
      'drizzle/0003_c.sqlx.sql',
    ]);
    expect(
      erros.find((x) => x.arquivo === 'drizzle/0002_b.sql')?.mensagem,
    ).toBe('0002_b.sql não está no journal e nunca seria aplicada');
  });

  it('Dado entrada da base alterada, Quando valida, Então a mensagem cita a tag; sem diferença não há erro', () => {
    const base = [e(0, '0000_a', 1)];
    expect(validarSoAcrescenta(base, [e(0, '0000_a', 2)])[0].mensagem).toBe(
      'a entrada 0000_a do journal mudou ou sumiu; só é permitido acrescentar ao fim',
    );
    expect(validarSoAcrescenta(base, [])[0].codigo).toBe(
      'journal-nao-so-acrescenta',
    );
    expect(
      validarSoAcrescenta(base, [e(0, '0000_a', 1), e(1, '0001_b', 2)]),
    ).toEqual([]);
  });

  it('Dado migração antiga alterada, Quando verifica, Então a mensagem cita o arquivo e a saída', () => {
    const r = verificar({
      base: 'main',
      journal: [],
      journalBase: null,
      arquivosSql: [],
      analisar: [],
      alterados: ['drizzle/0001_a.sql'],
      lerSql: () => '',
    });
    expect(r.erros[0]).toEqual({
      codigo: 'migracao-existente-alterada',
      mensagem:
        'drizzle/0001_a.sql já existe na base e não pode mudar: corrija com uma migração nova',
      arquivo: 'drizzle/0001_a.sql',
    });
  });
});
