import type { NextRequest } from 'next/server';
import { RunRetention } from '@/application/retention/run-retention';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { passwordMatches } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';

/**
 * Job de retenção e anonimização (#294), pelo mesmo mecanismo do cron de
 * lembretes e com o mesmo segredo:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/retention/run
 *   GET com `Authorization: Bearer $CRON_SECRET` (formato do Vercel Cron).
 * Sem CRON_SECRET configurado, a rota fica desativada (503). Clínica suspensa
 * também é processada: o prazo é legal, não depende do estado da empresa.
 */
export async function POST(request: NextRequest) {
  return runRetention(request.headers.get('x-cron-secret') ?? '');
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  return runRetention(bearer);
}

async function runRetention(provided: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail(
      'CRON_SECRET não configurado — job de retenção desativado',
      503,
    );
  }
  if (!passwordMatches(secret, provided)) {
    return fail('Não autorizado', 401);
  }

  return handleRequest(async () => {
    // Escopo de sistema só para listar as empresas e tratar a trilha de
    // plataforma (eventos sem empresa); o resto roda no escopo de cada uma.
    const { clinics } = await getRepositories(systemScope());
    const all = await clinics.findAll();
    return new RunRetention(
      all.map((clinic) => clinic.id),
      (clinicId) => getRepositories(clinicScope(clinicId)),
      () => getRepositories(systemScope()),
    ).execute();
  });
}
