import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import { USER_ROLES, type UserRole } from '@/domain/auth/user-role';
import { Procedure } from '@/domain/catalog/procedure';
import {
  type ProcedureKitItem,
  type ProcedureKitRepository,
  validateKitItems,
} from '@/domain/catalog/procedure-kit';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import {
  cancellationPolicyOf,
  DEFAULT_CANCELLATION_POLICY,
  type ScheduleConfig,
  type ScheduleConfigRepository,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { newId } from '@/domain/shared/id';
import {
  type BlindIndex,
  blindIndexFromEnv,
  LOGIN_INDEX_SCOPE,
  orFallbackOnInvalid,
} from '@/lib/blind-index';
import { dataCipherFromEnv, type FieldCipher } from '@/lib/data-cipher';
import { type AppDb, MAX_ROWS } from './db';
import type { BlindIndexSource } from './drizzle-patient-repository';
import {
  procedureSupplies,
  procedures,
  scheduleSettings,
  userAccounts,
} from './schema';
import { withTenant } from './tenant-scope';

export class DrizzleProcedureRepository implements ProcedureRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(procedure: Procedure): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar procedimento (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: procedure.id,
      clinicId: this.clinicId,
      name: procedure.name,
      priceCents: procedure.priceCents,
      durationMinutes: procedure.durationMinutes,
      active: procedure.isActive,
      createdAt: procedure.createdAt,
    };
    await this.db
      .insert(procedures)
      .values(values)
      .onConflictDoUpdate({ target: procedures.id, set: values });
  }

  async findById(id: string): Promise<Procedure | null> {
    const rows = await this.db
      .select()
      .from(procedures)
      .where(withTenant(procedures, this.clinicId, eq(procedures.id, id)))
      .limit(1);
    return rows[0] ? Procedure.restore(rows[0]) : null;
  }

  async findByName(name: string): Promise<Procedure | null> {
    const rows = await this.db
      .select()
      .from(procedures)
      .where(
        withTenant(
          procedures,
          this.clinicId,
          sql`lower(${procedures.name}) = lower(${name.trim()})`,
        ),
      )
      .limit(1);
    return rows[0] ? Procedure.restore(rows[0]) : null;
  }

  async findAll(): Promise<Procedure[]> {
    const rows = await this.db
      .select()
      .from(procedures)
      .where(withTenant(procedures, this.clinicId))
      .orderBy(asc(procedures.name))
      .limit(MAX_ROWS);
    return rows.map((row) => Procedure.restore(row));
  }
}

function toUserRole(value: string): UserRole {
  if (!(USER_ROLES as readonly string[]).includes(value)) {
    throw new Error(`Papel de conta inválido persistido: "${value}"`);
  }
  return value as UserRole;
}

/** A cifra, ou quem a fornece quando precisar (leitura preguiçosa do ambiente). */
export type CipherSource = FieldCipher | (() => FieldCipher);

type AccountRow = typeof userAccounts.$inferSelect;

/** Hash do e-mail de login (ADR-111); `null` se o valor não normaliza. */
export function loginEmailHash(
  blindIndex: BlindIndex,
  email: string,
): string | null {
  return orFallbackOnInvalid(
    () => blindIndex.hash(LOGIN_INDEX_SCOPE, 'login-email', email),
    null,
  );
}

/**
 * Condição do e-mail de login: só pelo índice cego (o atual e os peppers da
 * rotação). O ramo em claro caiu na contração (ADR-111): toda conta ativa tem
 * `email_hash` (restrição `ck_user_accounts_email_hash_conta_ativa`
 * validada). E-mail que não normaliza não tem hash e não acha conta nenhuma.
 */
export function loginEmailCondition(blindIndex: BlindIndex, email: string) {
  const hashes = orFallbackOnInvalid(
    () => blindIndex.candidates(LOGIN_INDEX_SCOPE, 'login-email', email),
    [] as string[],
  );
  return hashes.length === 0
    ? sql`false`
    : inArray(userAccounts.emailHash, hashes);
}

