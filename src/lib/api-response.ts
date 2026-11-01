import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import {
  ConflictError,
  ConsentRequiredError,
  DomainError,
  ForbiddenError,
  InvalidStatusTransitionError,
  NotFoundError,
  ProvisioningDeniedError,
  SchedulingConflictError,
} from '@/domain/shared/errors';
import { logError } from '@/lib/log-error';
import { logger } from '@/lib/observability/logger';
import { recordSignal } from '@/lib/observability/signals';

// Mensagens de validação em português para a tela (rotas e Server Actions): sem
// isto, o `zod` devolve «Too small: expected string to have >=1 characters».
z.config(z.locales.pt());

/**
 * Caminho do campo para a mensagem. As Server Actions recebem `{ id, body }` e
 * o campo é o que a pessoa vê na tela, então o `body.` do envelope não vaza.
 */
const fieldPath = (path: ReadonlyArray<PropertyKey>): string =>
  (path.length > 1 && path[0] === 'body' ? path.slice(1) : path).join('.');

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  /** Paginação por cursor (issue #75): presente só nas listagens paginadas. */
  meta?: { nextCursor: string | null };
}

export function ok<T>(
  data: T,
  status = 200,
  meta?: { nextCursor: string | null },
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    { success: true, data, error: null, meta },
    { status },
  );
}

export function fail(
  message: string,
  status: number,
): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status },
  );
}

function statusForDomainError(error: DomainError): number {
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConsentRequiredError) return 403;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof ProvisioningDeniedError) return 403;
  if (error instanceof SchedulingConflictError) return 409;
  if (error instanceof ConflictError) return 409;
  if (error instanceof InvalidStatusTransitionError) return 409;
  return 400;
}

/** Mensagem e status HTTP de uma exceção — a mesma tradução para rotas e Server Actions. */
export function describeFailure(error: unknown): {
  message: string;
  status: number;
} {
  if (error instanceof ZodError) {
    const detail = error.issues
      .map((issue) => `${fieldPath(issue.path)}: ${issue.message}`)
      .join('; ');
    return { message: `Dados inválidos: ${detail}`, status: 400 };
  }
  if (error instanceof NotFoundError) {
    // O id saiu da mensagem (issue #219); fica só aqui, para diagnóstico.
    logger.info('[api] 404', {
      entity: error.entity,
      entityId: error.entityId,
    });
  }
  if (error instanceof DomainError) {
    return { message: error.message, status: statusForDomainError(error) };
  }
  logError('Erro inesperado na API:', error);
  recordSignal('server-error');
  return { message: 'Erro interno do servidor', status: 500 };
}

export async function handleRequest<T>(
  action: () => Promise<T>,
  buildMeta?: (result: T) => { nextCursor: string | null },
): Promise<NextResponse<ApiEnvelope<T>>> {
  try {
    const result = await action();
    return ok(result, 200, buildMeta?.(result));
  } catch (error) {
    const { message, status } = describeFailure(error);
    return fail(message, status);
  }
}
