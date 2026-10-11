import { and, eq, isNull, lt } from 'drizzle-orm';
import type {
  CompleteEnrollmentInput,
  MfaFactor,
  MfaRepository,
  RecoveryCodeRecord,
} from '@/domain/auth/mfa';
import { newId } from '@/domain/shared/id';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { mfaRecoveryCodes, userAccounts, userMfa } from './schema';

/**
 * Segundo fator TOTP (ADR-008, ADR-012). Sem escopo de clínica, como
 * `auth_tokens`: o acesso é sempre pela conta, antes de existir sessão.
 */
export class DrizzleMfaRepository implements MfaRepository {
  constructor(
    private readonly db: AppDb,
    private readonly cipher: FieldCipher,
  ) {}

  async findFactor(accountId: string): Promise<MfaFactor | null> {
    const [row] = await this.db
      .select()
      .from(userMfa)
      .where(eq(userMfa.accountId, accountId))
      .limit(1);
    if (!row) return null;
    return {
      accountId: row.accountId,
      secret: this.cipher.decrypt(row.totpSecret),
      enrolledAt: row.enrolledAt,
      lastUsedStep: row.lastUsedStep,
    };
  }

  async claimStep(accountId: string, step: number): Promise<boolean> {
    const rows = await this.db
      .update(userMfa)
      .set({ lastUsedStep: step })
      .where(
        and(eq(userMfa.accountId, accountId), lt(userMfa.lastUsedStep, step)),
      )
      .returning({ accountId: userMfa.accountId });
    return rows.length === 1;
  }

  completeEnrollment(input: CompleteEnrollmentInput): Promise<boolean> {
    const factor = {
      accountId: input.accountId,
      totpSecret: this.cipher.encrypt(input.secret),
      enrolledAt: input.now,
      lastUsedStep: input.step,
    };
    return this.db.transaction(async (tx) => {
      // Compare-and-set: de duas confirmações com o mesmo token, só uma passa.
      const bumped = await tx
        .update(userAccounts)
        .set({ sessionVersion: input.expectedSessionVersion + 1 })
        .where(
          and(
            eq(userAccounts.id, input.accountId),
            eq(userAccounts.sessionVersion, input.expectedSessionVersion),
          ),
        )
        .returning({ id: userAccounts.id });
      if (bumped.length === 0) return false;
      await tx
        .insert(userMfa)
        .values(factor)
        .onConflictDoUpdate({ target: userMfa.accountId, set: factor });
      await tx
        .delete(mfaRecoveryCodes)
        .where(eq(mfaRecoveryCodes.accountId, input.accountId));
      await tx.insert(mfaRecoveryCodes).values(
        input.recoveryCodeHashes.map((codeHash) => ({
          id: newId(),
          accountId: input.accountId,
          codeHash,
          usedAt: null,
          createdAt: input.now,
        })),
      );
      return true;
    });
  }

  async listUnusedRecoveryCodes(
    accountId: string,
  ): Promise<RecoveryCodeRecord[]> {
    return this.db
      .select({ id: mfaRecoveryCodes.id, codeHash: mfaRecoveryCodes.codeHash })
      .from(mfaRecoveryCodes)
      .where(
        and(
          eq(mfaRecoveryCodes.accountId, accountId),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      );
  }

  async claimRecoveryCode(id: string, usedAt: Date): Promise<boolean> {
    const rows = await this.db
      .update(mfaRecoveryCodes)
      .set({ usedAt })
      .where(and(eq(mfaRecoveryCodes.id, id), isNull(mfaRecoveryCodes.usedAt)))
      .returning({ id: mfaRecoveryCodes.id });
    return rows.length === 1;
  }
}
