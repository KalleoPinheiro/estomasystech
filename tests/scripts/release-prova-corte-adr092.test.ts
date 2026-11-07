import { describe, expect, it } from 'vitest';
import {
  type PreflightEnv,
  pendenciasDoPreflight,
} from '../../scripts/release/preflight-lib';
import {
  avaliarProva,
  avisoDaRecusa,
  type CheckRunLite,
  checkRunsDaSaida,
  ETAPAS_CI,
  type ProvaInput,
  SELO_APP_ID,
  SELO_NOME,
} from '../../scripts/release/prova-corte-lib';

const HEAD = 'a'.repeat(40);
const ARVORE = 'f'.repeat(40);

const selo = (over: Partial<CheckRunLite> = {}): CheckRunLite => ({
  name: SELO_NOME,
  conclusion: 'success',
  head_sha: HEAD,
  app: { id: SELO_APP_ID, slug: 'github-actions' },
  output: { summary: `${SELO_NOME} sha=${HEAD} etapas=${ETAPAS_CI.join(',')}` },
  ...over,
});

const base = (over: Partial<ProvaInput> = {}): ProvaInput => ({
  evento: 'pull_request',
  baseRef: 'main',
  headRef: 'release/v0.5.0',
  headShaEvento: HEAD,
  segundoPai: HEAD,
  arvoreCommit: ARVORE,
  arvoreSegundoPai: ARVORE,
  checkRuns: [selo()],
  etapasExigidas: ETAPAS_CI,
  ...over,
});

describe('Feature: o selo só vale se vier da app github-actions pelo id numérico (ADR-092)', () => {
  it('Dado o selo com o id 15368 da app, Então a prova vale', () => {
    expect(SELO_APP_ID).toBe(15368);
    expect(avaliarProva(base()).provado).toBe(true);
  });

  it('Dado selo com slug certo e id de outra app ou sem id, Então roda tudo', () => {
    for (const app of [
      { id: 1, slug: 'github-actions' },
      { slug: 'github-actions' },
      { id: null, slug: 'github-actions' },
      { id: SELO_APP_ID, slug: 'outra-app' },
    ])
      expect(avaliarProva(base({ checkRuns: [selo({ app })] })).provado).toBe(
        false,
      );
  });
});

describe('Feature: o selo não se perde na paginação dos check runs (ADR-092)', () => {
  it('Dado duas páginas de um objeto por linha, Quando lê a saída, Então devolve todos e o selo da página 2 vale', () => {
    const outro = { ...selo({ name: 'ci' }), head_sha: HEAD };
    const saida = `${JSON.stringify(outro)}\n${JSON.stringify(selo())}\n`;
    const todos = checkRunsDaSaida(saida);
    expect(todos).toHaveLength(2);
    expect(avaliarProva(base({ checkRuns: todos })).provado).toBe(true);
  });

  it('Dado saída vazia, truncada ou ilegível, Então não há check runs e o CI roda inteiro', () => {
    expect(checkRunsDaSaida('')).toEqual([]);
    expect(checkRunsDaSaida('\n\n')).toEqual([]);
    expect(checkRunsDaSaida(`${JSON.stringify(selo())}\n{"name":`)).toEqual([]);
  });
});

describe('Feature: o selo recusado vira aviso, sem deixar de falhar fechado (ADR-092)', () => {
  it('Dado PR release→main sem selo, Então a recusa é esperada e gera ::warning com o motivo', () => {
    const r = avaliarProva(base({ checkRuns: [] }));
    expect(r).toMatchObject({ provado: false, esperado: true });
    const aviso = avisoDaRecusa(r, 'ci');
    expect(aviso).toMatch(/^::warning title=Selo do corte recusado \(ci\)::/);
    expect(aviso).toContain(r.motivo);
  });

  it('Dado push na main com árvore diferente, Então também avisa', () => {
    const r = avaliarProva(
      base({
        evento: 'push',
        headRef: '',
        headShaEvento: '',
        arvoreSegundoPai: 'e'.repeat(40),
      }),
    );
    expect(avisoDaRecusa(r, 'docker')).toContain('docker');
  });

  it('Dado PR de feature para a release ou de hotfix, Então a recusa não era esperada e não avisa', () => {
    for (const over of [
      { baseRef: 'release/v0.5.0', headRef: 'feat/x' },
      { headRef: 'hotfix/x' },
      { evento: 'schedule' },
    ]) {
      const r = avaliarProva(base(over));
      expect(r).toMatchObject({ provado: false, esperado: false });
      expect(avisoDaRecusa(r, 'ci')).toBeNull();
    }
  });

  it('Dado a prova válida, Então não há aviso', () => {
    expect(avisoDaRecusa(avaliarProva(base()), 'ci')).toBeNull();
  });
});

describe('Feature: o pré-voo barra disparo fora da main e branch fora do padrão (ADR-092)', () => {
  const ok: PreflightEnv = {
    token: 't',
    repo: 'o/r',
    gitName: 'n',
    gitEmail: 'e',
    rollbackOk: true,
    emCi: true,
    disparo: { workflowRef: 'refs/heads/main', branch: 'release/v0.5.0' },
  };

  it('Dado disparo da main com release/vX.Y.Z, Então não há pendência', () => {
    expect(pendenciasDoPreflight(ok)).toEqual([]);
  });

  it('Dado disparo da própria release, Então reprova e manda usar a main', () => {
    const f = pendenciasDoPreflight({
      ...ok,
      disparo: {
        workflowRef: 'refs/heads/release/v0.5.0',
        branch: 'release/v0.5.0',
      },
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('disparado da main');
  });

  it('Dado branch vazia, main ou feat/x, Então reprova com a branch recebida', () => {
    for (const branch of [
      '',
      'main',
      'feat/x',
      'release/0.5.0',
      'release/v0.5',
    ]) {
      const f = pendenciasDoPreflight({
        ...ok,
        disparo: { workflowRef: 'refs/heads/main', branch },
      });
      expect(f.join('\n')).toContain('branch de corte inválida');
    }
  });

  it('Dado corte local (sem disparo do Actions), Então a checagem não se aplica', () => {
    expect(pendenciasDoPreflight({ ...ok, disparo: undefined })).toEqual([]);
  });
});