const byEmail = (a: UserAccount, b: UserAccount): number =>
  a.email < b.email ? -1 : a.email > b.email ? 1 : 0;

export class DrizzleUserAccountRepository implements UserAccountRepository {
  private resolvedCipher: FieldCipher | undefined;

  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipherSource: CipherSource = dataCipherFromEnv,
    private readonly blindIndexSource: BlindIndexSource = blindIndexFromEnv,
  ) {}

  /** Resolvidos só no uso: quem nunca lê ou grava e-mail não exige as chaves. */
  private get cipher(): FieldCipher {
    this.resolvedCipher ??=
      typeof this.cipherSource === 'function'
        ? this.cipherSource()
        : this.cipherSource;
    return this.resolvedCipher;
  }

  private get blindIndex(): BlindIndex {
    return typeof this.blindIndexSource === 'function'
      ? this.blindIndexSource()
      : this.blindIndexSource;
  }

  /** Linha do banco para a conta: o e-mail volta legível (linha em claro passa como está). */
  private toAccount(row: AccountRow): UserAccount {
    const { emailHash: _emailHash, ...state } = row;
    return UserAccount.restore({
      ...state,
      email: this.cipher.decrypt(row.email),
      role: toUserRole(row.role),
    });
  }

  async save(account: UserAccount): Promise<void> {
    // Repositório escopado grava na própria empresa; repositório de sistema
    // (clinicId nulo) grava a empresa que a própria conta carrega — que é
    // `null` para super_admin, papel cross-empresa por definição. Sem esse
    // caminho não haveria como semear o primeiro Super Admin (AUTH-27).
    const values = {
      id: account.id,
      clinicId: this.clinicId ?? account.clinicId,
      // E-mail de login cifrado em repouso; o índice cego serve ao login (ADR-111).
      email: this.cipher.encrypt(account.email),
      emailHash: loginEmailHash(this.blindIndex, account.email),
      passwordHash: account.passwordHash,
      role: account.role,
      professionalId: account.professionalId,
      patientId: account.patientId,
      partnerId: account.partnerId,
      guardianId: account.guardianId,
      active: account.isActive,
      createdAt: account.createdAt,
    };
    // `session_version` fica fora de propósito (#194): só `revokeSessions` e
    // `updatePasswordHash` o incrementam, atomicamente no banco. Gravá-lo aqui
    // desfaria um incremento concorrente com o valor lido antes dele.
    // `deactivated_at` (#294) marca a passagem para inativa e some ao reativar;
    // salvar de novo uma conta já inativa preserva a data original.
    await this.db
      .insert(userAccounts)
      .values({ ...values, deactivatedAt: values.active ? null : new Date() })
      .onConflictDoUpdate({
        target: userAccounts.id,
        set: {
          ...values,
          deactivatedAt: sql`case when excluded.active then null
            else coalesce(${userAccounts.deactivatedAt}, now()) end`,
        },
      });
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        withTenant(
          userAccounts,
          this.clinicId,
          loginEmailCondition(this.blindIndex, email),
        ),
      )
      .limit(1);
    return rows[0] ? this.toAccount(rows[0]) : null;
  }

  /** A conta de sistema (o super_admin), achada pelo papel — nunca pelo e-mail. */
  async findSystemAccount(): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        and(
          eq(userAccounts.role, 'super_admin'),
          isNull(userAccounts.clinicId),
        ),
      )
      .limit(1);
    return rows[0] ? this.toAccount(rows[0]) : null;
  }

  async findAllByEmail(email: string): Promise<UserAccount[]> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        withTenant(
          userAccounts,
          this.clinicId,
          loginEmailCondition(this.blindIndex, email),
        ),
      );
    return rows.map((row) => this.toAccount(row));
  }

  async findById(id: string): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId, eq(userAccounts.id, id)))
      .limit(1);
    return rows[0] ? this.toAccount(rows[0]) : null;
  }

  /**
   * Atualiza apenas o hash de senha, pelo id. Diferente de `save`, não exige
   * empresa de contexto: o fluxo de convite/reset roda antes de existir sessão
   * e a autorização vem do token de uso único.
   */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    // Senha nova derruba as sessões anteriores na mesma instrução (#194).
    await this.db
      .update(userAccounts)
      .set({
        passwordHash,
        sessionVersion: sql`${userAccounts.sessionVersion} + 1`,
      })
      .where(withTenant(userAccounts, this.clinicId, eq(userAccounts.id, id)));
  }

  async saveAvatarKey(id: string, avatarKey: string | null): Promise<void> {
    await this.db
      .update(userAccounts)
      .set({ avatarKey })
      .where(withTenant(userAccounts, this.clinicId, eq(userAccounts.id, id)));
  }

  async upgradePasswordHash(
    id: string,
    currentHash: string,
    upgradedHash: string,
  ): Promise<void> {
    await this.db
      .update(userAccounts)
      .set({ passwordHash: upgradedHash })
      .where(
        withTenant(
          userAccounts,
          this.clinicId,
          and(
            eq(userAccounts.id, id),
            eq(userAccounts.passwordHash, currentHash),
          ),
        ),
      );
  }

  async revokeSessions(id: string): Promise<void> {
    await this.db
      .update(userAccounts)
      .set({ sessionVersion: sql`${userAccounts.sessionVersion} + 1` })
      .where(withTenant(userAccounts, this.clinicId, eq(userAccounts.id, id)));
  }

  async revokeAllSessions(): Promise<void> {
    if (this.clinicId === null) {
      throw new Error('revokeAllSessions exige repositório escopado à clínica');
    }
    await this.db
      .update(userAccounts)
      .set({ sessionVersion: sql`${userAccounts.sessionVersion} + 1` })
      .where(eq(userAccounts.clinicId, this.clinicId));
  }

  async findByPortalLink(
    link:
      | { patientId: string }
      | { partnerId: string }
      | { guardianId: string },
  ): Promise<UserAccount | null> {
    const condition =
      'patientId' in link
        ? eq(userAccounts.patientId, link.patientId)
        : 'partnerId' in link
          ? eq(userAccounts.partnerId, link.partnerId)
          : eq(userAccounts.guardianId, link.guardianId);
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId, condition))
      .limit(1);
    return rows[0] ? this.toAccount(rows[0]) : null;
  }

  async hasAnyAccount(): Promise<boolean> {
    const rows = await this.db
      .select({ id: userAccounts.id })
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId))
      .limit(1);
    return rows.length > 0;
  }

  // A ordem por e-mail é em memória: o `email` cifrado não ordena no banco.
  async findByRole(role: UserRole): Promise<UserAccount[]> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        withTenant(userAccounts, this.clinicId, eq(userAccounts.role, role)),
      )
      .orderBy(asc(userAccounts.id));
    return rows.map((row) => this.toAccount(row)).sort(byEmail);
  }

  async findByRoleForUpdate(role: UserRole): Promise<UserAccount[]> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        withTenant(userAccounts, this.clinicId, eq(userAccounts.role, role)),
      )
      .orderBy(asc(userAccounts.id))
      .for('update');
    return rows.map((row) => this.toAccount(row)).sort(byEmail);
  }

  async findAll(): Promise<UserAccount[]> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId))
      .orderBy(asc(userAccounts.id))
      .limit(MAX_ROWS);
    return rows.map((row) => this.toAccount(row)).sort(byEmail);
  }
}

