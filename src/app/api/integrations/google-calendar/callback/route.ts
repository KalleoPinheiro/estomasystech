import { type NextRequest, NextResponse } from 'next/server';
import { currentDataCipher, getRepositories } from '@/infrastructure/container';
import {
  CALENDAR_OAUTH_STATE_COOKIE,
  decodeCalendarOAuthState,
  type GoogleCalendarOAuthConfig,
  googleCalendarOAuthConfigFromEnv,
  publicBaseUrl,
} from '@/lib/auth/google-calendar-oauth';
import { createOAuthClient } from '@/lib/auth/google-oauth-client';
import { requireStaffSession } from '@/lib/auth/require-session';
import {
  expiredCookieOptions,
  getAuthConfig,
  type Session,
} from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { logError } from '@/lib/log-error';

/** Códigos de falha do fluxo OAuth (issue #124) — a página lê `reason` de uma allowlist própria, nunca texto bruto. */
type CalendarConnectReason =
  | 'nao_configurado'
  | 'fluxo_invalido'
  | 'sem_credencial'
  | 'falha_conexao';

/** Falha do fluxo OAuth sempre volta pro app com mensagem visível — nunca JSON cru fora dele (issue #124). */
function redirectWithReason(
  request: NextRequest,
  reason: CalendarConnectReason,
): NextResponse {
  const url = new URL('/configuracoes', publicBaseUrl(request.url));
  url.searchParams.set('calendar', 'erro');
  url.searchParams.set('reason', reason);
  return NextResponse.redirect(url);
}

function clearState(response: NextResponse): NextResponse {
  response.cookies.set(CALENDAR_OAUTH_STATE_COOKIE, '', expiredCookieOptions());
  return response;
}

/**
 * Valida `code`, o `state` anti-CSRF e — igualmente importante — que a sessão
 * do retorno é a MESMA que iniciou o fluxo. Sem essa segunda checagem, trocar
 * de conta entre o redirect e o callback gravaria a credencial do Google sob a
 * conta errada, possivelmente de outra empresa.
 */
function extractValidatedCode(
  request: NextRequest,
  subject: string,
): string | null {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const expected = decodeCalendarOAuthState(
    request.cookies.get(CALENDAR_OAUTH_STATE_COOKIE)?.value,
  );
  if (!code || !state || !expected) {
    return null;
  }
  if (state !== expected.state || subject !== expected.subject) {
    return null;
  }
  return code;
}

interface CredentialOwner {
  subject: string;
  clinicId: string | null;
}

/**
 * Dono da credencial = a sessão nativa que iniciou o fluxo.
 */
function credentialOwner(session: Session): CredentialOwner {
  return { subject: session.subject, clinicId: session.clinicId };
}

/**
 * Troca o `code` pelo refresh token e persiste a credencial cifrada sob o dono
 * informado. Extraída do handler para manter a complexidade dele dentro do
 * limite do projeto — a guarda de sessão, a de config e a de `state` já vivem
 * lá, e este trecho tem o próprio ramo de erro.
 */
async function persistCalendarCredential(
  config: GoogleCalendarOAuthConfig,
  code: string,
  owner: CredentialOwner,
): Promise<'ok' | 'sem_credencial'> {
  const { tokens } = await createOAuthClient(config).getToken(code);
  if (!tokens.refresh_token) {
    return 'sem_credencial';
  }

  // Titular da credencial é a sessão nativa, não uma identidade do Google.
  const { googleAccounts } = await getRepositories(sessionScope(owner));
  await googleAccounts.save({
    email: owner.subject,
    // Chave de dados (#195, ADR-006), não o AUTH_SECRET da sessão.
    encryptedRefreshToken: currentDataCipher().encrypt(tokens.refresh_token),
    connectedAt: new Date(),
  });
  return 'ok';
}

/**
 * Conclusão da conexão do Google Agenda. Guarda apenas o refresh token cifrado
 * sob o `subject` da sessão que iniciou o fluxo. **Nunca** emite, renova ou
 * troca cookie de sessão: quem já está autenticado continua exatamente com a
 * mesma sessão que tinha (AUTH-18).
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const config = googleCalendarOAuthConfigFromEnv();
  const auth = getAuthConfig();
  if (!config || !auth) {
    return redirectWithReason(request, 'nao_configurado');
  }

  const owner = credentialOwner(guard.session);
  const code = extractValidatedCode(request, owner.subject);
  if (!code) {
    return clearState(redirectWithReason(request, 'fluxo_invalido'));
  }

  try {
    const result = await persistCalendarCredential(config, code, owner);
    return clearState(
      result === 'ok'
        ? NextResponse.redirect(
            new URL(
              '/configuracoes?calendar=conectado',
              publicBaseUrl(request.url),
            ),
          )
        : redirectWithReason(request, result),
    );
  } catch (error) {
    logError('Google Agenda: falha ao concluir a conexão', error);
    return clearState(redirectWithReason(request, 'falha_conexao'));
  }
}
