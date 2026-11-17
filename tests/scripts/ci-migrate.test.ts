import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * ADR-113: `deploy/migrate/ci-migrate.sh` é o único comando da chave SSH de migração do CI. Roda o script de
 * verdade com um `docker` falso no lugar do `docker exec ... psql`.
 */
const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'deploy/migrate/ci-migrate.sh');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ci-migrate-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

type Opcoes = {
  comando?: string;
  stdin?: string;
  config?: string | null;
  /** Saída do psql por consulta (trecho do SQL -> saída). */
  respostas?: Record<string, string>;
  /** Saída de erro e código do psql quando roda o SQL do stdin (-f -). */
  falhaNoSql?: { codigo: number; erro: string };
  maxBytes?: string;
  argumentos?: string[];
};

function rodar(o: Opcoes) {
  const docker = path.join(dir, 'docker');
  const respostas = o.respostas ?? {};
  const casos = Object.entries(respostas)
    .map(
      ([trecho, saida]) =>
        `*"${trecho}"*) printf '%s\\n' '${saida.replaceAll("'", "'\\''")}' ;;`,
    )
    .join('\n');
  const falha = o.falhaNoSql
    ? `echo '${o.falhaNoSql.erro}' >&2; exit ${o.falhaNoSql.codigo}`
    : 'exit 0';
  writeFileSync(
    docker,
    `#!/bin/bash
echo "$@" >> "${dir}/chamadas"
if printf '%s ' "$@" | grep -q -- '-f -'; then
  cat > "${dir}/sql-recebido"
  ${falha}
fi
sql="$(printf '%s\\n' "$@" | tail -n 1)"
case "$sql" in
${casos}
esac
`,
  );
  chmodSync(docker, 0o755);
  const env = path.join(dir, 'migrate.env');
  if (o.config !== null) {
    writeFileSync(
      env,
      o.config ??
        'CI_MIGRATE_DB_CONTAINER=pg-prod\nCI_MIGRATE_DB_USER=estomasystech\n',
    );
  }
  const r = spawnSync('bash', [script, ...(o.argumentos ?? [])], {
    input: o.stdin ?? '',
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      SSH_ORIGINAL_COMMAND: o.comando ?? '',
      CI_MIGRATE_ENV_FILE: env,
      CI_MIGRATE_DOCKER: docker,
      ...(o.maxBytes ? { CI_MIGRATE_MAX_BYTES: o.maxBytes } : {}),
    } as unknown as NodeJS.ProcessEnv,
  });
  const linhas = (r.stdout ?? '').trim().split('\n');
  const ler = (nome: string) =>
    existsSync(path.join(dir, nome))
      ? readFileSync(path.join(dir, nome), 'utf8')
      : '';
  return {
    saida: linhas,
    ultima: linhas.at(-1),
    codigo: r.status,
    chamadas: ler('chamadas'),
    sql: ler('sql-recebido'),
  };
}

describe('Feature: ci-migrate.sh só aceita comandos de uma lista fechada', () => {
  it.each([
    '',
    'bash',
    'ls -la',
    'estado; rm -rf /',
    'aplicar && id',
    'desfazer-versao',
  ])('Dado o comando "%s", Então recusa sem chamar o banco', (comando) => {
    const r = rodar({ comando });
    expect(r.codigo).toBe(1);
    expect(r.ultima).toMatch(/^MIGRACAO_FALHOU /);
    expect(r.chamadas).toBe('');
  });

  it('Dado argumento na linha de comando, Então recusa', () => {
    expect(rodar({ comando: 'estado', argumentos: ['x'] }).ultima).toMatch(
      /argumentos não são aceitos/,
    );
  });

  it('Dado a configuração ausente ou com container inválido, Então recusa', () => {
    expect(rodar({ comando: 'estado', config: null }).ultima).toMatch(
      /configuração da migração ilegível/,
    );
    expect(
      rodar({
        comando: 'estado',
        config: 'CI_MIGRATE_DB_CONTAINER="pg prod"\n',
      }).ultima,
    ).toMatch(/CI_MIGRATE_DB_CONTAINER/);
  });
});