export class DrizzleScheduleConfigRepository
  implements ScheduleConfigRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async get(): Promise<ScheduleConfig | null> {
    if (this.clinicId === null) {
      return null;
    }
    const rows = await this.db
      .select()
      .from(scheduleSettings)
      .where(eq(scheduleSettings.clinicId, this.clinicId))
      .limit(1);
    if (!rows[0]) {
      return null;
    }
    try {
      return validateScheduleConfig({
        weekdays: JSON.parse(rows[0].weekdays) as number[],
        startHour: rows[0].startHour,
        endHour: rows[0].endHour,
        minGapMinutes: rows[0].minGapMinutes,
        lunchBreak:
          rows[0].lunchStartMinute !== null && rows[0].lunchEndMinute !== null
            ? {
                startMinute: rows[0].lunchStartMinute,
                endMinute: rows[0].lunchEndMinute,
              }
            : null,
        cancellationPolicy: {
          noticeHours:
            rows[0].cancelNoticeHours ??
            DEFAULT_CANCELLATION_POLICY.noticeHours,
          lateFeeCents:
            rows[0].lateCancelFeeCents ??
            DEFAULT_CANCELLATION_POLICY.lateFeeCents,
        },
      });
    } catch {
      // Configuração corrompida nunca derruba o agendamento — cai no default.
      return null;
    }
  }

  async save(config: ScheduleConfig): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar configuração de horário (somente leitura cross-empresa)',
      );
    }
    const validated = validateScheduleConfig(config);
    const policy = cancellationPolicyOf(validated);
    const values = {
      id: newId(),
      clinicId: this.clinicId,
      weekdays: JSON.stringify(validated.weekdays),
      startHour: validated.startHour,
      endHour: validated.endHour,
      minGapMinutes: validated.minGapMinutes,
      lunchStartMinute: validated.lunchBreak?.startMinute ?? null,
      lunchEndMinute: validated.lunchBreak?.endMinute ?? null,
      cancelNoticeHours: policy.noticeHours,
      lateCancelFeeCents: policy.lateFeeCents,
      updatedAt: new Date(),
    };
    await this.db
      .insert(scheduleSettings)
      .values(values)
      .onConflictDoUpdate({
        target: scheduleSettings.clinicId,
        set: {
          weekdays: values.weekdays,
          startHour: values.startHour,
          endHour: values.endHour,
          minGapMinutes: values.minGapMinutes,
          lunchStartMinute: values.lunchStartMinute,
          lunchEndMinute: values.lunchEndMinute,
          cancelNoticeHours: values.cancelNoticeHours,
          lateCancelFeeCents: values.lateCancelFeeCents,
          updatedAt: values.updatedAt,
        },
      });
  }
}

