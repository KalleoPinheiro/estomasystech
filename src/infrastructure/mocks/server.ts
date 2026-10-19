import { setupServer } from 'msw/node';
import { logger } from '@/lib/observability/logger';
import { buildMockHandlers } from './handlers';

let started = false;

/** Liga o MSW uma vez por processo; chamadas fora dos handlers seguem para a rede. */
export function startMockServer(): void {
  if (started) {
    return;
  }
  setupServer(...buildMockHandlers()).listen({ onUnhandledFrame: 'bypass' });
  started = true;
  logger.info(
    '[mocks] Integrações externas simuladas (MOCK_INTEGRATIONS=true)',
  );
}
