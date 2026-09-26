import type {
  CarePlanInterventionRepository,
  CarePlanOutcomeRepository,
  CarePlanRepository,
  ClinicalConditionRepository,
  ConditionPhotoRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import { NotFoundError } from '@/domain/shared/errors';
import { assertPatientAccessibleToProfessional } from './professional-patient-scope';
import type { Session } from './session';

/**
 * R4 nas rotas clínicas endereçadas pelo id do RECURSO (#186): o path não
 * traz o paciente, então a cadeia recurso→paciente é resolvida aqui, uma vez,
 * e termina em `assertPatientAccessibleToProfessional`.
 */
export type ClinicalResourceKind =
  | 'condition'
  | 'photo'
  | 'carePlan'
  | 'carePlanIntervention'
  | 'carePlanOutcome';

export interface ClinicalResourceRepositories {
  conditions: Pick<ClinicalConditionRepository, 'findById'>;
  conditionPhotos: Pick<ConditionPhotoRepository, 'findById'>;
  carePlans: Pick<CarePlanRepository, 'findById'>;
  carePlanInterventions: Pick<CarePlanInterventionRepository, 'findById'>;
  carePlanOutcomes: Pick<CarePlanOutcomeRepository, 'findById'>;
  professionalPatientLinks: ProfessionalPatientLinkRepository;
}

const RESOURCE_LABEL: Record<ClinicalResourceKind, string> = {
  condition: 'Condição',
  photo: 'Foto',
  carePlan: 'Plano de cuidados',
  carePlanIntervention: 'Intervenção',
  carePlanOutcome: 'Resultado',
};

type Resolver = (
  id: string,
  repos: ClinicalResourceRepositories,
) => Promise<string | null>;

const conditionPatient: Resolver = async (id, repos) =>
  (await repos.conditions.findById(id))?.patientId ?? null;

const carePlanPatient: Resolver = async (id, repos) =>
  (await repos.carePlans.findById(id))?.patientId ?? null;

const RESOLVERS: Record<ClinicalResourceKind, Resolver> = {
  condition: conditionPatient,
  photo: async (id, repos) => {
    const photo = await repos.conditionPhotos.findById(id);
    return photo ? conditionPatient(photo.conditionId, repos) : null;
  },
  carePlan: carePlanPatient,
  carePlanIntervention: async (id, repos) => {
    const intervention = await repos.carePlanInterventions.findById(id);
    return intervention
      ? carePlanPatient(intervention.carePlanId, repos)
      : null;
  },
  carePlanOutcome: async (id, repos) => {
    const outcome = await repos.carePlanOutcomes.findById(id);
    return outcome ? carePlanPatient(outcome.carePlanId, repos) : null;
  },
};

/** Paciente dono do recurso, ou `null` se o recurso (ou um elo da cadeia) não existe no escopo. */
export function resolveClinicalResourcePatientId(
  kind: ClinicalResourceKind,
  id: string,
  repos: ClinicalResourceRepositories,
): Promise<string | null> {
  return RESOLVERS[kind](id, repos);
}

/**
 * Profissional sem vínculo com o paciente do recurso (ou recurso inexistente)
 * recebe `NotFoundError` citando o RECURSO pedido — nunca o `patientId`, que
 * vazaria a quem não tem vínculo. Outros papéis passam sem consulta extra.
 */
export async function assertClinicalResourceAccessible(
  session: Session | null,
  kind: ClinicalResourceKind,
  id: string,
  repos: ClinicalResourceRepositories,
): Promise<void> {
  if (session?.role !== 'profissional') {
    return;
  }
  const notFound = new NotFoundError(RESOURCE_LABEL[kind], id);
  const patientId = await resolveClinicalResourcePatientId(kind, id, repos);
  if (patientId === null) {
    throw notFound;
  }
  try {
    await assertPatientAccessibleToProfessional(
      session,
      patientId,
      repos.professionalPatientLinks,
    );
  } catch (error) {
    throw error instanceof NotFoundError ? notFound : error;
  }
}

/**
 * Filtro de listagem por vínculo (R4): para o Profissional aceita só os
 * pacientes vinculados; para os demais papéis aceita todos.
 */
export async function linkedPatientFilter(
  session: Session | null,
  links: Pick<ProfessionalPatientLinkRepository, 'findLinkedPatientIds'>,
): Promise<(patientId: string) => boolean> {
  if (session?.role !== 'profissional') {
    return () => true;
  }
  const linked = new Set(
    session.professionalId
      ? await links.findLinkedPatientIds(session.professionalId)
      : [],
  );
  return (patientId) => linked.has(patientId);
}
