import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '..', '..');
const PROTEGIDO = '/x/scripts/gate/test-integrity.ts';
const payload = (file: string) =>
  JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } });

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'protect-sh-'));
  mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
  copyFileSync(
    join(REPO, '.claude/hooks/protect-tests.sh'),
    join(root, '.claude/hooks/protect-tests.sh'),
  );
  chmodSync(join(root, '.claude/hooks/protect-tests.sh'), 0o755);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function instalaAnalisador(exitCode: number | null): void {
  mkdirSync(join(root, 'scripts/gate'), { recursive: true });
  writeFileSync(join(root, 'scripts/gate/protect-tests-hook.ts'), '');
  if (exitCode === null) return;
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(
    join(root, 'node_modules/.bin/tsx'),
    `#!/bin/sh\nexit ${exitCode}\n`,
  );
  chmodSync(join(root, 'node_modules/.bin/tsx'), 0o755);
}

function roda(file: string, env: Record<string, string>, command?: string) {
  return spawnSync(
    'bash',
    ['-c', command ?? `"${join(root, '.claude/hooks/protect-tests.sh')}"`],
    {
      input: payload(file),
      env: {
        PATH: process.env.PATH ?? '',
        ...env,
      } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
    },
  );
}

describe('protect-tests.sh falha fechado (regra 8, #830)', () => {
  it('Dado ROOT_DIR vazio e CLAUDE_PROJECT_DIR definido, Quando o settings chama o hook, Então o caminho resolve', () => {
    const settings = JSON.parse(
      readFileSync(join(REPO, '.claude/settings.json'), 'utf8'),
    );
    const entrada = settings.hooks.PreToolUse.find(
      (h: { matcher?: string }) => h.matcher === 'Edit|Write|MultiEdit',
    );
    const command = entrada.hooks[0].command as string;
    const r = roda(
      '/x/src/app.ts',
      { CLAUDE_PROJECT_DIR: root, ROOT_DIR: '' },
      command,
    );
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('No such file');
  });

  it('Dado caminho protegido e sem tsx, Quando o hook roda, Então bloqueia com exit 2', () => {
    const r = roda(PROTEGIDO, { ROOT_DIR: root });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('BLOQUEADO (regra 8)');
  });

  it('Dado caminho protegido, tsx presente e analisador ausente, Quando roda, Então bloqueia', () => {
    mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
    writeFileSync(join(root, 'node_modules/.bin/tsx'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(root, 'node_modules/.bin/tsx'), 0o755);
    expect(roda(PROTEGIDO, { ROOT_DIR: root }).status).toBe(2);
  });

  it('Dado ROOT_DIR vazio, Quando usa CLAUDE_PROJECT_DIR sem tsx, Então bloqueia (não cai no 127)', () => {
    expect(
      roda(PROTEGIDO, { ROOT_DIR: '', CLAUDE_PROJECT_DIR: root }).status,
    ).toBe(2);
  });

  it.each([1, 127, 139])(
    'Dado tsx que quebra com exit %i, Quando roda, Então bloqueia',
    (code) => {
      instalaAnalisador(code);
      const r = roda(PROTEGIDO, { ROOT_DIR: root });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(`exit ${code}`);
    },
  );

  it('Dado analisador que acha problema (exit 2), Quando roda, Então propaga o bloqueio', () => {
    instalaAnalisador(2);
    expect(roda(PROTEGIDO, { ROOT_DIR: root }).status).toBe(2);
  });

  it('Dado analisador sem achados (exit 0), Quando roda, Então libera', () => {
    instalaAnalisador(0);
    expect(roda(PROTEGIDO, { ROOT_DIR: root }).status).toBe(0);
  });

  it.each([
    'vitest.config.mts',
    'vitest.mutacao.config.mts',
    'vitest.integracao.config.mts',
    'vitest.shard.config.mts',
    'playwright.prod.config.ts',
    '/x/tests/a.test.ts',
    '/x/e2e/a.spec.ts',
    '/x/.husky/pre-push',
    '/x/.claude/settings.json',
    '/x/.claude/hooks/protect-tests.sh',
  ])(
    'Dado o caminho %s, Quando não há tsx, Então é tratado como protegido',
    (file) => {
      expect(roda(file, { ROOT_DIR: root }).status).toBe(2);
    },
  );

  it('Dado config aninhada que o analisador não trata como config, Quando não há tsx, Então libera', () => {
    expect(
      roda('/x/src/vitest-fixture/example.config.mts', { ROOT_DIR: root })
        .status,
    ).toBe(0);
  });

  it('Dado ROOT_DIR relativo, Quando o hook roda, Então localiza o tsx pelo caminho absoluto', () => {
    instalaAnalisador(0);
    const r = spawnSync(
      'bash',
      [
        '-c',
        `cd "${join(root, '..')}" && "${join(root, '.claude/hooks/protect-tests.sh')}"`,
      ],
      {
        input: payload(PROTEGIDO),
        env: {
          ROOT_DIR: root.split('/').pop() ?? '',
          PATH: process.env.PATH ?? '',
        } as unknown as NodeJS.ProcessEnv,
        encoding: 'utf8',
      },
    );
    expect(r.status).toBe(0);
  });

  describe('leitura da entrada', () => {
    const falso = (nome: string) => {
      const bin = join(root, 'fake-bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, nome), '#!/bin/sh\nexit 1\n');
      chmodSync(join(bin, nome), 0o755);
      return bin;
    };
    const comPath = (bin: string) => ({
      ROOT_DIR: root,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    });

    it('Dado python3 quebrado, Quando o node lê a entrada, Então ainda classifica o caminho protegido', () => {
      const r = roda(PROTEGIDO, comPath(falso('python3')));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('analisador de testes não pode rodar');
    });

    it('Dado python3 e node quebrados, Quando roda, Então bloqueia com o diagnóstico de leitura', () => {
      const bin = falso('python3');
      writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 1\n');
      chmodSync(join(bin, 'node'), 0o755);
      const r = roda('/x/src/a.ts', comPath(bin));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('não conseguiu ler a entrada');
    });
  });

  it('Dado caminho comum, Quando não há tsx, Então não paga o analisador e libera', () => {
    expect(roda('/x/src/domain/a.ts', { ROOT_DIR: root }).status).toBe(0);
  });

  it('Dado GATE_OWNER_EDIT=1, Quando o dono edita, Então libera mesmo sem tsx', () => {
    expect(
      roda(PROTEGIDO, { ROOT_DIR: root, GATE_OWNER_EDIT: '1' }).status,
    ).toBe(0);
  });
});
