import type { AdminStatus } from '@/application/platform/clinic-overview';
import type { ClinicStatus } from '@/domain/clinic/clinic';
import type { EmailProvider } from '@/domain/clinic/clinic-channel';
import type { PlatformEmailChannelDto } from '@/lib/dto';

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

/**
 * Status do canal de e-mail da clínica (C4, #267): o sinal precoce do design
 * `canal-por-clinica` — clínica ativa "sem canal" é a aposta indo mal.
 */
export function emailChannelLabel(channel: PlatformEmailChannelDto): {
  label: string;
  status: string;
} {
  if (!channel.configured) {
    return { label: 'E-mail: sem canal', status: 'cancelled' };
  }
  if (channel.lastStatus === 'ok') {
    return { label: 'E-mail: configurado', status: 'completed' };
  }
  if (channel.lastStatus === 'failed') {
    return { label: 'E-mail: falhando', status: 'out_of_stock' };
  }
  return { label: 'E-mail: não testado', status: 'pending' };
}

/** Nome do provedor como a tela de Configurações mostra. */
export const EMAIL_PROVIDER_LABEL: Record<EmailProvider, string> = {
  resend: 'Resend',
};
