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

/** Entidades com texto no feminino (#657); as demais seguem «não encontrado(a)». */
const FEMININE_ENTITIES: ReadonlySet<string> = new Set(['Fatura']);

/**
 * A mensagem vai para a UI e não carrega o id (issue #219): identificador
 * interno não é texto para o usuário. O id fica em `entityId`, para log.
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(
    readonly entity: string,
    readonly entityId: string,
  ) {
    super(
      FEMININE_ENTITIES.has(entity)
        ? `${entity} não encontrada`
        : `${entity} não encontrado(a)`,
    );
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

/** O papel da sessão não pode fazer esta ação neste recurso — mapeado para 403. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/** Ator tentou cadastrar um papel/empresa fora do que a hierarquia permite (RBAC-11..14). */
export class ProvisioningDeniedError extends DomainError {
  readonly code = 'PROVISIONING_DENIED';
}
