import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Custo do scrypt para senha nova: `N=2^17, r=8, p=1`, o mínimo do OWASP
 * Password Storage Cheat Sheet (#208). Hashes com custo menor (o antigo era
 * `2^14`) continuam validando — o custo vai no próprio hash — e são refeitos
 * com este custo no login bem-sucedido (`needsRehash`).
 */
export const PASSWORD_COST = 131_072;
const BLOCK_SIZE = 8;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MIN_COST = 1024;
const MAX_COST = 1_048_576;

/**
 * O Node recusa o scrypt quando `128 * N * r` passa de `maxmem` (padrão 32
 * MiB); `2^17` com `r=8` pede 128 MiB. O dobro do necessário dá folga ao
 * cálculo aproximado do Node.
 */
const maxmemFor = (cost: number): number => 2 * 128 * cost * BLOCK_SIZE;

const scryptAsync = (
  password: string,
  salt: string,
  cost: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: cost, r: BLOCK_SIZE, p: 1, maxmem: maxmemFor(cost) },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });

/**
 * Hash sentinela de conta que ainda não definiu senha (recém-convidada).
 * Mantém o formato exigido pelo domínio, mas o custo `0` está fora da faixa
 * aceita por `verifyPassword`, então NENHUMA senha satisfaz este hash — a conta
 * só passa a autenticar depois de consumir o convite.
 */
export const UNSET_PASSWORD_HASH = 'scrypt$0$sem-senha$sem-senha';

const DUMMY_SALT = randomBytes(SALT_BYTES).toString('hex');

interface ParsedHash {
  cost: number;
  salt: string;
  hash: string;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    return null;
  }
  const cost = Number(parts[1]);
  if (!Number.isInteger(cost) || cost < MIN_COST || cost > MAX_COST) {
    return null;
  }
  return { cost, salt: parts[2], hash: parts[3] };
}

/**
 * Gera hash no formato `scrypt$custo$salt$hash` (hex). `cost` só muda para
 * segredo de alta entropia (códigos de recuperação); senha usa o padrão.
 */
export async function hashPassword(
  password: string,
  cost: number = PASSWORD_COST,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await scryptAsync(password, salt, cost);
  return `scrypt$${cost}$${salt}$${derived.toString('hex')}`;
}

/**
 * Gasta o mesmo tempo de uma verificação real e responde `false` (#208):
 * login sem conta candidata (ou com hash sem senha usável) não pode responder
 * mais rápido que um com conta — senão o tempo revela quais e-mails existem.
 */
export async function simulatePasswordCheck(password: string): Promise<false> {
  await scryptAsync(password, DUMMY_SALT, PASSWORD_COST).catch(() => null);
  return false;
}

/** Verificação em tempo constante; formato inválido nunca lança — retorna false. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) {
    return simulatePasswordCheck(password);
  }
  try {
    const derived = await scryptAsync(password, parsed.salt, parsed.cost);
    const expected = Buffer.from(parsed.hash, 'hex');
    return (
      expected.length === derived.length && timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

/** Hash válido com custo abaixo do atual: refazer depois de provar a senha. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  return parsed !== null && parsed.cost < PASSWORD_COST;
}
