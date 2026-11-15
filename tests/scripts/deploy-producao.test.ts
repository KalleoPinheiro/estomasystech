import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * ADR-095 (#750, #751): `backup-vps.sh` só libera o deploy com `BACKUP_OK`; `deploy-coolify.sh` só dá
 * certo se o deployment termina `finished` com o commit esperado. Os dois rodam de verdade com ssh e
 * curl falsos (injetados por BACKUP_SSH e COOLIFY_CURL).
 */
const root = path.resolve(import.meta.dirname, '../..');
const backup = path.join(root, 'scripts/release/backup-vps.sh');
const deploy = path.join(root, 'scripts/release/deploy-coolify.sh');
const SHA = 'a'.repeat(40);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'deploy-prod-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function falso(nome: string, corpo: string): string {
  const arquivo = path.join(dir, nome);
  writeFileSync(arquivo, `#!/bin/bash\n${corpo}\n`);
  chmodSync(arquivo, 0o755);
  return arquivo;
}

function rodar(script: string, env: Record<string, string>) {
  const r = spawnSync('bash', [script], {
    env: { PATH: '/usr/bin:/bin', ...env } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

describe('Feature: backup-vps.sh (#750)', () => {
  const base = {
    VPS_SSH_KEY: 'CHAVE-SECRETA-FALSA',
    VPS_KNOWN_HOSTS: 'host ssh-ed25519 AAAA',
    VPS_HOST: 'vps.example.test',
  };

  it('Dado BACKUP_OK, Então sai 0, usa StrictHostKeyChecking e não vaza a chave', () => {
    const args = path.join(dir, 'args');
    const ssh = falso(
      'ssh',
      `echo "$@" > ${args}\necho "ruído"\necho "BACKUP_OK 2026-11-15T10:00:00Z"`,
    );
    const r = rodar(backup, { ...base, BACKUP_SSH: ssh });
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('BACKUP_OK 2026-11-15T10:00:00Z');
    const usado = readFileSync(args, 'utf8');
    expect(usado).toContain('StrictHostKeyChecking=yes');
    expect(usado).toContain('estoma-ci@vps.example.test');
    expect(r.saida).not.toContain('CHAVE-SECRETA-FALSA');
  });

  it('Dado BACKUP_FALHOU, Então sai 1 com o motivo', () => {
    const ssh = falso('ssh', 'echo "BACKUP_FALHOU disco cheio"; exit 1');
    const r = rodar(backup, { ...base, BACKUP_SSH: ssh });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('BACKUP_FALHOU disco cheio');
  });

  it('Dado ssh sem resposta ou resposta estranha, Então sai 1', () => {
    for (const corpo of [
      'exit 255',
      'echo "tudo certo"',
      'echo "BACKUP_OKAY"',
    ]) {
      const r = rodar(backup, { ...base, BACKUP_SSH: falso('ssh', corpo) });
      expect(r.codigo, corpo).toBe(1);
      expect(r.saida).toContain('BACKUP_FALHOU');
    }
  });

  it('Dado CRLF nos segredos colados no Windows, Então o ssh recebe chave e known_hosts sem \\r', () => {
    const saida = path.join(dir, 'copia');
    const ssh = falso(
      'ssh',
      `for a in "$@"; do case "$a" in UserKnownHostsFile=*) kh="\${a#UserKnownHostsFile=}";; esac; done
kh_file="$kh"; printf '%s' "$(cat "$kh_file")" | od -c | grep -q '\\\\r' && echo "TEM-CR" > ${saida} || echo "SEM-CR" > ${saida}
echo "BACKUP_OK 2026-11-15T10:00:00Z"`,
    );
    const r = rodar(backup, {
      ...base,
      VPS_KNOWN_HOSTS: 'host ssh-ed25519 AAAA\r\n',
      VPS_SSH_KEY: 'linha1\r\nlinha2\r\n',
      BACKUP_SSH: ssh,
    });
    expect(r.codigo).toBe(0);
    expect(readFileSync(saida, 'utf8').trim()).toBe('SEM-CR');
  });

  it('Dado falha do ssh com stderr, Então o motivo aparece na saída sem a chave', () => {
    const ssh = falso(
      'ssh',
      'echo "Host key verification failed." >&2; exit 255',
    );
    const r = rodar(backup, { ...base, BACKUP_SSH: ssh });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('ssh: Host key verification failed.');
    expect(r.saida).not.toContain('CHAVE-SECRETA-FALSA');
  });

  it('Dado host inválido ou segredo ausente, Então reprova sem chamar o ssh', () => {
    const ssh = falso('ssh', 'echo BACKUP_OK x');
    expect(
      rodar(backup, { ...base, VPS_HOST: 'a; rm -rf /', BACKUP_SSH: ssh })
        .codigo,
    ).toBe(2);
    expect(
      rodar(backup, { ...base, VPS_SSH_KEY: '', BACKUP_SSH: ssh }).codigo,
    ).not.toBe(0);
  });
});

describe('Feature: deploy-coolify.sh (#751)', () => {
  const base = {
    COOLIFY_URL: 'https://coolify.example.test',
    COOLIFY_TOKEN: 'TOKEN-SECRETO-FALSO',
    COOLIFY_APP_UUID: 'appuuid123',
    ESPERADO_SHA: SHA,
    COOLIFY_INTERVALO: '0',
    COOLIFY_ESPERA: '1',
  };

  /** curl falso: POST /deploy devolve o deployment; GET /deployments devolve `corpo`. */
  function curl(deployHttp: number, corpo: string, getHttp = 200): string {
    return falso(
      'curl',
      `cat > /dev/null
for a in "$@"; do url="$a"; done
out=""; while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
case "$url" in
  *"/api/v1/deploy?"*) echo '{"deployments":[{"deployment_uuid":"dep1"}]}' > "$out"; printf ${deployHttp} ;;
  *"/api/v1/deployments/dep1") echo '${corpo}' > "$out"; printf ${getHttp} ;;
esac`,
    );
  }

  it('Dado deployment finished com o commit esperado, Então sai 0', () => {
    const cabeca = SHA.slice(0, 12);
    const r = rodar(deploy, {
      ...base,
      COOLIFY_CURL: curl(200, `{"status":"finished","commit":"${cabeca}"}`),
    });
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('SHA validado pela staging');
    expect(r.saida).not.toContain('TOKEN-SECRETO-FALSO');
  });

  it('Dado commit implantado diferente, Então sai 1 com SHA divergente', () => {
    const r = rodar(deploy, {
      ...base,
      COOLIFY_CURL: curl(
        200,
        `{"status":"finished","commit":"${'b'.repeat(40)}"}`,
      ),
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('SHA divergente');
  });

  it('Dado deployment sem commit legível, Então sai 1', () => {
    const r = rodar(deploy, {
      ...base,
      COOLIFY_CURL: curl(200, '{"status":"finished"}'),
    });
    expect(r.codigo).toBe(1);
  });

  it('Dado deployment failed, Então sai 1 sem rollback', () => {
    const r = rodar(deploy, {
      ...base,
      COOLIFY_CURL: curl(200, '{"status":"failed"}'),
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('Deploy falhou');
  });

  it('Dado deploy não disparado (HTTP 401), Então sai 1', () => {
    const r = rodar(deploy, { ...base, COOLIFY_CURL: curl(401, '{}') });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('Deploy não disparado');
  });

  it('Dado token sem leitura (403 no GET), Então sai 1', () => {
    const r = rodar(deploy, { ...base, COOLIFY_CURL: curl(200, '{}', 403) });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('Token sem leitura');
  });

  it('Dado entrada inválida, Então sai 2 sem chamar o curl', () => {
    const c = curl(200, '{}');
    for (const troca of [
      { COOLIFY_URL: 'http://inseguro.test' },
      { COOLIFY_APP_UUID: 'x; rm' },
      { ESPERADO_SHA: 'HEAD' },
      { COOLIFY_ESPERA: 'abc' },
    ]) {
      expect(rodar(deploy, { ...base, ...troca, COOLIFY_CURL: c }).codigo).toBe(
        2,
      );
    }
  });
});
