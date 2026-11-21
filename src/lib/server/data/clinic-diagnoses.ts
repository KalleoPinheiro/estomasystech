import 'server-only';
import { ListClinicDiagnoses } from '@/application/taxonomy/clinic-diagnoses';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  type ClinicNursingDiagnosisDto,
  toClinicNursingDiagnosisDto,
} from '@/lib/dto';
import { canRoleAccess } from '@/lib/staff-pages';

export const CLINIC_DIAGNOSES_API = '/api/settings/nursing-diagnoses';

/**
 * Catálogo de diagnósticos da clínica para Configurações (#954). Papel sem acesso à seção não
 * recebe a lista (a tela mostra o aviso de acesso negado).
 */
export async function listClinicDiagnosesFor(
  session: Session,
): Promise<ClinicNursingDiagnosisDto[]> {
  if (!canRoleAccess(CLINIC_DIAGNOSES_API, session.role)) {
    return [];
  }
  const { clinicDiagnoses } = await getRepositories(sessionScope(session));
  const list = await new ListClinicDiagnoses(clinicDiagnoses).execute();
  return list.map(toClinicNursingDiagnosisDto);
}
