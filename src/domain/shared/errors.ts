export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
}

export class InvalidTimeSlotError extends DomainError {
  readonly code = 'INVALID_TIME_SLOT';
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(entity: string, id: string) {
    super(`${entity} não encontrado(a): ${id}`);
  }
}

export class SchedulingConflictError extends DomainError {
  readonly code = 'SCHEDULING_CONFLICT';
}

/** Ação exige consentimento vigente do titular (LGPD) — mapeado para 403. */
/** Operação colide com estado já gravado (ex.: sessão já paga em outro repasse). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

export class ConsentRequiredError extends DomainError {
  readonly code = 'CONSENT_REQUIRED';
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
}

/** Ator tentou cadastrar um papel/empresa fora do que a hierarquia permite (RBAC-11..14). */
export class ProvisioningDeniedError extends DomainError {
  readonly code = 'PROVISIONING_DENIED';
}
