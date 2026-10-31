import 'server-only';
import { getRepositories } from '@/infrastructure/container';
import {
  assertClinicalResourceAccessible,
  type ClinicalResourceKind,
} from '@/lib/auth/clinical-resource-scope';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import type { Session } from '@/lib/auth/session';
import type { TenantScope } from '@/lib/auth/tenant-scope';

/**
 * Autorização do RECURSO nas ações da ficha (#552, ADR-080): o mesmo R4 das
 * rotas `/api` (Profissional sem vínculo = 404, outra empresa = 404), rodando
 * em `authorize`, depois do `zod` e ANTES de abrir a transação.
 */
interface FichaContext {
  session: Session;
  scope: TenantScope;
}

/** Ações endereçadas pelo id do PACIENTE. */
export async function authorizePatientAccess(
  { session, scope }: FichaContext,
  patientId: string,
): Promise<void> {
  const { professionalPatientLinks } = await getRepositories(scope);
  await assertPatientAccessibleToProfessional(
    session,
    patientId,
    professionalPatientLinks,
  );
}

/** Ações endereçadas pelo id de um recurso clínico (condição, plano, intervenção, resultado). */
export async function authorizeClinicalResource(
  { session, scope }: FichaContext,
  kind: ClinicalResourceKind,
  id: string,
): Promise<void> {
  await assertClinicalResourceAccessible(
    session,
    kind,
    id,
    await getRepositories(scope),
  );
}
