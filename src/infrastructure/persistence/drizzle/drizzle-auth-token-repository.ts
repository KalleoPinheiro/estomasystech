import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  AuthToken,
  type AuthTokenPurpose,
  type AuthTokenRepository,
} from '@/domain/auth/auth-token';
import { isUniqueViolation } from '@/lib/db-errors';
import type { AppDb } from './db';
import { authTokens } from './schema';

type AuthTokenRow = typeof authTokens.$inferSelect;

const toAuthToken = (row: AuthTokenRow): AuthToken =>
  AuthToken.restore({
    id: row.id,
    accountId: row.accountId,
    purpose: row.purpose as AuthTokenPurpose,
    secretHash: row.secretHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  });

export class DrizzleAuthTokenRepository implements AuthTokenRepository {
  constructor(private readonly db: AppDb) {}

  async save(token: AuthToken): Promise<void> {
    const row = {
      id: token.id,
      accountId: token.accountId,
      purpose: token.purpose,
      secretHash: token.secretHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      createdAt: token.createdAt,
    };
    await this.db.insert(authTokens).values(row).onConflictDoUpdate({
      target: authTokens.id,
      set: row,
    });
  }

  /**
   * `UPDATE … WHERE used_at IS NULL AND expires_at > now RETURNING *` — uma só
   * declaração. O predicado de validade e a marca de uso acontecem sob o mesmo
   * lock de linha, então de duas requisições concorrentes com o mesmo link
   * exatamente uma recebe a linha; a outra recebe zero linhas e é tratada como
   * link inválido. Um `SELECT` seguido de `UPDATE` deixaria as duas passarem.
   */
  async claimBySecretHash(
    secretHash: string,
    nowMs: number = Date.now(),
  ): Promise<AuthToken | null> {
    const now = new Date(nowMs);
    const rows = await this.db
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.secretHash, secretHash),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, now),
        ),
      )
      .returning();
    return rows[0] ? toAuthToken(rows[0]) : null;
  }

  async findUsableBySecretHash(
    secretHash: string,
    nowMs: number = Date.now(),
  ): Promise<AuthToken | null> {
    const [row] = await this.db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.secretHash, secretHash),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date(nowMs)),
        ),
      )
      .limit(1);
    return row ? toAuthToken(row) : null;
  }

  async markAllUnusedAsUsed(
    accountId: string,
    purpose: AuthTokenPurpose,
    usedAt: Date = new Date(),
  ): Promise<void> {
    await this.db
      .update(authTokens)
      .set({ usedAt })
      .where(
        and(
          eq(authTokens.accountId, accountId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
        ),
      );
  }

  /**
   * Invalidar os irmãos e inserir o novo token sob o mesmo commit, mais o
   * índice único parcial `uq_auth_tokens_account_purpose_unused` (no máximo um
   * token não-usado por conta+propósito): quando duas emissões concorrem, a
   * segunda transação a chegar ao INSERT esbarra no índice e recebe violação
   * de unicidade — recomeça (reinvalida, agora vendo a linha que a outra já
   * commitou) até o próprio índice garantir que só uma sobrevive (issue #50).
   */
  async replaceUnused(
    token: AuthToken,
    usedAt: Date = new Date(),
    attempt = 0,
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(authTokens)
          .set({ usedAt })
          .where(
            and(
              eq(authTokens.accountId, token.accountId),
              eq(authTokens.purpose, token.purpose),
              isNull(authTokens.usedAt),
            ),
          );
        const row = {
          id: token.id,
          accountId: token.accountId,
          purpose: token.purpose,
          secretHash: token.secretHash,
          expiresAt: token.expiresAt,
          usedAt: token.usedAt,
          createdAt: token.createdAt,
        };
        await tx.insert(authTokens).values(row).onConflictDoUpdate({
          target: authTokens.id,
          set: row,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 5) {
        await this.replaceUnused(token, usedAt, attempt + 1);
        return;
      }
      throw error;
    }
  }
}
