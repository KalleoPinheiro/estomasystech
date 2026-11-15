import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * ADR-095, ticket 2 (#747): `deploy/backup/ci-backup.sh` é o único comando da chave SSH do CI.
 * Os testes rodam o script de verdade com `systemctl` e `rclone` simulados no PATH.
 */
const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'deploy/backup/ci-backup.sh');

type Cenario = {
  /** Pastas no destino antes do backup. */
  antes?: string[];
  /** Pastas no destino depois do `systemctl start`. */
  depois?: string[];
  /** Arquivos dentro da pasta nova. */
  arquivos?: string[];
  /** Saída do `systemctl start` (0 ok, 124 simula timeout via stub). */
  start?: number;
  result?: string;
  /** rclone falha na listagem do destino na N-ésima chamada (1 = antes). */
  rcloneFalhaEm?: number;
  semDest?: boolean;
};

let dir: string;

function stub(nome: string, corpo: string) {
  const arquivo = path.join(dir, 'bin', nome);
  writeFileSync(arquivo, `#!/usr/bin/env bash\n${corpo}\n`);
  chmodSync(arquivo, 0o755);
}

function preparar(c: Cenario) {
  mkdirSync(path.join(dir, 'bin'));
  const estado = path.join(dir, 'estado');
  writeFileSync(estado, '0');
  const lista = (xs: string[] = []) => xs.map((x) => `${x}/`).join('\\n');
  stub(
    'systemctl',
    `if [ "$1" = start ]; then echo 1 > "${estado}"; echo "segredo-no-systemctl" >&2; exit ${c.start ?? 0}; fi
if [ "$1" = show ]; then echo "${c.result ?? 'success'}"; exit 0; fi`,
  );
  stub(
    'timeout',
    `shift; exec "$@"`, // ignora o limite; o caminho 124 é coberto abaixo
  );
  stub(
    'rclone',
    `n=$(( $(cat "${dir}/chamadas" 2>/dev/null || echo 0) + 1 )); echo $n > "${dir}/chamadas"
if [ "$1" = lsf ] && [ "$2" = --dirs-only ]; then
  if [ "${c.rcloneFalhaEm ?? 0}" = "$n" ]; then echo "token-secreto" >&2; exit 1; fi
  if [ "$(cat "${estado}")" = 1 ]; then printf '${lista(c.depois)}\\n'; else printf '${lista(c.antes)}\\n'; fi
  exit 0
fi
if [ "$1" = lsf ]; then printf '${(c.arquivos ?? []).join('\\n')}\\n'; exit 0; fi`,
  );
  writeFileSync(
    path.join(dir, 'backup.env'),
    c.semDest
      ? 'BACKUP_KEEP_DAYS=7\n'
      : 'BACKUP_RCLONE_DEST=r2:bucket/prod\nRCLONE_CONFIG=/x\n',
  );
}

function rodar(args: string[] = [], extraEnv: Record<string, string> = {}) {
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      CI_BACKUP_ENV_FILE: path.join(dir, 'backup.env'),
      ...extraEnv,
    },
  });
  return { saida: r.stdout, erro: r.stderr, codigo: r.status };
}

