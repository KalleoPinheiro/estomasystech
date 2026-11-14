import { describe, expect, it } from 'vitest';
import {
  type Buscador,
  dadosDoPr,
  labelsDaIssue,
} from '../../scripts/release/posse-api';
import {
  agenteDaBranch,
  agentesDosCommits,
  avaliarPosse,
  donosDasLabels,
  issuesDoPr,
  issuesFechadas,
  renderEstado,
} from '../../scripts/release/posse-lib';

const CLAUDE =
  'feat: x\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';
const CURSOR =
  'feat: y\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>';

describe('posse mecânica de issue (ADR-104)', () => {
  it('Dado commits com trailer de cada agente, Quando identifica, Então devolve os agentes', () => {
    expect(agentesDosCommits([CLAUDE])).toEqual(['claude']);
    expect(agentesDosCommits([CURSOR])).toEqual(['cursor']);
    expect(agentesDosCommits([CLAUDE, CURSOR]).sort()).toEqual([
      'claude',
      'cursor',
    ]);
    expect(agentesDosCommits(['feat: sem trailer'])).toEqual([]);
  });

  it('Dado nome de branch, Quando identifica o agente, Então só claude/* e cursor/* contam', () => {
    expect(agenteDaBranch('claude/project-thread-x')).toBe('claude');
    expect(agenteDaBranch('cursor/portao-risco')).toBe('cursor');
    expect(agenteDaBranch('feat/x')).toBeNull();
  });

  it('Dado corpo de PR, Quando lê as issues fechadas, Então aceita Closes, Fixes e Resolves sem repetir', () => {
    expect(
      issuesFechadas('Closes #12\nfixes #7 e Closes #12\nResolved #3\nVer #99'),
    ).toEqual([12, 7, 3]);
    expect(issuesFechadas('sem fechamento (#5)')).toEqual([]);
  });

  it('Dado labels, Quando lê os donos, Então devolve só dono:*', () => {
    expect(donosDasLabels(['v0.7.0', 'dono:claude', 'dono:cursor'])).toEqual([
      'claude',
      'cursor',
    ]);
  });

  const labels = (m: Record<number, string[]>) =>
    new Map(Object.entries(m).map(([k, v]) => [Number(k), v]));

  it('Dado PR do Claude e issue dono:claude, Quando avalia, Então passa', () => {
    const r = avaliarPosse({
      branch: 'feat/x',
      corpo: 'Closes #1',
      mensagensDosCommits: [CLAUDE],
      labelsPorIssue: labels({ 1: ['dono:claude'] }),
    });
    expect(r).toEqual({ ok: true, aplicavel: true, motivos: [] });
  });

  it('Dado PR do Cursor e issue dono:claude, Quando avalia, Então reprova pela divergência', () => {
    const r = avaliarPosse({
      branch: 'cursor/x',
      corpo: 'Closes #1',
      mensagensDosCommits: [CURSOR],
      labelsPorIssue: labels({ 1: ['dono:claude'] }),
    });
    expect(r.ok).toBe(false);
    expect(r.motivos[0]).toContain('dono:claude');
  });

  it('Dado issue sem dono ou com dois, Quando avalia, Então reprova', () => {
    for (const l of [[], ['dono:claude', 'dono:cursor']]) {
      const r = avaliarPosse({
        branch: 'claude/x',
        corpo: 'Closes #1',
        mensagensDosCommits: [],
        labelsPorIssue: labels({ 1: l }),
      });
      expect(r.ok).toBe(false);
      expect(r.motivos[0]).toContain('exatamente uma label');
    }
    const ausente = avaliarPosse({
      branch: 'claude/x',
      corpo: 'Closes #1',
      mensagensDosCommits: [],
      labelsPorIssue: new Map(),
    });
    expect(ausente.ok).toBe(false);
  });

  it('Dado PR de agente sem Closes, Quando avalia, Então reprova', () => {
    const r = avaliarPosse({
      branch: 'claude/x',
      corpo: 'sem issue',
      mensagensDosCommits: [],
      labelsPorIssue: new Map(),
    });
    expect(r.ok).toBe(false);
    expect(r.motivos[0]).toContain('Closes #N');
  });

  it('Dado dois agentes escrevendo no mesmo PR, Quando avalia, Então reprova (branch por agente)', () => {
    const r = avaliarPosse({
      branch: 'claude/x',
      corpo: 'Closes #1',
      mensagensDosCommits: [CURSOR],
      labelsPorIssue: labels({ 1: ['dono:claude'] }),
    });
    expect(r.ok).toBe(false);
    expect(r.motivos[0]).toContain('mais de um agente');
  });

  it('Dado PR de integração, Quando avalia, Então não se aplica', () => {
    for (const branch of [
      'release/v0.7.0',
      'sync/main-v0.7.0',
      'chore/sync-main-x',
      'hotfix/judge',
      'dependabot/npm/x',
    ]) {
      expect(
        avaliarPosse({
          branch,
          corpo: '',
          mensagensDosCommits: [CLAUDE],
          labelsPorIssue: new Map(),
        }).aplicavel,
      ).toBe(false);
    }
  });

  it('Dado PR fora da integração sem trailer de agente, Quando avalia, Então reprova pedindo o trailer (falha fechada)', () => {
    const r = avaliarPosse({
      branch: 'feat/humano',
      corpo: 'Closes #1',
      mensagensDosCommits: ['fix: x'],
      labelsPorIssue: new Map([[1, ['dono:claude']]]),
    });
    expect(r.ok).toBe(false);
    expect(r.aplicavel).toBe(true);
    expect(r.motivos[0]).toContain('trailer');
  });

  it('Dado issues abertas, Quando gera o estado, Então agrupa por dono e conta as vagas', () => {
    const md = renderEstado(
      'v0.7.0',
      [
        { numero: 1, titulo: 'a', labels: ['dono:claude', 'em-andamento'] },
        { numero: 2, titulo: 'b', labels: ['dono:cursor'] },
        { numero: 3, titulo: 'c', labels: [] },
      ],
      [{ numero: 9, titulo: 'pr', labels: [], rascunho: true }],
    );
    expect(md).toContain('1/3');
    expect(md).toContain('## Issues de claude\n- #1 a');
    expect(md).toContain('## Issues de cursor\n- #2 b');
    expect(md).toContain(
      '## Issues sem dono único (resolver antes de iniciar)\n- #3 c',
    );
    expect(md).toContain('- #9 pr (rascunho)');
    const acima = renderEstado(
      'v',
      [1, 2, 3, 4].map((n) => ({
        numero: n,
        titulo: 't',
        labels: ['em-andamento'],
      })),
      [],
    );
    expect(acima).toContain('ACIMA DO TETO');
  });
});

