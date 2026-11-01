import 'server-only';
import { GetCarePlan } from '@/application/clinical/get-care-plan';
import { getRepositories } from '@/infrastructure/container';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type CarePlanDetailDto, toCarePlanDetailDto } from '@/lib/dto';

/**

 * resposta de `GET /api/care-plans/[id]`, que chama esta função: R4 do
 * Profissional (sem vínculo = 404) e leitura do prontuário auditada.
 */
export async function getCarePlanDetailFor(
  session: Session,
  id: string,
): Promise<CarePlanDetailDto> {
  const repos = await getRepositories(sessionScope(session));
  await assertClinicalResourceAccessible(session, 'carePlan', id, repos);
  const {
    carePlans,
    carePlanDiagnoses,
    carePlanOutcomes,
    carePlanInterventions,
    outcomeEvaluations,
    interventionRecords,
    nursingDiagnoses,
    nursingOutcomes,
    nursingInterventions,
    auditEvents,
  } = repos;
  const detail = await new GetCarePlan(
    carePlans,
    carePlanDiagnoses,
    carePlanOutcomes,
    carePlanInterventions,
    outcomeEvaluations,
    interventionRecords,
  ).execute({ id });

  const [diagnosisCatalog, outcomeCatalog, interventionCatalog] =
    await Promise.all([
      nursingDiagnoses.findByCodes(
        detail.diagnoses.map((d) => d.diagnosisCode),
      ),
      nursingOutcomes.findByCodes(
        detail.outcomes.map(({ outcome }) => outcome.outcomeCode),
      ),
      nursingInterventions.findByCodes(
        detail.interventions.map(
          ({ intervention }) => intervention.interventionCode,
        ),
      ),
    ]);

  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'care_plan',
    resourceId: id,
    patientId: detail.plan.patientId,
  });
  return toCarePlanDetailDto(detail, {
    diagnoses: new Map(diagnosisCatalog.map((d) => [d.code, d])),
    outcomes: new Map(outcomeCatalog.map((o) => [o.code, o])),
    interventions: new Map(interventionCatalog.map((i) => [i.code, i])),
  });
}
