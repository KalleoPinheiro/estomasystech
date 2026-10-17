import { ConflictError } from '../shared/errors';
import { newId } from '../shared/id';
import { validatePersonContact } from '../shared/person-validation';

export interface PatientProps {
  fullName: string;
  email: string;
  phone: string;
  birthDate?: Date | null;
  notes?: string | null;
  /** Médico parceiro que indicou o paciente (estrutura de indicação). */
  referredByPartnerId?: string | null;
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

  private static validate(props: PatientProps): PatientProps {
    return {
      ...validatePersonContact(props),
      birthDate: props.birthDate ?? null,
      notes: props.notes ?? null,
      referredByPartnerId: props.referredByPartnerId ?? null,
    };
  }

  update(changes: Partial<PatientProps>): Patient {
    const validated = Patient.validate({
      fullName: changes.fullName ?? this.state.fullName,
      email: changes.email ?? this.state.email,
      phone: changes.phone ?? this.state.phone,
      birthDate:
        changes.birthDate !== undefined
          ? changes.birthDate
          : this.state.birthDate,
      notes: changes.notes !== undefined ? changes.notes : this.state.notes,
      referredByPartnerId:
        changes.referredByPartnerId !== undefined
          ? changes.referredByPartnerId
          : this.state.referredByPartnerId,
    });
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

  get email(): string {
    return this.state.email;
  }

  get phone(): string {
    return this.state.phone;
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

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
