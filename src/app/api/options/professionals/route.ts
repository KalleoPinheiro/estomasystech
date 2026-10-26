import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { listProfessionalOptions } from '@/lib/server/data/professionals';

/**
 * Profissionais da empresa para os seletores da equipe (#188/#189): família
 * `operational`, então Atendente e Profissional leem — sem comissão nem
 * registro. O cadastro completo segue em `/api/professionals` (administrativo).
 * Devolve inativos também (com `active: false`): a agenda precisa do nome do
 * profissional de consultas antigas; os formulários filtram os ativos.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listProfessionalOptions(guard.session));
}
