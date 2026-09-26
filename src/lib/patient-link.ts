import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import { logError } from '@/lib/log-error';

/**
 * Concede/renova o vínculo profissional-paciente em melhor esforço (issue
 * #42): o registro clínico principal (paciente, consulta, evolução) já foi
 * persistido quando isto roda, então uma falha aqui não pode virar 500 para
 * quem chamou — o vínculo fica pendente e se autocorrige no próximo
 * agendamento/nota com o mesmo profissional (trade-off documentado em
 * .specs/features/rbac-catalogo-papeis/design.md).
 */
export async function ensureLinkBestEffort(
  links: ProfessionalPatientLinkRepository,
  professionalId: string,
  patientId: string,
): Promise<void> {
  try {
    await links.ensureLink(professionalId, patientId);
  } catch (error) {
    logError(
      `Vínculo profissional-paciente pendente (profissional ${professionalId}, paciente ${patientId}):`,
      error,
    );
  }
}
