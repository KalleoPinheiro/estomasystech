import type { Instrumentation } from 'next';

/**
 * Roda uma vez por instância do servidor, antes da primeira requisição
 * (convenção `instrumentation.ts` do Next). Só no runtime Node: o proxy
 * (edge-like) não tem fuso de processo relevante, e a checagem usa API do
 * Node (`process.exit`) que fica no módulo importado só neste ramo (#205).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startRuntimeGuards } = await import('@/lib/runtime-guards');
    await startRuntimeGuards();
    const { enforceProcessTimeZone } = await import('@/lib/app-timezone');
    await enforceProcessTimeZone();
    const { warmUpDatabase } = await import(
      '@/infrastructure/persistence/drizzle/db'
    );
    void warmUpDatabase();
  }
}

/**
 * Erro de servidor que nenhum handler tratou (#212): log em JSON com o
 * request-id, GlitchTip (se configurado) e contagem para o alerta de 5xx.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reportRequestError } = await import(
      '@/lib/observability/request-error'
    );
    reportRequestError(error, request, context);
  }
};
