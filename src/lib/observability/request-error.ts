import { logError } from '@/lib/log-error';
import { isValidRequestId, REQUEST_ID_HEADER } from './request-id';
import { recordSignal } from './signals';

/** Formato do `onRequestError` do Next (só o que usamos). */
export interface RequestErrorInfo {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RequestErrorContext {
  routePath: string;
  routeType: string;
}

/**
 * Erro que escapou de um handler, server component ou action (#212): conta
 * como 5xx para o alerta, vai ao log em JSON e ao GlitchTip. Vai a rota do
 * arquivo (`/api/patients/[id]`), não o caminho da requisição: o caminho tem
 * ids e query string. Cabeçalhos e corpo nunca saem daqui.
 */
export function reportRequestError(
  error: unknown,
  request: RequestErrorInfo,
  context: RequestErrorContext,
): void {
  recordSignal('server-error');
  const header = request.headers[REQUEST_ID_HEADER];
  const requestId = typeof header === 'string' ? header : undefined;
  logError('Erro não tratado na requisição', error, {
    ...(isValidRequestId(requestId) ? { requestId } : {}),
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
}
