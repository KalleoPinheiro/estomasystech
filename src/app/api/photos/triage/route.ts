import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { linkedPatientFilter } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { buildTriageQueue } from '@/lib/server/data/triage';

/** Fila de triagem (staff): fotos enviadas por pacientes aguardando avaliação. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { professionalPatientLinks } = await getRepositories(
      sessionScope(guard.session),
    );
    // Escopo R4 (#186): o Profissional só vê a fila dos pacientes vinculados.
    const isLinked = await linkedPatientFilter(
      guard.session,
      professionalPatientLinks,
    );
    return buildTriageQueue(guard.session, isLinked);
  });
}
