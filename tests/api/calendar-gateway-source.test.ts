import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCalendarGateway } from '@/application/ports/calendar-gateway';
import { DrizzleGoogleAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-google-account-repository';
import { encryptSecret } from '@/lib/auth/crypto';
import { systemScope } from '@/lib/auth/tenant-scope';

process.env.VITTA_DB_DRIVER = 'pglite';

const clearGoogleAccounts = async () => {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  const schema = await import('@/infrastructure/persistence/drizzle/schema');
  const db = await getDb();
  await db.delete(schema.googleAccounts);
};

const withoutServiceAccount = () => {
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_CALENDAR_ID;
};

/**
 * AUTH-20: com uma credencial conectada pelo fluxo desacoplado, o gateway de
 * agenda é montado a partir dela — sem depender de `GOOGLE_ALLOWED_EMAILS`,
 * que deixou de participar da configuração.
 *
 * A2: montar os serviços não lê a credencial — só o primeiro uso da agenda.
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

  it('Dado uma credencial conectada e nenhuma allowlist, Quando usar a agenda, Então o gateway resolvido é o Google', async () => {
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
    // credencial força a reconstrução na próxima resolução.
    const { calendar } = await getRepositories(systemScope());
    const resolved = await resolveCalendarGateway(calendar);

    expect(resolved.constructor.name).toBe('GoogleCalendarGateway');
  });

  it('data key: credencial cifrada com a chave de dados (#195) resolve o Google; a do formato legado acima também', async () => {
    const { currentDataCipher, getRepositories } = await import(
      '@/infrastructure/container'
    );
    const { googleAccounts } = await getRepositories(systemScope());
    await googleAccounts.save({
      email: 'equipe-agenda-v1@clinica.com',
      encryptedRefreshToken: currentDataCipher().encrypt('refresh-token-v1'),
      connectedAt: new Date(Date.now() + 1_000),
    });

    const { calendar } = await getRepositories(systemScope());
    const resolved = await resolveCalendarGateway(calendar);

    expect(resolved.constructor.name).toBe('GoogleCalendarGateway');
  });

  it('Dada integração OAuth configurada, Quando montar os serviços, Então a credencial não é lida até o primeiro uso', async () => {
    const findMostRecent = vi.spyOn(
      DrizzleGoogleAccountRepository.prototype,
      'findMostRecent',
    );
    const { getRepositories } = await import('@/infrastructure/container');

    const { calendar } = await getRepositories(systemScope());

    expect(findMostRecent).not.toHaveBeenCalled();
    await resolveCalendarGateway(calendar);
    await resolveCalendarGateway(calendar);
    expect(findMostRecent).toHaveBeenCalledTimes(1);
  });

  it('Dada integração OAuth configurada sem conta conectada, Quando usar a agenda, Então resolve para o nulo', async () => {
    await clearGoogleAccounts();
    withoutServiceAccount();
    const { getRepositories } = await import('@/infrastructure/container');

    const { calendar } = await getRepositories(systemScope());

    expect(calendar.constructor.name).toBe('LazyCalendarGateway');
    expect((await resolveCalendarGateway(calendar)).constructor.name).toBe(
      'NullCalendarGateway',
    );
  });

  it('Dada service account e nenhuma conta conectada, Quando usar a agenda, Então o gateway resolvido é o Google', async () => {
    await clearGoogleAccounts();
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sa@vitta.iam.test';
    process.env.GOOGLE_PRIVATE_KEY = 'chave-fake';
    process.env.GOOGLE_CALENDAR_ID = 'agenda@vitta.test';
    const { getRepositories } = await import('@/infrastructure/container');

    const { calendar } = await getRepositories(systemScope());

    expect((await resolveCalendarGateway(calendar)).constructor.name).toBe(
      'GoogleCalendarGateway',
    );
  });

  it('Dado nenhuma integração no ambiente, Quando montar os serviços, Então o gateway é o nulo sem consultar o banco', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    withoutServiceAccount();
    const findMostRecent = vi.spyOn(
      DrizzleGoogleAccountRepository.prototype,
      'findMostRecent',
    );
    const { getRepositories } = await import('@/infrastructure/container');

    const { calendar } = await getRepositories(systemScope());

    expect(calendar.constructor.name).toBe('NullCalendarGateway');
    expect(findMostRecent).not.toHaveBeenCalled();
  });
});
