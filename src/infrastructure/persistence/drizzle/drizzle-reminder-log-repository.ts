import { and, asc, eq, gte, inArray, max } from 'drizzle-orm';
import { MAX_RECALL_ATTEMPTS } from '@/domain/messaging/recall-cadence';
import type {
  ReminderChannel,
  ReminderKind,
  ReminderLog,
  ReminderLogRepository,
} from '@/domain/messaging/reminder-log';
import type { AppDb } from './db';
import { reminderLogs } from './schema';
import { withTenant } from './tenant-scope';

/**
 * Leituras e gravação no escopo da empresa: o job roda por empresa
 * (`clinicScope`) e o clique da recepção grava na empresa da sessão
 * (`writeScope`). Sem empresa não há gravação — o fallback para a clínica
 * legada gravava o log de todas as empresas numa só (N3).
 */
export class DrizzleReminderLogRepository implements ReminderLogRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(log: ReminderLog): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Registro de lembrete exige empresa (escopo de sistema é somente leitura)',
      );
    }
    await this.db
      .insert(reminderLogs)
      .values({
        id: log.id,
        clinicId: this.clinicId,
        kind: log.kind,
        referenceId: log.referenceId,
        channel: log.channel,
        attempt: log.attempt,
        sentOn: log.sentOn,
        createdAt: log.createdAt,
      })
      .onConflictDoNothing();
  }

  async wasSent(
    kind: ReminderKind,
    referenceId: string,
    channel: ReminderChannel,
    onDay: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: reminderLogs.id })
      .from(reminderLogs)
      .where(
        withTenant(
          reminderLogs,
          this.clinicId,
          and(
            eq(reminderLogs.kind, kind),
            eq(reminderLogs.referenceId, referenceId),
            eq(reminderLogs.channel, channel),
            eq(reminderLogs.sentOn, onDay),
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async lastRecallAttempt(referenceId: string): Promise<number> {
    const rows = await this.db
      .select({ last: max(reminderLogs.attempt) })
      .from(reminderLogs)
      .where(
        withTenant(
          reminderLogs,
          this.clinicId,
          and(
            eq(reminderLogs.kind, 'recall'),
            eq(reminderLogs.channel, 'email'),
            eq(reminderLogs.referenceId, referenceId),
          ),
        ),
      );
    return rows[0]?.last ?? 0;
  }

  async firstSentAt(
    kind: ReminderKind,
    channel: ReminderChannel,
    referenceIds: readonly string[],
    onDay: string,
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (referenceIds.length === 0) {
      return result;
    }
    const rows = await this.db
      .select({
        referenceId: reminderLogs.referenceId,
        createdAt: reminderLogs.createdAt,
      })
      .from(reminderLogs)
      .where(
        withTenant(
          reminderLogs,
          this.clinicId,
          and(
            eq(reminderLogs.kind, kind),
            eq(reminderLogs.channel, channel),
            eq(reminderLogs.sentOn, onDay),
            inArray(reminderLogs.referenceId, [...referenceIds]),
          ),
        ),
      )
      .orderBy(asc(reminderLogs.createdAt));
    for (const row of rows) {
      if (!result.has(row.referenceId)) {
        result.set(row.referenceId, row.createdAt);
      }
    }
    return result;
  }

  async exhaustedRecalls(
    referenceIds: readonly string[],
  ): Promise<Set<string>> {
    if (referenceIds.length === 0) {
      return new Set();
    }
    const rows = await this.db
      .selectDistinct({ referenceId: reminderLogs.referenceId })
      .from(reminderLogs)
      .where(
        withTenant(
          reminderLogs,
          this.clinicId,
          and(
            eq(reminderLogs.kind, 'recall'),
            eq(reminderLogs.channel, 'email'),
            gte(reminderLogs.attempt, MAX_RECALL_ATTEMPTS),
            inArray(reminderLogs.referenceId, [...referenceIds]),
          ),
        ),
      );
    return new Set(rows.map((row) => row.referenceId));
  }
}
