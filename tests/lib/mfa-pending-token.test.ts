import { describe, expect, it } from 'vitest';
import {
  createMfaPendingToken,
  MFA_PENDING_TTL_MS,
  verifyMfaPendingToken,
} from '@/lib/auth/mfa-pending-token';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'segredo-de-teste-do-b2';
const NOW = 1_800_000_000_000;
const base = {
  accountId: 'conta-1',
  sessionVersion: 3,
  stage: 'verify' as const,
};

describe('Feature: Token de login pendente do super_admin (B2)', () => {
  it('Dado token recém-emitido, Quando verificar, Então vale durante a validade de 5 minutos e não depois', () => {
    const token = createMfaPendingToken(SECRET, base, NOW);
    expect(MFA_PENDING_TTL_MS).toBe(5 * 60 * 1000);
    expect(
      verifyMfaPendingToken(SECRET, token, NOW + MFA_PENDING_TTL_MS - 1),
    ).toEqual({
      ...base,
      expiresAtMs: NOW + MFA_PENDING_TTL_MS,
    });
    expect(
      verifyMfaPendingToken(SECRET, token, NOW + MFA_PENDING_TTL_MS),
    ).toBeNull();
  });

  it('Dado token adulterado, de outro segredo ou malformado, Quando verificar, Então recusa adulterado e demais', () => {
    const token = createMfaPendingToken(
      SECRET,
      { ...base, stage: 'confirm', encryptedSecret: 'x' },
      NOW,
    );
    expect(verifyMfaPendingToken(SECRET, token, NOW)?.encryptedSecret).toBe(
      'x',
    );
    const [prefix, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        p: 'mfa',
        sub: 'outra',
        sv: 3,
        st: 'verify',
        exp: NOW + 1000,
      }),
    ).toString('base64url');
    expect(
      verifyMfaPendingToken(SECRET, `${prefix}.${forged}.${signature}`, NOW),
    ).toBeNull();
    expect(verifyMfaPendingToken('outro-segredo', token, NOW)).toBeNull();
    expect(
      verifyMfaPendingToken(SECRET, `${payload}.${signature}`, NOW),
    ).toBeNull();
    expect(verifyMfaPendingToken(SECRET, 'mfa.semassinatura', NOW)).toBeNull();
    expect(verifyMfaPendingToken(SECRET, undefined, NOW)).toBeNull();
  });

  it('Dado payload assinado mas inválido, Quando verificar, Então recusa etapa desconhecida e JSON quebrado', async () => {
    const { createHmac } = await import('node:crypto');
    const key = createHmac('sha256', SECRET)
      .update('estomasystech/mfa-pending/v1')
      .digest();
    const signed = (payload: string) =>
      `mfa.${payload}.${createHmac('sha256', key).update(payload).digest('hex')}`;
    const badStage = Buffer.from(
      JSON.stringify({
        p: 'mfa',
        sub: 'c',
        sv: 0,
        st: 'sessao',
        exp: NOW + 1000,
      }),
    ).toString('base64url');
    expect(verifyMfaPendingToken(SECRET, signed(badStage), NOW)).toBeNull();
    expect(verifyMfaPendingToken(SECRET, signed('não-é-json'), NOW)).toBeNull();
    expect(verifyMfaPendingToken(SECRET, signed(badStage), NOW)).toBeNull();
    const sealed = createMfaPendingToken(SECRET, base, NOW);
    expect(verifyMfaPendingToken(SECRET, sealed, NOW)).not.toBeNull();
  });

  it('Dado cookie de sessão e token pendente, Quando trocar um pelo outro, Então a separação de domínio recusa os dois', () => {
    const session = createSessionToken(
      SECRET,
      NOW + 60_000,
      'root@estomasystech.test',
      'super_admin',
      null,
      null,
      3,
    );
    const pending = createMfaPendingToken(SECRET, base, NOW);
    expect(verifyMfaPendingToken(SECRET, session, NOW)).toBeNull();
    expect(verifyMfaPendingToken(SECRET, `mfa.${session}`, NOW)).toBeNull();
    expect(verifySessionToken(SECRET, pending, NOW)).toBeNull();
    expect(verifySessionToken(SECRET, pending.slice(4), NOW)).toBeNull();
  });
});
