import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import {
  RecoveryPreconditionError,
  recoverSuperAdmin,
} from '@/infrastructure/persistence/drizzle/recover-super-admin';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { BlindIndex, LOGIN_INDEX_SCOPE } from '@/lib/blind-index';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const BLIND = new BlindIndex({
  current: 'pepper-de-teste-do-indice-cego-0000000001',
});
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

let db: AppDb;

const hashOf = (email: string) =>
  BLIND.hash(LOGIN_INDEX_SCOPE, 'login-email', email);

const account = (id: string, clinicId: string | null, email: string) => ({
  id,
  clinicId,
  email: TEST_CIPHER.encrypt(email),
  emailHash: hashOf(email),
  passwordHash: UNSET_PASSWORD_HASH,
  role: clinicId === null ? 'super_admin' : 'company_admin',
  createdAt: new Date(NOW),
});

const recover = (options: { newEmail?: string; confirm?: boolean }) =>
  recoverSuperAdmin(db, {
    appUrl: 'https://clinica.exemplo.com.br',
    confirm: options.confirm ?? true,
    newEmail: options.newEmail,
    nowMs: NOW,
    cipher: TEST_CIPHER,
    blindIndex: BLIND,
  });

const row = async (id: string) =>
  (
    await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, id))
  )[0];

describe('Feature: recuperação do super_admin com e-mail de login cifrado (ADR-111, #742)', () => {
  beforeEach(async () => {
    db = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;
    await db
      .insert(schema.userAccounts)
      .values([
        account('sa-1', null, 'dono@plataforma.test'),
        account('adm-1', LEGACY_CLINIC_ID, 'admin@clinica.test'),
      ]);
  });

  it('Dado e-mail cifrado, Quando simular, Então o plano mostra o e-mail legível e nada é gravado', async () => {
    const before = await row('sa-1');

    const result = await recover({ confirm: false });

    expect(result.plan.currentEmail).toBe('dono@plataforma.test');
    expect(result.applied).toBe(false);
    expect(await row('sa-1')).toEqual(before);
  });

  it('Dado --novo-email, Quando recuperar, Então grava cifrado com o índice cego novo', async () => {
    await recover({ newEmail: 'Novo@Plataforma.test' });

    const saved = await row('sa-1');
    expect(TEST_CIPHER.decrypt(saved.email)).toBe('novo@plataforma.test');
    expect(saved.email).not.toContain('novo@');
    expect(saved.emailHash).toBe(hashOf('novo@plataforma.test'));
  });

  it('Dado sem troca de e-mail, Quando recuperar, Então regrava cifrado com o hash atual (conta em claro passa a cifrada)', async () => {
    await db
      .update(schema.userAccounts)
      .set({ email: 'dono@plataforma.test', emailHash: null })
      .where(eq(schema.userAccounts.id, 'sa-1'));

    await recover({});

    const saved = await row('sa-1');
    expect(saved.email).toMatch(/^v1\./);
    expect(TEST_CIPHER.decrypt(saved.email)).toBe('dono@plataforma.test');
    expect(saved.emailHash).toBe(hashOf('dono@plataforma.test'));
  });

  it('Dado e-mail novo igual ao de outra conta cifrada, Quando recuperar, Então recusa e nada muda', async () => {
    const before = await row('sa-1');

    await expect(
      recover({ newEmail: 'admin@clinica.test' }),
    ).rejects.toBeInstanceOf(RecoveryPreconditionError);

    expect(await row('sa-1')).toEqual(before);
  });

  it('Dado e-mail novo igual ao atual (cifrado), Quando recuperar, Então não conta como troca', async () => {
    const result = await recover({ newEmail: 'DONO@plataforma.test' });

    expect(result.plan.newEmail).toBeNull();
  });
});