export class DrizzleProcedureKitRepository implements ProcedureKitRepository {
  constructor(private readonly db: AppDb) {}

  async getKit(procedureId: string): Promise<ProcedureKitItem[]> {
    const rows = await this.db
      .select()
      .from(procedureSupplies)
      .where(eq(procedureSupplies.procedureId, procedureId));
    return rows.map((row) => ({
      supplyId: row.supplyId,
      quantity: row.quantity,
    }));
  }

  async setKit(procedureId: string, items: ProcedureKitItem[]): Promise<void> {
    const validated = validateKitItems(items);
    await this.db.transaction(async (tx) => {
      await tx
        .delete(procedureSupplies)
        .where(eq(procedureSupplies.procedureId, procedureId));
      if (validated.length > 0) {
        // A empresa do kit é a do procedimento (RLS etapa 4): a chave composta do banco a confere.
        const [parent] = await tx
          .select({ clinicId: procedures.clinicId })
          .from(procedures)
          .where(eq(procedures.id, procedureId));
        if (!parent) {
          throw new Error(`Procedimento ${procedureId} não encontrado.`);
        }
        await tx.insert(procedureSupplies).values(
          validated.map((item) => ({
            procedureId,
            clinicId: parent.clinicId,
            supplyId: item.supplyId,
            quantity: item.quantity,
          })),
        );
      }
    });
  }

  async countByProcedure(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        procedureId: procedureSupplies.procedureId,
        count: sql<number>`count(*)`,
      })
      .from(procedureSupplies)
      .groupBy(procedureSupplies.procedureId);
    return Object.fromEntries(
      rows.map((row) => [row.procedureId, Number(row.count)]),
    );
  }
}
