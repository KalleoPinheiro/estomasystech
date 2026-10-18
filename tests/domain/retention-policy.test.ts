import { describe, expect, it, vi } from 'vitest';
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

  const SP = 'America/Sao_Paulo';

  it('Dada uma execução, Quando calcula o corte, Então é a meia-noite local do mesmo dia N anos antes', () => {
    // 2026-10-11 00:04 em São Paulo.
    const now = new Date('2026-10-11T03:04:05.678Z');

    expect(retentionCutoff(now, 20, SP).toISOString()).toBe(
      '2006-10-11T03:00:00.000Z',
    );
    expect(retentionCutoffs(now, SP)).toEqual({
      clinicalRecord: new Date('2006-10-11T03:00:00Z'),
      auditTrail: new Date('2021-10-11T03:00:00Z'),
      waitlist: new Date('2024-10-11T03:00:00Z'),
      inactiveAccount: new Date('2024-10-11T03:00:00Z'),
    });
  });

  it('Dado o fuso padrão, Quando omitido, Então usa APP_TIMEZONE', () => {
    vi.stubEnv('APP_TIMEZONE', 'America/Manaus');
    const now = new Date('2026-10-11T12:00:00Z');
    expect(retentionCutoffs(now)).toEqual(
      retentionCutoffs(now, 'America/Manaus'),
    );
    vi.unstubAllEnvs();
  });

  it('Dada a execução logo depois da meia-noite UTC, Quando ainda é ontem em São Paulo, Então o dia do corte é o local', () => {
    // 2026-10-12 01:00 UTC = 2026-10-11 22:00 em São Paulo.
    expect(
      retentionCutoff(new Date('2026-10-12T01:00:00Z'), 5, SP).toISOString(),
    ).toBe('2021-10-11T03:00:00.000Z');
  });

  it('Dado um evento no último dia do prazo, Quando o job roda nesse dia, Então ele fica (CC art. 132 § 3º)', () => {
    const event = new Date('2021-10-18T23:30:00-03:00');
    const lastDay = retentionCutoff(
      new Date('2026-10-18T23:59:00-03:00'),
      5,
      SP,
    );
    const dayAfter = retentionCutoff(
      new Date('2026-10-19T00:01:00-03:00'),
      5,
      SP,
    );

    expect(event < lastDay).toBe(false);
    expect(event < dayAfter).toBe(true);
  });

  it('Dado início em 29/02, Quando o ano final não é bissexto, Então o prazo termina em 01/03', () => {
    const event = new Date('2024-02-29T12:00:00-03:00');
    // 01/03/2029 é o último dia: fica.
    expect(
      event < retentionCutoff(new Date('2029-03-01T12:00:00-03:00'), 5, SP),
    ).toBe(false);
    // 02/03/2029: sai. E o evento de 28/02 já tinha saído em 01/03.
    expect(
      event < retentionCutoff(new Date('2029-03-02T00:00:00-03:00'), 5, SP),
    ).toBe(true);
    expect(
      new Date('2024-02-28T12:00:00-03:00') <
        retentionCutoff(new Date('2029-03-01T00:00:00-03:00'), 5, SP),
    ).toBe(true);
  });

  it('Dada a execução em 29/02, Quando o ano do corte não é bissexto, Então o corte é 01/03', () => {
    expect(
      retentionCutoff(
        new Date('2028-02-29T12:00:00-03:00'),
        2,
        SP,
      ).toISOString(),
    ).toBe('2026-03-01T03:00:00.000Z');
    expect(
      retentionCutoff(
        new Date('2028-02-29T12:00:00-03:00'),
        4,
        SP,
      ).toISOString(),
    ).toBe('2024-02-29T03:00:00.000Z');
  });

  it('Dado o primeiro dia do mês, Quando calcula o corte, Então volta pelo fim do mês anterior sem transbordar', () => {
    expect(
      retentionCutoff(
        new Date('2026-03-01T12:00:00-03:00'),
        5,
        SP,
      ).toISOString(),
    ).toBe('2021-03-01T03:00:00.000Z');
    expect(
      retentionCutoff(
        new Date('2026-03-31T12:00:00-03:00'),
        5,
        SP,
      ).toISOString(),
    ).toBe('2021-03-31T03:00:00.000Z');
    expect(
      retentionCutoff(
        new Date('2026-01-01T12:00:00-03:00'),
        5,
        SP,
      ).toISOString(),
    ).toBe('2021-01-01T03:00:00.000Z');
  });

  it('Dada uma conta anonimizada, Então o e-mail é único por registro e nenhuma senha passa', async () => {
    expect(anonymizedEmail('abc')).toBe('anonimizado+abc@anonimizado.invalid');
    expect(ANONYMIZED_PASSWORD_HASH.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('anonimizado', ANONYMIZED_PASSWORD_HASH)).toBe(
      false,
    );
  });
});
