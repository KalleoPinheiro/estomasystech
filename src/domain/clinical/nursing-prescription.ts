import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

/**
 * Receituário de enfermagem emitido (#956, ADR-116): o conteúdo é congelado na
 * emissão. Baixar de novo reproduz exatamente o que foi entregue; se o plano de
 * cuidados mudar, emite-se um receituário novo, com outro número.
 */

export const PRESCRIPTION_FREE_TEXT_MAX = 2000;

export const EMPTY_PRESCRIPTION_MESSAGE =
  'Este plano de cuidados ainda não tem intervenção prescrita: não é possível emitir o receituário vazio.';
export const FREE_TEXT_TOO_LONG_MESSAGE = `As observações do receituário têm no máximo ${PRESCRIPTION_FREE_TEXT_MAX} caracteres.`;

export interface PrescriptionItemContent {
  label: string;
  frequency: string;
}

/** Tudo o que sai impresso, como estava no momento da emissão. */
export interface PrescriptionContent {
  issuer: {
    name: string;
    /** CNPJ da clínica ou CPF da autônoma, já na forma impressa. */
    document: { label: string; value: string } | null;
    /** COREN no timbre da autônoma; `null` na clínica. */
    registry: string | null;
    address: string | null;
  };
  city: string | null;
  patientName: string;
  items: PrescriptionItemContent[];
  /** Texto livre da prescritora, além das intervenções do plano. */
  freeText: string | null;
  signer: { name: string; registry: string | null };
}

export interface NursingPrescriptionProps {
  carePlanId: string;
  patientId: string;
  /** Quem emitiu (sujeito da sessão). */
  issuedBy: string;
  content: PrescriptionContent;
}

export interface NursingPrescriptionState
  extends Omit<NursingPrescriptionProps, 'content'> {
  id: string;
  issuedAt: Date;
  /** `null` depois da anonimização por retenção: o número fica, o conteúdo não. */
  content: PrescriptionContent | null;
}

/** Observações em branco viram `null`; acima do limite, recusa. */
export function normalizeFreeText(value: string | null): string | null {
  const text = value?.trim() ?? '';
  if (text.length > PRESCRIPTION_FREE_TEXT_MAX) {
    throw new ValidationError(FREE_TEXT_TOO_LONG_MESSAGE);
  }
  return text.length === 0 ? null : text;
}

const required = (value: string, message: string): void => {
  if (value.trim().length === 0) throw new ValidationError(message);
};

export class NursingPrescription {
  private constructor(private readonly state: NursingPrescriptionState) {}

  static create(props: NursingPrescriptionProps): NursingPrescription {
    required(props.carePlanId, 'Plano de cuidados é obrigatório');
    required(props.patientId, 'Paciente é obrigatório');
    required(props.issuedBy, 'Quem emite é obrigatório');
    if (props.content.items.length === 0) {
      throw new ValidationError(EMPTY_PRESCRIPTION_MESSAGE);
    }
    return new NursingPrescription({
      carePlanId: props.carePlanId,
      patientId: props.patientId,
      issuedBy: props.issuedBy,
      content: {
        ...props.content,
        freeText: normalizeFreeText(props.content.freeText),
      },
      id: newId(),
      issuedAt: new Date(),
    });
  }

  static restore(state: NursingPrescriptionState): NursingPrescription {
    return new NursingPrescription({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get carePlanId(): string {
    return this.state.carePlanId;
  }

  get patientId(): string {
    return this.state.patientId;
  }

  get issuedBy(): string {
    return this.state.issuedBy;
  }

  get issuedAt(): Date {
    return this.state.issuedAt;
  }

  get content(): PrescriptionContent | null {
    return this.state.content;
  }

  /** Número impresso: prefixo `RCT` e os 8 primeiros caracteres do id. */
  get documentNumber(): string {
    return `RCT-${this.state.id.slice(0, 8).toUpperCase()}`;
  }

  /**
   * Mesmo conteúdo do que se vai emitir agora: clicar de novo sem mudar nada
   * devolve este receituário em vez de gerar outro número.
   */
  hasSameContent(content: PrescriptionContent): boolean {
    if (this.state.content === null) return false;
    const candidate = {
      ...content,
      freeText: normalizeFreeText(content.freeText),
    };
    return JSON.stringify(this.state.content) === JSON.stringify(candidate);
  }
}
