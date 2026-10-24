import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { fail } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { identityImageResponse } from '@/lib/identity-image-response';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Entrega o avatar de uma conta da equipe da mesma clínica (o repositório
 * escopado devolve 404 para outra empresa). Conta inativa ou anonimizada não
 * serve imagem: foto de rosto é dado pessoal.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const { userAccounts, photoStorage } = await getRepositories(
    sessionScope(guard.session),
  );
  const account = await userAccounts.findById(id);
  if (!account?.isActive || account.isAnonymized) {
    return fail('Imagem não encontrada', 404);
  }
  return identityImageResponse(request, photoStorage, account.avatarKey);
}
