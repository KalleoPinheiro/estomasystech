/**
 * Ida ao login com volta ao lugar (issue #207). Puro na carga do módulo: o
 * proxy (borda) e o cliente (`apiFetch`, página de login) leem as mesmas
 * regras de `next` — um validador só contra open redirect.
 */

export const SESSION_EXPIRED_ERROR = 'session_expired';
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

/**
 * Páginas sem sessão: um 401 nelas é resposta do próprio fluxo (senha errada,
 * código MFA vencido), não sessão expirada — nunca redireciona a partir delas
 * nem volta para elas depois do login.
 */
const AUTH_PAGES = ['/login', '/definir-senha', '/esqueci-senha'] as const;

const SAME_ORIGIN = 'http://vitta.invalid';

/** Barra final ignorada: `/login/` também é a tela de login. */
const isAuthPage = (pathname: string): boolean => {
  const path = pathname.replace(/\/+$/, '');
  return AUTH_PAGES.some((page) => path === page);
};

/**
 * `next` aceito só se for caminho interno: começa com uma `/` (não `//` nem
 * `/\`, que o navegador lê como outro host), sem caractere de controle e
 * resolvendo na mesma origem. Qualquer outra coisa vira `null` — o chamador
 * cai no destino padrão.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw?.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return null;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejeitar \t/\n/\r etc. é o objetivo — o parser de URL os descarta e `/\t/evil.com` viraria `//evil.com`.
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, SAME_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== SAME_ORIGIN || isAuthPage(url.pathname)) {
    return null;
  }
  const path = `${url.pathname}${url.search}${url.hash}`;
  // A normalização pode recriar `//` (`/.//evil.com` → `//evil.com`).
  return path === '/' || path.startsWith('//') ? null : path;
}

/** `/login` com o motivo e o caminho de volta (só os válidos entram na URL). */
export function loginPath(options: {
  error?: typeof SESSION_EXPIRED_ERROR;
  next?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options.error) {
    params.set('error', options.error);
  }
  const next = safeNextPath(options.next);
  if (next) {
    params.set('next', next);
  }
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

/**
 * Sessão expirou numa chamada de API: navegação completa até o login,
 * guardando a rota atual. Devolve `false` (e não navega) fora do navegador ou
 * quando a página atual já é uma tela sem sessão.
 */
export function redirectToLoginOnExpiredSession(
  navigate: (url: string) => void = (url) => window.location.assign(url),
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const { pathname, search, hash } = window.location;
  if (isAuthPage(pathname)) {
    return false;
  }
  navigate(
    loginPath({
      error: SESSION_EXPIRED_ERROR,
      next: `${pathname}${search}${hash}`,
    }),
  );
  return true;
}
