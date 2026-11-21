'use client';

import { Input } from '@still-void/ui/react';

/** Campos do cadastro da clínica — Configurações e plataforma (B4). */
export interface ClinicFieldsDraft {
  name: string;
  /** Profissional autônoma (#977); ausente é clínica. */
  kind?: 'individual';
  cnpj: string | null;
  cpf?: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
  address?: string | null;
  city?: string | null;
}

export type ClinicFieldKey = Exclude<keyof ClinicFieldsDraft, 'kind'>;

interface ClinicField {
  key: ClinicFieldKey;
  label: string;
  placeholder: string;
  type?: 'email' | 'tel';
}

const FIELDS: Record<ClinicFieldKey, ClinicField> = {
  name: { key: 'name', label: 'Razão social', placeholder: 'Nome da clínica' },
  cnpj: { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  cpf: { key: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
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

/**
 * Profissional autônoma (#977): CPF no lugar do CNPJ e sem responsável
 * técnico, que é ela mesma (o nome do cadastro vale como responsável).
 */
export const REQUIRED_INDIVIDUAL_FIELDS: readonly ClinicFieldKey[] = [
  'name',
  'cpf',
  'contactPhone',
  'contactEmail',
];

export const ALL_INDIVIDUAL_FIELDS: readonly ClinicFieldKey[] = [
  'name',
  'cpf',
  'contactPhone',
  'contactEmail',
  'professionalRegistry',
  'address',
  'city',
];

/** Rótulos que mudam na autônoma: o nome é o dela e o registro é o COREN. */
const INDIVIDUAL_OVERRIDES: Partial<
  Record<ClinicFieldKey, Partial<ClinicField>>
> = {
  name: { label: 'Nome completo', placeholder: 'Nome da profissional' },
  professionalRegistry: {
    label: 'Registro no conselho (COREN)',
    placeholder: 'COREN-SP 000000',
  },
  contactEmail: { placeholder: 'contato@exemplo.com.br' },
};

/** Campos do cadastro conforme o tipo de cliente. */
export const clinicFieldKeys = (draft: Pick<ClinicFieldsDraft, 'kind'>) =>
  draft.kind === 'individual' ? ALL_INDIVIDUAL_FIELDS : ALL_CLINIC_FIELDS;

export const requiredClinicFieldKeys = (
  draft: Pick<ClinicFieldsDraft, 'kind'>,
) =>
  draft.kind === 'individual'
    ? REQUIRED_INDIVIDUAL_FIELDS
    : REQUIRED_CLINIC_FIELDS;

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
        const field = {
          ...FIELDS[key],
          ...(draft.kind === 'individual' ? INDIVIDUAL_OVERRIDES[key] : {}),
        };
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
