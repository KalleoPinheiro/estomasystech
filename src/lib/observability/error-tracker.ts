import {
  createStackParser,
  createTransport,
  type ErrorEvent,
  type Event,
  nodeStackLineParser,
  ServerRuntimeClient,
  type Transport,
  type TransportMakeRequestResponse,
  type TransportRequest,
} from '@sentry/core';
import type { SafeErrorLog } from '@/lib/log-error';
import { scrubText } from '@/lib/redact';

/**
 * Error tracking no GlitchTip self-hosted (#212, ADR-014), pelo SDK base do
 * Sentry (`@sentry/core`), sem integrações automáticas: nada de request,
 * cookies, cabeçalhos, usuário, breadcrumbs ou console. O evento é montado
 * aqui a partir do erro já sanitizado por `logError` (lista do que pode ir,
 * não do que não pode); `scrubEvent` é a segunda barreira, para qualquer
 * campo que o SDK venha a preencher.
 *
 * Sem `GLITCHTIP_DSN` tudo aqui é no-op.
 */
const REQUEST_TIMEOUT_MS = 5_000;

const globalForTracker = globalThis as unknown as {
  /** `client` nulo = DSN malformado (lembrado para não recriar a cada erro). */
  estomasystechErrorTracker?: {
    dsn: string;
    client: ServerRuntimeClient | null;
  };
};

function fetchTransport(
  options: Parameters<typeof createTransport>[0] & {
    url: string;
  },
): Transport {
  return createTransport(
    options,
    async (
      request: TransportRequest,
    ): Promise<TransportMakeRequestResponse> => {
      const response = await fetch(options.url, {
        method: 'POST',
        cache: 'no-store',
        body: request.body as BodyInit,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return {
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'),
          'retry-after': response.headers.get('retry-after'),
        },
      };
    },
  );
}

/** Campos de evento que nunca saem do processo (LGPD, #212). */
const DROPPED_FIELDS = [
  'request',
  'user',
  'breadcrumbs',
  'extra',
  'contexts',
  'server_name',
  'modules',
  'sdkProcessingMetadata',
] as const;

/** Tags são valores curtos; o `requestId` já foi validado pelo proxy. */
function scrubTags(tags: NonNullable<Event['tags']>): Event['tags'] {
  return Object.fromEntries(
    Object.entries(tags).map(([key, value]) => [
      key,
      key === 'requestId' || typeof value !== 'string'
        ? value
        : scrubText(value),
    ]),
  );
}

/** Segunda barreira: remove o que não é da lista e limpa texto livre. */
export function scrubEvent<T extends Event>(event: T): T {
  const clean = { ...event } as Record<string, unknown>;
  for (const field of DROPPED_FIELDS) {
    delete clean[field];
  }
  if (typeof event.message === 'string') {
    clean.message = scrubText(event.message);
  }
  if (typeof event.transaction === 'string') {
    clean.transaction = scrubText(event.transaction);
  }
  if (event.tags) {
    clean.tags = scrubTags(event.tags);
  }
  if (event.exception?.values) {
    clean.exception = {
      values: event.exception.values.map((value) => ({
        ...value,
        value: value.value === undefined ? undefined : scrubText(value.value),
      })),
    };
  }
  return clean as T;
}

function createClient(dsn: string): ServerRuntimeClient {
  const client = new ServerRuntimeClient({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.APP_RELEASE || undefined,
    integrations: [],
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    sendClientReports: false,
    stackParser: createStackParser(nodeStackLineParser()),
    transport: fetchTransport,
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    platform: 'node',
  });
  client.init();
  return client;
}

/** Cliente do processo, refeito se o DSN mudar (testes trocam o ambiente). */
function currentClient(): ServerRuntimeClient | null {
  const dsn = process.env.GLITCHTIP_DSN?.trim();
  if (!dsn) {
    return null;
  }
  const cached = globalForTracker.estomasystechErrorTracker;
  if (cached?.dsn === dsn) {
    return cached.client;
  }
  // DSN malformado: o SDK não lança, só fica sem destino. O app segue sem
  // error tracking, nunca cai por isso.
  const client = createClient(dsn);
  globalForTracker.estomasystechErrorTracker = {
    dsn,
    client: client.getDsn() ? client : null,
  };
  return globalForTracker.estomasystechErrorTracker.client;
}

export function isErrorTrackingEnabled(): boolean {
  return currentClient() !== null;
}

export interface CapturedError {
  /** Contexto do `logError` (sem PII, só ids). */
  context: string;
  error: SafeErrorLog;
  requestId?: string;
}

/** Evento montado só com o que pode sair. Exportado para teste. */
export function buildEvent(captured: CapturedError): Event {
  const { context, error, requestId } = captured;
  const parser = createStackParser(nodeStackLineParser());
  const frames = error.stack ? parser(error.stack) : [];
  return {
    level: 'error',
    message: scrubText(context),
    exception: {
      values: [
        {
          type: error.name,
          value: scrubText(error.message ?? error.code ?? error.name),
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        },
      ],
    },
    tags: {
      ...(requestId ? { requestId } : {}),
      ...(error.code ? { code: error.code } : {}),
      ...(error.table ? { table: error.table } : {}),
    },
  };
}

/** Envia o erro ao GlitchTip, se configurado. Nunca lança. */
export function captureError(captured: CapturedError): void {
  const client = currentClient();
  if (!client) {
    return;
  }
  try {
    client.captureEvent(buildEvent(captured));
  } catch {
    // Falha do rastreador não pode virar erro da requisição.
  }
}

/** Para o teste: esquece o cliente em cache. */
export function resetErrorTracker(): void {
  globalForTracker.estomasystechErrorTracker = undefined;
}
