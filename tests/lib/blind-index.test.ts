import { describe, expect, it, vi } from 'vitest';
import {
  assertBlindIndexConfigured,
  BlindIndex,
  blindIndexFromEnv,
  blindIndexKeyId,
  normalizeForBlindIndex,
} from '@/lib/blind-index';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability/logger', () => ({ logger: { warn } }));

const PEPPER_1 = 'a'.repeat(64);
const PEPPER_2 = 'b'.repeat(64);
const CLINIC_A = 'clinic-a';
const CLINIC_B = 'clinic-b';
const CPF = '529.982.247-25';

describe('Feature: Índice cego da PII cifrada (#734, ADR-096)', () => {
  it('format: hash no formato b1.<keyId>.<hex> sem o valor em claro', () => {
    const index = new BlindIndex({ current: PEPPER_1 });
    const hash = index.hash(CLINIC_A, 'cpf', CPF);

    expect(hash).toMatch(/^b1\.[0-9a-f]{8}\.[0-9a-f]{64}$/);
    expect(hash?.split('.')[1]).toBe(blindIndexKeyId(PEPPER_1));
    expect(hash).toBe(`b1.${index.currentKeyId}.${hash?.split('.')[2]}`);
    expect(hash).not.toContain('52998224725');
  });

  it('normalization: CPF com e sem máscara, e-mail em outra caixa e telefone formatado dão o mesmo hash', () => {
    const index = new BlindIndex({ current: PEPPER_1 });

    expect(index.hash(CLINIC_A, 'cpf', '52998224725')).toBe(
      index.hash(CLINIC_A, 'cpf', CPF),
    );
    expect(index.hash(CLINIC_A, 'email', '  Ana@Clinica.COM ')).toBe(
      index.hash(CLINIC_A, 'email', 'ana@clinica.com'),
    );
    expect(index.hash(CLINIC_A, 'phone', '(11) 99999-0000')).toBe(
      index.hash(CLINIC_A, 'phone', '+5511999990000'),
    );
    expect(normalizeForBlindIndex('cpf', CPF)).toBe('52998224725');
    expect(normalizeForBlindIndex('phone', '(11) 99999-0000')).toBe(
      '+5511999990000',
    );
    expect(normalizeForBlindIndex('email', ' Ana@Clinica.COM ')).toBe(
      'ana@clinica.com',
    );
  });

  it('clinic scope: o mesmo CPF em outra clínica não gera o mesmo hash', () => {
    const index = new BlindIndex({ current: PEPPER_1 });

    expect(index.hash(CLINIC_A, 'cpf', CPF)).not.toBe(
      index.hash(CLINIC_B, 'cpf', CPF),
    );
  });

  it('kind separation: valores de tipos diferentes não colidem', () => {
    const index = new BlindIndex({ current: PEPPER_1 });
    const asEmail = index.candidates(CLINIC_A, 'email', 'a@b.co');
    const asCpf = index.candidates(CLINIC_A, 'cpf', CPF);

    expect(asEmail).not.toEqual(asCpf);
  });

  it('pepper separation: peppers diferentes dão hashes diferentes', () => {
    expect(
      new BlindIndex({ current: PEPPER_1 }).hash(CLINIC_A, 'cpf', CPF),
    ).not.toBe(
      new BlindIndex({ current: PEPPER_2 }).hash(CLINIC_A, 'cpf', CPF),
    );
  });

  it('empty values: vazio, branco e nulo não geram hash nem candidatos', () => {
    const index = new BlindIndex({ current: PEPPER_1 });

    for (const empty of [null, undefined, '', '   ']) {
      expect(index.hash(CLINIC_A, 'cpf', empty)).toBeNull();
      expect(index.candidates(CLINIC_A, 'email', empty)).toEqual([]);
      expect(normalizeForBlindIndex('phone', empty)).toBeNull();
    }
  });

  it('invalid values: CPF, telefone e e-mail inválidos lançam em vez de indexar lixo', () => {
    const index = new BlindIndex({ current: PEPPER_1 });

    expect(() => index.hash(CLINIC_A, 'cpf', '111.111.111-11')).toThrow(
      /CPF inválido/,
    );
    expect(() => index.hash(CLINIC_A, 'phone', '123')).toThrow();
    expect(() => index.hash(CLINIC_A, 'email', 'sem-arroba')).toThrow(
      /Email inválido/,
    );
  });

  it('rotation with previous: o hash antigo segue achável, a gravação usa o pepper atual', () => {
    const before = new BlindIndex({ current: PEPPER_1 });
    const stored = before.hash(CLINIC_A, 'cpf', CPF) as string;
    const rotated = new BlindIndex({
      current: PEPPER_2,
      previous: [PEPPER_1, PEPPER_1, PEPPER_2],
    });

    const candidates = rotated.candidates(CLINIC_A, 'cpf', CPF);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toBe(rotated.hash(CLINIC_A, 'cpf', CPF));
    expect(candidates).toContain(stored);
    expect(rotated.isCurrent(stored)).toBe(false);
    expect(rotated.isCurrent(candidates[0])).toBe(true);
    expect(rotated.currentKeyId).toBe(blindIndexKeyId(PEPPER_2));
    // Sem o pepper anterior configurado, o hash antigo não é achado.
    expect(
      new BlindIndex({ current: PEPPER_2 }).candidates(CLINIC_A, 'cpf', CPF),
    ).not.toContain(stored);
  });

  it('short pepper: pepper com menos de 32 caracteres é recusado, atual ou anterior', () => {
    expect(() => new BlindIndex({ current: 'curto' })).toThrow(/menos de 32/);
    expect(
      () => new BlindIndex({ current: PEPPER_1, previous: ['curto'] }),
    ).toThrow(/menos de 32/);
  });
});

