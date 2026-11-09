import { assertBlindIndexConfigured } from '@/lib/blind-index';
import {
  assertStagingMfaFlagSafe,
  mockIntegrationsEnabled,
  resolveAppEnv,
} from '@/lib/runtime-env';

/**
 * Roda no boot do servidor (`instrumentation.ts`): recusa `APP_ENV` inválido ou
 * ausente na Vercel, exige o pepper do índice cego em produção (#734) e liga os mocks de integração só onde são permitidos.
 */
export async function startRuntimeGuards(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  resolveAppEnv(env);
  assertStagingMfaFlagSafe(env);
  assertBlindIndexConfigured(env);
  if (mockIntegrationsEnabled(env)) {
    const { startMockServer } = await import('@/infrastructure/mocks/server');
    startMockServer();
  }
}
