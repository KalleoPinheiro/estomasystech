import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import type { CalendarIntegrationStatusDto } from '@/lib/dto';

/** Status da conexão do Google Agenda da clínica (issue #124) — nunca é preciso consultar o banco pra saber se conectou. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async (): Promise<CalendarIntegrationStatusDto> => {
    const { googleAccounts } = await getRepositories({
      clinicId: guard.session?.clinicId ?? null,
    });
    const account = await googleAccounts.findMostRecent();
    return account
      ? {
          connected: true,
          email: account.email,
          connectedAt: account.connectedAt.toISOString(),
        }
      : { connected: false, email: null, connectedAt: null };
  });
}
