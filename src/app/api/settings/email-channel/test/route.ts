import type { NextRequest } from 'next/server';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { writeClinicId } from '@/lib/auth/tenant-scope';
import { channelContext, requireChannelAdmin } from '../guard';

/** Por clínica (Unresolved 1 da task C3): cada teste é um envio pago por ela. */
const CHANNEL_TEST_RATE_LIMIT = new SharedRateLimiter(
  'email-channel-test',
  5,
  60_000,
);

/**
 * Envia o e-mail de teste pelo canal da clínica para o e-mail da conta logada
 * (design, Open 1) e grava o resultado. Recusa do provedor não é erro da rota:
 * responde `200` com `lastStatus: 'failed'` e a mensagem em `lastError`.
 */
export async function POST(request: NextRequest) {
  const guard = requireChannelAdmin(request);
  if (!guard.ok) return guard.response;
  const session = guard.session;
  if (!(await CHANNEL_TEST_RATE_LIMIT.allow(writeClinicId(session)))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }

  return handleRequest(async () => {
    const { manage, services } = await channelContext(session);
    const tested = await manage.test(session.subject);
    await recordAuditNow(services.auditEvents, session, {
      action: 'update',
      resourceType: 'clinic_channel',
      resourceId: tested.id,
      detail: tested.lastStatus === 'ok' ? 'test-ok' : 'test-failed',
    });
    return {
      lastStatus: tested.lastStatus,
      lastStatusAt: tested.lastStatusAt?.toISOString() ?? null,
      lastError: tested.lastError,
    };
  });
}
