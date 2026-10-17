import { StatusBadge } from '@/components/status-badge';
import { formatBrazilianPhone } from '@/domain/shared/phone';

interface PatientPhoneProps {
  phone: string;
  needsCorrection: boolean;
}

/** Telefone formatado; legado fora do E.164 ganha selo pedindo correção (#324). */
export function PatientPhone({ phone, needsCorrection }: PatientPhoneProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span>{formatBrazilianPhone(phone)}</span>
      {needsCorrection && (
        <StatusBadge status="pending" label="Corrigir telefone" />
      )}
    </span>
  );
}
