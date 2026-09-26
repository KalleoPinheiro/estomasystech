/**
 * Roda uma vez por instância do servidor, antes da primeira requisição
 * (convenção `instrumentation.ts` do Next). Só no runtime Node: o proxy
 * (edge-like) não tem fuso de processo relevante, e a checagem usa API do
 * Node (`process.exit`) que fica no módulo importado só neste ramo (#205).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { enforceProcessTimeZone } = await import('@/lib/app-timezone');
    await enforceProcessTimeZone();
  }
}
