import type { NextRequest } from 'next/server';
import { SearchDiagnoses } from '@/application/taxonomy/search-diagnoses';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { toNursingDiagnosisDto } from '@/lib/dto';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const term = request.nextUrl.searchParams.get('q') ?? '';
    const { nursingDiagnoses } = await getRepositories(systemScope());
    const result = await new SearchDiagnoses(nursingDiagnoses).execute({
      term,
    });
    return result.map(toNursingDiagnosisDto);
  });
}
