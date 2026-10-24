import { describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import {
  assertWithinLimit,
  detectIdentityImage,
  identityFormatOf,
  MAX_IDENTITY_IMAGE_BYTES,
  newIdentityKey,
  prepareSvg,
} from '@/domain/clinic/identity-image';
import { ValidationError } from '@/domain/shared/errors';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const ftyp = (brand: string) =>
  new Uint8Array([0, 0, 0, 24, ...text('ftyp'), ...text(brand), 0, 0, 0, 0]);

describe('Feature: Imagem de identidade (logo da clínica e avatar da equipe, #427)', () => {
  describe('Cenário: o tipo vem dos bytes, nunca do Content-Type', () => {
    it.each([
      ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0)],
      ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
      ['WebP', new Uint8Array([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP')])],
      ['GIF89a', text('GIF89a....')],
      ['GIF87a', text('GIF87a....')],
      ['AVIF', ftyp('avif')],
      ['AVIF animado', ftyp('avis')],
    ])('Dado um arquivo %s, Quando detectar, Então é raster', (_nome, data) => {
      expect(detectIdentityImage(data)).toEqual({ type: 'raster' });
    });

    it.each(['heic', 'heix', 'mif1'])(
      'Dado um arquivo HEIC (marca %s), Quando detectar, Então é heic',
      (brand) => {
        expect(detectIdentityImage(ftyp(brand))).toEqual({ type: 'heic' });
      },
    );

    it('Dado um SVG simples, Quando detectar, Então devolve o texto', () => {
      const source = '<svg xmlns="http://www.w3.org/2000/svg"/>';

      expect(detectIdentityImage(text(source))).toEqual({
        type: 'svg',
        text: source,
      });
    });

    it('Dado SVG com declaração XML, comentário e DOCTYPE, Quando detectar, Então é svg', () => {
      const source =
        '<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg PUBLIC "a" "b">\n<svg/>';

      expect(detectIdentityImage(text(source)).type).toBe('svg');
    });

    it.each([
      ['HTML', text('<html><script>alert(1)</script></html>')],
      ['texto', text('olá')],
      ['PDF', text('%PDF-1.7')],
      ['vazio', new Uint8Array()],
      ['UTF-8 inválido', bytes(0xc3, 0x28)],
      ['ftyp de outra marca', ftyp('mp42')],
    ])(
      'Dado %s, Quando detectar, Então recusa com formato não suportado',
      (_nome, data) => {
        expect(() => detectIdentityImage(data)).toThrow(
          /Formato de imagem não suportado/,
        );
      },
    );
  });

  describe('Cenário: limite do arquivo guardado', () => {
    it('Dado arquivo no limite de 1 MB, Quando conferir, Então passa', () => {
      expect(() =>
        assertWithinLimit(new Uint8Array(MAX_IDENTITY_IMAGE_BYTES)),
      ).not.toThrow();
    });

    it('Dado arquivo acima de 1 MB, Quando conferir, Então recusa', () => {
      expect(() =>
        assertWithinLimit(new Uint8Array(MAX_IDENTITY_IMAGE_BYTES + 1)),
      ).toThrow('Imagem excede o limite de 1 MB');
    });

    it('Dado SVG limpo acima de 1 MB, Quando preparar, Então recusa', () => {
      const big = `<svg><text>${'a'.repeat(MAX_IDENTITY_IMAGE_BYTES)}</text></svg>`;

      expect(() => prepareSvg(big)).toThrow(ValidationError);
    });

    it('Dado SVG pequeno, Quando preparar, Então devolve os bytes do SVG limpo', () => {
      const out = prepareSvg(
        '<svg onclick="x"></svg>'.replace(' onclick="x"', ''),
      );

      expect(new TextDecoder().decode(out)).toMatch(/^<svg xmlns=/);
    });
  });

  describe('Cenário: a chave no armazenamento carrega o formato', () => {
    it('Dado logo em webp, Quando gerar a chave, Então ela é única e o formato se lê de volta', () => {
      const a = newIdentityKey('logo', 'webp');
      const b = newIdentityKey('logo', 'webp');

      expect(a).not.toBe(b);
      expect(a).toMatch(/^logo-[0-9a-f-]{36}-webp$/);
      expect(identityFormatOf(a)).toBe('webp');
    });

    it('Dado avatar em svg, Quando ler o formato da chave, Então é svg', () => {
      expect(identityFormatOf(newIdentityKey('avatar', 'svg'))).toBe('svg');
    });

    it.each(['foto-123', 'logo-x-png', '../logo-x-webp', 'logo-x-webp/..', ''])(
      'Dado a chave %j que não é de identidade, Quando ler o formato, Então é nulo',
      (key) => {
        expect(identityFormatOf(key)).toBeNull();
      },
    );
  });

  describe('Cenário: a clínica e a conta guardam a chave sem mutar a original', () => {
    it('Dada uma clínica sem logo, Quando trocar e remover a chave, Então devolve novas instâncias', () => {
      const clinic = Clinic.restore({
        id: 'c1',
        name: 'Clínica',
        createdBy: 'a',
        createdAt: new Date(),
      });

      const withLogo = clinic.withLogoKey('logo-1-webp');

      expect(clinic.logoKey).toBeNull();
      expect(withLogo.logoKey).toBe('logo-1-webp');
      expect(withLogo.withLogoKey(null).logoKey).toBeNull();
    });

    it('Dada uma conta sem avatar, Quando trocar e remover a chave, Então devolve novas instâncias', () => {
      const account = UserAccount.create({
        email: 'a@b.test',
        passwordHash: 'scrypt$x',
        role: 'atendente',
        clinicId: 'c1',
      });

      const withAvatar = account.withAvatarKey('avatar-1-svg');

      expect(account.avatarKey).toBeNull();
      expect(withAvatar.avatarKey).toBe('avatar-1-svg');
      expect(withAvatar.withAvatarKey(null).avatarKey).toBeNull();
    });
  });
});
