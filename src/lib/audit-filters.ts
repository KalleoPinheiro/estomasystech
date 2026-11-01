import { clinicDayEnd, clinicDayStart, instantDayKey } from './clinic-calendar';

/** Tamanhos de página da trilha oferecidos no controle «Eventos por página» (#521, ADR-085). */
export const AUDIT_PAGE_SIZES = [25, 50] as const;
export const AUDIT_DEFAULT_PAGE_SIZE = 25;

/** Filtros da tela de Auditoria como vivem na URL (`?paciente=&de=&ate=&por=&cursor=`). */
export interface AuditUrlFilters {
  patientId: string;
  from: string;
  to: string;
  /** Eventos por página: só 25 ou 50; qualquer outro valor da URL volta para 25. */
  size: number;
  cursor: string;
}

type Param = string | string[] | undefined;

const first = (value: Param): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Data da URL só vale se existir no calendário: `?de=abc` não pode derrubar a tela. */
export function validDateParam(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  // 2027-02-31 normaliza para março: só vale o dia que volta igual.
  return instantDayKey(clinicDayStart(value)) === value ? value : '';
}

/** Tamanho pedido em `?por=`; fora da lista oferecida volta ao padrão (25). */
export function validPageSize(value: string | null | undefined): number {
  const size = AUDIT_PAGE_SIZES.find((option) => String(option) === value);
  return size ?? AUDIT_DEFAULT_PAGE_SIZE;
}

/** Lê os filtros dos `searchParams` da página, descartando o que não vale. */
export function auditFiltersFrom(
  params: Record<string, Param> | undefined,
): AuditUrlFilters {
  return {
    patientId: first(params?.paciente) ?? '',
    from: validDateParam(first(params?.de)),
    to: validDateParam(first(params?.ate)),
    size: validPageSize(first(params?.por)),
    cursor: first(params?.cursor) ?? '',
  };
}

/** Query string da tela (sem `?`); filtro vazio não entra. */
export function auditFiltersToSearch(
  filters: Partial<AuditUrlFilters>,
): string {
  const params = new URLSearchParams();
  if (filters.patientId) params.set('paciente', filters.patientId);
  if (filters.from) params.set('de', filters.from);
  if (filters.to) params.set('ate', filters.to);
  if (filters.size && filters.size !== AUDIT_DEFAULT_PAGE_SIZE) {
    params.set('por', String(filters.size));
  }
  if (filters.cursor) params.set('cursor', filters.cursor);
  return params.toString();
}

/** Intervalo do dia civil da clínica (`de` 00:00 até `ate` 23:59:59.999) para a consulta. */
export function auditRangeFrom(filters: AuditUrlFilters): {
  from?: Date;
  to?: Date;
} {
  return {
    from: filters.from ? clinicDayStart(filters.from) : undefined,
    to: filters.to ? clinicDayEnd(filters.to, 999) : undefined,
  };
}
