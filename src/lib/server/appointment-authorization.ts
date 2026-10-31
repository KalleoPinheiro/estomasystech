import 'server-only';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { assertPatientLinkedForProfessionalWrite } from '@/lib/auth/professional-patient-scope';
import type { Session } from '@/lib/auth/session';
import type { TenantScope } from '@/lib/auth/tenant-scope';

/**
 * Regra única de acesso às ações de consulta (#603, ADR-079), compartilhada
 * pelas Server Actions da agenda e pelas rotas `/api/appointments`: as duas
 * entradas aplicam a mesma R4 e o mesmo escopo de empresa.
 */

/**
 * Autoriza o ato sobre uma consulta existente (confirmar, concluir, cancelar,
 * marcar falta, remarcar) antes de gravar: consulta de outra empresa é 404 (o
 * escopo não a enxerga) e Profissional sem vínculo com o paciente é 403 (R4).
 */
export async function authorizeAppointmentAct(
  session: Session,
  scope: TenantScope,
  appointmentId: string,
): Promise<void> {
  const { appointments, professionalPatientLinks } =
    await getRepositories(scope);
  const appointment = await appointments.findById(appointmentId);
  if (!appointment) {
    throw new NotFoundError('Consulta', appointmentId);
  }
  await assertPatientLinkedForProfessionalWrite(
    session,
    appointment.patientId,
    professionalPatientLinks,
  );
}

/**
 * Agendar, avulso ou em série: o Profissional só agenda no próprio nome. Com o
 * `professionalId` de outro, a ação concederia vínculo a quem não agendou.
 * Não exige vínculo prévio com o paciente: é por agendar que ele ganha paciente novo.
 */
export function assertProfessionalActsAsSelf(
  session: Session,
  professionalId: string | null | undefined,
): void {
  if (
    session.role === 'profissional' &&
    professionalId &&
    professionalId !== session.professionalId
  ) {
    throw new ForbiddenError(
      'Profissional só pode agendar em seu próprio nome',
    );
  }
}
