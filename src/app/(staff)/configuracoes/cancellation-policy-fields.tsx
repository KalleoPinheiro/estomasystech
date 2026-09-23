'use client';

import { Input } from '@still-void/ui/react';
import {
  type CancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
} from '@/domain/scheduling/schedule-config';

/**
 * Política de cancelamento: antecedência mínima para o paciente mudar a
 * consulta sozinho e taxa (opcional) por cancelamento tardio ou falta.
 */
export function CancellationPolicyFields({
  value,
  onChange,
}: {
  value: CancellationPolicy | undefined;
  onChange: (value: CancellationPolicy) => void;
}) {
  const policy = value ?? DEFAULT_CANCELLATION_POLICY;
  return (
    <fieldset className="mt-4 max-w-md">
      <legend className="font-medium text-sm">Política de cancelamento</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Antecedência mínima (h)
          <Input
            type="number"
            min="0"
            max="168"
            value={policy.noticeHours}
            onChange={(e) =>
              onChange({ ...policy, noticeHours: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Taxa tardia/falta (R$)
          <Input
            type="number"
            min="0"
            step="0.01"
            value={(policy.lateFeeCents / 100).toFixed(2)}
            onChange={(e) =>
              onChange({
                ...policy,
                lateFeeCents: Math.round(Number(e.target.value) * 100),
              })
            }
            className="mt-1"
          />
        </label>
      </div>
      <p className="mt-1 text-ink-3 text-xs">
        Com menos antecedência, o paciente não cancela nem remarca pelo portal e
        o cancelamento pedido por ele fica marcado como tardio. Taxa 0 = não
        cobrar.
      </p>
    </fieldset>
  );
}
