import type { UserRole } from '@/domain/auth/user-role';
import { classifyRoute, isFamilyAllowedForRole } from './route-family';
import { getAuthConfig } from './session';

/**
 * Política de acesso do EstomaSysTech — fonte única consumida pelas DUAS camadas de
 * autorização:
 *
 *  1. `src/proxy.ts` (borda): checagem otimista antes de a requisição chegar à
 *     rota — barra o tráfego não autenticado cedo e redireciona páginas.
 *  2. `src/lib/auth/require-session.ts` (handler): autorização efetiva dentro de
 *     cada route handler.
 *
 * A doc do Next 16 é explícita: "Proxy is not intended to be used as a full
 * session management or authorization solution" — por isso a camada 2 existe e
 * por isso as duas precisam ler a MESMA política (allowlists divergentes entre
 * camadas seriam pior do que ter uma só).
 *
 * Este módulo é puro (só `pathname` + env, sem `next/server`), então roda tanto
 * no proxy quanto no handler e é testável isoladamente.
 */

/** Caminhos liberados sem sessão — comparação exata, nunca por prefixo. */
export const PUBLIC_PATHS = [
  '/login',
  // Aviso de privacidade (LGPD, art. 9º; #216): informação ao titular, lida antes de entrar.
  '/privacidade',
  // Fluxos de primeiro acesso e recuperação: quem os usa, por definição, não tem sessão.
  '/definir-senha',
  '/esqueci-senha',
  '/api/auth/login',
  '/api/auth/providers',
  '/api/auth/set-password',
  '/api/auth/forgot-password',
  // Segunda etapa do login do super_admin (ADR-007, bloco B2): ainda não há
  // sessão; as rotas exigem o token pendente assinado que o login entrega.
  '/api/auth/mfa/enroll',
  '/api/auth/mfa/verify',
  // Bootstrap do primeiro Super Admin: por definição não há sessão nem conta.
  // A própria rota exige o segredo `ESTOMASYSTECH_BOOTSTRAP_TOKEN` e só funciona
  // enquanto a instalação está vazia.
  '/api/auth/bootstrap',
  // Cron externo — a própria rota exige o header x-cron-secret (CRON_SECRET).
  '/api/reminders/run',
  '/api/retention/run',
  '/api/alerts/run',
  // Health check (#212): liveness e readiness, sem dado sensível.
  '/api/health',
  '/api/health/ready',
  // Instalar na tela inicial (#430): manifesto e ícones da marca, sem dado da clínica.
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
] as const;

/** Rotas acessíveis a qualquer papel autenticado; todo o resto é exclusivo do admin (equipe). */
export const SHARED_PATH_PREFIXES = [
  '/portal',
  '/api/portal',
  '/api/auth/logout',
  '/api/me',
] as const;

export const UNAUTHENTICATED_MESSAGE = 'Não autenticado';
export const STAFF_ONLY_MESSAGE = 'Acesso restrito à equipe da clínica';
/** Distinto de STAFF_ONLY_MESSAGE: a sessão É da equipe, mas o papel não acessa esta família de rota (RBAC-16). */
export const ROLE_FAMILY_DENIED_MESSAGE =
  'Seu papel não tem acesso a este recurso';
export const AUTH_NOT_CONFIGURED_MESSAGE =
  'Autenticação não configurada: defina AUTH_SECRET';

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => path === pathname);
}

export function isSharedPath(pathname: string): boolean {
  return SHARED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Regra grosseira de família de rota por papel (RBAC-05): cada papel acessa
 * só as famílias permitidas pela matriz de `route-family.ts`. A checagem fina
 * (ex.: vínculo do Profissional com um paciente específico, R4) acontece no
 * próprio handler, que tem acesso ao `:id` da rota — esta função não.
 */
export function isAllowedForRole(pathname: string, role: UserRole): boolean {
  return isFamilyAllowedForRole(classifyRoute(pathname), role);
}

/**
 * - `configured`: autenticação utilizável — exige sessão válida.
 * - `unconfigured`: sem `AUTH_SECRET` — fail-closed, responde 503. Não existe
 *   modo "sem autenticação" (ADR-002, #327): nenhuma variável o libera.
 */
export type AuthMode = 'configured' | 'unconfigured';

/**
 * Autenticação utilizável = segredo de assinatura de sessão presente. Depois da
 * remoção do login Google e da senha mestre (ADR-004), toda credencial vive no
 * banco: nenhuma outra variável de ambiente participa da decisão.
 */
function isAuthUsable(): boolean {
  return getAuthConfig() !== null;
}

export function resolveAuthMode(): AuthMode {
  return isAuthUsable() ? 'configured' : 'unconfigured';
}
