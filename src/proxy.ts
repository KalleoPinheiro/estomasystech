import { type NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/api-response';
import {
  AUTH_NOT_CONFIGURED_MESSAGE,
  isAllowedForRole,
  isPublicPath,
  ROLE_FAMILY_DENIED_MESSAGE,
  resolveAuthMode,
  STAFF_ONLY_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from '@/lib/auth/access-policy';
import { clientIp } from '@/lib/auth/client-ip';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { getRequestSession } from '@/lib/auth/request-session';
import type { Session } from '@/lib/auth/session';
import { isStaffSessionRevoked } from '@/lib/auth/staff-revocation';
import { isStaffRole } from '@/lib/auth/staff-roles';

/**
 * Camada 1 de autorização (borda). No Next.js 16 este arquivo se chama `proxy.ts`
 * — é o antigo `middleware.ts`, renomeado pelo framework.
 *
 * Checagem OTIMISTA: barra tráfego não autenticado antes de chegar à rota e
 * redireciona páginas para /login. A autorização efetiva de cada rota de API é
 * feita de novo no handler (`src/lib/auth/require-session.ts`), porque a doc do
 * Next é explícita que o proxy não deve ser a única barreira. Ver
 * `docs/adr/002-autorizacao-em-duas-camadas.md`.
 */

// Configurável via env para permitir relaxar em ambientes de teste E2E (muitas
// chamadas de setup em sequência) sem afetar o padrão de produção.
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX) || 120;
// Teto por conta (ou por IP, se anônimo) somado entre réplicas (issues #77 e
// #201). Cada réplica sincroniza com o banco no máximo 1×/s por chave — não
// uma escrita por request.
const API_RATE_LIMIT_SYNC_MS = 1_000;
const API_RATE_LIMIT = new SharedRateLimiter(
  'api',
  API_RATE_LIMIT_MAX,
  60_000,
  undefined,
  API_RATE_LIMIT_SYNC_MS,
);

const isApiPath = (pathname: string): boolean => pathname.startsWith('/api/');

/**
 * Chave do limite geral da API (#201). Autenticado: a conta (empresa +
 * sujeito) — recepção, consultórios e tablets de uma clínica saem pelo mesmo
 * IP público (NAT) e dividiam 120 req/min, com cada tela fazendo de 2 a 8
 * chamadas ao abrir. Anônimo: o IP. Com 8 chamadas por tela, 120/min por conta
 * comportam uma troca de tela a cada 4s sustentada por um minuto.
 */
function apiRateLimitKey(request: NextRequest): string {
  const session = getRequestSession(request);
  if (session) {
    return `acct:${session.clinicId ?? 'system'}:${session.subject}`;
  }
  return `ip:${clientIp(request)}`;
}

function unauthorized(request: NextRequest): NextResponse {
  if (isApiPath(request.nextUrl.pathname)) {
    return fail(UNAUTHENTICATED_MESSAGE, 401);
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

function forbidden(request: NextRequest, session: Session): NextResponse {
  if (isApiPath(request.nextUrl.pathname)) {
    // Equipe sem acesso à família de rota lê a mesma mensagem do handler
    // (#199) — "restrito à equipe" confundia quem É da equipe.
    return fail(
      isStaffRole(session.role)
        ? ROLE_FAMILY_DENIED_MESSAGE
        : STAFF_ONLY_MESSAGE,
      403,
    );
  }
  return NextResponse.redirect(new URL('/portal', request.url));
}

function authNotConfiguredResponse(): NextResponse {
  return fail(AUTH_NOT_CONFIGURED_MESSAGE, 503);
}

/**
 * CSP estrita com nonce por request (issue #76). `strict-dynamic` + nonce
 * bloqueiam injeção de `<script>`/`<style>` mesmo sem `unsafe-inline`. O nonce
 * só existe porque a página é dinamicamente renderizada por request — Next
 * injeta o valor automaticamente nos scripts do próprio framework (ver
 * `layout.tsx`: `dynamic = "force-dynamic"`).
 *
 * `style-src-attr 'unsafe-inline'` (achado do critique de 2026-09-06, issue
 * CSP-01): Radix (via `@still-void/ui`) seta `style={{ pointerEvents: ... }}`
 * no `ToastViewport` — vira atributo `style=""` no DOM, sem passar pelo nonce
 * (React não suporta nonce em `style` inline). Sem essa exceção, o navegador
 * bloqueia e o toast fica sem `pointer-events` correto. `style-src-attr` (CSP
 * nível 3) restringe a permissividade só ao atributo — `style-src-elem`
 * continua exigindo nonce pra qualquer `<style>` injetado, que é o vetor real
 * de CSS injection.
 */
function nextWithCsp(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // unsafe-inline só em dev: HMR/overlay do Next injeta estilo inline sem nonce.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `style-src-elem 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (
    isApiPath(pathname) &&
    !(await API_RATE_LIMIT.allow(apiRateLimitKey(request)))
  ) {
    return fail(
      'Limite de requisições excedido, tente novamente em instantes',
      429,
    );
  }

  if (isPublicPath(pathname)) {
    return nextWithCsp(request);
  }

  const mode = resolveAuthMode();
  if (mode === 'unconfigured') {
    return authNotConfiguredResponse();
  }
  if (mode === 'open') {
    return nextWithCsp(request);
  }

  const session = getRequestSession(request);
  if (!session) {
    return unauthorized(request);
  }
  // Conta staff desativada perde o acesso em ≤ 60s, mesmo com cookie válido.
  if (await isStaffSessionRevoked(session)) {
    return unauthorized(request);
  }
  if (!isAllowedForRole(pathname, session.role)) {
    return forbidden(request, session);
  }

  return nextWithCsp(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
