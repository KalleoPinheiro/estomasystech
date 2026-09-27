import type { NextRequest } from 'next/server';
import { SendReminders } from '@/application/reminders/send-reminders';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { passwordMatches } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';

/**
 * Disparo do job de lembretes (cron externo). Dois formatos, mesmo segredo:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/reminders/run
 *   GET com `Authorization: Bearer $CRON_SECRET` — o que o Vercel Cron envia
 *   (`vercel.json`, #206).
 * Sem CRON_SECRET configurado, a rota fica desativada (503). Lembretes saem
 * por e-mail (Resend), empresa a empresa; sem Resend fora de produção, dry-run.
 */
export async function POST(request: NextRequest) {
  return runReminders(request.headers.get('x-cron-secret') ?? '');
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  return runReminders(bearer);
}

async function runReminders(provided: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail(
      'CRON_SECRET não configurado — job de lembretes desativado',
      503,
    );
  }
  // Comparação em tempo constante — mesmo tratamento das demais credenciais.
  if (!passwordMatches(secret, provided)) {
    return fail('Não autorizado', 401);
  }

  return handleRequest(async () => {
    // Listar as empresas é a única leitura cross-empresa; todo o resto do job
    // roda no escopo de cada uma (N3).
    const { clinics, email } = await getRepositories(systemScope());
    const all = await clinics.findAll();
    return new SendReminders(
      all.map((clinic) => ({
        id: clinic.id,
        name: clinic.name,
        status: clinic.status,
      })),
      (clinicId) => getRepositories(clinicScope(clinicId)),
      email,
    ).execute();
  });
}
