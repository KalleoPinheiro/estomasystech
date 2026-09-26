/**
 * Roda uma vez por instância do servidor, antes da primeira requisição
 * (convenção `instrumentation.ts` do Next). Só no runtime Node: o proxy
 * (edge-like) não tem fuso de processo relevante.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { assertProcessTimeZone } = await import('@/lib/app-timezone');
  assertProcessTimeZone();
}
