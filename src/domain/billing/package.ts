import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

export interface SessionPackageProps {
  patientId: string;
  procedureId: string;
  totalSessions: number;
  priceCents: number;
  /** Validade opcional (COMP3-07): null = sem validade (comportamento histórico). */
  expiresAt?: Date | null;
}

export interface SessionPackageState extends SessionPackageProps {
  id: string;
  usedSessions: number;
  active: boolean;
  createdAt: Date;
}

const MAX_SESSIONS = 100;

/** Pacote de sessões pré-pago: consultas do procedimento consomem saldo em vez de faturar. */
export class SessionPackage {
  private constructor(private readonly state: SessionPackageState) {}

  static create(props: SessionPackageProps): SessionPackage {
    if (!props.patientId.trim() || !props.procedureId.trim()) {
      throw new ValidationError(
        'Plano de acompanhamento exige paciente e procedimento',
      );
    }
    if (
      !Number.isInteger(props.totalSessions) ||
      props.totalSessions < 1 ||
      props.totalSessions > MAX_SESSIONS
    ) {
      throw new ValidationError(
        `Plano de acompanhamento deve ter de 1 a ${MAX_SESSIONS} sessões`,
      );
    }
    if (!Number.isInteger(props.priceCents) || props.priceCents < 0) {
      throw new ValidationError(
        'Preço do plano de acompanhamento não pode ser negativo',
      );
    }
    return new SessionPackage({
      ...props,
      expiresAt: props.expiresAt ?? null,
      id: newId(),
      usedSessions: 0,
      active: true,
      createdAt: new Date(),
    });
  }

  static restore(state: SessionPackageState): SessionPackage {
    return new SessionPackage({ ...state });
  }

  consumeSession(): SessionPackage {
    if (!this.hasBalance) {
      throw new ValidationError('Plano de acompanhamento sem saldo de sessões');
    }
    return new SessionPackage({
      ...this.state,
      usedSessions: this.state.usedSessions + 1,
    });
  }

  cancel(): SessionPackage {
    return new SessionPackage({ ...this.state, active: false });
  }

  get hasBalance(): boolean {
    return (
      this.state.active && this.state.usedSessions < this.state.totalSessions
    );
  }

  get expiresAt(): Date | null {
    return this.state.expiresAt ?? null;
  }

  /** Elegível para consumo (COMP3-08): ativo, com saldo e dentro da validade. */
  isUsableAt(now: Date): boolean {
    const expiresAt = this.state.expiresAt ?? null;
    return (
      this.hasBalance &&
      (expiresAt === null || expiresAt.getTime() > now.getTime())
    );
  }

  get remainingSessions(): number {
    return this.state.totalSessions - this.state.usedSessions;
  }

  get id(): string {
    return this.state.id;
  }

  get patientId(): string {
    return this.state.patientId;
  }

  get procedureId(): string {
    return this.state.procedureId;
  }

  get totalSessions(): number {
    return this.state.totalSessions;
  }

  get usedSessions(): number {
    return this.state.usedSessions;
  }

  get priceCents(): number {
    return this.state.priceCents;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}

export interface SessionPackageRepository {
  save(pkg: SessionPackage): Promise<void>;
  findById(id: string): Promise<SessionPackage | null>;
  findByPatientId(patientId: string): Promise<SessionPackage[]>;
  /** Pacote ativo, com saldo e não expirado para o par paciente+procedimento (mais antigo primeiro). */
  findUsable(
    patientId: string,
    procedureId: string,
    now?: Date,
  ): Promise<SessionPackage | null>;
  /** Registra consumo por consulta — unique por consulta garante idempotência. */
  recordConsumption(packageId: string, appointmentId: string): Promise<void>;
  wasConsumedBy(appointmentId: string): Promise<boolean>;
}
