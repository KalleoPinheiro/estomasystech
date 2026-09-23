import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '@/lib/auth/crypto';
import { systemScope } from '@/lib/auth/tenant-scope';

process.env.VITTA_DB_DRIVER = 'pglite';

/**
 * AUTH-20: com uma credencial conectada pelo fluxo desacoplado, o gateway de
 * agenda é montado a partir dela — sem depender de `GOOGLE_ALLOWED_EMAILS`,
 * que deixou de participar da configuração.
 */
describe('Feature: Origem da credencial do Google Agenda', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-abc';
    process.env.GOOGLE_CLIENT_SECRET = 'secret-xyz';
    process.env.APP_URL = 'https://app.vitta.test';
    delete process.env.GOOGLE_ALLOWED_EMAILS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('Dado uma credencial conectada e nenhuma allowlist, Quando montar os serviços, Então o gateway de agenda está habilitado', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { googleAccounts } = await getRepositories(systemScope());
    await googleAccounts.save({
      email: 'equipe-agenda@clinica.com',
      encryptedRefreshToken: encryptSecret(
        'refresh-token-conectado',
        process.env.AUTH_SECRET as string,
      ),
      connectedAt: new Date(),
    });

    // Chave de cache do gateway inclui o instante da conexão, então a nova
    // credencial força a reconstrução na próxima montagem.
    const { calendar } = await getRepositories(systemScope());

    expect(calendar.constructor.name).toBe('GoogleCalendarGateway');
  });

  it('Dado nenhuma credencial conectada e nenhuma service account, Quando montar os serviços, Então o gateway de agenda é o nulo', async () => {
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const schema = await import('@/infrastructure/persistence/drizzle/schema');
    const db = await getDb();
    await db.delete(schema.googleAccounts);
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.GOOGLE_CALENDAR_ID;

    const { getRepositories } = await import('@/infrastructure/container');
    const { calendar } = await getRepositories(systemScope());

    expect(calendar.constructor.name).toBe('NullCalendarGateway');
  });
});
