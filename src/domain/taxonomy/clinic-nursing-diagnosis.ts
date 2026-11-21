import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

const CODE_PATTERN = /^\d{5}$/;
export const CLINIC_DIAGNOSIS_LABEL_MAX = 200;
export const CLINIC_DIAGNOSIS_TEXT_MAX = 120;
export const CLINIC_DIAGNOSIS_DEFINITION_MAX = 2000;

export interface ClinicNursingDiagnosisProps {
  clinicId: string;
  /** Código NANDA-I de 5 dígitos. Opcional: listas da clínica nem sempre trazem código. */
  code?: string | null;
  label: string;
  domain?: string | null;
  class?: string | null;
  /** Edição de origem (ex.: "NANDA-I 2024-2026"), quando a clínica informa. */
  edition?: string | null;
  definition?: string | null;
}

export interface ClinicNursingDiagnosisState {
  id: string;
  clinicId: string;
  code: string | null;
  label: string;
  domain: string | null;
  class: string | null;
  edition: string | null;
  definition: string | null;
  active: boolean;
  createdAt: Date;
}

function optionalText(
  value: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const text = value?.trim() ?? '';
  if (text.length > max) {
    throw new ValidationError(`${field} deve ter no máximo ${max} caracteres`);
  }
  return text.length > 0 ? text : null;
}

/** Chave de duplicidade do catálogo: o mesmo título com outra caixa ou espaços é o mesmo item. */
export function clinicDiagnosisKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/**
 * Diagnóstico de enfermagem que a própria clínica cadastra (#954). A taxonomia NANDA-I é obra
 * protegida e o repositório é público: a lista mora só no banco, no escopo da empresa.
 */
export class ClinicNursingDiagnosis {
  private constructor(private readonly state: ClinicNursingDiagnosisState) {}

  static create(props: ClinicNursingDiagnosisProps): ClinicNursingDiagnosis {
    return new ClinicNursingDiagnosis({
      ...ClinicNursingDiagnosis.validate(props),
      id: newId(),
      active: true,
      createdAt: new Date(),
    });
  }

  static restore(state: ClinicNursingDiagnosisState): ClinicNursingDiagnosis {
    return new ClinicNursingDiagnosis({ ...state });
  }

  private static validate(
    props: ClinicNursingDiagnosisProps,
  ): Omit<ClinicNursingDiagnosisState, 'id' | 'active' | 'createdAt'> {
    if (props.clinicId.trim().length === 0) {
      throw new ValidationError('Empresa é obrigatória');
    }
    const code = props.code?.trim() || null;
    if (code !== null && !CODE_PATTERN.test(code)) {
      throw new ValidationError(
        'Código NANDA-I deve ter 5 dígitos (ex.: 00046) ou ficar em branco',
      );
    }
    const label = props.label.trim().replace(/\s+/g, ' ');
    if (label.length === 0) {
      throw new ValidationError('Título do diagnóstico é obrigatório');
    }
    if (label.length > CLINIC_DIAGNOSIS_LABEL_MAX) {
      throw new ValidationError(
        `Título deve ter no máximo ${CLINIC_DIAGNOSIS_LABEL_MAX} caracteres`,
      );
    }
    return {
      clinicId: props.clinicId,
      code,
      label,
      domain: optionalText(props.domain, CLINIC_DIAGNOSIS_TEXT_MAX, 'Domínio'),
      class: optionalText(props.class, CLINIC_DIAGNOSIS_TEXT_MAX, 'Classe'),
      edition: optionalText(props.edition, CLINIC_DIAGNOSIS_TEXT_MAX, 'Edição'),
      definition: optionalText(
        props.definition,
        CLINIC_DIAGNOSIS_DEFINITION_MAX,
        'Definição',
      ),
    };
  }

  deactivate(): ClinicNursingDiagnosis {
    return new ClinicNursingDiagnosis({ ...this.state, active: false });
  }

  reactivate(): ClinicNursingDiagnosis {
    return new ClinicNursingDiagnosis({ ...this.state, active: true });
  }

  get key(): string {
    return clinicDiagnosisKey(this.state.label);
  }

  get id(): string {
    return this.state.id;
  }

  get clinicId(): string {
    return this.state.clinicId;
  }

  get code(): string | null {
    return this.state.code;
  }

  get label(): string {
    return this.state.label;
  }

  get domain(): string | null {
    return this.state.domain;
  }

  get class(): string | null {
    return this.state.class;
  }

  get edition(): string | null {
    return this.state.edition;
  }

  get definition(): string | null {
    return this.state.definition;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
