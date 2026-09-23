import type { NextRequest } from 'next/server';
import { SendReminders } from '@/application/reminders/send-reminders';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { passwordMatches } from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';

/**
 * Disparo do job de lembretes (cron externo):
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/reminders/run
 * Sem CRON_SECRET configurado, a rota fica desativada (503).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail(
      'CRON_SECRET não configurado — job de lembretes desativado',
      503,
    );
  }
  // Comparação em tempo constante — mesmo tratamento das demais credenciais.
  if (!passwordMatches(secret, request.headers.get('x-cron-secret') ?? '')) {
    return fail('Não autorizado', 401);
  }

  return handleRequest(async () => {
    const { appointments, followUps, patients, reminderLog, messaging } =
      await getRepositories(systemScope());
    return new SendReminders(
      appointments,
      followUps,
      patients,
      reminderLog,
      messaging,
    ).execute();
  });
}