describe('posse: leituras da API (falha fechada, ADR-104)', () => {
  const resposta =
    (status: number, corpo: unknown): Buscador =>
    async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => corpo,
    });

  it('Dado a API fora do ar (500), Quando lê as labels, Então lança (o check sai com 1)', async () => {
    await expect(
      labelsDaIssue(resposta(500, {}), 'o/r', 1, 't'),
    ).rejects.toThrow('HTTP 500');
  });

  it('Dado issue inexistente (404) ou token vazio recusado (401), Quando lê, Então lança', async () => {
    await expect(
      labelsDaIssue(resposta(404, {}), 'o/r', 1, 't'),
    ).rejects.toThrow('HTTP 404');
    await expect(dadosDoPr(resposta(401, {}), 'o/r', 1, '')).rejects.toThrow(
      'HTTP 401',
    );
  });

  it('Dado labels como objetos ou texto, Quando lê, Então devolve os nomes; lista vazia reprova na avaliação', async () => {
    expect(
      await labelsDaIssue(
        resposta(200, { labels: [{ name: 'dono:claude' }, 'v0.7.0'] }),
        'o/r',
        1,
        't',
      ),
    ).toEqual(['dono:claude', 'v0.7.0']);
    const vazia = await labelsDaIssue(
      resposta(200, { labels: [] }),
      'o/r',
      1,
      't',
    );
    const r = avaliarPosse({
      branch: 'claude/x',
      corpo: 'Closes #1',
      mensagensDosCommits: [],
      labelsPorIssue: new Map([[1, vazia]]),
    });
    expect(r.ok).toBe(false);
  });

  it('Dado PR com corpo nulo, Quando lê, Então devolve corpo vazio e o título', async () => {
    expect(
      await dadosDoPr(
        resposta(200, { body: null, title: 't (#5)' }),
        'o/r',
        1,
        't',
      ),
    ).toEqual({ corpo: '', titulo: 't (#5)' });
  });

  it('Dado PR aberto antes do ADR-104 com (#N) só no título, Quando avalia, Então a issue do título vale', () => {
    expect(issuesDoPr('sem closes', 'fix(ci): portão (#769)')).toEqual([769]);
    expect(issuesDoPr('Closes #1', 'x (#1) (#2)')).toEqual([1, 2]);
    const r = avaliarPosse({
      branch: 'cursor/x',
      corpo: '',
      titulo: 'fix (#769)',
      mensagensDosCommits: [],
      labelsPorIssue: new Map([[769, ['dono:cursor']]]),
    });
    expect(r).toEqual({ ok: true, aplicavel: true, motivos: [] });
  });
});
