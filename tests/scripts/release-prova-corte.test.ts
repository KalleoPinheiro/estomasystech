import { describe, expect, it } from 'vitest';
import {
  avaliarProva,
  type CheckRunLite,
  ETAPAS_CI,
  ETAPAS_DOCKER,
  etapasDoResumo,
  type ProvaInput,
  resumoDoSelo,
  SELO_NOME,
  seloDoRecibo,
} from '../../scripts/release/prova-corte-lib';
import { selarCorte } from '../../scripts/release/selo';
import { pendenciasDoPreflight } from '../../scripts/release/preflight-lib';

const HEAD = 'a'.repeat(40);
const ARVORE = 'f'.repeat(40);
const ETAPAS = 'typecheck,lint,sv,docs,integridade-de-testes,cobertura,build,e2e-producao,e2e-dev,docker,backup,integracao';

const selo = (over: Partial<CheckRunLite> = {}): CheckRunLite => ({
  name: SELO_NOME,
  conclusion: 'success',
  head_sha: HEAD,
  app: { slug: 'github-actions' },
  output: { summary: `${SELO_NOME} sha=${HEAD} etapas=${ETAPAS}` },
  ...over,
});

const base = (over: Partial<ProvaInput> = {}): ProvaInput => ({
  evento: 'pull_request',
  baseRef: 'main',
  headRef: 'release/v0.4.0',
  headShaEvento: HEAD,
  segundoPai: HEAD,
  arvoreCommit: ARVORE,
  arvoreSegundoPai: ARVORE,
  checkRuns: [selo()],
  etapasExigidas: ETAPAS_CI,
  ...over,
});

describe('Feature: o PR release→main e o push da main aceitam a prova do corte (ADR-088)', () => {
  it('Dado o selo do corte no head e a mesma árvore, Quando é PR release→main, Então dispensa o CI pesado', () => {
    expect(avaliarProva(base())).toMatchObject({ provado: true });
  });

  it('Dado o merge commit na main com o selo no segundo pai, Quando é push, Então dispensa', () => {
    expect(avaliarProva(base({ evento: 'push', headRef: '', headShaEvento: '' }))).toMatchObject({ provado: true });
  });

  it('Dado o selo com docker e backup, Quando o Docker pede a prova, Então dispensa o docker.yml', () => {
    expect(avaliarProva(base({ etapasExigidas: ETAPAS_DOCKER }))).toMatchObject({ provado: true });
  });

  it('Dado PR que não é release→main, Então roda tudo', () => {
    expect(avaliarProva(base({ baseRef: 'release/v0.5.0' })).provado).toBe(false);
    expect(avaliarProva(base({ headRef: 'feat/x' })).provado).toBe(false);
    expect(avaliarProva(base({ headRef: 'hotfix/x' })).provado).toBe(false);
  });

  it('Dado push fora da main ou outro evento, Então roda tudo', () => {
    expect(avaliarProva(base({ evento: 'push', baseRef: 'staging' })).provado).toBe(false);
    expect(avaliarProva(base({ evento: 'merge_group' })).provado).toBe(false);
    expect(avaliarProva(base({ evento: 'workflow_dispatch' })).provado).toBe(false);
  });

  it('Dado commit sem segundo pai, ou head do PR diferente do segundo pai, Então roda tudo', () => {
    expect(avaliarProva(base({ segundoPai: '' })).provado).toBe(false);
    expect(avaliarProva(base({ headShaEvento: 'b'.repeat(40) })).provado).toBe(false);
  });

  it('Dado árvore diferente da provada (main andou, merge com conflito resolvido), Então roda tudo', () => {
    expect(avaliarProva(base({ arvoreSegundoPai: 'e'.repeat(40) })).provado).toBe(false);
    expect(avaliarProva(base({ arvoreCommit: '', arvoreSegundoPai: '' })).provado).toBe(false);
  });

  it('Dado selo ausente, de outro SHA, falho, de outra app ou de outro nome, Então roda tudo', () => {
    for (const checkRuns of [
      [],
      [selo({ head_sha: 'b'.repeat(40) })],
      [selo({ conclusion: 'failure' })],
      [selo({ conclusion: null })],
      [selo({ app: { slug: 'outra-app' } })],
      [selo({ app: null })],
      [selo({ name: 'ci' })],
    ])
      expect(avaliarProva(base({ checkRuns })).provado).toBe(false);
  });

  it('Dado selo sem uma das etapas exigidas, Então roda tudo e nomeia a que falta', () => {
    const semBuild = selo({ output: { summary: `${SELO_NOME} sha=${HEAD} etapas=typecheck,lint,sv,docs,cobertura,integracao` } });
    const r = avaliarProva(base({ checkRuns: [semBuild] }));
    expect(r.provado).toBe(false);
    expect(r.motivo).toContain('build');
    expect(avaliarProva(base({ checkRuns: [selo({ output: null })] })).provado).toBe(false);
  });
});