describe('Feature: Pepper do índice cego no ambiente (falha fechada em produção)', () => {
  it('configured: lê o pepper e os anteriores da variável', () => {
    const index = blindIndexFromEnv({
      NODE_ENV: 'production',
      BLIND_INDEX_PEPPER: ` ${PEPPER_2} `,
      BLIND_INDEX_PEPPER_PREVIOUS: ` ${PEPPER_1} , `,
    });

    expect(index.currentKeyId).toBe(blindIndexKeyId(PEPPER_2));
    expect(index.candidates(CLINIC_A, 'cpf', CPF)).toHaveLength(2);
  });

  it('production without pepper: falha fechada', () => {
    expect(() =>
      blindIndexFromEnv({
        NODE_ENV: 'production',
        AUTH_SECRET: 'x'.repeat(40),
      }),
    ).toThrow(/BLIND_INDEX_PEPPER ausente/);
    expect(() =>
      assertBlindIndexConfigured({ NODE_ENV: 'production' }),
    ).toThrow(/BLIND_INDEX_PEPPER ausente/);
    expect(() =>
      assertBlindIndexConfigured({
        NODE_ENV: 'production',
        BLIND_INDEX_PEPPER: 'curto',
      }),
    ).toThrow(/menos de 32/);
  });

  it('production with pepper: o boot passa', () => {
    expect(() =>
      assertBlindIndexConfigured({
        NODE_ENV: 'production',
        BLIND_INDEX_PEPPER: PEPPER_1,
      }),
    ).not.toThrow();
  });

  it('outside production: deriva do AUTH_SECRET com um único aviso e o boot não exige nada', () => {
    const env = {
      NODE_ENV: 'development',
      AUTH_SECRET: 'segredo-de-sessao-longo-o-bastante',
    };
    const first = blindIndexFromEnv(env);
    const second = blindIndexFromEnv(env);

    expect(first.hash(CLINIC_A, 'cpf', CPF)).toBe(
      second.hash(CLINIC_A, 'cpf', CPF),
    );
    expect(first.currentKeyId).not.toBe(blindIndexKeyId(PEPPER_1));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() =>
      assertBlindIndexConfigured({ NODE_ENV: 'test' }),
    ).not.toThrow();
  });

  it('no pepper and no auth secret outside production: lança', () => {
    expect(() => blindIndexFromEnv({ NODE_ENV: 'development' })).toThrow(
      /BLIND_INDEX_PEPPER e AUTH_SECRET ausentes/,
    );
  });
});
