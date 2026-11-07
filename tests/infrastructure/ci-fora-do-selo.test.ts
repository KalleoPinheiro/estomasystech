import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ETAPAS_CI } from '../../scripts/release/prova-corte-lib';

/**
 * ADR-092: o PR release→main provado pelo selo pula o `estatico`. Todo step dele tem de estar coberto pelo selo
 * (etapas do ADR-088) ou rodar no job `fora-do-selo`; o disparo do corte tem um único caminho, validado em
 * falha alta antes do checkout.
 */
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string =>
  readFileSync(path.join(root, file), 'utf8');
const ci = read('.github/workflows/ci.yml');
const corte = read('.github/workflows/release-cut.yml');

function job(name: string, source: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

/** Valor de cada `run:` do job (linha única ou bloco `|`, `>`, `|-`, `>-`, `|+`), na ordem; linha em branco não encerra o bloco. */
function runs(bloco: string): string[] {
  const out: string[] = [];
  const lines = bloco.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^( +)(?:- )?run: (.*)$/.exec(lines[i] ?? '');
    if (!m) continue;
    const valor = (m[2] ?? '').trim();
    if (!/^[|>][-+]?$/.test(valor)) {
      out.push(valor);
      continue;
    }
    const recuo = (m[1] ?? '').length;
    const corpo: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] ?? '';
      if (l.trim() !== '' && l.length - l.trimStart().length <= recuo) break;
      corpo.push(l.trim());
    }
    out.push(corpo.join('\n').trim());
  }
  return out;
}

/** Comando de step do `estatico` → etapa do selo que o cobre. */
const COBERTO_PELO_SELO: Record<string, (typeof ETAPAS_CI)[number]> = {
  'npm run typecheck': 'typecheck',
  'npm run lint': 'lint',
  'npm run check:sv': 'sv',
  'npm run check:docs': 'docs',
};

/** Fora do selo e fora do `fora-do-selo`, por motivo escrito. */
const NAO_SE_APLICA: Record<string, string> = {
  'npm ci': 'instalação, não é verificação',
  'npm run check:changeset':
    'o PR release→main consome os changesets no commit de versão (ADR-052) e o step já é pulado em release/*',
};

describe('Feature: nenhum step do estático fica sem cobertura no PR provado pelo selo (ADR-092)', () => {
  const comandos = runs(job('estatico', ci));
  const foraDoSelo = runs(job('fora-do-selo', ci));

  it('Dado o job estatico, Então tem verificações para classificar', () => {
    expect(comandos.length).toBeGreaterThan(5);
  });

  it.each(comandos)(
    'Dado o step "%s", Então o selo cobre, o fora-do-selo roda ou há motivo escrito',
    (cmd) => {
      const etapa = COBERTO_PELO_SELO[cmd];
      if (etapa !== undefined) {
        expect(ETAPAS_CI).toContain(etapa);
        return;
      }
      if (cmd in NAO_SE_APLICA) return;
      expect(
        foraDoSelo,
        `step "${cmd}" do estatico sem cobertura no PR provado`,
      ).toContain(cmd);
    },
  );

  it('Dado o fora-do-selo, Então roda server-first e dynamic-import', () => {
    expect(foraDoSelo).toContain('npm run check:server-first');
    expect(foraDoSelo).toContain('npx tsx scripts/check-dynamic-import.ts');
  });

  it('Dado o job ci, Então exige o fora-do-selo e não cita o nome antigo', () => {
    expect(job('ci', ci)).toContain('needs.fora-do-selo.result');
    expect(ci).not.toContain('server-first-provado');
  });
});

describe('Feature: o corte tem um só caminho de disparo, validado em falha alta (ADR-092)', () => {
  const cut = job('cut', corte);

  it('Dado o workflow, Então o input branch é obrigatório e não há fallback para a ref nem job pulado por if', () => {
    expect(corte).toMatch(/branch:[\s\S]*?required: true/);
    expect(corte).not.toContain('github.ref_name');
    expect(corte).not.toContain('|| github.ref');
    expect(cut).not.toMatch(/^ {4}if:/m);
  });

  it('Dado o job cut, Então o primeiro step valida o disparo, em bash, antes do checkout e do npm ci', () => {
    const ordem = [...cut.matchAll(/^ {6}- (?:name|uses): (.*)$/gm)].map(
      (m) => m[1] ?? '',
    );
    expect(ordem[0]).toContain('Validar o disparo');
    const bloco = cut.slice(0, cut.indexOf('- name: Exigir RELEASE_CUT_TOKEN'));
    expect(bloco).toContain('shell: bash');
    expect(cut.indexOf('Validar o disparo')).toBeLessThan(
      cut.indexOf('actions/checkout'),
    );
    expect(cut.indexOf('Validar o disparo')).toBeLessThan(
      cut.indexOf('run: npm ci'),
    );
  });

  const validacao =
    runs(cut.slice(0, cut.indexOf('- name: Exigir RELEASE_CUT_TOKEN')))[0] ??
    '';
  const roda = (ref: string, branch: string): number => {
    try {
      execFileSync('bash', ['-c', validacao], {
        env: { ...process.env, WORKFLOW_REF: ref, BRANCH: branch },
        stdio: 'pipe',
      });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? -1;
    }
  };

  it.each([
    ['refs/heads/main', 'release/v0.5.0', 0],
    ['refs/heads/main', 'release/v1.12.3-rc.1', 0],
    ['refs/heads/release/v0.5.0', 'release/v0.5.0', 1],
    ['refs/heads/main', '', 1],
    ['refs/heads/main', 'main', 1],
    ['refs/heads/main', 'feat/x', 1],
    ['refs/heads/main', 'release/v0.5', 1],
    ['refs/heads/main', 'release/v0.5.0; rm -rf /', 1],
  ])(
    'Dado ref %s e branch "%s", Então o step sai %i',
    (ref, branch, esperado) => {
      expect(roda(ref, branch)).toBe(esperado);
    },
  );
});

describe('Feature: os steps de prova rodam em bash explícito (ADR-092)', () => {
  it('Dado o step prova do ci.yml e do docker.yml, Então declara shell: bash', () => {
    for (const f of [
      '.github/workflows/ci.yml',
      '.github/workflows/docker.yml',
    ]) {
      const src = read(f);
      const i = src.indexOf('      - id: prova');
      expect(i, f).toBeGreaterThanOrEqual(0);
      expect(src.slice(i, i + 200), f).toContain('shell: bash');
    }
  });
});
