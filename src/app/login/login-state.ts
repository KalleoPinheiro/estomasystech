import {
  SESSION_EXPIRED_ERROR,
  SESSION_EXPIRED_MESSAGE,
  safeNextPath,
} from '@/lib/login-redirect';

export type LoginSearchParams = Record<string, string | string[] | undefined>;

// Allowlist de mensagens de erro (LOG-02): nunca renderiza o valor bruto de
// `?error=` — texto arbitrário da URL dentro da marca é vetor de phishing por
// texto refletido, mesmo sem XSS (React já escapa).
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  [SESSION_EXPIRED_ERROR]: SESSION_EXPIRED_MESSAGE,
};
const GENERIC_LOGIN_ERROR =
  'Não foi possível concluir a operação. Tente novamente.';

function first(value: string | string[] | undefined): string | null {
  const one = Array.isArray(value) ? value[0] : value;
  return one ?? null;
}

/** Estado da tela de login resolvido no servidor, sem chamada de API. */
export function resolveLoginState(
  params: LoginSearchParams,
  passwordEnabled: boolean,
) {
  const code = first(params.error);
  return {
    passwordEnabled,
    errorMessage: code
      ? (LOGIN_ERROR_MESSAGES[code] ?? GENERIC_LOGIN_ERROR)
      : null,
    destination: safeNextPath(first(params.next)) ?? '/',
  };
}
