import { APPOINTMENT_STATUSES, type AppointmentStatus } from './appointment';

/** Padrão da agenda (AGE-FLT-02): tudo, exceto as consultas canceladas. */
export const DEFAULT_STATUS_FILTER: readonly AppointmentStatus[] =
  APPOINTMENT_STATUSES.filter((status) => status !== 'cancelled');

const isStatus = (value: string): value is AppointmentStatus =>
  (APPOINTMENT_STATUSES as readonly string[]).includes(value);

/** Ordem canônica e sem repetição, para a URL sair estável. */
const canonical = (
  statuses: readonly AppointmentStatus[],
): AppointmentStatus[] =>
  APPOINTMENT_STATUSES.filter((status) => statuses.includes(status));

/**
 * Lê `?status=a,b` (AGE-FLT-04). Ausente ou sem nenhum valor válido cai no
 * padrão; vazio (`status=`) significa nenhum status marcado (AGE-FLT-01).
 */
export function parseStatusFilter(
  raw: string | null | undefined,
): AppointmentStatus[] {
  if (raw === null || raw === undefined) {
    return [...DEFAULT_STATUS_FILTER];
  }
  if (raw === '') {
    return [];
  }
  const valid = raw.split(',').filter(isStatus);
  return valid.length > 0 ? canonical(valid) : [...DEFAULT_STATUS_FILTER];
}

/** Valor do parâmetro `status`; `null` quando é o padrão (URL limpa). */
export function serializeStatusFilter(
  statuses: readonly AppointmentStatus[],
): string | null {
  const selected = canonical(statuses);
  const isDefault =
    selected.length === DEFAULT_STATUS_FILTER.length &&
    selected.every((status, index) => status === DEFAULT_STATUS_FILTER[index]);
  return isDefault ? null : selected.join(',');
}

export function toggleStatus(
  statuses: readonly AppointmentStatus[],
  status: AppointmentStatus,
): AppointmentStatus[] {
  return canonical(
    statuses.includes(status)
      ? statuses.filter((s) => s !== status)
      : [...statuses, status],
  );
}
