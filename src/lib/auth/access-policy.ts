import type { UserRole } from '@/domain/auth/user-role';
import { classifyRoute, isFamilyAllowedForRole } from './route-family';
import { getAuthConfig } from './session';

/**
 * Política de acesso do VittaFlow — fonte única consumida pelas DUAS camadas de
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
  // A própria rota exige o segredo `VITTA_BOOTSTRAP_TOKEN` e só funciona
  // enquanto a instalação está vazia.
  '/api/auth/bootstrap',
  // Cron externo — a própria rota exige o header x-cron-secret (CRON_SECRET).
  '/api/reminders/run',
] as const;

/** Rotas acessíveis a qualquer papel autenticado; todo o resto é exclusivo do admin (equipe). */
export const SHARED_PATH_PREFIXES = [
  '/portal',
  '/api/portal',
  '/api/auth/logout',
] as const;

export const UNAUTHENTICATED_MESSAGE = 'Não autenticado';
export const STAFF_ONLY_MESSAGE = 'Acesso restrito à equipe da clínica';
/** Distinto de STAFF_ONLY_MESSAGE: a sessão É da equipe, mas o papel não acessa esta família de rota (RBAC-16). */
export const ROLE_FAMILY_DENIED_MESSAGE =
  'Seu papel não tem acesso a este recurso';
export const AUTH_NOT_CONFIGURED_MESSAGE =
  'Autenticação não configurada: defina AUTH_SECRET';

/**
 * Opt-in explícito para rodar SEM autenticação (desenvolvimento, testes E2E do
 * cenário "modo aberto"). Sem esta variável o app é fail-closed: auth ausente
 * responde 503 em vez de liberar o prontuário. Antes, bastava `NODE_ENV` não ser
 * "production" — um deploy self-hosted que esquecesse essa variável ficava aberto.
 */
export const ALLOW_OPEN_MODE_ENV = 'VITTA_ALLOW_OPEN_MODE';

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
 * - `open`: sem autenticação configurada, liberado (só fora de produção).
 * - `unconfigured`: sem autenticação configurada e sem liberação — responde 503.
 */
export type AuthMode = 'configured' | 'open' | 'unconfigured';

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

let warnedAuthDisabled = false;

function warnAuthDisabledOnce(): void {
  if (warnedAuthDisabled) {
    return;
  }
  warnedAuthDisabled = true;
  console.warn(
    `⚠ Autenticação DESATIVADA por ${ALLOW_OPEN_MODE_ENV}=true — nenhuma rota exige sessão (permitido apenas fora de produção)`,
  );
}

/** Só para testes: zera o estado do aviso "uma vez por processo". */
export function resetAuthModeWarning(): void {
  warnedAuthDisabled = false;
}

/**
 * Autenticação utilizável = segredo de assinatura de sessão presente. Depois da
 * remoção do login Google e da senha mestre (ADR-004), toda credencial vive no
 * banco: nenhuma outra variável de ambiente participa da decisão.
 */
function isAuthUsable(): boolean {
  return getAuthConfig() !== null;
}

export function resolveAuthMode(): AuthMode {
  if (isAuthUsable()) {
    return 'configured';
  }
  // Fail-closed: liberar exige NÃO ser produção E o opt-in explícito.
  if (isProduction() || process.env[ALLOW_OPEN_MODE_ENV] !== 'true') {
    return 'unconfigured';
  }
  warnAuthDisabledOnce();
  return 'open';
}
