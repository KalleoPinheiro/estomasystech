import { NextResponse } from 'next/server';
import { checkReadiness } from '@/infrastructure/persistence/drizzle/readiness';

/**
 * Readiness (#212): banco responde e as migrações estão aplicadas. `200`
 * pronto, `503` não. Pública e sem dado sensível; é o alvo do verificador de
 * uptime externo e um dos sinais do alerta por e-mail (`/api/alerts/run`).
 */
export async function GET() {
  const report = await checkReadiness();
  const checks = { database: report.database, migrations: report.migrations };
  return NextResponse.json(
    report.ready
      ? { success: true, data: checks, error: null }
      : { success: false, data: checks, error: 'Serviço indisponível' },
    { status: report.ready ? 200 : 503 },
  );
}
