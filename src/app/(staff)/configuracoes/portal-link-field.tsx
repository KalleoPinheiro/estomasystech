'use client';

import { NativeSelect } from '@still-void/ui/react';
import { PatientPicker } from '@/components/patient-picker';
import type { GuardianDto, PartnerDto } from '@/lib/dto';
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
  role: 'patient' | 'partner' | 'guardian';
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
          if (patient?.email) onSuggestEmail(patient.email);
        }}
      />
    );
  }
  if (role === 'guardian') {
    return (
      <GuardianSelect
        value={value}
        onChange={onChange}
        onSuggestEmail={onSuggestEmail}
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

function GuardianSelect({
  value,
  onChange,
  onSuggestEmail,
}: {
  value: string;
  onChange: (guardianId: string) => void;
  onSuggestEmail: (email: string) => void;
}) {
  const { data: guardians } = useApiQuery<GuardianDto[]>('/api/guardians');
  return (
    <label className="font-medium text-sm">
      Responsável vinculado *
      <NativeSelect
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const guardian = (guardians ?? []).find(
            (g) => g.id === e.target.value,
          );
          if (guardian?.email) onSuggestEmail(guardian.email);
        }}
        className="mt-1"
      >
        <option value="">— selecione —</option>
        {(guardians ?? []).map((guardian) => (
          <option key={guardian.id} value={guardian.id}>
            {guardian.fullName} ({guardian.relationshipLabel})
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
