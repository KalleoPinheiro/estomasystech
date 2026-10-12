import type { NextRequest } from 'next/server';
import {
  type AlertKey,
  alertConfigFromEnv,
  EvaluateAlerts,
} from '@/application/monitoring/evaluate-alerts';
import { getRepositories } from '@/infrastructure/container';
import { platformEmailGateway } from '@/infrastructure/email/resend-email-gateway';
import { checkReadiness } from '@/infrastructure/persistence/drizzle/readiness';
import { fail, handleRequest } from '@/lib/api-response';
import { passwordMatches } from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { countSignals } from '@/lib/observability/signals';

/**
 * Alertas por e-mail ao operador (#212), chamado pelo cron do host a cada
 * 5 minutos, com o mesmo segredo dos outros jobs:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/alerts/run
 *   GET com `Authorization: Bearer $CRON_SECRET`.
 * Sem CRON_SECRET, 503. O e-mail sai pelo canal da plataforma (ADR-011), que
 * não depende do banco: banco fora do ar ainda vira alerta.
 */
export async function POST(request: NextRequest) {
  return runAlerts(request.headers.get('x-cron-secret') ?? '');
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  return runAlerts(bearer);
}

/** Último envio de cada alerta, por processo (uma réplica, #206). */
const globalForAlerts = globalThis as unknown as {
  vittaAlertsNotified?: Map<AlertKey, number>;
};

async function runAlerts(provided: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail('CRON_SECRET não configurado — alertas desativados', 503);
  }
  if (!passwordMatches(secret, provided)) {
    return fail('Não autorizado', 401);
  }

  return handleRequest(() => {
    globalForAlerts.vittaAlertsNotified ??= new Map();
    return new EvaluateAlerts(
      {
        readiness: () => checkReadiness(),
        // Tabela de plataforma (sem empresa): o escopo de sistema só a lê.
        lastRemindersRun: async () =>
          (await getRepositories(systemScope())).jobRuns.lastRun('reminders'),
        countSignals,
      },
      platformEmailGateway(),
      alertConfigFromEnv(),
      globalForAlerts.vittaAlertsNotified,
    ).execute();
  });
}
