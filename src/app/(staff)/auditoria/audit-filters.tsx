'use client';

import { Input, NativeSelect } from '@still-void/ui/react';
import { useRouter } from 'next/navigation';
import { PatientPicker } from '@/components/patient-picker';
import {
  AUDIT_PAGE_SIZES,
  type AuditUrlFilters,
  auditFiltersToSearch,
  validPageSize,
} from '@/lib/audit-filters';

type Filters = Omit<AuditUrlFilters, 'cursor'>;

/**
 * Filtros da trilha (#555): paciente e período vivem na URL, então a tela
 * compartilha e recarrega o mesmo recorte e o servidor refaz a consulta. Mudar
 * o filtro volta à primeira página (descarta o cursor).
 */
export function AuditFilters({
  filters,
  patientName,
}: {
  filters: Filters;
  patientName: string | null;
}) {
  const router = useRouter();
  const update = (next: Partial<Filters>) => {
    const search = auditFiltersToSearch({ ...filters, ...next });
    router.replace(search ? `/auditoria?${search}` : '/auditoria');
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-ink-2 text-sm">
        De
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => update({ from: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-ink-2 text-sm">
        Até
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => update({ to: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-ink-2 text-sm">
        Eventos por página
        <NativeSelect
          value={String(filters.size)}
          onChange={(e) => update({ size: validPageSize(e.target.value) })}
        >
          {AUDIT_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="min-w-64">
        <PatientPicker
          label="Filtrar por paciente"
          value={filters.patientId}
          selectedName={patientName}
          onChange={(id) => update({ patientId: id })}
          includeInactive
        />
      </div>
    </div>
  );
}
