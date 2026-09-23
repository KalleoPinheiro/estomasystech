import type { NextRequest } from 'next/server';
import { SearchInterventions } from '@/application/taxonomy/search-interventions';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { toNursingInterventionDto } from '@/lib/dto';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const term = request.nextUrl.searchParams.get('q') ?? '';
    const { nursingInterventions } = await getRepositories(systemScope());
    const result = await new SearchInterventions(nursingInterventions).execute({
      term,
    });
    return result.map(toNursingInterventionDto);
  });
}
