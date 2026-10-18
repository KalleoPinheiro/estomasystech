import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import {
  normalizeOptionalEmail,
  validateNameAndPhone,
} from '../shared/person-validation';
import { normalizeBrazilianPhoneOrThrow } from '../shared/phone';

export const GUARDIAN_RELATIONSHIPS = [
  'mae',
  'pai',
  'conjuge',
  'filho',
  'irmao',
  'avo',
  'neto',
  'outro_familiar',
  'representante_legal',
  'cuidador',
] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** Parentesco como a recepção lê e o documento impresso mostra. */
export const GUARDIAN_RELATIONSHIP_LABELS: Record<
  GuardianRelationship,
  string
> = {
  mae: 'Mãe',
  pai: 'Pai',
  conjuge: 'Cônjuge ou companheiro(a)',
  filho: 'Filho(a)',
  irmao: 'Irmão(ã)',
  avo: 'Avô ou avó',
  neto: 'Neto(a)',
  outro_familiar: 'Outro familiar',
  representante_legal: 'Representante legal (tutor ou curador)',
  cuidador: 'Cuidador(a) contratado(a)',
};

/**
 * Parentescos que representam legalmente um menor (CC, arts. 1.634 e 1.740):
 * mãe, pai e tutor. Avô, irmão ou cuidador só representam com tutela, e então
 * a equipe cadastra como `representante_legal` (#372, ADR-032).
 */
export const MINOR_REPRESENTATIVE_RELATIONSHIPS: readonly GuardianRelationship[] =
  ['mae', 'pai', 'representante_legal'];

export const canRepresentMinor = (
  relationship: GuardianRelationship,
): boolean => MINOR_REPRESENTATIVE_RELATIONSHIPS.includes(relationship);

export interface GuardianProps {
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
  /** Contato opcional, só para lembretes; nunca abre o portal (ADR-024). */
  email?: string | null;
}

export interface GuardianState extends GuardianProps {
  id: string;
  createdAt: Date;
}

/**
 * Responsável legal ou cuidador de um ou mais pacientes da mesma empresa
 * (#329). É só contato: não tem conta, papel nem acesso ao prontuário.
 */
export class Guardian {
  private constructor(private readonly state: GuardianState) {}

  static create(props: GuardianProps): Guardian {
    return new Guardian({
      ...Guardian.validate(props),
      id: newId(),
      createdAt: new Date(),
    });
  }

  static restore(state: GuardianState): Guardian {
    return new Guardian({ ...state });
  }

  private static validate(props: GuardianProps): GuardianProps {
    const contact = validateNameAndPhone(props);
    if (!GUARDIAN_RELATIONSHIPS.includes(props.relationship)) {
      throw new ValidationError('Parentesco inválido');
    }
    return {
      fullName: contact.fullName,
      relationship: props.relationship,
      phone: normalizeBrazilianPhoneOrThrow(contact.phone),
      email: normalizeOptionalEmail(props.email),
    };
  }

  update(changes: Partial<GuardianProps>): Guardian {
    const validated = Guardian.validate({
      fullName: changes.fullName ?? this.state.fullName,
      relationship: changes.relationship ?? this.state.relationship,
      phone: changes.phone ?? this.state.phone,
      email: changes.email !== undefined ? changes.email : this.state.email,
    });
    return new Guardian({ ...this.state, ...validated });
  }

  get id(): string {
    return this.state.id;
  }

  get fullName(): string {
    return this.state.fullName;
  }

  get relationship(): GuardianRelationship {
    return this.state.relationship;
  }

  get relationshipLabel(): string {
    return GUARDIAN_RELATIONSHIP_LABELS[this.state.relationship];
  }

  get phone(): string {
    return this.state.phone;
  }

  get email(): string | null {
    return this.state.email ?? null;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
