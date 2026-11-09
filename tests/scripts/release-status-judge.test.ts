import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  avaliarRevisao,
  avaliarStatus,
  revisaoDaUrl,
  type StatusGitHub,
} from '../../scripts/release/status-judge-lib';

const alvo = { repo: 'o/r', pr: 7, sha: 'abc123' };
const url = 'https://github.com/o/r/pull/7#pullrequestreview-42';
const st = (o: Partial<StatusGitHub>): StatusGitHub => ({
  context: 'the-judge',
  state: 'success',
  target_url: url,
  ...o,
});

describe('status the-judge do head (ADR-101)', () => {
  it('Dado status success apontando para review desta PR, Quando avalia, Então aprova e devolve o id da review', () => {
    expect(avaliarStatus([st({})], alvo)).toEqual({ ok: true, revisaoId: 42 });
  });

  it('Dado SHA sem o status, Quando avalia, Então reprova (falha fechado)', () => {
    const r = avaliarStatus([st({ context: 'outro' })], alvo);
    expect(r).toMatchObject({ ok: false });
    expect(avaliarStatus([], alvo)).toMatchObject({ ok: false });
  });

  it('Dado failure posterior a um success, Quando avalia, Então vale o mais novo e reprova (revoga)', () => {
    const r = avaliarStatus([st({ state: 'failure' }), st({})], alvo);
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).toContain("'failure'");
  });

  it('Dado target_url que não é review desta PR, Quando avalia, Então reprova', () => {
    for (const t of [
      null,
      'https://github.com/o/r/pull/8#pullrequestreview-42',
      'https://github.com/outro/r/pull/7#pullrequestreview-42',
      'https://github.com/o/r/pull/7#issuecomment-42',
      'https://github.com/o/r/pull/7#pullrequestreview-4x',
    ])
      expect(avaliarStatus([st({ target_url: t })], alvo)).toMatchObject({
        ok: false,
      });
    expect(revisaoDaUrl(url, alvo)).toBe(42);
  });

  it('Dado review de outro commit, pendente ou sem citar o the-judge, Quando avalia, Então reprova', () => {
    const boa = {
      commit_id: 'abc123',
      state: 'COMMENTED',
      body: 'the-judge: APROVADO',
    };
    expect(avaliarRevisao(boa, 'abc123')).toBeNull();
    expect(avaliarRevisao({ ...boa, commit_id: 'velho' }, 'abc123')).toContain(
      'velho',
    );
    expect(avaliarRevisao({ ...boa, state: 'DISMISSED' }, 'abc123')).toContain(
      'DISMISSED',
    );
    expect(avaliarRevisao({ ...boa, state: 'PENDING' }, 'abc123')).toContain(
      'PENDING',
    );
    expect(avaliarRevisao({ ...boa, body: 'ok' }, 'abc123')).toContain(
      'the-judge',
    );
    expect(avaliarRevisao({ ...boa, body: null }, 'abc123')).toContain(
      'the-judge',
    );
  });

  it('Dado o script sem argumentos, Quando roda sob o tsx (CJS), Então carrega e sai com 1 sem erro de transformação', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/release/status-judge.ts'], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    expect(`${r.stdout}${r.stderr}`).not.toMatch(
      /TransformError|Top-level await/,
    );
    expect(r.status).toBe(1);
  });
});
