import type { AdminStatus } from '@/application/platform/clinic-overview';
import type { ClinicStatus } from '@/domain/clinic/clinic';

/** Rótulo e cor (`StatusBadge`) do estado do admin na plataforma (B4). */
export const ADMIN_STATUS_LABEL: Record<
  AdminStatus,
  { label: string; status: string }
> = {
  none: { label: 'Sem admin', status: 'cancelled' },
  pending: { label: 'Aguardando primeiro acesso', status: 'pending' },
  active: { label: 'Ativo', status: 'completed' },
};

export const registrationLabel = (complete: boolean) =>
  complete
    ? { label: 'Cadastro completo', status: 'completed' }
    : { label: 'Cadastro incompleto', status: 'no_show' };

/** Situação da clínica (B5): ativa ou suspensa. */
export const CLINIC_STATUS_LABEL: Record<
  ClinicStatus,
  { label: string; status: string }
> = {
  active: { label: 'Ativa', status: 'completed' },
  suspended: { label: 'Suspensa', status: 'cancelled' },
};
