import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptField,
  decryptSecret,
  encryptField,
  encryptSecret,
  isEncryptedPayload,
} from '@/lib/auth/crypto';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { RateLimiter } from '@/lib/auth/rate-limit';
import {
  createSessionToken,
  passwordMatches,
  verifySessionToken,
} from '@/lib/auth/session';

const SECRET = 'test-secret';

/**
 * Reproduz `encryptSecret` como era ANTES de `authTagLength` ser explícito, para que o
 * teste de compatibilidade exercite um ciphertext realmente legado — e não a saída do
 * helper já corrigido. Único motivo para existir uma cifragem local neste arquivo.
 */
function encryptSecretPreAuthTagLength(
  plaintext: string,
  secret: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

describe('Feature: Sessão assinada (HMAC)', () => {
  it('session version claim: token carrega `sv`; token sem `sv` é lido como 0 (#194)', () => {
    const exp = Date.now() + 60_000;
    const withVersion = createSessionToken(
      SECRET,
      exp,
      'ana@x.com',
      'atendente',
      'c1',
      null,
      4,
    );
    expect(verifySessionToken(SECRET, withVersion)?.sessionVersion).toBe(4);

    // Token emitido antes do #194: payload sem `sv`, assinado do mesmo jeito.
    const payload = Buffer.from(
      JSON.stringify({
        exp,
        sub: 'ana@x.com',
        role: 'atendente',
        clinicId: 'c1',
      }),
    ).toString('base64url');
    const legacy = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('hex')}`;
    expect(verifySessionToken(SECRET, legacy)?.sessionVersion).toBe(0);

    // `sv` inválido (negativo/fracionário/texto) invalida o token inteiro.
    for (const sv of [-1, 1.5, '2']) {
      const bad = Buffer.from(
        JSON.stringify({
          exp,
          sub: 'a@x.com',
          role: 'atendente',
          clinicId: 'c1',
          sv,
        }),
      ).toString('base64url');
      const token = `${bad}.${createHmac('sha256', SECRET).update(bad).digest('hex')}`;
      expect(verifySessionToken(SECRET, token)).toBeNull();
    }
  });

  it('Dado token emitido, Quando verificar com o mesmo segredo, Então válido com subject', () => {
    const token = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'maria@clinica.com',
    );

    const session = verifySessionToken(SECRET, token);

    expect(session).not.toBeNull();
    expect(session?.subject).toBe('maria@clinica.com');
  });

  it("Dado token sem subject explícito, Quando verificar, Então subject 'local' e papel 'admin'", () => {
    const token = createSessionToken(SECRET, Date.now() + 60_000);

    const session = verifySessionToken(SECRET, token);
    expect(session?.subject).toBe('local');
    expect(session?.role).toBe('company_admin');
  });

  it('Dado token com papel patient/partner, Quando verificar, Então papel preservado', () => {
    const patientToken = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'maria@x.com',
      'patient',
    );
    const partnerToken = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'dr@x.com',
      'partner',
    );

    expect(verifySessionToken(SECRET, patientToken)?.role).toBe('patient');
    expect(verifySessionToken(SECRET, partnerToken)?.role).toBe('partner');
  });

  it('Dado token emitido sem clinicId explícito, Quando verificar, Então claim clinicId é null (papel de sistema)', () => {
    const token = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'maria@clinica.com',
    );

    const session = verifySessionToken(SECRET, token);

    expect(session?.clinicId).toBeNull();
  });

  it('Dado token emitido com clinicId, Quando verificar, Então claim clinicId preservado', () => {
    const token = createSessionToken(
      SECRET,
      Date.now() + 60_000,
      'maria@clinica.com',
      'company_admin',
      'clinic-a',
    );

    const session = verifySessionToken(SECRET, token);

    expect(session?.clinicId).toBe('clinic-a');
  });

  it('Dado token expirado, Quando verificar, Então inválido', () => {
    const token = createSessionToken(SECRET, Date.now() - 1);

    expect(verifySessionToken(SECRET, token)).toBeNull();
  });

  it('Dado token adulterado (payload ou assinatura), Quando verificar, Então inválido', () => {
    const token = createSessionToken(SECRET, Date.now() + 60_000);
    const [payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ exp: Date.now() + 9_999_999, sub: 'hacker' }),
    ).toString('base64url');

    expect(
      verifySessionToken(SECRET, `${forgedPayload}.${signature}`),
    ).toBeNull();
    expect(
      verifySessionToken(SECRET, `${payload}.${'0'.repeat(signature.length)}`),
    ).toBeNull();
    expect(verifySessionToken(SECRET, undefined)).toBeNull();
    expect(verifySessionToken(SECRET, 'malformed')).toBeNull();
  });

  it('Dado segredo diferente, Quando verificar, Então inválido', () => {
    const token = createSessionToken(SECRET, Date.now() + 60_000);

    expect(verifySessionToken('outro-segredo', token)).toBeNull();
  });

  it('Dado senhas iguais/diferentes, Quando comparar em tempo constante, Então correto', () => {
    expect(passwordMatches('s3nh@forte', 's3nh@forte')).toBe(true);
    expect(passwordMatches('s3nh@forte', 's3nh@fortE')).toBe(false);
    expect(passwordMatches('s3nh@forte', 'curta')).toBe(false);
  });
});

describe('Feature: Criptografia de segredos em repouso (AES-256-GCM)', () => {
  it('Dado segredo cifrado, Quando decifrar com a mesma chave, Então texto original', () => {
    const encrypted = encryptSecret('refresh-token-google-1//abc', SECRET);

    expect(encrypted).not.toContain('refresh-token');
    expect(decryptSecret(encrypted, SECRET)).toBe(
      'refresh-token-google-1//abc',
    );
  });

  it('Dado chave errada ou dado adulterado, Quando decifrar, Então lança erro', () => {
    const encrypted = encryptSecret('valor', SECRET);

    expect(() => decryptSecret(encrypted, 'outra-chave')).toThrow();
    expect(() =>
      decryptSecret(`${encrypted.slice(0, -4)}AAAA`, SECRET),
    ).toThrow();
  });

  it('Dado mesmo texto cifrado duas vezes, Quando comparar, Então saídas diferentes (IV aleatório)', () => {
    expect(encryptSecret('x', SECRET)).not.toBe(encryptSecret('x', SECRET));
  });
});

describe('Feature: Helpers null-safe de cifra e detecção de payload cifrado', () => {
  it('Dado valor null, Quando encryptField, Então retorna null sem cifrar', () => {
    expect(encryptField(null, SECRET)).toBeNull();
  });

  it('Dado valor não nulo, Quando encryptField, Então retorna cifrado equivalente a encryptSecret', () => {
    const encrypted = encryptField('nota clínica sensível', SECRET);

    expect(encrypted).not.toBeNull();
    expect(encrypted).not.toContain('nota clínica sensível');
  });

  it('Dado valor null, Quando decryptField, Então retorna null sem decifrar', () => {
    expect(decryptField(null, SECRET)).toBeNull();
  });

  it('Dado valor cifrado por encryptField, Quando decryptField, Então retorna texto original (round-trip)', () => {
    const encrypted = encryptField('nota clínica sensível', SECRET);

    expect(decryptField(encrypted, SECRET)).toBe('nota clínica sensível');
  });

  it('Dado string vazia, Quando encryptField/decryptField, Então passa direto sem cifrar (sem conteúdo a proteger)', () => {
    expect(encryptField('', SECRET)).toBe('');
    expect(decryptField('', SECRET)).toBe('');
  });

  it('Dado payload cifrado válido com a mesma secret, Quando isEncryptedPayload, Então true', () => {
    const encrypted = encryptSecret('valor', SECRET);

    expect(isEncryptedPayload(encrypted, SECRET)).toBe(true);
  });

  it('Dado texto plano (formato não bate com iv.tag.ciphertext), Quando isEncryptedPayload, Então false', () => {
    expect(isEncryptedPayload('nota clínica em claro', SECRET)).toBe(false);
    expect(isEncryptedPayload('', SECRET)).toBe(false);
    expect(isEncryptedPayload('a.b', SECRET)).toBe(false);
    expect(isEncryptedPayload('a.b.c', SECRET)).toBe(false);
  });

  it('Dado texto plano que só coincide no FORMATO com iv.tag.ciphertext (3 segmentos base64url plausíveis), Quando isEncryptedPayload, Então false — checagem exige autenticação GCM real, não só forma (evita a migração pular linha em claro)', () => {
    // 16 bytes / 16 bytes / N bytes em base64url, mesma forma estrutural de um payload
    // real de `encryptSecret` — mas nunca passou por cifra: não pode ser aceito como
    // "já cifrado", ou a migração (#72) deixaria a linha em claro pra sempre.
    const lookalike = [
      Buffer.alloc(12, 1).toString('base64url'),
      Buffer.alloc(16, 2).toString('base64url'),
      Buffer.from('nota clínica', 'utf8').toString('base64url'),
    ].join('.');

    expect(isEncryptedPayload(lookalike, SECRET)).toBe(false);
  });

  it('Dado payload cifrado com OUTRA secret, Quando isEncryptedPayload com a secret vigente, Então false (tag de autenticação não bate)', () => {
    const encryptedWithOtherSecret = encryptSecret(
      'valor',
      'outra-secret-diferente-0000000000',
    );

    expect(isEncryptedPayload(encryptedWithOtherSecret, SECRET)).toBe(false);
  });
});

describe('Feature: Rate limiting de janela fixa', () => {
  it('Dado limite 3/janela, Quando 4ª requisição na janela, Então bloqueia', () => {
    const limiter = new RateLimiter(3, 60_000);
    const now = 1_000_000;

    expect(limiter.allow('ip1', now)).toBe(true);
    expect(limiter.allow('ip1', now + 1)).toBe(true);
    expect(limiter.allow('ip1', now + 2)).toBe(true);
    expect(limiter.allow('ip1', now + 3)).toBe(false);
  });

  it('Dado janela expirada, Quando nova requisição, Então libera novamente', () => {
    const limiter = new RateLimiter(1, 1_000);

    expect(limiter.allow('ip1', 0)).toBe(true);
    expect(limiter.allow('ip1', 500)).toBe(false);
    expect(limiter.allow('ip1', 1_001)).toBe(true);
  });

  it('Dado chaves diferentes, Quando limitar, Então contadores independentes', () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.allow('ip1', 0)).toBe(true);
    expect(limiter.allow('ip2', 0)).toBe(true);
  });
});

describe('Feature: Criptografia de segredos — payload malformado', () => {
  it('Dado payload cifrado sem as 3 partes esperadas, Quando decifrar, Então lança erro de formato', () => {
    expect(() => decryptSecret('apenas-uma-parte', SECRET)).toThrow(
      'Segredo cifrado em formato inválido',
    );
    expect(() => decryptSecret('iv.tag', SECRET)).toThrow(
      'Segredo cifrado em formato inválido',
    );
  });

  it('Dado tag de autenticação truncada, Quando decifrar, Então rejeita como formato inválido (não como falha de auth)', () => {
    const encrypted = encryptSecret('valor', SECRET);
    const [iv, tag, data] = encrypted.split('.');
    const truncated = Buffer.from(tag, 'base64url')
      .subarray(0, 4)
      .toString('base64url');

    // GCM aceita tags de 4/8/12..16 bytes por padrão — truncar enfraquece a
    // autenticação. O tamanho é fixado em 16 bytes, então a rejeição acontece
    // na validação de formato, antes de qualquer tentativa de decifragem.
    expect(() =>
      decryptSecret([iv, truncated, data].join('.'), SECRET),
    ).toThrow('Segredo cifrado em formato inválido');
  });

  it('Dado IV de tamanho inesperado, Quando decifrar, Então rejeita como formato inválido', () => {
    const encrypted = encryptSecret('valor', SECRET);
    const [iv, tag, data] = encrypted.split('.');
    const shortIv = Buffer.from(iv, 'base64url')
      .subarray(0, 8)
      .toString('base64url');

    expect(() => decryptSecret([shortIv, tag, data].join('.'), SECRET)).toThrow(
      'Segredo cifrado em formato inválido',
    );
  });

  it('Dado payload cifrado no formato anterior a authTagLength, Quando decifrar, Então continua funcionando', () => {
    // Compatibilidade retroativa de verdade: cifra reproduzindo o código ANTERIOR
    // (createCipheriv sem authTagLength) e decifra com a implementação atual.
    // Cifrar com `encryptSecret` provaria apenas que o helper novo lê a própria saída.
    const legacy = encryptSecretPreAuthTagLength(
      'refresh-token-legado',
      SECRET,
    );

    expect(Buffer.from(legacy.split('.')[1], 'base64url')).toHaveLength(16);
    expect(decryptSecret(legacy, SECRET)).toBe('refresh-token-legado');
  });
});

describe('Feature: Hash e verificação de senha (scrypt)', () => {
  it('Dado uma senha, Quando hashPassword e verifyPassword, Então valida corretamente e rejeita senha errada', async () => {
    const hash = await hashPassword('s3nh@forte');

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('s3nh@forte', hash)).toBe(true);
    expect(await verifyPassword('senha-errada', hash)).toBe(false);
  });

  it('Dado hash com formato inválido, Quando verifyPassword, Então retorna false', async () => {
    expect(await verifyPassword('qualquer', 'formato-invalido')).toBe(false);
    expect(await verifyPassword('qualquer', 'bcrypt$10$salt$hash')).toBe(false);
  });

  it('Dado hash com custo fora do intervalo permitido, Quando verifyPassword, Então retorna false', async () => {
    expect(await verifyPassword('qualquer', 'scrypt$500$salt$abcd')).toBe(
      false,
    );
    expect(await verifyPassword('qualquer', 'scrypt$2000000$salt$abcd')).toBe(
      false,
    );
    expect(
      await verifyPassword('qualquer', 'scrypt$naoenumero$salt$abcd'),
    ).toBe(false);
  });

  it('Dado hash com custo não potência de dois, Quando verifyPassword, Então scrypt lança e retorna false', async () => {
    expect(await verifyPassword('qualquer', 'scrypt$1030$salt$abcd')).toBe(
      false,
    );
  });
});
