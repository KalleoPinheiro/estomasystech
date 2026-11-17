import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

export const AUDIT_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventProps {
  /**
   * Empresa a que o evento pertence (a clínica-alvo, quando o super_admin age
   * sobre uma clínica). `null` = evento de plataforma: sem empresa, visível só
   * ao super_admin (B6, #210).
   */
  clinicId: string | null;
  /** Papel do ator (admin, patient, partner). */
  actorRole: string;
  /**
   * Identificador do ator. No login, o id da conta; vazio quando a tentativa
   * não identifica uma conta (#887).
   */
  actorId: string;
  action: AuditAction;
  /** Tipo do recurso acessado (ex.: "anamnesis", "evolution", "condition"). */
  resourceType: string;
  resourceId: string;
  /** Paciente titular do dado, quando aplicável — base das consultas LGPD. */
  patientId?: string | null;
  /** Metadados curtos (nunca conteúdo clínico). */
  detail?: string | null;
}

export interface AuditEventState extends AuditEventProps {
  id: string;
  occurredAt: Date;
}

/**
 * Login sem conta (#887): e-mail desconhecido, senha errada ou credencial
 * ambígua. Os dois ids ficam vazios. Qualquer outro evento exige ator e recurso.
 */
function unidentifiedLogin(props: AuditEventProps): boolean {
  return (
    props.actorRole === 'anonymous' &&
    props.resourceType === 'session' &&
    props.actorId === '' &&
    props.resourceId === ''
  );
}

function hasActor(props: AuditEventProps): boolean {
  return props.actorId.trim() !== '' || unidentifiedLogin(props);
}

function hasResource(props: AuditEventProps): boolean {
  return props.resourceId.trim() !== '' || unidentifiedLogin(props);
}

/** Evento de auditoria de prontuário — imutável (append-only). */
export class AuditEvent {
  private constructor(private readonly state: AuditEventState) {}

  static create(props: AuditEventProps): AuditEvent {
    if (props.clinicId !== null && !props.clinicId.trim()) {
      throw new ValidationError('Empresa da auditoria é obrigatória');
    }
    if (!props.actorRole.trim() || !hasActor(props)) {
      throw new ValidationError('Ator da auditoria é obrigatório');
    }
    if (!props.resourceType.trim() || !hasResource(props)) {
      throw new ValidationError('Recurso auditado é obrigatório');
    }
    return new AuditEvent({
      clinicId: props.clinicId,
      actorRole: props.actorRole,
      actorId: props.actorId,
      action: props.action,
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      patientId: props.patientId ?? null,
      detail: props.detail ?? null,
      id: newId(),
      occurredAt: new Date(),
    });
  }

  static restore(state: AuditEventState): AuditEvent {
    return new AuditEvent({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get clinicId(): string | null {
    return this.state.clinicId;
  }

  get actorRole(): string {
    return this.state.actorRole;
  }

  get actorId(): string {
    return this.state.actorId;
  }

  get action(): AuditAction {
    return this.state.action;
  }

  get resourceType(): string {
    return this.state.resourceType;
  }

  get resourceId(): string {
    return this.state.resourceId;
  }

  get patientId(): string | null {
    return this.state.patientId ?? null;
  }

  get detail(): string | null {
    return this.state.detail ?? null;
  }

  get occurredAt(): Date {
    return this.state.occurredAt;
  }
}
