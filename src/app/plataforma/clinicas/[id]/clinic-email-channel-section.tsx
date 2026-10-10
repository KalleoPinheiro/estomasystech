import { Card } from '@still-void/ui/react';
import { StatusBadge } from '@/components/status-badge';
import type { PlatformEmailChannelDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { EMAIL_PROVIDER_LABEL, emailChannelLabel } from '../../clinic-labels';

/**
 * Status do canal de e-mail da clínica (C4, #267). Só leitura: quem configura
 * é o admin da clínica em Configurações; o último erro não sai daqui.
 */
export function ClinicEmailChannelSection({
  channel,
}: {
  channel: PlatformEmailChannelDto;
}) {
  const { status, label } = emailChannelLabel(channel);
  const provider = channel.provider
    ? EMAIL_PROVIDER_LABEL[channel.provider]
    : '—';
  const lastTest = channel.lastStatusAt
    ? `Último teste: ${formatDateTime(channel.lastStatusAt)}`
    : 'Nunca testado';
  return (
    <Card as="section" className="flex flex-col gap-2 p-5">
      <h2 className="font-semibold text-lg">Canal de e-mail</h2>
      <div>
        <StatusBadge status={status} label={label} />
      </div>
      <p className="text-ink-2 text-sm">Provedor: {provider}</p>
      <p className="text-ink-2 text-sm">{lastTest}</p>
    </Card>
  );
}
