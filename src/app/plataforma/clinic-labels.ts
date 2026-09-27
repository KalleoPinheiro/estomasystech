import type { AdminStatus } from '@/application/platform/clinic-overview';

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
