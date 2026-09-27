import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * @deprecated Formato ANTERIOR ao #195 (`iv.tag.ct`, chave = sha256 do
 * AUTH_SECRET). Nenhum código de produção grava mais neste formato: use
 * `DataCipher` (`src/lib/data-cipher.ts`, ADR-006), que também lê este
 * formato. Mantido como referência do legado e para gerar fixtures nos testes.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
/**
 * GCM aceita tags de 4, 8 e 12..16 bytes. Deixar o tamanho implícito permite que um
 * payload adulterado chegue com tag truncada — o que reduz o custo de forjar uma tag
 * válida. Fixar em 16 bytes (o máximo, e o default do Node ao cifrar) mantém todo
 * payload já existente decifrável e rejeita os truncados.
 */
const AUTH_TAG_LENGTH = 16;

const deriveKey = (secret: string): Buffer =>
  createHash('sha256').update(secret).digest();

/** Cifra um segredo (ex.: refresh token do Google) para armazenamento em repouso. */
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Segredo cifrado em formato inválido');
  }

  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  // Validado antes de decifrar: com tamanhos inesperados o Node ou aceita em silêncio
  // (IV curto) ou falha com erro genérico de autenticação (tag truncada).
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Segredo cifrado em formato inválido');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Wrapper null-safe de `encryptSecret` — usado nos campos clínicos que aceitam `null`.
 * String vazia passa direto também: `decryptSecret` valida `dataPart` com checagem de
 * falsy, então um ciphertext de texto vazio (`iv.tag.` sem `dataPart`) seria rejeitado
 * como formato inválido na leitura — e não há conteúdo sensível em "" para proteger.
 */
export function encryptField(
  value: string | null,
  secret: string,
): string | null {
  return value === null || value === '' ? value : encryptSecret(value, secret);
}

/** Wrapper null-safe de `decryptSecret` — usado nos campos clínicos que aceitam `null`. */
export function decryptField(
  value: string | null,
  secret: string,
): string | null {
  return value === null || value === '' ? value : decryptSecret(value, secret);
}

/**
 * Detecta se um valor já está cifrado (formato `iv.tag.ciphertext` produzido por
 * `encryptSecret` E autenticado pela mesma `secret`) — usado pelo script de migração
 * de dado pra pular linhas já cifradas (idempotência).
 *
 * Exige a tentativa real de decifra (não só checagem de formato): um texto plano
 * gravado pela equipe pode coincidir por acaso com o formato `x.y.z` em base64url
 * (3 segmentos, tamanhos plausíveis) sem jamais ter sido cifrado — aceitar isso só
 * pelo formato faria a migração PULAR a linha e deixá-la em claro pra sempre
 * (CWE-311). A tag de autenticação do GCM é o único jeito de confirmar que o
 * payload veio de `encryptSecret` com esta `secret`.
 */
export function isEncryptedPayload(value: string, secret: string): boolean {
  try {
    decryptSecret(value, secret);
    return true;
  } catch {
    return false;
  }
}
