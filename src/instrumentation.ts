/**
 * Roda uma vez por instância do servidor, antes da primeira requisição
 * (convenção `instrumentation.ts` do Next). Só no runtime Node: o proxy
 * (edge-like) não tem fuso de processo relevante.
 *
 * Erro aqui o Next só loga ("Failed to prepare server") e o processo segue
 * vivo sem servir; configuração inválida em produção encerra com código 1
 * para o orquestrador ver a falha e não rotear tráfego (#205).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { assertProcessTimeZone } = await import('@/lib/app-timezone');
  try {
    assertProcessTimeZone();
  } catch (error) {
    const { logError } = await import('@/lib/log-error');
    logError('[config] Inicialização abortada', error);
    process.exit(1);
  }
}
