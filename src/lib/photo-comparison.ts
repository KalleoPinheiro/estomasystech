import type { AssessmentDto, ConditionPhotoDto } from '@/lib/dto';

/** Par de fotos da comparação: `before` é sempre a mais antiga, `after` a mais recente. */
export interface PhotoPair {
  before: ConditionPhotoDto;
  after: ConditionPhotoDto;
}

const time = (iso: string): number => new Date(iso).getTime();

/** Fotos em ordem cronológica (a mais antiga primeiro); empate de data desempata pelo id. */
export function sortPhotosChronologically(
  photos: readonly ConditionPhotoDto[],
): ConditionPhotoDto[] {
  return [...photos].sort(
    (a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Par exibido na comparação. Sem escolha válida, o padrão é primeira × última. A escolha (dois ids
 * distintos) vale só se as duas fotos ainda existem; foto excluída volta ao padrão. Devolve `null`
 * com menos de duas fotos.
 */
export function resolvePhotoPair(
  chronological: readonly ConditionPhotoDto[],
  choice: readonly [string, string] | null,
): PhotoPair | null {
  if (chronological.length < 2) return null;
  const picked =
    choice && choice[0] !== choice[1]
      ? choice.map((id) => chronological.find((photo) => photo.id === id))
      : [];
  const [x, y] = picked;
  if (x && y) {
    return time(x.createdAt) <= time(y.createdAt)
      ? { before: x, after: y }
      : { before: y, after: x };
  }
  return {
    before: chronological[0],
    after: chronological[chronological.length - 1],
  };
}

/**
 * Avaliação TIME mais próxima da foto: a vinculada à foto (`assessmentId`) quando existe na lista;
 * senão a de data mais próxima. `null` sem avaliações.
 */
export function nearestAssessment(
  photo: ConditionPhotoDto,
  assessments: readonly AssessmentDto[],
): AssessmentDto | null {
  const linked = photo.assessmentId
    ? assessments.find((a) => a.id === photo.assessmentId)
    : undefined;
  if (linked) return linked;
  const at = time(photo.createdAt);
  let best: AssessmentDto | null = null;
  for (const assessment of assessments) {
    if (
      !best ||
      Math.abs(time(assessment.createdAt) - at) <
        Math.abs(time(best.createdAt) - at)
    ) {
      best = assessment;
    }
  }
  return best;
}
