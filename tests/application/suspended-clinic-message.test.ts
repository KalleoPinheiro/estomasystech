import { describe, expect, it } from 'vitest';
import {
  SUSPENDED_CLINIC_MESSAGE,
  suspendedClinicMessage,
} from '@/application/auth/suspended-clinic-message';

describe('Feature: Mensagem de clínica suspensa (B5, design Open 2)', () => {
  it.each([
    [
      'só telefone',
      { contactPhone: '11 3333-4444', contactEmail: null },
      'O acesso desta clínica está suspenso. Fale com o responsável pela clínica: telefone 11 3333-4444.',
    ],
    [
      'só e-mail',
      { contactPhone: null, contactEmail: 'c@x.com' },
      'O acesso desta clínica está suspenso. Fale com o responsável pela clínica: e-mail c@x.com.',
    ],
    [
      'sem contato',
      { contactPhone: null, contactEmail: null },
      SUSPENDED_CLINIC_MESSAGE,
    ],
  ] as const)(
    'Dado portal com %s, Quando montar, Então só as partes preenchidas do contato',
    (_label, clinic, expected) => {
      expect(suspendedClinicMessage('partner', clinic)).toBe(expected);
    },
  );

  it('Dada equipe, Quando montar, Então nunca leva o contato', () => {
    expect(
      suspendedClinicMessage('company_admin', {
        contactPhone: '11 3333-4444',
        contactEmail: 'c@x.com',
      }),
    ).toBe(SUSPENDED_CLINIC_MESSAGE);
  });
});
