import type { NextRequest } from 'next/server';
import { SuggestLinkedTerms } from '@/application/taxonomy/suggest-linked-terms';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { toNursingInterventionDto, toNursingOutcomeDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { code } = await context.params;
    const { taxonomyLinkages, nursingOutcomes, nursingInterventions } =
      await getRepositories(systemScope());
    const linked = await new SuggestLinkedTerms(
      taxonomyLinkages,
      nursingOutcomes,
      nursingInterventions,
    ).execute({ diagnosisCode: code });
    return {
      outcomes: linked.outcomes.map(toNursingOutcomeDto),
      interventions: linked.interventions.map(toNursingInterventionDto),
    };
  });
}
