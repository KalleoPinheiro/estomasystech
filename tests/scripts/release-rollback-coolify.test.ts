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
 * ADR-113: `rollback-coolify.sh` volta a imagem para o commit anterior pela API do Coolify e devolve o recurso
 * a HEAD SEMPRE. Roda o script de verdade com um `curl` falso que registra cada PATCH (corpo vem por stdin).
 */
const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/release/rollback-coolify.sh');
const ANTERIOR = 'a'.repeat(40);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rollback-coolify-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

type Api = {
  /** git_commit_sha atual do recurso (GET). */
  atual?: string;
  getHttp?: number;
  /** HTTP de cada PATCH, na ordem. */
  patch?: number[];
  deployHttp?: number;
  status?: string;
  commit?: string;
};

function curl(a: Api): string {
  const arquivo = path.join(dir, 'curl');
  const patch = (a.patch ?? [200, 200]).join(' ');
  writeFileSync(
    arquivo,
    `#!/bin/bash
cfg="$(cat)"
for u; do url="$u"; done
out=""; while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
metodo="$(printf '%s' "$cfg" | sed -n 's/^request = "\\(.*\\)"$/\\1/p')"
corpo="$(printf '%s' "$cfg" | sed -n 's/^data = "\\(.*\\)"$/\\1/p' | tr -d '\\\\')"
echo "$metodo $url $corpo" >> "${dir}/chamadas"
case "$metodo $url" in
  "GET "*"/api/v1/applications/"*) echo '{"git_commit_sha":"${a.atual ?? 'HEAD'}"}' > "$out"; printf ${a.getHttp ?? 200} ;;
  "PATCH "*)
    n=$(( $(cat "${dir}/n-patch" 2>/dev/null || echo 0) + 1 )); echo $n > "${dir}/n-patch"
    set -- ${patch}; eval "printf \\\${$n}" ;;
  "POST "*"/api/v1/deploy?"*) echo '{"deployments":[{"deployment_uuid":"dep1"}]}' > "$out"; printf ${a.deployHttp ?? 200} ;;
  *"/api/v1/deployments/dep1") echo '{"status":"${a.status ?? 'finished'}","commit":"${a.commit ?? ANTERIOR.slice(0, 12)}"}' > "$out"; printf 200 ;;
esac`,
  );
  chmodSync(arquivo, 0o755);
  return arquivo;
}

function rodar(modo: string, a: Api, env: Record<string, string> = {}) {
  const r = spawnSync('bash', [script, modo], {
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      COOLIFY_URL: 'https://coolify.example.test',
      COOLIFY_TOKEN: 'TOKEN-SECRETO-FALSO',
      COOLIFY_APP_UUID: 'appuuid123',
      COOLIFY_INTERVALO: '0',
      COOLIFY_ESPERA: '1',
      COOLIFY_CURL: curl(a),
      ...env,
    } as unknown as NodeJS.ProcessEnv,
  });
  const chamadas = existsSync(path.join(dir, 'chamadas'))
    ? readFileSync(path.join(dir, 'chamadas'), 'utf8').trim().split('\n')
    : [];
  return {
    codigo: r.status,
    saida: `${r.stdout}${r.stderr}`,
    patches: chamadas.filter((c) => c.startsWith('PATCH')),
    chamadas,
  };
}

describe('Feature: rollback-coolify.sh preflight (ADR-113)', () => {
  it('Dado um token que escreve, Então faz PATCH com o próprio valor e sai 0', () => {
    const r = rodar('preflight', { atual: 'HEAD' });
    expect(r.codigo).toBe(0);
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0]).toContain('{"git_commit_sha":"HEAD"}');
    expect(r.saida).toContain('Rollback possível');
  });

  it('Dado um token sem escrita (403), Então reprova ANTES do deploy', () => {
    const r = rodar('preflight', { patch: [403] });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('Sem como reverter');
  });

  it('Dado que o recurso não é legível, Então reprova', () => {
    expect(rodar('preflight', { getHttp: 401 }).codigo).toBe(1);
  });
});

describe('Feature: rollback-coolify.sh rollback (ADR-113)', () => {
  const env = { ROLLBACK_SHA: ANTERIOR };

  it('Dado deploy finished no commit anterior, Então fixa o SHA, implanta forçado e devolve o recurso a HEAD', () => {
    const r = rodar('rollback', { atual: 'HEAD' }, env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('Rollback ok');
    expect(r.patches.map((p) => p.split(' ').at(-1))).toEqual([
      `{"git_commit_sha":"${ANTERIOR}"}`,
      '{"git_commit_sha":"HEAD"}',
    ]);
    expect(
      r.chamadas.some((c) => c.includes('/deploy?uuid=appuuid123&force=true')),
    ).toBe(true);
    expect(r.saida).not.toContain('TOKEN-SECRETO-FALSO');
  });

  it('Dado deploy que falhou, Então sai 1 e MESMO ASSIM devolve o recurso a HEAD', () => {
    const r = rodar('rollback', { status: 'failed' }, env);
    expect(r.codigo).toBe(1);
    expect(r.patches.at(-1)).toContain('{"git_commit_sha":"HEAD"}');
  });

  it('Dado commit implantado diferente do anterior, Então sai 1', () => {
    const r = rodar('rollback', { commit: 'b'.repeat(40) }, env);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('commit errado');
    expect(r.patches.at(-1)).toContain('HEAD');
  });

  it('Dado que o Coolify recusa fixar o commit, Então não dispara deploy', () => {
    const r = rodar('rollback', { patch: [500, 200] }, env);
    expect(r.codigo).toBe(1);
    expect(r.chamadas.some((c) => c.includes('/deploy?'))).toBe(false);
    expect(r.patches.at(-1)).toContain('{"git_commit_sha":"HEAD"}');
  });

  it('Dado que não consegue devolver HEAD, Então grita no log para ação humana', () => {
    const r = rodar('rollback', { patch: [200, 500] }, env);
    expect(r.saida).toContain('Recurso preso no SHA antigo');
  });

  it.each([
    ['sem alvo', {}],
    ['alvo inválido', { ROLLBACK_SHA: 'main; rm -rf /' }],
  ])('Dado %s, Então reprova sem deploy', (_n, e) => {
    const r = rodar('rollback', {}, e);
    expect(r.codigo).not.toBe(0);
    expect(r.chamadas.some((c) => c.includes('/deploy?'))).toBe(false);
  });
});
