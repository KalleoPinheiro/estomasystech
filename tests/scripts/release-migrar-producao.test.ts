import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
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
 * ADR-113: `migrar-producao.sh` migra com o dono ANTES do deploy e para na primeira falha. Roda o script de
 * verdade (e o plano em TypeScript) com um `ssh` falso que responde como o `ci-migrate.sh` e uma pasta
 * drizzle/ de duas migrações.
 */
const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/release/migrar-producao.sh');
const tsx = path.join(root, 'node_modules/.bin/tsx');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'migrar-prod-'));
  mkdirSync(path.join(dir, 'drizzle/meta'), { recursive: true });
  writeFileSync(
    path.join(dir, 'drizzle/meta/_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [
        { idx: 0, version: '7', when: 100, tag: '0000_a', breakpoints: true },
        { idx: 1, version: '7', when: 200, tag: '0001_b', breakpoints: true },
      ],
    }),
  );
  writeFileSync(
    path.join(dir, 'drizzle/0000_a.sql'),
    'CREATE TABLE a (id int);\n',
  );
  writeFileSync(
    path.join(dir, 'drizzle/0001_b.sql'),
    'ALTER TABLE a ADD COLUMN b text;\n--> statement-breakpoint\nCREATE INDEX a_b ON a (b);\n',
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Respostas do `estado`, na ordem das chamadas; `aplicar` e `simular` respondem `final`. */
type Cenario = {
  estados: string[];
  aplicar?: string;
  simular?: string;
  desfazer?: string;
};

function ssh(c: Cenario): string {
  const arquivo = path.join(dir, 'ssh');
  const estados = c.estados.map((e) => e.replaceAll("'", "'\\''"));
  writeFileSync(
    arquivo,
    `#!/bin/bash
for ultimo; do :; done
echo "$ultimo" >> "${dir}/comandos"
case "$ultimo" in
  estado)
    n=$(( $(cat "${dir}/n-estado" 2>/dev/null || echo 0) + 1 )); echo $n > "${dir}/n-estado"
    case $n in
${estados.map((e, i) => `      ${i + 1}) printf '%s\\n' '${e}' ;;`).join('\n')}
    esac ;;
  aplicar) cat > "${dir}/sql-aplicado"; echo '${c.aplicar ?? 'MIGRACAO_OK'}' ;;
  simular) cat > "${dir}/sql-simulado"; echo '${c.simular ?? 'SIMULACAO_OK'}' ;;
  desfazer-versao*) ${c.desfazer ? `echo '${c.desfazer}'` : 'echo "VERSAO_DESFEITA ${ultimo#desfazer-versao }"'} ;;
esac
`,
  );
  chmodSync(arquivo, 0o755);
  return arquivo;
}

function rodar(modo: string[], c: Cenario) {
  const r = spawnSync('bash', [script, ...modo], {
    encoding: 'utf8',
    env: {
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      VPS_MIGRATE_SSH_KEY: 'CHAVE-FALSA-SECRETA',
      VPS_KNOWN_HOSTS: 'host ssh-ed25519 AAAA',
      VPS_HOST: 'vps.example.test',
      MIGRAR_SSH: ssh(c),
      MIGRAR_PASTA: path.join(dir, 'drizzle'),
      MIGRAR_TSX: tsx,
      GITHUB_OUTPUT: path.join(dir, 'github-output'),
    } as unknown as NodeJS.ProcessEnv,
  });
  const ler = (n: string) =>
    existsSync(path.join(dir, n))
      ? readFileSync(path.join(dir, n), 'utf8')
      : '';
  return {
    codigo: r.status,
    saida: `${r.stdout}${r.stderr}`,
    comandos: ler('comandos').trim().split('\n').filter(Boolean),
    sqlAplicado: ler('sql-aplicado'),
    sqlSimulado: ler('sql-simulado'),
    output: ler('github-output'),
  };
}

const COMPLETO = 'D 100\nD 200\nF 100\nF 200\nESTADO_OK';

