import { ok } from '@/lib/api-response';

/**
 * Liveness (#212): o processo responde. Sem I/O — nem banco, nem rate limit
 * (o proxy deixa esta rota passar direto). É o que o HEALTHCHECK do Docker
 * chama: banco fora do ar não deve marcar o container como doente.
 */
export function GET() {
  return ok({ status: 'ok' });
}
