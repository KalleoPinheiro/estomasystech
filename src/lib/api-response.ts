import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  ConflictError,
  ConsentRequiredError,
  DomainError,
  InvalidStatusTransitionError,
  NotFoundError,
  ProvisioningDeniedError,
  SchedulingConflictError,
} from '@/domain/shared/errors';
import { logError } from '@/lib/log-error';

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
  if (error instanceof ProvisioningDeniedError) return 403;
  if (error instanceof SchedulingConflictError) return 409;
  if (error instanceof ConflictError) return 409;
  if (error instanceof InvalidStatusTransitionError) return 409;
  return 400;
}

export async function handleRequest<T>(
  action: () => Promise<T>,
  buildMeta?: (result: T) => { nextCursor: string | null },
): Promise<NextResponse<ApiEnvelope<T>>> {
  try {
    const result = await action();
    return ok(result, 200, buildMeta?.(result));
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return fail(`Dados inválidos: ${detail}`, 400);
    }
    if (error instanceof DomainError) {
      return fail(error.message, statusForDomainError(error));
    }
    logError('Erro inesperado na API:', error);
    return fail('Erro interno do servidor', 500);
  }
}
