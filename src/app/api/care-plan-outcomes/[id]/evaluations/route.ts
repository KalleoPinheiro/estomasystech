import type { NextRequest } from 'next/server';
import { EvaluateOutcome } from '@/application/clinical/evaluate-outcome';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toOutcomeEvaluationDto } from '@/lib/dto';
import { evaluationSchema } from '@/lib/patient-record-schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlanOutcome',
      id,
      repos,
    );
    const body = evaluationSchema.parse(await request.json());
    const {
      outcomeEvaluations,
      carePlanOutcomes,
      carePlans,
      auditEvents,
      userAccounts,
    } = repos;
    const evaluation = await new EvaluateOutcome(
      outcomeEvaluations,
      carePlanOutcomes,
      carePlans,
    ).execute({
      outcomeId: id,
      score: body.score,
      // Autoria pela sessão (#200) — o corpo não escolhe o profissional.
      professionalId: await resolveSessionProfessionalId(
        guard.session,
        userAccounts,
      ),
      notes: body.notes ?? null,
    });
    const outcome = await carePlanOutcomes.findById(id);
    const plan = outcome ? await carePlans.findById(outcome.carePlanId) : null;
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'outcome_evaluation',
      resourceId: evaluation.id,
      patientId: plan?.patientId ?? null,
    });
    return toOutcomeEvaluationDto(evaluation);
  });
}
