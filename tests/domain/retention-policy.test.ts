import { describe, expect, it } from 'vitest';
import {
  ANONYMIZED_PASSWORD_HASH,
  anonymizedEmail,
  RETENTION_YEARS,
  retentionCutoff,
  retentionCutoffs,
} from '@/domain/retention/retention-policy';
import { verifyPassword } from '@/lib/auth/password';

describe('Feature: Prazos de retenção por tipo (#294, RET-02)', () => {
  it('Dado o prazo decidido, Então prontuário 20, trilha 5, fila 2 e contas 2 anos', () => {
    expect(RETENTION_YEARS).toEqual({
      clinicalRecord: 20,
      auditTrail: 5,
      waitlist: 2,
      inactiveAccount: 2,
    });
  });

  it('Dada uma execução, Quando calcula o corte, Então é a mesma data e hora N anos antes', () => {
    const now = new Date('2026-10-11T03:04:05.678Z');

    expect(retentionCutoff(now, 20).toISOString()).toBe(
      '2006-10-11T03:04:05.678Z',
    );
    expect(retentionCutoffs(now)).toEqual({
      clinicalRecord: new Date('2006-10-11T03:04:05.678Z'),
      auditTrail: new Date('2021-10-11T03:04:05.678Z'),
      waitlist: new Date('2024-10-11T03:04:05.678Z'),
      inactiveAccount: new Date('2024-10-11T03:04:05.678Z'),
    });
  });

  it('Dado 29/02, Quando o ano do corte não é bissexto, Então o corte é 28/02 (o mais cedo)', () => {
    expect(
      retentionCutoff(new Date('2028-02-29T12:00:00Z'), 2).toISOString(),
    ).toBe('2026-02-28T12:00:00.000Z');
    expect(
      retentionCutoff(new Date('2028-02-29T12:00:00Z'), 4).toISOString(),
    ).toBe('2024-02-29T12:00:00.000Z');
  });

  it('Dado o fim de um mês longo, Quando o corte cai noutro ano, Então não transborda para o mês seguinte', () => {
    expect(
      retentionCutoff(new Date('2026-03-31T00:00:00Z'), 5).toISOString(),
    ).toBe('2021-03-31T00:00:00.000Z');
  });

  it('Dada uma conta anonimizada, Então o e-mail é único por registro e nenhuma senha passa', async () => {
    expect(anonymizedEmail('abc')).toBe('anonimizado+abc@anonimizado.invalid');
    expect(ANONYMIZED_PASSWORD_HASH.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('anonimizado', ANONYMIZED_PASSWORD_HASH)).toBe(
      false,
    );
  });
});
