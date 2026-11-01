import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { googleCalendarOAuthConfigFromEnv } from '@/lib/auth/google-calendar-oauth';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import type { CalendarIntegrationStatusDto } from '@/lib/dto';

/** Status da conexão do Google Agenda da clínica (issue #124) — nunca é preciso consultar o banco pra saber se conectou. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async (): Promise<CalendarIntegrationStatusDto> => {
    const { googleAccounts } = await getRepositories(
      sessionScope(guard.session),
    );
    const account = await googleAccounts.findMostRecent();
    const configured = googleCalendarOAuthConfigFromEnv() !== null;
    return account
      ? {
          configured,
          connected: true,
          email: account.email,
          connectedAt: account.connectedAt.toISOString(),
        }
      : { configured, connected: false, email: null, connectedAt: null };
  });
}
