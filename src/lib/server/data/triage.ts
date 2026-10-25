import 'server-only';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { isInfectionAlertLevel } from '@/domain/clinical/wound-time';
import { getRepositories } from '@/infrastructure/container';
import { linkedPatientFilter } from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import type { TriagePhotoDto } from '@/lib/dto';

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

/**
 * Fila de triagem da empresa da sessão: fotos enviadas por pacientes
 * aguardando avaliação. Escopo R4 (#186): quem chama passa `isLinked`
 * (`linkedPatientFilter`), então o Profissional só vê a fila dos pacientes
 * vinculados e a rota continua mostrando a checagem à vista. Mesma resposta de
 * `GET /api/photos/triage` e fonte do cartão de triagem da tela Hoje.
 */
export async function buildTriageQueue(
  session: Session,
  isLinked: (patientId: string) => boolean,
): Promise<(TriagePhotoDto & { conditionId: string })[]> {
  const { conditionPhotos, conditions, patients, assessments } =
    await getRepositories(sessionScope(session));
  const allPending = await conditionPhotos.findPendingTriage();

  // Uma query em lote (CONS2-09) — padrão anti-N+1 do restante do projeto.
  const conditionList = await conditions.findByIds([
    ...new Set(allPending.map((photo) => photo.conditionId)),
  ]);
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
      waitingHours: Math.floor((now - photo.createdAt.getTime()) / MS_PER_HOUR),
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
}

/**
 * Fila de triagem já no escopo R4 do papel (o Profissional só vê os pacientes
 * vinculados), para as telas que leem no servidor. A rota monta o mesmo filtro
 * à vista e chama `buildTriageQueue`.
 */
export async function buildLinkedTriageQueue(
  session: Session,
): Promise<TriagePhotoDto[]> {
  const { professionalPatientLinks } = await getRepositories(
    sessionScope(session),
  );
  const isLinked = await linkedPatientFilter(session, professionalPatientLinks);
  return buildTriageQueue(session, isLinked);
}
