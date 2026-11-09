import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  avaliarReviews,
  type ReviewGitHub,
  vereditoDoCorpo,
} from '../../scripts/release/review-judge-lib';

const SHA = 'abc123';
const rev = (o: Partial<ReviewGitHub> & { id: number }): ReviewGitHub => ({
  commit_id: SHA,
  state: 'COMMENTED',
  body: '## the-judge/v1 — PR #7 @ abc123 — veredito: APPROVE\n\nresto',
  ...o,
});

describe('review the-judge/v1 do head (ADR-101)', () => {
  it('Dado as duas formas de primeira linha usadas pela revisora, Quando lê o veredito, Então reconhece APPROVE', () => {
    expect(
      vereditoDoCorpo(
        '## the-judge/v1 — PR #797 @ f86597d — veredito: APPROVE\n...',
      ),
    ).toBe('APPROVE');
    expect(
      vereditoDoCorpo('\n**the-judge/v1: APPROVE** (head `c9d9c8d6`)\n...'),
    ).toBe('APPROVE');
  });

  it('Dado veredito com recusa, sem APPROVE ou sem a marca, Quando lê, Então não é APPROVE', () => {
    expect(vereditoDoCorpo('## the-judge/v1 — veredito: REQUEST_CHANGES')).toBe(
      'REJEITADO',
    );
    expect(
      vereditoDoCorpo('## the-judge/v1 — veredito: APPROVE? não: BLOCK'),
    ).toBe('REJEITADO');
    expect(vereditoDoCorpo('## the-judge/v1 — sem veredito')).toBe('REJEITADO');
    expect(vereditoDoCorpo('Revisão: **APPROVE**')).toBeNull();
    expect(
      vereditoDoCorpo('APPROVE\nthe-judge/v1 só na segunda linha'),
    ).toBeNull();
    expect(vereditoDoCorpo(null)).toBeNull();
    expect(vereditoDoCorpo('')).toBeNull();
  });

  it('Dado review COMMENT APPROVE do head, Quando avalia, Então aprova e devolve o id', () => {
    expect(avaliarReviews([rev({ id: 5 })], SHA)).toEqual({
      ok: true,
      reviewId: 5,
    });
  });

  it('Dado SHA sem review do the-judge, Quando avalia, Então reprova (falha fechado)', () => {
    expect(avaliarReviews([], SHA)).toMatchObject({ ok: false });
    expect(
      avaliarReviews([rev({ id: 1, body: 'comentário comum' })], SHA),
    ).toMatchObject({ ok: false });
  });

  it('Dado review de outro commit ou em outro estado, Quando avalia, Então não conta', () => {
    for (const o of [
      { commit_id: 'velho' },
      { state: 'APPROVED' },
      { state: 'CHANGES_REQUESTED' },
      { state: 'PENDING' },
      { state: 'DISMISSED' },
    ])
      expect(
        avaliarReviews([rev({ id: 1, ...o })], SHA),
        JSON.stringify(o),
      ).toMatchObject({ ok: false });
  });

  it('Dado veredito posterior que não é APPROVE, Quando avalia, Então a review mais nova revoga a anterior', () => {
    const r = avaliarReviews(
      [
        rev({ id: 1 }),
        rev({ id: 2, body: '## the-judge/v1 — veredito: REQUEST_CHANGES' }),
      ],
      SHA,
    );
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).toContain('review 2');
    expect(
      avaliarReviews(
        [
          rev({ id: 2, body: '## the-judge/v1 — veredito: REQUEST_CHANGES' }),
          rev({ id: 3 }),
        ],
        SHA,
      ),
    ).toEqual({ ok: true, reviewId: 3 });
  });

  it('Dado o script sem argumentos, Quando roda sob o tsx (CJS), Então carrega e sai com 1 sem erro de transformação', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/release/review-judge.ts'], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    expect(`${r.stdout}${r.stderr}`).not.toMatch(
      /TransformError|Top-level await/,
    );
    expect(r.status).toBe(1);
  });
});
