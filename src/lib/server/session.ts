import 'server-only';
import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { cache } from 'react';
import type { UserRole } from '@/domain/auth/user-role';
import { AUTH_NOT_CONFIGURED_MESSAGE } from '@/lib/auth/access-policy';
import { ACTING_PATIENT_COOKIE } from '@/lib/auth/acting-patient';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import {
  getAuthConfig,
  SESSION_COOKIE,
  type Session,
  verifySessionToken,
} from '@/lib/auth/session';
import { isSessionRevoked } from '@/lib/auth/staff-revocation';
import { isStaffRole } from '@/lib/auth/staff-roles';
import { loginPath, SESSION_EXPIRED_ERROR } from '@/lib/login-redirect';
import { canRoleAccess, staffPageFor } from '@/lib/staff-pages';

/**
 * Sessão no servidor para páginas e Server Actions (ADR-069 § 1). Lê o cookie
 * por `cookies()` — as rotas leem por `NextRequest` — e passa pela MESMA
 * verificação (`verifySessionToken`) e pela MESMA revogação do proxy
 * (`isSessionRevoked`, ADR-005): sessão de conta desativada ou de clínica
 * suspensa não renderiza página nem executa ação. Sem `AUTH_SECRET` falha
 * fechado (ADR-002).
 */
export type SessionState =
  | { status: 'active'; session: Session }
  | { status: 'anonymous'; expired: boolean };

/**
 * Lida uma vez por requisição: `React.cache()` deduplica layout, páginas e
 * componentes da mesma renderização, então o cookie é verificado e a conta
 * consultada uma única vez. Nunca guarda nada entre requisições (ADR-069 § 3).
 */
export const readSession = cache(async (): Promise<SessionState> => {
  const auth = getAuthConfig();
  if (!auth) {
    throw new Error(AUTH_NOT_CONFIGURED_MESSAGE);
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(auth.secret, token);
  if (!session || (await isSessionRevoked(session))) {
    // Havia cookie (vencido, inválido ou revogado) → a tela de login diz por quê.
    return { status: 'anonymous', expired: token !== undefined };
  }
  return { status: 'active', session };
});

interface PageGuardOptions {
  /** Caminho de volta depois do login (`/login?next=…`); só caminho interno vale. */
  next?: string;
}

async function requireSession(options: PageGuardOptions): Promise<Session> {
  const state = await readSession();
  if (state.status === 'anonymous') {
    redirect(
      loginPath({
        error: state.expired ? SESSION_EXPIRED_ERROR : undefined,
        next: options.next,
      }),
    );
  }
  return state.session;
}

const hasRole = (
  session: Session,
  roles: readonly UserRole[] | undefined,
): boolean => roles === undefined || roles.includes(session.role);

/**
 * Página da equipe da clínica. Sem sessão → `/login?next=…`; sessão de outra
 * família (portal, plataforma) ou papel fora de `roles` → `forbidden()` (403).
 * O super_admin é operador da plataforma e não entra em tela da clínica (ADR-007).
 */
export async function requireStaffPage(
  options: PageGuardOptions & { roles?: readonly UserRole[] } = {},
): Promise<Session> {
  const session = await requireSession(options);
  if (
    !isStaffRole(session.role) ||
    session.role === 'super_admin' ||
    !hasRole(session, options.roles)
  ) {
    forbidden();
  }
  return session;
}

/**
 * Tela da equipe pelo caminho (`/faturamento`): além de exigir a equipe da
 * clínica, aplica a MESMA matriz de papéis da API a essa tela (`STAFF_PAGES`,
 * #199). Vai no `layout.tsx` do segmento, então o papel sem acesso recebe o
 * 403 (`forbidden.tsx`) sem a página montar nem chamar a API — esconder no
 * cliente depois de carregar não existe mais (#545). Caminho fora do mapa só
 * exige a equipe.
 */
export async function requireStaffPageFor(href: string): Promise<Session> {
  const session = await requireStaffPage({ next: href });
  const page = staffPageFor(href);
  if (page && !canRoleAccess(page.api, session.role)) {
    forbidden();
  }
  return session;
}

/**
 * Página aberta a qualquer sessão (equipe, portal ou plataforma): só exige
 * entrar. Quem decide o que mostrar por papel é a própria página (ex.: `/portal`
 * leva a equipe de volta ao sistema da clínica, #553).
 */
export async function requireSignedInPage(
  options: PageGuardOptions = {},
): Promise<Session> {
  return requireSession(options);
}

/** Página do portal (paciente, responsável ou parceiro); `roles` restringe a um subconjunto. */
export async function requirePortalPage(
  options: PageGuardOptions & { roles?: readonly UserRole[] } = {},
): Promise<Session> {
  const session = await requireSession(options);
  const portalRoles: readonly UserRole[] = ['patient', 'guardian', 'partner'];
  if (!portalRoles.includes(session.role) || !hasRole(session, options.roles)) {
    forbidden();
  }
  return session;
}

/**
 * Página do portal do paciente: sessão de paciente ou responsável, com o
 * paciente em nome de quem o responsável age (cookie, ADR-027) — o mesmo que
 * `requirePatientPortalSession` monta nas rotas. O cookie é só um id: cada
 * leitura o revalida contra o vínculo do responsável.
 */
export async function requirePatientPortalPage(): Promise<PatientPortalSession> {
  return withActingPatient(
    await requirePortalPage({ roles: ['patient', 'guardian'] }),
  );
}

/**
 * A sessão do portal com o paciente em nome de quem o responsável age (cookie,
 * ADR-027). Vale para página e para Server Action: a ação lê o mesmo cookie
 * que as rotas leem do `NextRequest`, e cada resolução o revalida no vínculo.
 */
export async function withActingPatient(
  session: Session,
): Promise<PatientPortalSession> {
  const acting =
    session.role === 'guardian'
      ? ((await cookies()).get(ACTING_PATIENT_COOKIE)?.value ?? null)
      : null;
  return { ...session, actingPatientId: acting };
}

/** Página da plataforma: só o super_admin (ADR-007). */
export async function requirePlatformPage(
  options: PageGuardOptions = {},
): Promise<Session> {
  const session = await requireSession(options);
  if (session.role !== 'super_admin') {
    forbidden();
  }
  return session;
}
