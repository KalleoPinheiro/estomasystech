import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

export const CARE_PLAN_DIAGNOSIS_TYPES = [
  'real',
  'risco',
  'promocao-saude',
  'sindrome',
] as const;
export type CarePlanDiagnosisType = (typeof CARE_PLAN_DIAGNOSIS_TYPES)[number];

/** Tamanho máximo do título guardado no plano (catálogo da clínica ou digitado à mão). */
export const CARE_PLAN_DIAGNOSIS_LABEL_MAX = 200;

export interface CarePlanDiagnosisProps {
  carePlanId: string;
  /** Código NANDA-I. Nulo quando o diagnóstico foi digitado à mão ou veio sem código ("sem código"). */
  diagnosisCode: string | null;
  /**
   * Título gravado no próprio plano quando o diagnóstico vem do catálogo da clínica ou é digitado à
   * mão (#954): o plano não muda se a clínica editar ou desativar o item depois. Nulo no catálogo global.
   */
  diagnosisLabel?: string | null;
  type: CarePlanDiagnosisType;
  /** Etiologia — "relacionado a". */
  relatedFactors?: string | null;
  /** Sinais/sintomas — "evidenciado por". Diagnóstico de risco não tem (só fatores de risco). */
  definingCharacteristics?: string | null;
}

export interface CarePlanDiagnosisState extends CarePlanDiagnosisProps {
  id: string;
  createdAt: Date;
}

/**
 * Diagnóstico de enfermagem prescrito no formato PES (Problema-Etiologia-Sinais/sintomas).
 * Diagnóstico real exige etiologia e evidência; diagnóstico de risco exige etiologia mas
 * rejeita evidência (um risco, por definição, ainda não se manifestou); diagnóstico de
 * promoção da saúde não tem etiologia, mas exige evidência (motivação/desejo expresso); síndrome
 * exige evidência (o conjunto de diagnósticos) e aceita etiologia.
 */
export class CarePlanDiagnosis {
  private constructor(private readonly state: CarePlanDiagnosisState) {}

  static create(props: CarePlanDiagnosisProps): CarePlanDiagnosis {
    CarePlanDiagnosis.validateIds(props);
    const relatedFactors = props.relatedFactors?.trim() || null;
    const definingCharacteristics =
      props.definingCharacteristics?.trim() || null;
    CarePlanDiagnosis.validatePes(
      props.type,
      relatedFactors,
      definingCharacteristics,
    );

    return new CarePlanDiagnosis({
      carePlanId: props.carePlanId,
      diagnosisCode: props.diagnosisCode?.trim() || null,
      diagnosisLabel: CarePlanDiagnosis.normalizeLabel(props.diagnosisLabel),
      type: props.type,
      relatedFactors,
      definingCharacteristics,
      id: newId(),
      createdAt: new Date(),
    });
  }

  private static validateIds(props: CarePlanDiagnosisProps): void {
    if (props.carePlanId.trim().length === 0) {
      throw new ValidationError('Plano de cuidados é obrigatório');
    }
    const hasCode = (props.diagnosisCode?.trim().length ?? 0) > 0;
    const hasLabel = (props.diagnosisLabel?.trim().length ?? 0) > 0;
    if (!hasCode && !hasLabel) {
      throw new ValidationError('Diagnóstico é obrigatório');
    }
  }

  private static normalizeLabel(label: string | null | undefined): string | null {
    const text = label?.trim().replace(/\s+/g, ' ') ?? '';
    if (text.length > CARE_PLAN_DIAGNOSIS_LABEL_MAX) {
      throw new ValidationError(
        `Título do diagnóstico deve ter no máximo ${CARE_PLAN_DIAGNOSIS_LABEL_MAX} caracteres`,
      );
    }
    return text.length > 0 ? text : null;
  }

  /** Diagnóstico real exige etiologia e evidência; risco exige etiologia mas rejeita evidência. */
  private static validatePes(
    type: CarePlanDiagnosisType,
    relatedFactors: string | null,
    definingCharacteristics: string | null,
  ): void {
    if (!CARE_PLAN_DIAGNOSIS_TYPES.includes(type)) {
      throw new ValidationError('Tipo de diagnóstico inválido');
    }
    if (type === 'risco') {
      CarePlanDiagnosis.validateRisco(relatedFactors, definingCharacteristics);
    } else if (type === 'real') {
      CarePlanDiagnosis.validateReal(relatedFactors, definingCharacteristics);
    } else if (type === 'sindrome') {
      CarePlanDiagnosis.validateSindrome(definingCharacteristics);
    } else {
      CarePlanDiagnosis.validatePromocaoSaude(
        relatedFactors,
        definingCharacteristics,
      );
    }
  }

  /** Risco exige fatores de risco (etiologia) e rejeita evidência — ainda não se manifestou. */
  private static validateRisco(
    relatedFactors: string | null,
    definingCharacteristics: string | null,
  ): void {
    if (definingCharacteristics) {
      throw new ValidationError(
        'Diagnóstico de risco não tem características definidoras — apenas fatores de risco',
      );
    }
    if (!relatedFactors) {
      throw new ValidationError(
        'Diagnóstico de risco exige fatores de risco (relacionado a)',
      );
    }
  }

  /** Real exige etiologia e evidência. */
  private static validateReal(
    relatedFactors: string | null,
    definingCharacteristics: string | null,
  ): void {
    if (!relatedFactors) {
      throw new ValidationError(
        'Diagnóstico real exige fatores relacionados (relacionado a)',
      );
    }
    if (!definingCharacteristics) {
      throw new ValidationError(
        'Diagnóstico real exige características definidoras (evidenciado por)',
      );
    }
  }

  /**
   * Síndrome (NANDA-I): um conjunto de diagnósticos que aparecem juntos. Exige as características
   * definidoras (os diagnósticos do conjunto); fatores relacionados são opcionais.
   */
  private static validateSindrome(definingCharacteristics: string | null): void {
    if (!definingCharacteristics) {
      throw new ValidationError(
        'Síndrome exige características definidoras (os diagnósticos do conjunto)',
      );
    }
  }

  /** Promoção da saúde não tem etiologia, mas exige evidência (motivação/desejo expresso). */
  private static validatePromocaoSaude(
    relatedFactors: string | null,
    definingCharacteristics: string | null,
  ): void {
    if (relatedFactors) {
      throw new ValidationError(
        'Diagnóstico de promoção da saúde não tem fatores relacionados — não há problema, só motivação',
      );
    }
    if (!definingCharacteristics) {
      throw new ValidationError(
        'Diagnóstico de promoção da saúde exige características definidoras (evidenciado por)',
      );
    }
  }

  static restore(state: CarePlanDiagnosisState): CarePlanDiagnosis {
    return new CarePlanDiagnosis({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get carePlanId(): string {
    return this.state.carePlanId;
  }

  get diagnosisCode(): string | null {
    return this.state.diagnosisCode ?? null;
  }

  get diagnosisLabel(): string | null {
    return this.state.diagnosisLabel ?? null;
  }

  get type(): CarePlanDiagnosisType {
    return this.state.type;
  }

  get relatedFactors(): string | null {
    return this.state.relatedFactors ?? null;
  }

  get definingCharacteristics(): string | null {
    return this.state.definingCharacteristics ?? null;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
