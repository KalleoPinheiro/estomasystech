import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, expect, it } from 'vitest';
import {
  faltandoDepoisDeMigrar,
  type MigracaoDoJournal,
  montarSql,
  naoAditivas,
  parseEstado,
  planejar,
} from '../../scripts/release/migrar-producao-lib';

/**
 * ADR-113: o plano de migração de produção usa as MESMAS regras e os MESMOS valores do migrador do drizzle-orm
 * (postmortem da v0.9.1: hash calculado à mão faria o `db:migrate` seguinte discordar).
 */
const m = (tag: string, when: number): MigracaoDoJournal => ({
  tag,
  when,
  hash: `h-${tag}`,
  instrucoes: [`ALTER TABLE t ADD COLUMN ${tag} text;`],
});
const journal = [m('0001_a', 100), m('0002_b', 200), m('0003_c', 300)];

const estado = (aplicadas: number[], extra = '') =>
  parseEstado(
    `${aplicadas.map((n) => `D ${n}`).join('\n')}\n${extra}\nESTADO_OK\n`,
  );

describe('Feature: leitura do estado do banco', () => {
  it('Dado tabela e função, Então separa os carimbos da tabela e os da função', () => {
    const e = parseEstado('D 100\nD 200\nF 100\nESTADO_OK\n');
    expect(e).toEqual({
      tabelaAusente: false,
      aplicadas: [100, 200],
      funcaoAusente: false,
      daFuncao: [100],
    });
  });

  it('Dado um banco nunca migrado, Então marca tabela e função ausentes', () => {
    const e = parseEstado('TABELA_AUSENTE\nFUNCAO_AUSENTE\nESTADO_OK');
    expect(e.tabelaAusente).toBe(true);
    expect(e.funcaoAusente).toBe(true);
  });

  it('Dado uma resposta sem ESTADO_OK (ssh cortado), Então recusa em vez de achar que nada está aplicado', () => {
    expect(() => parseEstado('D 100\n')).toThrow(/ESTADO_OK/);
  });

  it.each(['D abc', 'X 100', 'D', 'D 1 2'])(
    'Dado a linha inesperada "%s", Então recusa',
    (linha) => {
      expect(() => parseEstado(`${linha}\nESTADO_OK`)).toThrow(/inesperada/);
    },
  );
});

describe('Feature: o que falta migrar (regra do drizzle-orm)', () => {
  it('Dado o banco na migração 2, Então só a 3 está pendente', () => {
    const p = planejar(journal, estado([100, 200]));
    expect(p.pendentes.map((x) => x.tag)).toEqual(['0003_c']);
    expect(p.buracos).toEqual([]);
  });

  it('Dado o banco nunca migrado, Então tudo está pendente', () => {
    const p = planejar(journal, parseEstado('TABELA_AUSENTE\nESTADO_OK'));
    expect(p.pendentes).toHaveLength(3);
  });

  it('Dado o banco no esquema atual, Então nada está pendente', () => {
    expect(planejar(journal, estado([100, 200, 300])).pendentes).toEqual([]);
  });

  it('Dado uma migração antiga ausente (a armadilha 0050/0051), Então aparece como buraco, não como pendente', () => {
    const p = planejar(journal, estado([100, 300]));
    expect(p.buracos.map((x) => x.tag)).toEqual(['0002_b']);
    expect(p.pendentes).toEqual([]);
  });
});

describe('Feature: SQL do plano', () => {
  it('Dado pendências, Então grava hash e carimbo do journal, em ordem, sem BEGIN nem COMMIT', () => {
    const sql = montarSql([m('0002_b', 200), m('0003_c', 300)]);
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "drizzle";');
    expect(sql).toContain(
      `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values('h-0002_b', 200);`,
    );
    expect(sql.indexOf('0002_b (200)')).toBeLessThan(
      sql.indexOf('0003_c (300)'),
    );
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\b/i);
  });

  it('Dado uma instrução sem ponto e vírgula e outra vazia, Então termina cada uma com ; (em linha própria, sem engolir comentário) e ignora a vazia', () => {
    const sql = montarSql([
      { ...m('0001_a', 1), instrucoes: ['CREATE TABLE a (id int)\n', '  \n'] },
    ]);
    expect(sql).toContain('CREATE TABLE a (id int)\n;');
    expect(sql).not.toContain(';;');
  });

  it('Dado a pasta drizzle/ real, Então o hash e o carimbo do plano são os do readMigrationFiles', () => {
    const lidas = readMigrationFiles({ migrationsFolder: 'drizzle' });
    const ultima = lidas.at(-1);
    expect(ultima).toBeDefined();
    const sql = montarSql([
      {
        tag: 'ultima',
        when: ultima?.folderMillis ?? 0,
        hash: ultima?.hash ?? '',
        instrucoes: ultima?.sql ?? [],
      },
    ]);
    expect(sql).toContain(`values('${ultima?.hash}', ${ultima?.folderMillis})`);
  });
});

describe('Feature: lint de migração aditiva nas pendentes', () => {
  it('Dado uma migração que apaga coluna, Então é listada como não aditiva', () => {
    const lista = naoAditivas([m('0001_a', 1), m('0002_b', 2)], (tag) =>
      tag === '0002_b'
        ? 'ALTER TABLE t DROP COLUMN x;'
        : 'ALTER TABLE t ADD COLUMN y text;',
    );
    expect(lista).toEqual(['0002_b']);
  });
});

describe('Feature: conferência depois de migrar', () => {
  it('Dado tudo na tabela e na função, Então não falta nada', () => {
    const e = parseEstado(
      'D 100\nD 200\nD 300\nF 100\nF 200\nF 300\nESTADO_OK',
    );
    expect(faltandoDepoisDeMigrar(journal, e)).toEqual([]);
  });

  it('Dado a tabela cheia e a função ausente (o caso da v0.9.1), Então reprova: o readiness leria pendente', () => {
    const e = parseEstado('D 100\nD 200\nD 300\nFUNCAO_AUSENTE\nESTADO_OK');
    expect(faltandoDepoisDeMigrar(journal, e)).toEqual([
      'função public.app__drizzle_migrations() ausente',
    ]);
  });

  it('Dado a função sem a última migração, Então aponta qual', () => {
    const e = parseEstado('D 100\nD 200\nD 300\nF 100\nF 200\nESTADO_OK');
    expect(faltandoDepoisDeMigrar(journal, e)).toEqual([
      '0003_c fora da função do readiness',
    ]);
  });

  it('Dado banco sem tabela, Então reprova', () => {
    const e = parseEstado('TABELA_AUSENTE\nFUNCAO_AUSENTE\nESTADO_OK');
    expect(faltandoDepoisDeMigrar(journal, e)).toContain(
      'tabela drizzle.__drizzle_migrations ausente',
    );
  });
});
