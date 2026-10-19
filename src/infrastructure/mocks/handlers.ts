import { HttpResponse, http } from 'msw';

/**
 * Respostas fictícias das integrações externas (ADR-041). Valem só em
 * homologação/preview/dev, ligadas por `MOCK_INTEGRATIONS=true`
 * (`src/lib/runtime-env.ts` recusa em produção). O banco é TCP e não passa
 * por aqui: dado fictício vem do seed, não do MSW.
 *
 * Cenário de erro sem tocar o código: destinatário de e-mail
 * `erro@homologacao.invalid` devolve 500; chave S3 com `__erro__` devolve 403.
 */
export const MOCK_ERROR_EMAIL = 'erro@homologacao.invalid';
export const MOCK_ERROR_S3_MARKER = '__erro__';

interface ResendBody {
  to?: string[];
}

const resendHandler = http.post(
  'https://api.resend.com/emails',
  async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as ResendBody;
    if (body.to?.includes(MOCK_ERROR_EMAIL)) {
      return HttpResponse.json(
        { name: 'application_error', message: 'Falha simulada' },
        { status: 500 },
      );
    }
    return HttpResponse.json({ id: 'mock-email-id' });
  },
);

const googleHandlers = [
  http.post('https://oauth2.googleapis.com/token', () =>
    HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  ),
  http.post(
    'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events',
    () => HttpResponse.json({ id: 'mock-event-id', status: 'confirmed' }),
  ),
  http.all(
    'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId',
    ({ request, params }) =>
      request.method === 'DELETE'
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json({ id: params.eventId, status: 'confirmed' }),
  ),
];

/** Bucket em memória: some quando a instância reinicia (homologação). */
function s3Handler(store: Map<string, ArrayBuffer>) {
  return http.all(
    /^https:\/\/([^/]+\.)?(amazonaws\.com|r2\.cloudflarestorage\.com)\/.+/,
    async ({ request }) => {
      const { pathname } = new URL(request.url);
      if (pathname.includes(MOCK_ERROR_S3_MARKER)) {
        return new HttpResponse(null, { status: 403 });
      }
      if (request.method === 'PUT') {
        store.set(pathname, await request.arrayBuffer());
        return new HttpResponse(null, { status: 200 });
      }
      if (request.method === 'DELETE') {
        store.delete(pathname);
        return new HttpResponse(null, { status: 204 });
      }
      const object = store.get(pathname);
      return object
        ? new HttpResponse(object, { status: 200 })
        : new HttpResponse(null, { status: 404 });
    },
  );
}

export function buildMockHandlers(store = new Map<string, ArrayBuffer>()) {
  return [resendHandler, ...googleHandlers, s3Handler(store)];
}
