import { describe, expect, it } from 'vitest';
import {
  formatCpf,
  INVALID_CPF_MESSAGE,
  isValidCpf,
  maskCpf,
  normalizeCpf,
  normalizeOptionalCpf,
} from '@/domain/shared/cpf';
import { ValidationError } from '@/domain/shared/errors';

describe('Feature: CPF com dígito verificador (#326)', () => {
  describe('Cenário: formatos aceitos', () => {
    it.each([
      ['só dígitos', '52998224725'],
      ['com máscara', '529.982.247-25'],
      ['com espaços ao redor', '  529.982.247-25  '],
      ['dígito verificador zero', '11144477735'],
    ])('Dado CPF %s, Quando normalizar, Então guarda 11 dígitos', (_, raw) => {
      expect(normalizeCpf(raw)).toMatch(/^\d{11}$/);
    });

    it('Dado a mesma pessoa digitada de dois jeitos, Então a forma guardada é uma só', () => {
      expect(normalizeCpf('529.982.247-25')).toBe(normalizeCpf('52998224725'));
    });
  });

  describe('Cenário: recusas', () => {
    it.each([
      ['dígito verificador errado', '529.982.247-24'],
      ['segundo dígito errado', '52998224726'],
      ['todos iguais', '111.111.111-11'],
      ['zeros', '000.000.000-00'],
      ['curto', '5299822472'],
      ['longo', '529982247255'],
      ['com letras', '529.982.247-2A'],
      ['vazio', ''],
      ['só máscara', '...---'],
    ])(
      'Dado CPF com %s, Quando normalizar, Então recusa com a mensagem',
      (_, raw) => {
        expect(() => normalizeCpf(raw)).toThrow(ValidationError);
        expect(() => normalizeCpf(raw)).toThrow(INVALID_CPF_MESSAGE);
      },
    );
  });

  describe('Cenário: opcional', () => {
    it.each([[null], [undefined], [''], ['   ']])(
      'Dado %j, Então vira null',
      (raw) => {
        expect(normalizeOptionalCpf(raw)).toBeNull();
      },
    );

    it('Dado CPF preenchido e inválido, Então recusa', () => {
      expect(() => normalizeOptionalCpf('123')).toThrow(ValidationError);
    });
  });

  describe('Cenário: exibição', () => {
    it('Dado 11 dígitos, Quando formatar, Então aplica a máscara completa', () => {
      expect(formatCpf('52998224725')).toBe('529.982.247-25');
    });

    it('Dado 11 dígitos, Quando mascarar, Então só três dígitos do miolo ficam visíveis', () => {
      const masked = maskCpf('52998224725');
      expect(masked).toBe('***.***.247-**');
      expect(masked.replace(/\D/g, '')).toBe('247');
    });

    it('isValidCpf recusa texto fora de 11 dígitos', () => {
      expect(isValidCpf('529.982.247-25')).toBe(false);
      expect(isValidCpf('52998224725')).toBe(true);
    });
  });
});
