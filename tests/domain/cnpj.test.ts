import { describe, expect, it } from 'vitest';
import {
  INVALID_CNPJ_CHECK_DIGIT_MESSAGE,
  INVALID_CNPJ_MESSAGE,
  normalizeCnpj,
} from '@/domain/clinic/cnpj';
import { ValidationError } from '@/domain/shared/errors';

describe('Feature: CNPJ da clínica com dígito verificador (#248)', () => {
  describe('Cenário: CNPJ válido é aceito e normalizado', () => {
    it.each([
      ['numérico com pontuação', '11.222.333/0001-81', '11.222.333/0001-81'],
      ['numérico sem pontuação', '11222333000181', '11.222.333/0001-81'],
      ['numérico com espaços', ' 11222333000181 ', '11.222.333/0001-81'],
      // Vetor da Receita para o CNPJ alfanumérico (jul/2026).
      ['alfanumérico oficial', '12.ABC.345/01DE-35', '12.ABC.345/01DE-35'],
      ['alfanumérico em minúsculas', '12abc34501de35', '12.ABC.345/01DE-35'],
      [
        'resto 0 ou 1 vira dígito 0',
        '11.000.000/0001-08',
        '11.000.000/0001-08',
      ],
    ])(
      'Dado CNPJ %s, Quando normalizar, Então devolve a forma canônica',
      (_nome, entrada, esperado) => {
        expect(normalizeCnpj(entrada)).toBe(esperado);
      },
    );
  });

  describe('Cenário: dígito verificador errado é recusado', () => {
    it.each([
      ['1º dígito', '11.222.333/0001-91'],
      ['2º dígito', '11.222.333/0001-82'],
      ['alfanumérico', '12.ABC.345/01DE-36'],
    ])(
      'Dado CNPJ com %s errado, Quando normalizar, Então recusa com a mensagem do DV',
      (_nome, entrada) => {
        expect(() => normalizeCnpj(entrada)).toThrow(ValidationError);
        expect(() => normalizeCnpj(entrada)).toThrow(
          INVALID_CNPJ_CHECK_DIGIT_MESSAGE,
        );
      },
    );
  });

  describe('Cenário: formato inválido segue recusado antes do DV', () => {
    it.each([
      ['curto', '1122233300018'],
      ['DV com letra', '1122233300018A'],
      ['vazio de caracteres válidos', '--'],
    ])(
      'Dado CNPJ %s, Quando normalizar, Então recusa pelo formato',
      (_nome, entrada) => {
        expect(() => normalizeCnpj(entrada)).toThrow(INVALID_CNPJ_MESSAGE);
      },
    );
  });
});
