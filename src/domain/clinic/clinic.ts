import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import { normalizeCnpj } from './cnpj';

/**
 * Dados cadastrais (issue #61) — usados em documentos clínicos emitidos (issue
 * #62). O contato (B4, #214) é por onde a plataforma fala com a clínica.
 */
export interface ClinicInfoFields {
  cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  professionalName?: string | null;
  professionalRegistry?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

/**
 * Cadastro de uma clínica nova pela plataforma (B4): nome, CNPJ, telefone e
 * e-mail de contato obrigatórios; responsável técnico opcional.
 */
export interface ClinicProps {
  name: string;
  cnpj: string;
  contactPhone: string;
  contactEmail: string;
  professionalName?: string | null;
  professionalRegistry?: string | null;
  createdBy: string;
}

export interface ClinicState extends ClinicInfoFields {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
}

/**
 * `true` só quando os 3 campos com relevância jurídica direta na assinatura de
 * um documento estão presentes — `address`/`city` continuam opcionais (#62).
 */
export function isClinicInfoComplete(
  info: Pick<
    ClinicInfoFields,
    'cnpj' | 'professionalName' | 'professionalRegistry'
  > | null,
): boolean {
  return Boolean(
    info?.cnpj?.trim() &&
      info?.professionalName?.trim() &&
      info?.professionalRegistry?.trim(),
  );
}

const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trimToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeContactEmail = (value: string): string => {
  const email = value.toLowerCase();
  if (!CONTACT_EMAIL_PATTERN.test(email)) {
    throw new ValidationError('E-mail de contato inválido');
  }
  return email;
};

/** Forma canônica por campo; vazio vira `null` em todos. */
const FIELD_NORMALIZERS: Partial<
  Record<keyof ClinicInfoFields, (value: string) => string>
> = {
  cnpj: normalizeCnpj,
  contactEmail: normalizeContactEmail,
};

const INFO_KEYS = [
  'cnpj',
  'address',
  'city',
  'professionalName',
  'professionalRegistry',
  'contactPhone',
  'contactEmail',
] as const;

function normalizeField(
  key: keyof ClinicInfoFields,
  value: string | null | undefined,
): string | null {
  const trimmed = trimToNull(value);
  const normalize = FIELD_NORMALIZERS[key];
  return trimmed && normalize ? normalize(trimmed) : trimmed;
}

/** Aplica só os campos presentes em `fields` (chave `in` do objeto) — os demais preservam o valor atual. */
function resolveInfoFields(
  state: ClinicInfoFields,
  fields: ClinicInfoFields,
): Required<ClinicInfoFields> {
  const resolved = {} as Required<ClinicInfoFields>;
  for (const key of INFO_KEYS) {
    resolved[key] =
      key in fields ? normalizeField(key, fields[key]) : (state[key] ?? null);
  }
  return resolved;
}

const REQUIRED_ON_CREATE: readonly [keyof ClinicProps, string][] = [
  ['name', 'Nome da clínica é obrigatório'],
  ['cnpj', 'CNPJ é obrigatório'],
  ['contactPhone', 'Telefone de contato é obrigatório'],
  ['contactEmail', 'E-mail de contato é obrigatório'],
  ['createdBy', 'Criador da clínica é obrigatório'],
];

const EMPTY_INFO: Required<ClinicInfoFields> = {
  cnpj: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
  contactPhone: null,
  contactEmail: null,
};

/** Empresa/clínica — unidade de isolamento de dados (multi-tenancy). */
export class Clinic {
  private constructor(private readonly state: ClinicState) {}

  /** Clínica nova pela plataforma (B4): nasce com o cadastro completo. */
  static create(props: ClinicProps): Clinic {
    for (const [key, message] of REQUIRED_ON_CREATE) {
      if (!trimToNull(props[key])) {
        throw new ValidationError(message);
      }
    }
    const { name, createdBy, ...info } = props;
    return new Clinic({
      id: newId(),
      name: name.trim(),
      createdBy,
      createdAt: new Date(),
      ...resolveInfoFields(EMPTY_INFO, info),
    });
  }

  static restore(state: ClinicState): Clinic {
    return new Clinic({ ...EMPTY_INFO, ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get createdBy(): string {
    return this.state.createdBy;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get cnpj(): string | null {
    return this.state.cnpj ?? null;
  }

  get address(): string | null {
    return this.state.address ?? null;
  }

  get city(): string | null {
    return this.state.city ?? null;
  }

  get professionalName(): string | null {
    return this.state.professionalName ?? null;
  }

  get professionalRegistry(): string | null {
    return this.state.professionalRegistry ?? null;
  }

  get contactPhone(): string | null {
    return this.state.contactPhone ?? null;
  }

  get contactEmail(): string | null {
    return this.state.contactEmail ?? null;
  }

  /** Retorna uma nova instância com os campos cadastrais atualizados (imutável). */
  updateInfo(fields: ClinicInfoFields & { name?: string }): Clinic {
    if ('name' in fields && !fields.name?.trim()) {
      throw new ValidationError('Nome da clínica é obrigatório');
    }
    return new Clinic({
      ...this.state,
      name: fields.name?.trim() ? fields.name.trim() : this.state.name,
      ...resolveInfoFields(this.state, fields),
    });
  }

  isCompleteForDocumentEmission(): boolean {
    return isClinicInfoComplete(this.state);
  }

  /**
   * Cadastro que a plataforma exige (B4): nome, CNPJ, telefone e e-mail de
   * contato. Sem ele, o primeiro admin não é convidado — é o caso da
   * `legacy-clinic`, que nasceu só com nome.
   */
  isRegistrationComplete(): boolean {
    return Boolean(
      this.state.name.trim() &&
        this.state.cnpj &&
        this.state.contactPhone &&
        this.state.contactEmail,
    );
  }
}