describe('Feature: estado do banco', () => {
  it('Dado tabela e função presentes, Então lista os carimbos e termina em ESTADO_OK', () => {
    const r = rodar({
      comando: 'estado',
      respostas: {
        to_regclass: 't',
        to_regprocedure: 't',
        'from drizzle.__drizzle_migrations': 'D 100\nD 200',
        'public.app__drizzle_migrations() as': 'F 100\nF 200',
      },
    });
    expect(r.codigo).toBe(0);
    expect(r.saida).toEqual(['D 100', 'D 200', 'F 100', 'F 200', 'ESTADO_OK']);
    expect(r.chamadas).toContain('exec -i pg-prod psql');
    expect(r.chamadas).toContain('-U estomasystech');
  });

  it('Dado o banco da v0.8.0 (sem a função da 0080), Então diz FUNCAO_AUSENTE', () => {
    const r = rodar({
      comando: 'estado',
      respostas: {
        to_regclass: 't',
        to_regprocedure: 'f',
        'from drizzle.__drizzle_migrations': 'D 100',
      },
    });
    expect(r.saida).toEqual(['D 100', 'FUNCAO_AUSENTE', 'ESTADO_OK']);
  });

  it('Dado banco sem a tabela do Drizzle, Então diz TABELA_AUSENTE', () => {
    const r = rodar({
      comando: 'estado',
      respostas: { to_regclass: 'f', to_regprocedure: 'f' },
    });
    expect(r.saida).toEqual(['TABELA_AUSENTE', 'FUNCAO_AUSENTE', 'ESTADO_OK']);
  });
});

describe('Feature: aplicar e simular', () => {
  const sql = 'ALTER TABLE t ADD COLUMN x text;\n-- ESTOMASYSTECH-FIM\n';

  it('Dado SQL, Quando aplica, Então roda numa transação com lock_timeout e COMMIT', () => {
    const r = rodar({ comando: 'aplicar', stdin: sql });
    expect(r.codigo).toBe(0);
    expect(r.ultima).toBe('MIGRACAO_OK');
    expect(r.sql).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '60s';\n/);
    expect(r.sql).toContain(sql.trim());
    expect(r.sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(r.chamadas).toContain('ON_ERROR_STOP=1');
  });

  it('Dado SQL, Quando simula, Então termina em ROLLBACK e nunca em COMMIT', () => {
    const r = rodar({ comando: 'simular', stdin: sql });
    expect(r.ultima).toBe('SIMULACAO_OK');
    expect(r.sql.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(r.sql).not.toContain('COMMIT');
  });

  it('Dado erro de SQL no meio, Então falha com o motivo e NUNCA diz MIGRACAO_OK', () => {
    const r = rodar({
      comando: 'aplicar',
      stdin: sql,
      falhaNoSql: { codigo: 3, erro: 'ERROR:  column "x" already exists' },
    });
    expect(r.codigo).toBe(1);
    expect(r.ultima).toMatch(/^MIGRACAO_FALHOU psql saiu 3: ERROR:/);
    expect(r.saida).not.toContain('MIGRACAO_OK');
  });

  it('Dado entrada sem a marca de fim (cortada), Então recusa antes de tocar o banco', () => {
    const r = rodar({
      comando: 'aplicar',
      stdin: 'ALTER TABLE t ADD COLUMN x text;\n',
    });
    expect(r.codigo).toBe(1);
    expect(r.ultima).toMatch(/sem a marca de fim/);
    expect(r.chamadas).toBe('');
  });

  it('Dado stdin vazio ou maior que o limite, Então recusa antes de tocar o banco', () => {
    expect(rodar({ comando: 'aplicar', stdin: '' }).ultima).toMatch(
      /SQL vazio/,
    );
    const grande = rodar({
      comando: 'aplicar',
      stdin: 'x'.repeat(50),
      maxBytes: '10',
    });
    expect(grande.ultima).toMatch(/maior que 10 bytes/);
    expect(grande.chamadas).toBe('');
  });
});

describe('Feature: desfazer a versão registrada (rollback automático)', () => {
  it('Dado X.Y.Z, Então apaga só essa versão de app_releases', () => {
    const r = rodar({ comando: 'desfazer-versao 0.9.1' });
    expect(r.ultima).toBe('VERSAO_DESFEITA 0.9.1');
    expect(r.chamadas).toContain(
      "delete from app_releases where version = '0.9.1'",
    );
  });

  it.each([
    "desfazer-versao 0.9.1'; drop table users; --",
    'desfazer-versao 0.9',
    'desfazer-versao latest',
  ])('Dado "%s", Então recusa', (comando) => {
    const r = rodar({ comando });
    expect(r.ultima).toBe('MIGRACAO_FALHOU versão inválida');
    expect(r.chamadas).toBe('');
  });
});
