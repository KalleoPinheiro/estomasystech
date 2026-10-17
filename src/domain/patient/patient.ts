import { ConflictError } from '../shared/errors';
import { newId } from '../shared/id';
import {
  normalizeOptionalEmail,
  validateNameAndPhone,
} from '../shared/person-validation';
import {
  isBrazilianE164,
  normalizeBrazilianPhoneOrThrow,
} from '../shared/phone';

export interface PatientProps {
  fullName: string;
  /**
   * E-mail de contato, opcional e repetível entre pacientes da mesma empresa
   * (ex.: o do cuidador). Não é identidade: o login do portal é uma conta com
   * e-mail próprio, vinculada ao paciente (ADR-023).
   */
  email?: string | null;
  phone: string;
  birthDate?: Date | null;
  notes?: string | null;
  /** Médico parceiro que indicou o paciente (estrutura de indicação). */
  referredByPartnerId?: string | null;
  /** Responsável legal ou cuidador, compartilhável entre pacientes (#329). */
  guardianId?: string | null;
}

export interface PatientState extends PatientProps {
  id: string;
  active: boolean;
  createdAt: Date;
  /** Anonimizado pela retenção (#294): não volta a ser ativado (ADR-017). */
  anonymizedAt?: Date | null;
}

export const ANONYMIZED_PATIENT_REACTIVATION =
  'Paciente anonimizado não pode ser reativado. Cadastre a pessoa novamente.';

export class Patient {
  private constructor(private readonly state: PatientState) {}

  static create(props: PatientProps): Patient {
    return new Patient({
      ...Patient.validate(props),
      id: newId(),
      active: true,
      createdAt: new Date(),
    });
  }

  static restore(state: PatientState): Patient {
    return new Patient({ ...state });
  }

  private static validate(
    props: PatientProps,
    normalizePhone = true,
  ): PatientProps {
    const contact = validateNameAndPhone(props);
    return {
      fullName: contact.fullName,
      email: normalizeOptionalEmail(props.email),
      phone: normalizePhone
        ? normalizeBrazilianPhoneOrThrow(contact.phone)
        : contact.phone,
      birthDate: props.birthDate ?? null,
      notes: props.notes ?? null,
      referredByPartnerId: props.referredByPartnerId ?? null,
      guardianId: props.guardianId ?? null,
    };
  }

  update(changes: Partial<PatientProps>): Patient {
    // Telefone legado (fora do E.164) segue válido enquanto ninguém o altera:
    // editar outro campo não pode travar o cadastro (#324).
    const phoneChanged =
      changes.phone !== undefined && changes.phone.trim() !== this.state.phone;
    const validated = Patient.validate(
      {
        fullName: changes.fullName ?? this.state.fullName,
        email: changes.email !== undefined ? changes.email : this.state.email,
        phone: phoneChanged ? (changes.phone ?? '') : this.state.phone,
        birthDate:
          changes.birthDate !== undefined
            ? changes.birthDate
            : this.state.birthDate,
        notes: changes.notes !== undefined ? changes.notes : this.state.notes,
        referredByPartnerId:
          changes.referredByPartnerId !== undefined
            ? changes.referredByPartnerId
            : this.state.referredByPartnerId,
        guardianId:
          changes.guardianId !== undefined
            ? changes.guardianId
            : this.state.guardianId,
      },
      phoneChanged,
    );
    return new Patient({ ...this.state, ...validated });
  }

  deactivate(): Patient {
    return new Patient({ ...this.state, active: false });
  }

  reactivate(): Patient {
    if (this.isAnonymized) {
      throw new ConflictError(ANONYMIZED_PATIENT_REACTIVATION);
    }
    return new Patient({ ...this.state, active: true });
  }

  get isAnonymized(): boolean {
    return (this.state.anonymizedAt ?? null) !== null;
  }

  get id(): string {
    return this.state.id;
  }

  get fullName(): string {
    return this.state.fullName;
  }

  get email(): string | null {
    return this.state.email ?? null;
  }

  get phone(): string {
    return this.state.phone;
  }

  /** Telefone guardado antes da #324 (fora do E.164 BR): sinalizar para correção. */
  get phoneNeedsCorrection(): boolean {
    // Anonimizado (PRO-RN-15) não tem telefone: nada a corrigir.
    return !this.isAnonymized && !isBrazilianE164(this.state.phone);
  }

  get birthDate(): Date | null {
    return this.state.birthDate ?? null;
  }

  get notes(): string | null {
    return this.state.notes ?? null;
  }

  get referredByPartnerId(): string | null {
    return this.state.referredByPartnerId ?? null;
  }

  get guardianId(): string | null {
    return this.state.guardianId ?? null;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
