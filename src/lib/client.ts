import type { ApiEnvelope } from './api-response';
import {
  redirectToLoginOnExpiredSession,
  SESSION_EXPIRED_MESSAGE,
} from './login-redirect';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Corpo que não é JSON (502/504 HTML do proxy reverso, 413…) — issue #207. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  'Serviço indisponível, tente novamente';

/** A chamada falhou porque a sessão expirou (o login já está a caminho). */
export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  // 401 fora das telas de login = sessão expirada: leva ao login com a rota
  // atual em `next`, em vez de virar um alerta de erro em cada tela (#207).
  if (response.status === 401 && redirectToLoginOnExpiredSession()) {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401);
  }
  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(SERVICE_UNAVAILABLE_MESSAGE, response.status);
  }
  // SPEC_DEVIATION: dropped `envelope.data === null` from the throw condition.
  // Reason (issue #65): `data: null` is a valid SUCCESS payload for endpoints
  // whose resource is legitimately optional (ex.: anamnese ainda não
  // registrada) — `success`/`error` já carregam o sinal real de falha. Antes,
  // toda primeira leitura de um recurso ainda-inexistente lançava
  // "Erro desconhecido" e o catch do `useApiQuery` escondia isso atrás de
  // `data` permanecer `null` — exatamente o padrão "erro confundido com sem
  // dado" que a #65 pede pra corrigir.
  if (!response.ok || !envelope?.success) {
    throw new ApiError(envelope?.error ?? 'Erro desconhecido', response.status);
  }
  return envelope;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const envelope = await request<T>(path, init);
  return envelope.data as T;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Como `apiFetch`, mas para listagens paginadas por cursor (issue #75). */
export async function apiFetchPage<T>(
  path: string,
  init?: RequestInit,
): Promise<CursorPage<T>> {
  const envelope = await request<T[]>(path, init);
  return {
    items: envelope.data ?? [],
    nextCursor: envelope.meta?.nextCursor ?? null,
  };
}
