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
 * ADR-095, ticket 1 (#746): o script do spike roda no PC do operador. Aqui, com um curl falso, prova-se que o
 * padrão é só leitura, que o token nunca aparece na saída nem nos argumentos e que o deploy é opt-in.
 */
const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/release/spike-coolify.sh');
const TOKEN = 'token-super-secreto-123';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'spike-'));
  mkdirSync(path.join(dir, 'bin'));
  writeFileSync(
    path.join(dir, 'bin', 'curl'),
    `#!/usr/bin/env bash
cat > "${dir}/stdin"; out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -m|-w|-H|--config) shift 2;; -*) shift;; *) url="$1"; shift;; esac; done
echo "$url" >> "${dir}/urls"
case "$url" in
  */api/v1/version) echo '4.6.0' > "$out"; printf 200;;
  */api/v1/applications/*) echo '{"status":"running","git_branch":"main","git_commit_sha":"HEAD","secret":"nao-sair"}' > "$out"; printf 200;;
  */api/v1/deployments/abc123) echo '{"status":"finished","commit":"abcdef1234567","token":"nao-sair"}' > "$out"; printf 200;;
  */api/v1/deploy*) echo '{"deployments":[{"deployment_uuid":"abc123"}]}' > "$out"; printf 200;;
  *) printf 404;;
esac
`,
  );
  chmodSync(path.join(dir, 'bin', 'curl'), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function rodar(extra: Record<string, string> = {}) {
  const r = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      COOLIFY_URL: 'https://painel.example.test',
      COOLIFY_TOKEN: TOKEN,
      COOLIFY_APP_UUID: 'uuid1',
      ...extra,
    },
  });
  return { saida: r.stdout + r.stderr, codigo: r.status };
}
const urls = () => readFileSync(path.join(dir, 'urls'), 'utf8');

describe('Feature: spike do Coolify (ADR-095, #746)', () => {
  it('Dado o modo padrão, Quando roda, Então só lê e não dispara deploy', () => {
    const r = rodar();
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('"git_commit_sha": "HEAD"');
    expect(r.saida).toContain('deploy NÃO disparado');
    expect(urls()).not.toContain('/api/v1/deploy');
  });

  it('Dado qualquer modo, Quando roda, Então o token e campos fora da lista nunca aparecem', () => {
    const r = rodar({ SPIKE_DEPLOY: '1' });
    expect(r.saida).not.toContain(TOKEN);
    expect(r.saida).not.toContain('nao-sair');
    expect(readFileSync(path.join(dir, 'stdin'), 'utf8')).toContain(TOKEN);
  });

  it('Dado SPIKE_DEPLOY=1 e SHA igual ao da tag, Quando roda, Então diz plano A', () => {
    const r = rodar({ SPIKE_DEPLOY: '1', SPIKE_TAG_SHA: 'abcdef1234567890' });
    expect(r.saida).toContain('deployment_uuid=abc123');
    expect(r.saida).toContain('IGUAL');
  });

  it('Dado SHA diferente do da tag, Quando roda, Então aponta o plano B', () => {
    const r = rodar({ SPIKE_DEPLOY: '1', SPIKE_TAG_SHA: '1111111' });
    expect(r.saida).toContain('plano B');
  });

  it.each([
    [{ COOLIFY_URL: 'http://painel.example.test' }],
    [{ COOLIFY_APP_UUID: 'x; rm -rf /' }],
    [{ SPIKE_ESPERA: 'abc' }],
  ])(
    'Dado entrada inválida %j, Quando roda, Então sai 2 sem chamar a rede',
    (env) => {
      expect(rodar(env).codigo).toBe(2);
      expect(() => urls()).toThrow();
    },
  );

  it('Dado COOLIFY_TOKEN ausente, Quando roda, Então falha pedindo a variável', () => {
    expect(rodar({ COOLIFY_TOKEN: '' }).codigo).not.toBe(0);
  });
});
