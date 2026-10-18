import { maskCpf, normalizeOptionalCpf } from '../shared/cpf';
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
import { isMinorOn } from './majority';

export interface PatientProps {
  fullName: string;
  /**
   * E-mail de contato, opcional e repetível entre pacientes da mesma empresa
   * (ex.: o do cuidador). Não é identidade: o login do portal é uma conta com
   * e-mail próprio, vinculada ao paciente (ADR-023).
   */
  email?: string | null;
  phone: string;
  /** CPF (11 dígitos), opcional no cadastro; obrigatório só para emitir recibo (#326). */
  cpf?: string | null;
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
  /** O paciente encerrou o acesso do responsável ao portal (#354, ADR-028). */
  guardianPortalRevokedAt?: Date | null;
  /**
   * A clínica viu que o paciente fez 18 anos e decidiu manter o acesso com o
   * responsável (ex.: curatela) em vez de transferir (#372, ADR-032).
   */
  majorityReviewedAt?: Date | null;
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
      cpf: normalizeOptionalCpf(props.cpf),
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
        cpf: changes.cpf !== undefined ? changes.cpf : this.state.cpf,
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
    // Trocar ou desvincular o responsável é ato da equipe e zera a revogação:
    // o vínculo novo nasce sem ela (ADR-028).
    const guardianChanged = validated.guardianId !== this.state.guardianId;
    return new Patient({
      ...this.state,
      ...validated,
      ...(guardianChanged && {
        guardianPortalRevokedAt: null,
        majorityReviewedAt: null,
      }),
    });
  }

  /** A clínica mantém o acesso com o responsável depois dos 18 anos (ADR-032). */
  markMajorityReviewed(now: Date = new Date()): Patient {
    return new Patient({ ...this.state, majorityReviewedAt: now });
  }

  /** Menor de idade em `now` (sem data de nascimento, vale como adulto). */
  isMinorOn(now: Date = new Date()): boolean {
    return isMinorOn(this.state.birthDate, now);
  }

  /** O próprio paciente encerra o acesso do responsável ao portal (ADR-028). */
  revokeGuardianPortalAccess(now: Date = new Date()): Patient {
    return new Patient({ ...this.state, guardianPortalRevokedAt: now });
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

  /** CPF completo: só para o recibo — telas e listas usam `cpfMasked`. */
  get cpf(): string | null {
    return this.state.cpf ?? null;
  }

  get cpfMasked(): string | null {
    return this.state.cpf ? maskCpf(this.state.cpf) : null;
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

  get guardianPortalRevokedAt(): Date | null {
    return this.state.guardianPortalRevokedAt ?? null;
  }

  get majorityReviewedAt(): Date | null {
    return this.state.majorityReviewedAt ?? null;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