const ok = ['db.dump.age', 'uploads.tar.age', 'SHA256SUMS'];
const velho = '20261107T050000Z';
const novo = '20261108T170000Z';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ci-backup-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Feature: backup pré-deploy pelo CI (ADR-095, #747)', () => {
  it('Dado backup que termina com sucesso e objeto novo no destino, Quando o CI chama, Então imprime só BACKUP_OK com o timestamp', () => {
    preparar({ antes: [velho], depois: [velho, novo], arquivos: ok });
    const r = rodar();
    expect(r.saida).toBe(`BACKUP_OK ${novo}\n`);
    expect(r.erro).toBe('');
    expect(r.codigo).toBe(0);
  });

  it('Dado destino vazio antes, Quando o primeiro backup aparece, Então BACKUP_OK', () => {
    preparar({ antes: [], depois: [novo], arquivos: ok });
    expect(rodar().saida).toBe(`BACKUP_OK ${novo}\n`);
  });

  it('Dado Result diferente de success, Quando o CI chama, Então BACKUP_FALHOU com o Result', () => {
    preparar({
      antes: [velho],
      depois: [velho, novo],
      arquivos: ok,
      result: 'exit-code',
    });
    const r = rodar();
    expect(r.saida).toBe('BACKUP_FALHOU Result=exit-code\n');
    expect(r.codigo).toBe(1);
  });

  it('Dado systemctl start que falha, Quando o CI chama, Então BACKUP_FALHOU sem repassar a saída do systemctl', () => {
    preparar({ antes: [velho], depois: [velho], start: 1 });
    const r = rodar();
    expect(r.saida).toBe('BACKUP_FALHOU systemctl start saiu 1\n');
    expect(r.saida + r.erro).not.toContain('segredo-no-systemctl');
    expect(r.codigo).toBe(1);
  });

  it('Dado systemctl que estoura o limite (124), Quando o CI chama, Então BACKUP_FALHOU tempo esgotado', () => {
    preparar({ antes: [velho], depois: [velho], start: 124 });
    expect(rodar([], { CI_BACKUP_TIMEOUT: '5' }).saida).toBe(
      'BACKUP_FALHOU tempo esgotado (5 s)\n',
    );
  });

  it('Dado success mas nenhuma pasta nova no destino, Quando o CI chama, Então BACKUP_FALHOU', () => {
    preparar({ antes: [velho], depois: [velho], arquivos: ok });
    expect(rodar().saida).toBe('BACKUP_FALHOU nenhum backup novo no destino\n');
  });

  it.each(ok)(
    'Dado objeto novo sem %s, Quando o CI chama, Então BACKUP_FALHOU',
    (falta) => {
      preparar({
        antes: [velho],
        depois: [velho, novo],
        arquivos: ok.filter((a) => a !== falta),
      });
      expect(rodar().saida).toBe(`BACKUP_FALHOU backup novo sem ${falta}\n`);
    },
  );

  it('Dado destino inacessível antes de começar, Quando o CI chama, Então falha sem iniciar o backup', () => {
    preparar({ rcloneFalhaEm: 1 });
    const r = rodar();
    expect(r.saida).toBe(
      'BACKUP_FALHOU destino fora do servidor inacessível\n',
    );
    expect(r.saida + r.erro).not.toContain('token-secreto');
    expect(readFileSync(path.join(dir, 'estado'), 'utf8').trim()).toBe('0');
  });

  it('Dado destino inacessível depois do backup, Quando o CI chama, Então BACKUP_FALHOU', () => {
    preparar({ antes: [velho], rcloneFalhaEm: 2 });
    expect(rodar().saida).toBe(
      'BACKUP_FALHOU destino fora do servidor inacessível depois do backup\n',
    );
  });

  it('Dado configuração sem BACKUP_RCLONE_DEST, Quando o CI chama, Então BACKUP_FALHOU', () => {
    preparar({ semDest: true });
    expect(rodar().saida).toBe('BACKUP_FALHOU BACKUP_RCLONE_DEST ausente\n');
  });

  it('Dado arquivo de configuração inexistente, Quando o CI chama, Então BACKUP_FALHOU sem citar o caminho', () => {
    preparar({});
    const r = rodar([], { CI_BACKUP_ENV_FILE: path.join(dir, 'nao-existe') });
    expect(r.saida).toBe('BACKUP_FALHOU configuração do backup ilegível\n');
    expect(r.saida).not.toContain(dir);
  });

  it('Dado qualquer argumento, Quando o CI chama, Então recusa antes de tocar no serviço', () => {
    preparar({ antes: [velho], depois: [velho, novo], arquivos: ok });
    const r = rodar(['--qualquer']);
    expect(r.saida).toBe('BACKUP_FALHOU argumentos não são aceitos\n');
    expect(readFileSync(path.join(dir, 'estado'), 'utf8').trim()).toBe('0');
  });

  it('Dado CI_BACKUP_TIMEOUT não numérico, Quando o CI chama, Então BACKUP_FALHOU', () => {
    preparar({});
    expect(rodar([], { CI_BACKUP_TIMEOUT: 'abc' }).saida).toBe(
      'BACKUP_FALHOU CI_BACKUP_TIMEOUT inválido\n',
    );
  });
});

describe('Feature: privilégio mínimo da chave do CI (ADR-095)', () => {
  const sudoers = readFileSync(
    path.join(root, 'deploy/backup/estomasystech-ci-backup.sudoers'),
    'utf8',
  );

  it('Dado o sudoers versionado, Quando lido, Então libera só o ci-backup.sh sem argumentos', () => {
    const regras = sudoers.split('\n').filter((l) => /NOPASSWD/.test(l));
    expect(regras).toEqual([
      'estoma-ci ALL=(root) NOPASSWD: /opt/estomasystech-backup/ci-backup.sh ""',
    ]);
  });
});
