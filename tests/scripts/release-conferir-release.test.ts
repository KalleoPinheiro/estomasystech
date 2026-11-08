import { describe, expect, it } from 'vitest';
import {
  avaliarRelease,
  type CommitDaRelease,
  type PrDaApi,
  prAtualDoCommit,
  prsDaRelease,
} from '../../scripts/release/conferir-release-lib';

const DESDE = '2026-11-09T00:00:00Z';
const commit = (extra: Partial<CommitDaRelease> = {}): CommitDaRelease => ({
  sha: 'a'.repeat(40),
  merge: false,
  data: '2026-11-10T10:00:00Z',
  prs: [{ numero: 10, veredito: 'success' }],
  ...extra,
});

describe('PR release→main · conferência dos vereditos', () => {
  it('Dado commits cujas PRs têm veredito aprovado, Quando avalia, Então aprova sem chamar modelo', () => {
    expect(
      avaliarRelease([commit(), commit({ sha: 'b'.repeat(40) })], DESDE),
    ).toEqual({ aprovado: true, motivos: [] });
    expect(avaliarRelease([], DESDE).aprovado).toBe(true);
  });

  it('Dado PR sem veredito ou com veredito reprovado, Quando avalia, Então reprova citando a PR', () => {
    const r = avaliarRelease(
      [
        commit({ prs: [{ numero: 11, veredito: 'ausente' }] }),
        commit({ prs: [{ numero: 12, veredito: 'failure' }] }),
      ],
      DESDE,
    );
    expect(r.aprovado).toBe(false);
    expect(r.motivos.join('\n')).toContain('PR #11');
    expect(r.motivos.join('\n')).toContain('PR #12');
  });

  it('Dado commit sem PR, Quando avalia, Então reprova; merge sem PR (sincronização com a main) é isento', () => {
    expect(avaliarRelease([commit({ prs: [] })], DESDE).motivos[0]).toContain(
      'não pertence a nenhuma PR',
    );
    expect(
      avaliarRelease([commit({ prs: [], merge: true })], DESDE).aprovado,
    ).toBe(true);
  });

  it('Dado commit anterior ao início do check, Quando avalia, Então fica isento', () => {
    const antigo = commit({
      data: '2026-11-01T00:00:00Z',
      prs: [{ numero: 9, veredito: 'ausente' }],
    });
    expect(avaliarRelease([antigo], DESDE).aprovado).toBe(true);
  });

  it.each([[undefined], ['ontem']])(
    'Dado a data de início %s, Quando avalia, Então reprova (falha fechada)',
    (desde) => {
      const r = avaliarRelease([commit()], desde);
      expect(r.aprovado).toBe(false);
      expect(r.motivos[0]).toContain('VEREDITO_JUDGE_DESDE');
    },
  );
});

describe('PR release→main · quais PRs valem', () => {
  const pr = (numero: number, mesclada: boolean, base: string): PrDaApi => ({
    number: numero,
    merged_at: mesclada ? '2026-11-08T12:00:00Z' : null,
    base: { ref: base },
    head: {
      sha: String(numero).repeat(40).slice(0, 40),
      ref: `feat/pr-${numero}`,
    },
  });

  it('Dado a resposta de commits/{sha}/pulls com PR da release, PRs abertas e a própria PR release→main, Quando filtra, Então só a PR mesclada na release vale', () => {
    const resposta = [
      pr(753, true, 'release/v0.7.0'),
      pr(774, false, 'release/v0.7.0'),
      pr(775, false, 'release/v0.7.0'),
      pr(800, false, 'main'),
    ];
    expect(prsDaRelease(resposta, 'main').map((p) => p.number)).toEqual([753]);
  });

  it('Dado PR mesclada na main (a própria release), Quando filtra, Então não entra na conferência', () => {
    expect(prsDaRelease([pr(900, true, 'main')], 'main')).toEqual([]);
    expect(prsDaRelease([], 'main')).toEqual([]);
  });
});

describe('PR release→main · commits da própria PR sob conferência', () => {
  const robo = commit({
    prs: [],
    assunto: 'chore(release): v0.7.0',
    prAtual: { headRef: 'release/v0.7.0' },
  });

  it('Dado o commit chore(release) do robô na branch da release, Quando avalia, Então não reprova por falta de PR', () => {
    expect(avaliarRelease([robo], DESDE).aprovado).toBe(true);
  });

  it('Dado commit de PR hotfix/* contra a main, Quando avalia, Então não reprova por falta de PR', () => {
    const hotfix = commit({
      prs: [],
      assunto: 'feat(ci): qualquer',
      prAtual: { headRef: 'hotfix/veredito-judge' },
    });
    expect(avaliarRelease([hotfix], DESDE).aprovado).toBe(true);
  });

  it('Dado commit comum direto na branch da release, Quando avalia, Então continua reprovando (o nome do commit não basta sem ser da PR atual)', () => {
    const direto = commit({
      prs: [],
      assunto: 'feat: empurrado direto',
      prAtual: { headRef: 'release/v0.7.0' },
    });
    expect(avaliarRelease([direto], DESDE).aprovado).toBe(false);
    const falsoRobo = commit({ prs: [], assunto: 'chore(release): v0.7.0' });
    expect(avaliarRelease([falsoRobo], DESDE).aprovado).toBe(false);
  });

  it('Dado a lista de PRs de um commit, Quando acha a PR sob conferência, Então é a aberta contra a main com o head conferido', () => {
    const doApi = [
      {
        number: 753,
        merged_at: '2026-11-08T12:00:00Z',
        base: { ref: 'release/v0.7.0' },
        head: { sha: 'a', ref: 'feat/x' },
      },
      {
        number: 800,
        merged_at: null,
        base: { ref: 'main' },
        head: { sha: 'h', ref: 'release/v0.7.0' },
      },
    ];
    expect(prAtualDoCommit(doApi, 'main', 'h')).toEqual({
      headRef: 'release/v0.7.0',
    });
    expect(prAtualDoCommit(doApi, 'main', 'outro')).toBeUndefined();
  });
});
