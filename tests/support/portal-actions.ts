import type { ActionResult } from '@/lib/action-result';
import { apiFetch } from '@/lib/client';

/**
 * As Server Actions do portal (`@/app/portal/actions`) no teste de tela: cada
 * uma faz a MESMA chamada HTTP que a rota equivalente, pelo `fetch` simulado
 * do teste, e devolve o envelope de uma ação. O cenário e a asserção de cada
 * tela ficam como estavam; só o canal da gravação mudou (#553, PR 2a).
 * Uso: `vi.mock('@/app/portal/actions', async () => (await import('../support/portal-actions')).portalActionsOverFetch())`.
 */
async function over<T>(
  path: string,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await apiFetch<T>(path, init), error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

export function portalActionsOverFetch() {
  return {
    acceptConsent: ({ purpose }: { purpose: string }) =>
      over(`/api/portal/patient/consent?purpose=${purpose}`, {
        method: 'POST',
      }),
    revokeConsent: ({ purpose }: { purpose: string }) =>
      over(`/api/portal/patient/consent/revoke?purpose=${purpose}`, {
        method: 'POST',
      }),
    acceptPartnerConsent: () =>
      over('/api/portal/patient/partner-consent', { method: 'POST' }),
    revokePartnerConsent: () =>
      over('/api/portal/patient/partner-consent/revoke', { method: 'POST' }),
    openDataRequest: (input: { kind: string; details: string | null }) =>
      over('/api/portal/patient/data-requests', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  };
}