describe('Feature: o selo nasce do recibo do gate de release (ADR-088)', () => {
  const recibo = `E2E-GATE: ${HEAD} pass e2e=490 etapas=typecheck,lint,docker,backup puladas=nenhuma min=41.8`;

  it('Dado recibo pass, Então o selo leva o SHA e as etapas, mais as extras sem repetir', () => {
    const s = seloDoRecibo(`texto\n${recibo}\n`, ['integracao', 'docker']);
    expect(s).toEqual({ sha: HEAD, etapas: ['typecheck', 'lint', 'docker', 'backup', 'integracao'] });
    expect(etapasDoResumo(resumoDoSelo(s as NonNullable<typeof s>))).toEqual(s?.etapas);
  });

  it('Dado recibo ausente, falho ou sem etapas, Então não há selo', () => {
    expect(seloDoRecibo('', [])).toBeNull();
    expect(seloDoRecibo(recibo.replace(' pass ', ' fail '), [])).toBeNull();
    expect(seloDoRecibo(`E2E-GATE: ${HEAD} pass e2e=1 min=1`, [])).toBeNull();
    expect(etapasDoResumo(undefined)).toEqual([]);
  });

  it('Dado o token do Actions, Quando sela, Então cria o check run no SHA do recibo', () => {
    const chamadas: string[][] = [];
    const r = selarCorte(
      { recibo, extras: ['integracao'], token: 'tok', repo: 'o/r' },
      (args, token) => {
        chamadas.push([...args, token]);
        return { ok: true, out: '' };
      },
    );
    expect(r.feita).toBe(true);
    const args = chamadas[0] ?? [];
    expect(args).toContain('repos/o/r/check-runs');
    expect(args).toContain(`head_sha=${HEAD}`);
    expect(args).toContain('conclusion=success');
    expect(args.some((a) => a.startsWith('output[summary]=') && a.includes('integracao'))).toBe(true);
    expect(args.at(-1)).toBe('tok');
  });

  it('Dado corte local (sem token), recibo inválido ou API recusando, Então não sela e diz por quê', () => {
    const ok = () => ({ ok: true, out: '' });
    expect(selarCorte({ recibo, extras: [], token: '', repo: 'o/r' }, ok).feita).toBe(false);
    expect(selarCorte({ recibo: 'nada', extras: [], token: 't', repo: 'o/r' }, ok).feita).toBe(false);
    const recusa = selarCorte({ recibo, extras: [], token: 't', repo: 'o/r' }, () => ({ ok: false, out: '403 Forbidden\nx' }));
    expect(recusa).toEqual({ feita: false, motivo: 'a API recusou o selo: 403 Forbidden' });
  });
});

describe('Feature: o pré-voo barra, em segundos, o que derrubaria o gate de 42 min (ADR-088)', () => {
  const ok = { token: 't', repo: 'o/r', gitName: 'n', gitEmail: 'e@x', rollbackOk: true, emCi: true };

  it('Dado ambiente completo, Então não há pendência', () => {
    expect(pendenciasDoPreflight(ok)).toEqual([]);
  });

  it('Dado token vazio no Actions, Então falha; no WSL com gh logado, Então passa', () => {
    expect(pendenciasDoPreflight({ ...ok, token: '' })[0]).toContain('RELEASE_CUT_TOKEN');
    expect(pendenciasDoPreflight({ ...ok, token: '', emCi: false })).toEqual([]);
  });

  it('Dado rollback inválido, repositório ou identidade git ausentes, Então lista todas as pendências', () => {
    const r = pendenciasDoPreflight({ token: 't', repo: '', gitName: '', gitEmail: 'e', rollbackOk: false, emCi: true });
    expect(r).toHaveLength(3);
    expect(r.join('|')).toContain('rollback');
    expect(r.join('|')).toContain('repositório');
    expect(r.join('|')).toContain('identidade git');
  });
});