describe('Feature: migrar-producao.sh (ADR-113, postmortem da v0.9.1)', () => {
  it('Dado o banco na migração 1, Quando migra, Então aplica a 2 com o hash do journal e confere o estado final', () => {
    const r = rodar(['migrar'], {
      estados: ['D 100\nFUNCAO_AUSENTE\nESTADO_OK', COMPLETO],
    });
    expect(r.codigo).toBe(0);
    expect(r.comandos).toEqual(['estado', 'aplicar', 'estado']);
    expect(r.sqlAplicado).toMatch(
      /insert into "drizzle"."__drizzle_migrations" \("hash", "created_at"\) values\('[0-9a-f]{64}', 200\);/,
    );
    expect(r.sqlAplicado).not.toContain('0000_a');
    expect(r.sqlAplicado).toContain('CREATE INDEX a_b ON a (b);');
    expect(r.saida).toContain('SEM_PENDENCIAS');
    expect(r.output).toContain('pendentes=1');
    expect(r.saida).not.toContain('CHAVE-FALSA-SECRETA');
  });

  it('Dado a migração falhando, Então sai 1 e NÃO confere nem segue: o deploy não acontece', () => {
    const r = rodar(['migrar'], {
      estados: ['D 100\nESTADO_OK'],
      aplicar: 'MIGRACAO_FALHOU psql saiu 3: ERROR: boom',
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('MIGRACAO_FALHOU psql saiu 3');
    expect(r.comandos).toEqual(['estado', 'aplicar']);
  });

  it('Dado que a função do readiness continua ausente depois de migrar (o caso da v0.9.1), Então sai 1', () => {
    const r = rodar(['migrar'], {
      estados: ['D 100\nESTADO_OK', 'D 100\nD 200\nFUNCAO_AUSENTE\nESTADO_OK'],
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain(
      'função public.app__drizzle_migrations() ausente',
    );
  });

  it('Dado o banco já no esquema da versão, Então não aplica nada e passa', () => {
    const r = rodar(['migrar'], { estados: [COMPLETO, COMPLETO] });
    expect(r.codigo).toBe(0);
    expect(r.comandos).toEqual(['estado', 'estado']);
    expect(r.saida).toContain('Nenhuma migração pendente');
  });

  it('Dado detectar, Então só lê o estado: nem aplica nem simula', () => {
    const r = rodar(['detectar'], { estados: ['D 100\nESTADO_OK'] });
    expect(r.codigo).toBe(0);
    expect(r.comandos).toEqual(['estado']);
    expect(r.saida).toContain('Pendentes (1): 0001_b');
  });

  it('Dado simular, Então manda o SQL para simular (ROLLBACK no servidor) e nunca para aplicar', () => {
    const r = rodar(['simular'], { estados: ['D 100\nESTADO_OK'] });
    expect(r.codigo).toBe(0);
    expect(r.comandos).toEqual(['estado', 'simular']);
    expect(r.sqlSimulado).toContain('0001_b');
    expect(r.sqlAplicado).toBe('');
  });

  it('Dado uma migração antiga ausente (buraco no journal), Então recusa antes de qualquer escrita', () => {
    const r = rodar(['migrar'], { estados: ['D 200\nESTADO_OK'] });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('0000_a');
    expect(r.comandos).toEqual(['estado']);
  });

  it.each([
    ['sem resposta', 'echo -n'],
    ['resposta estranha', 'echo tudo certo'],
  ])('Dado o ssh com %s, Então sai 1', (_nome, corpo) => {
    const falso = path.join(dir, 'ssh-ruim');
    writeFileSync(falso, `#!/bin/bash\n${corpo}\n`);
    chmodSync(falso, 0o755);
    const r = spawnSync('bash', [script, 'migrar'], {
      encoding: 'utf8',
      env: {
        PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
        VPS_MIGRATE_SSH_KEY: 'x',
        VPS_KNOWN_HOSTS: 'x',
        VPS_HOST: 'vps.example.test',
        MIGRAR_SSH: falso,
        MIGRAR_PASTA: path.join(dir, 'drizzle'),
        MIGRAR_TSX: tsx,
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(r.status).toBe(1);
  });

  it('Dado desfazer-versao, Então pede ao servidor só essa versão; versão inválida nem chama o ssh', () => {
    const ok = rodar(['desfazer-versao', '0.9.1'], { estados: [] });
    expect(ok.codigo).toBe(0);
    expect(ok.comandos).toEqual(['desfazer-versao 0.9.1']);
    rmSync(path.join(dir, 'comandos'));
    const ruim = rodar(['desfazer-versao', "0.9.1'; drop"], { estados: [] });
    expect(ruim.codigo).toBe(2);
    expect(ruim.comandos).toEqual([]);
  });

  it('Dado host inválido, modo desconhecido ou segredo ausente, Então reprova sem chamar o ssh', () => {
    expect(rodar(['apagar-tudo'], { estados: [] }).codigo).toBe(2);
    const r = spawnSync('bash', [script, 'migrar'], {
      encoding: 'utf8',
      env: {
        PATH: '/usr/bin:/bin',
        VPS_HOST: 'a; rm -rf /',
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(r.status).not.toBe(0);
  });
});
