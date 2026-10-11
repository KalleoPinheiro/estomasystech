import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthToken, hashAuthTokenSecret } from '@/domain/auth/auth-token';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuthTokenRepository } from '@/infrastructure/persistence/drizzle/drizzle-auth-token-repository';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC_ID = 'clinic-auth-tokens';
const NOW = new Date('2026-09-01T12:00:00.000Z').getTime();

/**
 * AUTH-03: token persistido guarda só o hash; expirado, usado ou inexistente
 * nunca sai do repositório como usável.
 */
describe('Feature: Persistência de tokens de ativação (Drizzle)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let tokens: DrizzleAuthTokenRepository;
  let accountId: string;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
    tokens = new DrizzleAuthTokenRepository(appDb);

    await new DrizzleClinicRepository(appDb).create(
      Clinic.restore({
        id: CLINIC_ID,
        name: 'Clínica dos tokens',
        createdBy: 'test',
        createdAt: new Date(NOW),
      }),
    );
    const account = UserAccount.create({
      email: 'pessoa@clinica.com',
      passwordHash: 'scrypt$16384$aa$bb',
      role: 'company_admin',
      clinicId: CLINIC_ID,
    });
    await new DrizzleUserAccountRepository(appDb, CLINIC_ID).save(account);
    accountId = account.id;
  });

  beforeEach(async () => {
    await db.delete(schema.authTokens);
  });

  it('Dado um token salvo, Quando reivindicar pelo hash do segredo, Então devolve o token com os campos preservados e já marcado como usado', async () => {
    const { token, secret } = AuthToken.issue({
      accountId,
      purpose: 'invite',
      nowMs: NOW,
    });
    await tokens.save(token);

    const found = await tokens.claimBySecretHash(
      hashAuthTokenSecret(secret),
      NOW + 1000,
    );

    expect(found?.id).toBe(token.id);
    expect(found?.accountId).toBe(accountId);
    expect(found?.purpose).toBe('invite');
    expect(found?.expiresAt.getTime()).toBe(token.expiresAt.getTime());
    // A reivindicação queima o token no mesmo comando que o valida.
    expect(found?.usedAt?.getTime()).toBe(NOW + 1000);
  });

  it('Dado duas reivindicações do mesmo token, Quando concorrerem, Então só a primeira recebe a linha (uso único sob corrida)', async () => {
    const { token, secret } = AuthToken.issue({
      accountId,
      purpose: 'invite',
      nowMs: NOW,
    });
    await tokens.save(token);
    const hash = hashAuthTokenSecret(secret);

    const [first, second] = await Promise.all([
      tokens.claimBySecretHash(hash, NOW + 1000),
      tokens.claimBySecretHash(hash, NOW + 1000),
    ]);

    // Exatamente uma das duas leva o token; a outra é tratada como link inválido.
    expect([first, second].filter((claim) => claim !== null)).toHaveLength(1);
  });

  it('Dado um token válido, Quando ler sem reivindicar, Então devolve o token sem queimá-lo e deixa de devolver depois do uso ou da validade (#291)', async () => {
    const { token, secret } = AuthToken.issue({
      accountId,
      purpose: 'reset',
      nowMs: NOW,
    });
    await tokens.save(token);
    const hash = hashAuthTokenSecret(secret);

    const peeked = await tokens.findUsableBySecretHash(hash, NOW + 1000);
    expect(peeked?.id).toBe(token.id);
    expect(peeked?.usedAt).toBeNull();
    expect(
      await tokens.findUsableBySecretHash(hash, token.expiresAt.getTime() + 1),
    ).toBeNull();

    expect(await tokens.claimBySecretHash(hash, NOW + 2000)).not.toBeNull();
    expect(await tokens.findUsableBySecretHash(hash, NOW + 3000)).toBeNull();
  });

  it('Dado um hash que não existe, Quando buscar, Então devolve null', async () => {
    expect(
      await tokens.claimBySecretHash(hashAuthTokenSecret('nao-existe'), NOW),
    ).toBeNull();
  });

  it('Dado um token expirado, Quando buscar, Então devolve null', async () => {
    const { token, secret } = AuthToken.issue({
      accountId,
      purpose: 'reset',
      nowMs: NOW,
    });
    await tokens.save(token);

    const found = await tokens.claimBySecretHash(
      hashAuthTokenSecret(secret),
      NOW + 60 * 60 * 1000 + 1,
    );

    expect(found).toBeNull();
  });

  it('Dado um token já marcado como usado, Quando buscar, Então devolve null', async () => {
    const { token, secret } = AuthToken.issue({
      accountId,
      purpose: 'invite',
      nowMs: NOW,
    });
    await tokens.save(token);
    await tokens.save(token.markUsed(new Date(NOW + 10)));

    expect(
      await tokens.claimBySecretHash(hashAuthTokenSecret(secret), NOW + 20),
    ).toBeNull();
  });

  it('Dado tokens de dois propósitos, Quando invalidar em lote um propósito, Então só ele é invalidado', async () => {
    const invite = AuthToken.issue({
      accountId,
      purpose: 'invite',
      nowMs: NOW,
    });
    const reset = AuthToken.issue({ accountId, purpose: 'reset', nowMs: NOW });
    await tokens.save(invite.token);
    await tokens.save(reset.token);

    await tokens.markAllUnusedAsUsed(accountId, 'invite', new Date(NOW + 5));

    expect(
      await tokens.claimBySecretHash(
        hashAuthTokenSecret(invite.secret),
        NOW + 10,
      ),
    ).toBeNull();
    expect(
      await tokens.claimBySecretHash(
        hashAuthTokenSecret(reset.secret),
        NOW + 10,
      ),
    ).not.toBeNull();
  });

  it('Dado tokens de outra conta, Quando invalidar em lote, Então os da outra conta continuam usáveis', async () => {
    const other = UserAccount.create({
      email: 'outra@clinica.com',
      passwordHash: 'scrypt$16384$aa$bb',
      role: 'atendente',
      clinicId: CLINIC_ID,
    });
    await new DrizzleUserAccountRepository(appDb, CLINIC_ID).save(other);
    const mine = AuthToken.issue({ accountId, purpose: 'reset', nowMs: NOW });
    const theirs = AuthToken.issue({
      accountId: other.id,
      purpose: 'reset',
      nowMs: NOW,
    });
    await tokens.save(mine.token);
    await tokens.save(theirs.token);

    await tokens.markAllUnusedAsUsed(accountId, 'reset', new Date(NOW + 5));

    expect(
      await tokens.claimBySecretHash(
        hashAuthTokenSecret(mine.secret),
        NOW + 10,
      ),
    ).toBeNull();
    expect(
      await tokens.claimBySecretHash(
        hashAuthTokenSecret(theirs.secret),
        NOW + 10,
      ),
    ).not.toBeNull();
  });

  it('Dado um token não usado, Quando replaceUnused, Então invalida o anterior e insere o novo atomicamente', async () => {
    const first = AuthToken.issue({ accountId, purpose: 'reset', nowMs: NOW });
    await tokens.save(first.token);

    const second = AuthToken.issue({
      accountId,
      purpose: 'reset',
      nowMs: NOW + 1000,
    });
    await tokens.replaceUnused(second.token, new Date(NOW + 1000));

    expect(
      await tokens.claimBySecretHash(
        hashAuthTokenSecret(first.secret),
        NOW + 2000,
      ),
    ).toBeNull();
    expect(
      await tokens.claimBySecretHash(
        hashAuthTokenSecret(second.secret),
        NOW + 2000,
      ),
    ).not.toBeNull();
  });

  it('Dado duas emissões concorrentes da mesma conta+propósito, Quando replaceUnused em Promise.all, Então só um token não-usado sobrevive (issue #50)', async () => {
    const a = AuthToken.issue({ accountId, purpose: 'invite', nowMs: NOW });
    const b = AuthToken.issue({ accountId, purpose: 'invite', nowMs: NOW });

    await Promise.all([
      tokens.replaceUnused(a.token, new Date(NOW)),
      tokens.replaceUnused(b.token, new Date(NOW)),
    ]);

    const claims = await Promise.all([
      tokens.claimBySecretHash(hashAuthTokenSecret(a.secret), NOW + 1000),
      tokens.claimBySecretHash(hashAuthTokenSecret(b.secret), NOW + 1000),
    ]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });
});
