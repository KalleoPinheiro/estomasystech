import { describe, expect, it } from 'vitest';
import { encryptSecret } from '@/lib/auth/crypto';
import { DataCipher, dataCipherFromEnv, dataKeyId } from '@/lib/data-cipher';

const KEY_1 = 'a'.repeat(64);
const KEY_2 = 'b'.repeat(64);
const AUTH = 'segredo-de-sessao';

describe('Feature: Cifra de dado clínico com chave própria (#195, ADR-006)', () => {
  it('round trip v1: formato v1.<keyId>.<iv>.<tag>.<ct> e decifra de volta', () => {
    const cipher = new DataCipher({ current: KEY_1 });
    const payload = cipher.encrypt('Alergia a látex');

    expect(payload).toMatch(
      /^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/,
    );
    expect(payload.split('.')[1]).toBe(dataKeyId(KEY_1));
    expect(payload).not.toContain('látex');
    expect(cipher.decrypt(payload)).toBe('Alergia a látex');
    expect(cipher.isCurrent(payload)).toBe(true);
  });

  it('rotation reads previous writes current: v1 da chave anterior é lido, gravação usa a atual', () => {
    const before = new DataCipher({ current: KEY_1 });
    const stored = before.encrypt('Diabetes tipo 2');
    const rotated = new DataCipher({ current: KEY_2, previous: [KEY_1] });

    expect(rotated.decrypt(stored)).toBe('Diabetes tipo 2');
    expect(rotated.isCurrent(stored)).toBe(false);
    const rewritten = rotated.encrypt(rotated.decrypt(stored));
    expect(rewritten.split('.')[1]).toBe(dataKeyId(KEY_2));
    expect(rotated.isCurrent(rewritten)).toBe(true);
    // Sem a anterior configurada, o payload antigo não abre.
    expect(() => new DataCipher({ current: KEY_2 }).decrypt(stored)).toThrow(
      /chave desconhecida/,
    );
  });

  it('reads legacy auth secret payload: iv.tag.ct cifrado com sha256(AUTH_SECRET)', () => {
    const legacy = encryptSecret('SOAP antigo', AUTH);
    const cipher = new DataCipher({ current: KEY_1, legacyAuthSecret: AUTH });

    expect(cipher.decrypt(legacy)).toBe('SOAP antigo');
    expect(cipher.isCurrent(legacy)).toBe(false);
    expect(() => new DataCipher({ current: KEY_1 }).decrypt(legacy)).toThrow(
      /AUTH_SECRET antigo ausente/,
    );
  });

  it('auth secret rotation does not affect data: trocar o AUTH_SECRET mantém o dado legível', () => {
    const stored = new DataCipher({
      current: KEY_1,
      legacyAuthSecret: AUTH,
    }).encrypt('Evolução');
    const afterRotation = dataCipherFromEnv({
      NODE_ENV: 'production',
      DATA_ENCRYPTION_KEY: KEY_1,
      AUTH_SECRET: 'segredo-novo-depois-do-incidente',
    });

    expect(afterRotation.decrypt(stored)).toBe('Evolução');
  });

  it('plaintext passthrough: texto em claro legado volta como está (inclusive parecido com payload)', () => {
    const cipher = new DataCipher({ current: KEY_1 });

    for (const text of ['Paciente estável', 'v1. retorno em 7 dias', 'a.b.c']) {
      expect(cipher.decrypt(text)).toBe(text);
    }
    expect(cipher.decryptNullable(null)).toBeNull();
    expect(cipher.encryptNullable('')).toBe('');
  });

  it('unknown key id throws: payload v1 íntegro de chave não configurada lança', () => {
    const foreign = new DataCipher({ current: KEY_2 }).encrypt('x');

    expect(() => new DataCipher({ current: KEY_1 }).decrypt(foreign)).toThrow(
      `chave desconhecida (id ${dataKeyId(KEY_2)})`,
    );
  });

  it('adulterar o payload v1 falha a autenticação do GCM', () => {
    const cipher = new DataCipher({ current: KEY_1 });
    const parts = cipher.encrypt('Nota').split('.');
    // Primeiro caractere: o último pode carregar só bits de preenchimento.
    parts[4] = `${parts[4].startsWith('A') ? 'B' : 'A'}${parts[4].slice(1)}`;

    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('production requires key: sem DATA_ENCRYPTION_KEY em produção lança; chave curta lança', () => {
    expect(() =>
      dataCipherFromEnv({ NODE_ENV: 'production', AUTH_SECRET: AUTH }),
    ).toThrow(/DATA_ENCRYPTION_KEY ausente/);
    expect(() =>
      dataCipherFromEnv({
        NODE_ENV: 'production',
        DATA_ENCRYPTION_KEY: 'curta',
      }),
    ).toThrow(/menos de 32 caracteres/);
    // Fora de produção, cai na chave de desenvolvimento (nunca a do AUTH_SECRET puro).
    const dev = dataCipherFromEnv({ NODE_ENV: 'test', AUTH_SECRET: AUTH });
    expect(dev.decrypt(dev.encrypt('ok'))).toBe('ok');
    expect(dev.encrypt('ok').split('.')[1]).not.toBe(dataKeyId(AUTH));
  });
});
