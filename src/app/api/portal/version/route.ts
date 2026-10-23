import type { NextRequest } from 'next/server';
import { currentVersionReader } from '@/infrastructure/release/app-release-service';
import { fail, ok } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';

/** Mesma versão de `GET /api/version`, para o rodapé do portal (paciente, responsável e parceiro). */
export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, [
    'patient',
    'guardian',
    'partner',
  ]);
  if (!guard.ok) return guard.response;

  const current = await currentVersionReader().read();
  if (!current) return fail('Versão indisponível', 404);
  const response = ok(current);
  response.headers.set('Cache-Control', 'private, max-age=300');
  return response;
}
