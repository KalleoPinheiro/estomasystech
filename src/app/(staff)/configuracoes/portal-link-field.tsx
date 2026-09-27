'use client';

import { NativeSelect } from '@still-void/ui/react';
import { PatientPicker } from '@/components/patient-picker';
import type { PartnerDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

/**
 * Vínculo da conta de portal com o cadastro (#196): o portal identifica o
 * titular por este vínculo, não pelo e-mail. Escolher o cadastro sugere o
 * e-mail dele para o login (`onSuggestEmail`); a equipe pode trocar — ex.: o
 * login de quem cuida do paciente.
 */
export function PortalLinkField({
  role,
  value,
  onChange,
  onSuggestEmail,
}: {
  role: 'patient' | 'partner';
  value: string;
  onChange: (recordId: string) => void;
  onSuggestEmail: (email: string) => void;
}) {
  if (role === 'patient') {
    return (
      <PatientPicker
        label="Paciente vinculado *"
        value={value}
        onChange={(id, patient) => {
          onChange(id);
          if (patient) onSuggestEmail(patient.email);
        }}
      />
    );
  }
  return (
    <PartnerSelect
      value={value}
      onChange={onChange}
      onSuggestEmail={onSuggestEmail}
    />
  );
}

function PartnerSelect({
  value,
  onChange,
  onSuggestEmail,
}: {
  value: string;
  onChange: (partnerId: string) => void;
  onSuggestEmail: (email: string) => void;
}) {
  const { data: partners } = useApiQuery<PartnerDto[]>('/api/partners');
  const active = (partners ?? []).filter((partner) => partner.active);
  return (
    <label className="font-medium text-sm">
      Parceiro vinculado *
      <NativeSelect
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const partner = active.find((p) => p.id === e.target.value);
          if (partner) onSuggestEmail(partner.email);
        }}
        className="mt-1"
      >
        <option value="">— selecione —</option>
        {active.map((partner) => (
          <option key={partner.id} value={partner.id}>
            {partner.fullName}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
