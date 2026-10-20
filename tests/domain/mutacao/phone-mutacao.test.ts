import { describe, expect, it } from 'vitest';
import {
  isBrazilianE164,
  PHONE_MESSAGES,
  parseBrazilianPhone,
} from '@/domain/shared/phone';

// Lista independente da implementação: DDDs em uso no Brasil (Anatel).
const VALID_AREA_CODES = [
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]; // biome-ignore format: tabela de DDDs agrupada por região

describe('Feature: Telefone brasileiro (testes de mutação, #406)', () => {
  describe('Cenário: DDDs em uso', () => {
    it.each(VALID_AREA_CODES)(
      'Dado o DDD %s, Quando informo fixo e celular, Então aceita',
      (ddd) => {
        expect(parseBrazilianPhone(`${ddd}33334444`)).toEqual({
          ok: true,
          e164: `+55${ddd}33334444`,
        });
        expect(parseBrazilianPhone(`${ddd}999990000`)).toEqual({
          ok: true,
          e164: `+55${ddd}999990000`,
        });
      },
    );

    it('Dado um DDD fora da lista, Quando informo, Então rejeita com o motivo do DDD', () => {
      for (const ddd of [
        '10',
        '20',
        '23',
        '25',
        '26',
        '29',
        '30',
        '36',
        '39',
        '40',
        '50',
        '52',
        '56',
        '60',
        '70',
        '72',
        '76',
        '78',
        '80',
        '90',
      ]) {
        expect(parseBrazilianPhone(`${ddd}33334444`)).toEqual({
          ok: false,
          reason: PHONE_MESSAGES.invalidAreaCode,
        });
      }
    });
  });

  describe('Cenário: bordas do formato', () => {
    it('Dado fixo com DDI 55 sem +, Então remove o DDI', () => {
      expect(parseBrazilianPhone('551133334444')).toEqual({
        ok: true,
        e164: '+551133334444',
      });
    });

    it('Dado zero de tronco com tamanho que não confere, Então não o descarta', () => {
      expect(parseBrazilianPhone('0933334444')).toEqual({
        ok: false,
        reason: PHONE_MESSAGES.invalidAreaCode,
      });
    });

    it('Dado número curto demais, Então pede telefone válido em vez de DDD', () => {
      expect(parseBrazilianPhone('1234567')).toEqual({
        ok: false,
        reason: PHONE_MESSAGES.invalidLength,
      });
      expect(parseBrazilianPhone('12345')).toEqual({
        ok: false,
        reason: PHONE_MESSAGES.invalidLength,
      });
    });

    it('Dado fixo cujo número começa com 1, Então rejeita por tamanho, não por faltar o 9', () => {
      expect(parseBrazilianPhone('11 1234-5678')).toEqual({
        ok: false,
        reason: PHONE_MESSAGES.invalidLength,
      });
    });

    it('Dado texto com letras, Então rejeita antes de normalizar', () => {
      expect(parseBrazilianPhone('11 9999a-0000')).toEqual({
        ok: false,
        reason: PHONE_MESSAGES.invalidLength,
      });
    });
  });

  describe('Cenário: E.164 guardado', () => {
    it('Dado lixo antes ou depois do número, Então não reconhece como E.164', () => {
      expect(isBrazilianE164('+5511999990000')).toBe(true);
      expect(isBrazilianE164('x+5511999990000')).toBe(false);
      expect(isBrazilianE164('+5511999990000x')).toBe(false);
    });
  });
});
