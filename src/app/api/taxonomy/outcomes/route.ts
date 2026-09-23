import type { NextRequest } from 'next/server';
import { SearchOutcomes } from '@/application/taxonomy/search-outcomes';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { toNursingOutcomeDto } from '@/lib/dto';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const term = request.nextUrl.searchParams.get('q') ?? '';
    const { nursingOutcomes } = await getRepositories(systemScope());
    const result = await new SearchOutcomes(nursingOutcomes).execute({ term });
    return result.map(toNursingOutcomeDto);
  });
}
