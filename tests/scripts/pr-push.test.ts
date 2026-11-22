import { describe, expect, it } from 'vitest';
import {
  erroDepoisDoPush,
  numeroDoPr,
  recusaAntesDoPush,
  shaDoLsRemote,
} from '../../scripts/pr/push-lib';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('pr:push · confere a branch antes e o head do PR depois (ADR-117)', () => {
  it('Dado argumento, Quando lê o número, Então aceita só inteiro positivo', () => {
    expect(numeroDoPr('990')).toBe(990);
    expect(numeroDoPr(undefined)).toBeNull();
    expect(numeroDoPr('0')).toBeNull();
    expect(numeroDoPr('12a')).toBeNull();
  });

  it('Dado saída do ls-remote, Quando lê, Então devolve o SHA ou null', () => {
    expect(shaDoLsRemote(`${A}\trefs/pull/1/head\n`)).toBe(A);
    expect(shaDoLsRemote('')).toBeNull();
  });

  it('Dado branch errada, HEAD destacado, main ou PR inexistente, Quando confere, Então recusa antes do push', () => {
    const base = {
      branch: 'feat/x',
      headLocal: A,
      headDoPr: B,
      descende: true,
    };
    expect(recusaAntesDoPush(base)).toBeNull();
    expect(
      recusaAntesDoPush({ ...base, headDoPr: A, descende: false }),
    ).toBeNull();
    expect(recusaAntesDoPush({ ...base, descende: false })).toContain(
      'não descende',
    );
    expect(recusaAntesDoPush({ ...base, branch: 'HEAD' })).toContain(
      'destacado',
    );
    expect(recusaAntesDoPush({ ...base, branch: '' })).toContain('destacado');
    expect(recusaAntesDoPush({ ...base, branch: 'main' })).toContain('main');
    expect(recusaAntesDoPush({ ...base, headDoPr: null })).toContain(
      'não achei',
    );
  });

  it('Dado o head do PR depois do push, Quando confere, Então só passa se for o HEAD local', () => {
    expect(erroDepoisDoPush(1, 'feat/x', A, A)).toBeNull();
    expect(erroDepoisDoPush(1, 'feat/y', A, B)).toContain('branch feat/y');
    expect(erroDepoisDoPush(1, 'feat/y', A, null)).toContain('(nada)');
  });
});
