import type { NextRequest } from 'next/server';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { isInfectionAlertLevel } from '@/domain/clinical/wound-time';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { linkedPatientFilter } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

const MS_PER_HOUR = 3_600_000;

/** Último score da condição (COMP3-04): PUSH para ferida, DET para estomia. */
function latestScoreFor(
  condition: ClinicalCondition | undefined,
  assessment: ConditionAssessment | undefined,
): { kind: 'push' | 'det'; value: number } | null {
  if (!condition || !assessment) {
    return null;
  }
  const value =
    condition.kind === 'wound' ? assessment.pushScore : assessment.detScore;
  if (value == null) {
    return null;
  }
  return { kind: condition.kind === 'wound' ? 'push' : 'det', value };
}

/** Nível de infecção da última avaliação quando é local ou pior (ADR-063). */
function infectionAlertFor(
  assessment: ConditionAssessment | undefined,
): string | null {
  const level = assessment?.infectionLevel;
  return isInfectionAlertLevel(level) ? (level ?? null) : null;
}

/** Fila de triagem (staff): fotos enviadas por pacientes aguardando avaliação. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const {
      conditionPhotos,
      conditions,
      patients,
      assessments,
      professionalPatientLinks,
    } = await getRepositories(sessionScope(guard.session));
    const allPending = await conditionPhotos.findPendingTriage();

    // Uma query em lote (CONS2-09) — padrão anti-N+1 do restante do projeto.
    const conditionList = await conditions.findByIds([
      ...new Set(allPending.map((photo) => photo.conditionId)),
    ]);
    // Escopo R4 (#186): o Profissional só vê a fila dos pacientes vinculados.
    const isLinked = await linkedPatientFilter(
      guard.session,
      professionalPatientLinks,
    );
    const conditionById = new Map(conditionList.map((c) => [c.id, c]));
    const pending = allPending.filter((photo) =>
      isLinked(conditionById.get(photo.conditionId)?.patientId ?? ''),
    );
    const conditionIds = [...new Set(pending.map((p) => p.conditionId))];
    const patientList = await patients.findByIds(
      conditionIds.flatMap((id) => conditionById.get(id)?.patientId ?? []),
    );
    const patientById = new Map(patientList.map((p) => [p.id, p]));

    // Avaliação mais recente por condição — contexto clínico sem abrir o prontuário.
    const allAssessments = await assessments.findByConditionIds(conditionIds);
    const latestByCondition = new Map<string, ConditionAssessment>();
    for (const assessment of allAssessments) {
      const current = latestByCondition.get(assessment.conditionId);
      if (
        !current ||
        assessment.createdAt.getTime() > current.createdAt.getTime()
      ) {
        latestByCondition.set(assessment.conditionId, assessment);
      }
    }

    const now = Date.now();
    return pending.map((photo) => {
      const condition = conditionById.get(photo.conditionId);
      const patient = condition
        ? patientById.get(condition.patientId)
        : undefined;
      return {
        id: photo.id,
        conditionId: photo.conditionId,
        conditionTitle: condition?.title ?? '—',
        patientId: condition?.patientId ?? null,
        patientName: patient?.fullName ?? '—',
        patientNote: photo.patientNote,
        createdAt: photo.createdAt.toISOString(),
        // Idade da pendência (COMP3-04): triagem parada > 24h ganha destaque na UI.
        waitingHours: Math.floor(
          (now - photo.createdAt.getTime()) / MS_PER_HOUR,
        ),
        latestScore: latestScoreFor(
          condition,
          latestByCondition.get(photo.conditionId),
        ),
        // ADR-063: infecção local ou pior na última avaliação pede atenção na fila.
        infectionAlert: infectionAlertFor(
          latestByCondition.get(photo.conditionId),
        ),
      };
    });
  });
}
