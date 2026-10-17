import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/domain/shared/errors';
import {
  formatBrazilianPhone,
  isBrazilianE164,
  normalizeBrazilianPhoneOrThrow,
  PHONE_MESSAGES,
  parseBrazilianPhone,
} from '@/domain/shared/phone';

describe('Feature: Telefone brasileiro em E.164 (#324)', () => {
  describe('Cenário: formatos aceitos', () => {
    it.each([
      ['celular com 9 e máscara', '(11) 99999-0000', '+5511999990000'],
      ['celular só dígitos', '11999990000', '+5511999990000'],
      ['fixo com máscara', '(11) 3333-4444', '+551133334444'],
      ['zero de tronco', '011 99999-0000', '+5511999990000'],
      ['zero de tronco no fixo', '(011) 3333-4444', '+551133334444'],
      ['com +55', '+55 11 99999-0000', '+5511999990000'],
      ['com 55 sem +', '5511999990000', '+5511999990000'],
      ['com 0055', '0055 11 99999-0000', '+5511999990000'],
      ['+55 e zero de tronco', '+55 (011) 99999-0000', '+5511999990000'],
      [
        'DDD 55 (RS) não é confundido com DDI',
        '55 99999-0000',
        '+5555999990000',
      ],
      ['DDD 55 com DDI', '+55 55 99999-0000', '+5555999990000'],
      ['espaços nas bordas', '  11 99999.0000 ', '+5511999990000'],
    ])('Dado %s, Então normaliza', (_name, raw, expected) => {
      expect(parseBrazilianPhone(raw)).toEqual({ ok: true, e164: expected });
    });
  });

  describe('Cenário: formatos rejeitados com motivo', () => {
    it.each([
      ['vazio', '   ', PHONE_MESSAGES.empty],
      ['celular sem DDD', '99999-0000', PHONE_MESSAGES.missingAreaCode],
      ['fixo sem DDD', '3333-4444', PHONE_MESSAGES.missingAreaCode],
      ['DDD inexistente', '(10) 99999-0000', PHONE_MESSAGES.invalidAreaCode],
      ['DDD 20 inexistente', '20 3333-4444', PHONE_MESSAGES.invalidAreaCode],
      ['celular sem o 9', '(11) 8888-7777', PHONE_MESSAGES.mobileWithoutNine],
      ['fixo começando em 1', '(11) 1333-4444', PHONE_MESSAGES.invalidLength],
      ['11 dígitos sem 9', '(11) 33333-4444', PHONE_MESSAGES.invalidLength],
      ['dígitos demais', '11 99999-00001', PHONE_MESSAGES.invalidLength],
      ['dígitos de menos', '123', PHONE_MESSAGES.invalidLength],
      ['letras', '11 99999-abcd', PHONE_MESSAGES.invalidLength],
      ['internacional +1', '+1 415 555 2671', PHONE_MESSAGES.international],
      ['internacional +351', '+351 912 345 678', PHONE_MESSAGES.international],
      ['internacional 00', '00351912345678', PHONE_MESSAGES.international],
    ])('Dado %s, Então rejeita', (_name, raw, reason) => {
      expect(parseBrazilianPhone(raw)).toEqual({ ok: false, reason });
    });
  });

  describe('Cenário: helpers', () => {
    it('normalizeBrazilianPhoneOrThrow lança ValidationError com o motivo', () => {
      expect(normalizeBrazilianPhoneOrThrow('11 99999-0000')).toBe(
        '+5511999990000',
      );
      expect(() => normalizeBrazilianPhoneOrThrow('99999-0000')).toThrow(
        new ValidationError(PHONE_MESSAGES.missingAreaCode),
      );
    });

    it('isBrazilianE164 reconhece só o formato guardado', () => {
      expect(isBrazilianE164('+5511999990000')).toBe(true);
      expect(isBrazilianE164('+551133334444')).toBe(true);
      expect(isBrazilianE164('11999990000')).toBe(false);
      expect(isBrazilianE164('(11) 99999-0000')).toBe(false);
    });

    it('formatBrazilianPhone mostra máscara e deixa legado como está', () => {
      expect(formatBrazilianPhone('+5511999990000')).toBe('(11) 99999-0000');
      expect(formatBrazilianPhone('+551133334444')).toBe('(11) 3333-4444');
      expect(formatBrazilianPhone('11 9999')).toBe('11 9999');
    });
  });
});
