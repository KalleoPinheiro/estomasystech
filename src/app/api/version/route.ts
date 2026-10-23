import type { NextRequest } from 'next/server';
import { currentVersionReader } from '@/infrastructure/release/app-release-service';
import { fail, ok } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';

/** Cache privado curto no navegador, alinhado ao cache de 5 minutos do servidor (ADR-066). */
const VERSION_CACHE_CONTROL = 'private, max-age=300';

/**
 * Versão do sistema para o rodapé da equipe (ADR-066): `{ version, releasedAt }` e, só em
 * homologação, `sha`. Só com sessão, nunca em login ou health. O leitor não lança: banco fora do
 * ar cai para a versão do build; sem versão alguma, 404. O portal lê de `/api/portal/version`.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const current = await currentVersionReader().read();
  if (!current) return fail('Versão indisponível', 404);
  const response = ok(current);
  response.headers.set('Cache-Control', VERSION_CACHE_CONTROL);
  return response;
}
