import type { NextRequest } from 'next/server';
import { SearchClinicDiagnoses } from '@/application/taxonomy/clinic-diagnoses';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toClinicNursingDiagnosisDto } from '@/lib/dto';

/**
 * Busca do plano de cuidados no catálogo da clínica da sessão (#954). A tela mostra estes itens
 * antes dos do catálogo global (`/api/taxonomy/diagnoses`).
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const term = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
    const { clinicDiagnoses } = await getRepositories(
      sessionScope(guard.session),
    );
    const result = await new SearchClinicDiagnoses(clinicDiagnoses).execute({
      term,
    });
    return result.map(toClinicNursingDiagnosisDto);
  });
}
