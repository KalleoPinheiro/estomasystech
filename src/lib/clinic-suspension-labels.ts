import type { ClinicSuspensionReason } from '@/domain/clinic/clinic';

/** Motivos da suspensão (#251) como a plataforma os lê. */
export const CLINIC_SUSPENSION_REASON_LABELS: Record<
  ClinicSuspensionReason,
  string
> = {
  non_payment: 'Inadimplência',
  clinic_request: 'Pedido da clínica',
  security_incident: 'Incidente de segurança',
  other: 'Outro',
};
