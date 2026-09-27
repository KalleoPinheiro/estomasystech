import { and, asc, eq, isNull, sql } from 'drizzle-orm';
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
  DEFAULT_CANCELLATION_POLICY,
  type ScheduleConfig,
  type ScheduleConfigRepository,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { newId } from '@/domain/shared/id';
import { type AppDb, MAX_ROWS } from './db';
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

export class DrizzleUserAccountRepository implements UserAccountRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(account: UserAccount): Promise<void> {
    // Repositório escopado grava na própria empresa; repositório de sistema
    // (clinicId nulo) grava a empresa que a própria conta carrega — que é
    // `null` para super_admin, papel cross-empresa por definição. Sem esse
    // caminho não haveria como semear o primeiro Super Admin (AUTH-27).
    const values = {
      id: account.id,
      clinicId: this.clinicId ?? account.clinicId,
      email: account.email,
      passwordHash: account.passwordHash,
      role: account.role,
      professionalId: account.professionalId,
      patientId: account.patientId,
      partnerId: account.partnerId,
      active: account.isActive,
      createdAt: account.createdAt,
    };
    // `session_version` fica fora de propósito (#194): só `revokeSessions` e
    // `updatePasswordHash` o incrementam, atomicamente no banco. Gravá-lo aqui
    // desfaria um incremento concorrente com o valor lido antes dele.
    await this.db
      .insert(userAccounts)
      .values(values)
      .onConflictDoUpdate({ target: userAccounts.id, set: values });
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        withTenant(
          userAccounts,
          this.clinicId,
          eq(userAccounts.email, email.trim().toLowerCase()),
        ),
      )
      .limit(1);
    return rows[0]
      ? UserAccount.restore({ ...rows[0], role: toUserRole(rows[0].role) })
      : null;
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
    return rows[0]
      ? UserAccount.restore({ ...rows[0], role: toUserRole(rows[0].role) })
      : null;
  }

  async findAllByEmail(email: string): Promise<UserAccount[]> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(
        withTenant(
          userAccounts,
          this.clinicId,
          eq(userAccounts.email, email.trim().toLowerCase()),
        ),
      );
    return rows.map((row) =>
      UserAccount.restore({ ...row, role: toUserRole(row.role) }),
    );
  }

  async findById(id: string): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId, eq(userAccounts.id, id)))
      .limit(1);
    return rows[0]
      ? UserAccount.restore({ ...rows[0], role: toUserRole(rows[0].role) })
      : null;
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

  async revokeSessions(id: string): Promise<void> {
    await this.db
      .update(userAccounts)
      .set({ sessionVersion: sql`${userAccounts.sessionVersion} + 1` })
      .where(withTenant(userAccounts, this.clinicId, eq(userAccounts.id, id)));
  }

  async findByPortalLink(
    link: { patientId: string } | { partnerId: string },
  ): Promise<UserAccount | null> {
    const condition =
      'patientId' in link
        ? eq(userAccounts.patientId, link.patientId)
        : eq(userAccounts.partnerId, link.partnerId);
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId, condition))
      .limit(1);
    return rows[0]
      ? UserAccount.restore({ ...rows[0], role: toUserRole(rows[0].role) })
      : null;
  }

  async hasAnyAccount(): Promise<boolean> {
    const rows = await this.db
      .select({ id: userAccounts.id })
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId))
      .limit(1);
    return rows.length > 0;
  }

  async findAll(): Promise<UserAccount[]> {
    const rows = await this.db
      .select()
      .from(userAccounts)
      .where(withTenant(userAccounts, this.clinicId))
      .orderBy(asc(userAccounts.email))
      .limit(MAX_ROWS);
    return rows.map((row) =>
      UserAccount.restore({ ...row, role: toUserRole(row.role) }),
    );
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
    const values = {
      id: newId(),
      clinicId: this.clinicId,
      weekdays: JSON.stringify(validated.weekdays),
      startHour: validated.startHour,
      endHour: validated.endHour,
      minGapMinutes: validated.minGapMinutes,
      lunchStartMinute: validated.lunchBreak?.startMinute ?? null,
      lunchEndMinute: validated.lunchBreak?.endMinute ?? null,
      cancelNoticeHours: validated.cancellationPolicy?.noticeHours ?? null,
      lateCancelFeeCents: validated.cancellationPolicy?.lateFeeCents ?? null,
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
        await tx.insert(procedureSupplies).values(
          validated.map((item) => ({
            procedureId,
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
