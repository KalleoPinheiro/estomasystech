'use client';

import { Input } from '@still-void/ui/react';

/** Campos do cadastro da clínica — Configurações e plataforma (B4). */
export interface ClinicFieldsDraft {
  name: string;
  cnpj: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
  address?: string | null;
  city?: string | null;
}

export type ClinicFieldKey = keyof ClinicFieldsDraft;

interface ClinicField {
  key: ClinicFieldKey;
  label: string;
  placeholder: string;
  type?: 'email' | 'tel';
}

const FIELDS: Record<ClinicFieldKey, ClinicField> = {
  name: { key: 'name', label: 'Razão social', placeholder: 'Nome da clínica' },
  cnpj: { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  contactPhone: {
    key: 'contactPhone',
    label: 'Telefone/WhatsApp de contato',
    placeholder: '(11) 99999-0000',
    type: 'tel',
  },
  contactEmail: {
    key: 'contactEmail',
    label: 'E-mail de contato',
    placeholder: 'contato@clinica.com.br',
    type: 'email',
  },
  professionalName: {
    key: 'professionalName',
    label: 'Responsável técnico',
    placeholder: 'Nome completo',
  },
  professionalRegistry: {
    key: 'professionalRegistry',
    label: 'Registro profissional',
    placeholder: 'COREN-SP 000000',
  },
  address: {
    key: 'address',
    label: 'Endereço',
    placeholder: 'Rua, número, bairro',
  },
  city: { key: 'city', label: 'Cidade', placeholder: 'Cidade/UF' },
};

/** Obrigatórios no cadastro pela plataforma (design, "Dados obrigatórios na criação"). */
export const REQUIRED_CLINIC_FIELDS: readonly ClinicFieldKey[] = [
  'name',
  'cnpj',
  'contactPhone',
  'contactEmail',
];

export const ALL_CLINIC_FIELDS: readonly ClinicFieldKey[] = [
  'name',
  'cnpj',
  'contactPhone',
  'contactEmail',
  'professionalName',
  'professionalRegistry',
  'address',
  'city',
];

interface ClinicFieldsGridProps<T extends ClinicFieldsDraft> {
  draft: T;
  keys: readonly ClinicFieldKey[];
  onChange: (next: T) => void;
  /** Marca com `*` e `required` os campos obrigatórios. */
  required?: readonly ClinicFieldKey[];
}

export function ClinicFieldsGrid<T extends ClinicFieldsDraft>({
  draft,
  keys,
  onChange,
  required = [],
}: ClinicFieldsGridProps<T>) {
  return (
    <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
      {keys.map((key) => {
        const field = FIELDS[key];
        const isRequired = required.includes(key);
        return (
          <label key={key} className="font-medium text-sm">
            {field.label}
            {isRequired ? ' *' : ''}
            <Input
              type={field.type ?? 'text'}
              required={isRequired}
              value={draft[key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
              className="mt-1"
            />
          </label>
        );
      })}
    </div>
  );
}
