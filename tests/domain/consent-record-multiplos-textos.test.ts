import { describe, expect, it } from 'vitest';
import { ConsentRecord } from '@/domain/consent/consent-record';

describe('Feature: aceite cobre qualquer um dos textos vigentes (#469)', () => {
  const record = (consentText: string) =>
    ConsentRecord.create({
      patientId: 'p-1',
      consentText,
      textVersion: 'v1',
      purpose: 'treatment',
    });

  it('Dado aceite do texto B, Quando conferir contra [A, B], Então vale', () => {
    expect(record('texto B').covers(['texto A', 'texto B'])).toBe(true);
  });

  it('Dado aceite do texto C, Quando conferir contra [A, B], Então não vale', () => {
    expect(record('texto C').covers(['texto A', 'texto B'])).toBe(false);
  });

  it('Dado aceite do texto B, Quando conferir contra um texto só, Então segue valendo como antes', () => {
    expect(record('texto B').covers('texto B')).toBe(true);
    expect(record('texto B').covers('texto A')).toBe(false);
  });

  it('Dado aceite do texto B, Quando resolver o status com [A, B], Então está aceito', () => {
    const status = ConsentRecord.resolveStatus(
      [record('texto B')],
      ['texto A', 'texto B'],
      'treatment',
    );

    expect(status.accepted).toBe(true);
  });
});
