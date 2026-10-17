import { ValidationError } from './errors';

const MIN_NAME_LENGTH = 3;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * E-mail de contato opcional (#325): vazio vira `null`; preenchido segue a
 * mesma regra de formato do e-mail obrigatório.
 */
export function normalizeOptionalEmail(
  raw: string | null | undefined,
): string | null {
  const email = raw?.trim().toLowerCase() ?? '';
  if (email.length === 0) {
    return null;
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError(`Email inválido: ${raw}`);
  }
  return email;
}

export interface PersonContact {
  fullName: string;
  email: string;
  phone: string;
}

/** Nome e telefone: a parte do contato comum a quem tem ou não e-mail. */
export function validateNameAndPhone(props: {
  fullName: string;
  phone: string;
}): { fullName: string; phone: string } {
  const fullName = props.fullName.trim();
  const phone = props.phone.trim();

  if (fullName.length < MIN_NAME_LENGTH) {
    throw new ValidationError(
      `Nome deve ter pelo menos ${MIN_NAME_LENGTH} caracteres`,
    );
  }
  if (phone.length === 0) {
    throw new ValidationError('Telefone é obrigatório');
  }
  return { fullName, phone };
}

/** Validação/normalização comum a pessoas do domínio (Partner). */
export function validatePersonContact(props: PersonContact): PersonContact {
  const email = props.email.trim().toLowerCase();
  const { fullName, phone } = validateNameAndPhone(props);
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError(`Email inválido: ${props.email}`);
  }
  return { fullName, email, phone };
}
