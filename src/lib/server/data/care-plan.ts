import 'server-only';
import { GetCarePlan } from '@/application/clinical/get-care-plan';
import type { TransactionScope } from '@/application/ports/transaction-manager';
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
  const { patientId, dto } = await loadCarePlanDetail(repos, id);
  recordAudit(repos.auditEvents, session, {
    action: 'read',
    resourceType: 'care_plan',
    resourceId: id,
    patientId,
  });
  return dto;
}

/** Repositórios que a montagem do plano lê: os de fora ou os de uma transação. */
export type CarePlanDetailRepositories = Pick<
  TransactionScope,
  | 'carePlans'
  | 'carePlanDiagnoses'
  | 'carePlanOutcomes'
  | 'carePlanInterventions'
  | 'outcomeEvaluations'
  | 'interventionRecords'
  | 'nursingDiagnoses'
  | 'nursingOutcomes'
  | 'nursingInterventions'
>;

/**
 * Monta o plano com os rótulos do catálogo, sem checar acesso nem auditar: quem
 * chama já fez os dois. A emissão do receituário usa os repositórios da própria
 * transação, depois da trava, para não congelar um plano lido antes (#998).
 */
export async function carePlanDetailFrom(
  repos: CarePlanDetailRepositories,
  id: string,
): Promise<CarePlanDetailDto> {
  return (await loadCarePlanDetail(repos, id)).dto;
}

async function loadCarePlanDetail(
  repos: CarePlanDetailRepositories,
  id: string,
): Promise<{ patientId: string; dto: CarePlanDetailDto }> {
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
        detail.diagnoses.flatMap((d) =>
          d.diagnosisCode && !d.diagnosisLabel ? [d.diagnosisCode] : [],
        ),
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

  const dto = toCarePlanDetailDto(detail, {
    diagnoses: new Map(diagnosisCatalog.map((d) => [d.code, d])),
    outcomes: new Map(outcomeCatalog.map((o) => [o.code, o])),
    interventions: new Map(interventionCatalog.map((i) => [i.code, i])),
  });
  return { patientId: detail.plan.patientId, dto };
}
