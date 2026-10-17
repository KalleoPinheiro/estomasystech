import type { NextRequest } from 'next/server';
import { AlertDataRequestDeadlines } from '@/application/patients/alert-data-request-deadlines';
import { SendReminders } from '@/application/reminders/send-reminders';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { passwordMatches } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { logError } from '@/lib/log-error';

/**
 * Disparo do job de lembretes (cron externo). Dois formatos, mesmo segredo:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/reminders/run
 *   GET com `Authorization: Bearer $CRON_SECRET` — o que o Vercel Cron envia
 *   (`vercel.json`, #206).
 * Sem CRON_SECRET configurado, a rota fica desativada (503). Lembretes saem
 * por e-mail, empresa a empresa, pelo canal de cada clínica (ADR-011); clínica
 * sem canal conta `skipped` e aparece com `channel: 'none'` no resumo.
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
    const { clinics, jobRuns } = await getRepositories(systemScope());
    const all = await clinics.findAll();
    const summary = await new SendReminders(
      all.map((clinic) => ({
        id: clinic.id,
        name: clinic.name,
        status: clinic.status,
      })),
      (clinicId) => getRepositories(clinicScope(clinicId)),
    ).execute();
    const dataRequestDeadlines = await alertDataRequestDeadlines(
      all.filter((clinic) => clinic.status !== 'suspended'),
    );
    // Alerta "lembretes sem rodar há 26 h" (#212). Falhar aqui não desfaz o
    // envio: o resumo volta igual e o alerta avisa no dia seguinte.
    await jobRuns
      .recordRun('reminders', new Date())
      .catch((error: unknown) =>
        logError('Lembretes: falha ao registrar a execução', error),
      );
    return { ...summary, dataRequestDeadlines };
  });
}

/**
 * Aviso de prazo dos pedidos do titular (#312), empresa a empresa e pelo canal
 * de cada clínica. Falha numa empresa não derruba o lote de lembretes.
 */
async function alertDataRequestDeadlines(
  clinics: readonly { id: string }[],
): Promise<{ alerted: number; skipped: number; failed: number }> {
  const total = { alerted: 0, skipped: 0, failed: 0 };
  for (const clinic of clinics) {
    try {
      const repos = await getRepositories(clinicScope(clinic.id));
      const result = await new AlertDataRequestDeadlines(
        repos.dataSubjectRequests,
        repos.userAccounts,
        repos.email,
      ).execute();
      total.alerted += result.alerted;
      total.skipped += result.skipped;
      total.failed += result.failed;
    } catch (error) {
      logError(`Prazo dos pedidos do titular da empresa ${clinic.id}`, error);
      total.failed += 1;
    }
  }
  return total;
}
