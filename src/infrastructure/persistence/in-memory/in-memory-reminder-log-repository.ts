import { MAX_RECALL_ATTEMPTS } from '@/domain/messaging/recall-cadence';
import type {
  ReminderChannel,
  ReminderKind,
  ReminderLog,
  ReminderLogRepository,
} from '@/domain/messaging/reminder-log';

const isEmailRecall = (log: ReminderLog): boolean =>
  log.kind === 'recall' && log.channel === 'email';

export class InMemoryReminderLogRepository implements ReminderLogRepository {
  private readonly keys = new Set<string>();
  readonly items: ReminderLog[] = [];

  /** Espelha os dois índices únicos parciais de `reminder_logs`. */
  private static keyOf(log: ReminderLog): string {
    const slot = isEmailRecall(log) ? `#${log.attempt}` : log.sentOn;
    return `${log.kind}|${log.referenceId}|${log.channel}|${slot}`;
  }

  async save(log: ReminderLog): Promise<void> {
    const key = InMemoryReminderLogRepository.keyOf(log);
    if (this.keys.has(key)) {
      return;
    }
    this.keys.add(key);
    this.items.push(log);
  }

  async sentReferences(
    kind: ReminderKind,
    channel: ReminderChannel,
    referenceIds: readonly string[],
    onDay: string,
  ): Promise<Set<string>> {
    return new Set(
      this.items
        .filter(
          (log) =>
            log.kind === kind &&
            log.channel === channel &&
            log.sentOn === onDay &&
            referenceIds.includes(log.referenceId),
        )
        .map((log) => log.referenceId),
    );
  }

  async lastRecallAttempts(
    referenceIds: readonly string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const log of this.items) {
      if (isEmailRecall(log) && referenceIds.includes(log.referenceId)) {
        result.set(
          log.referenceId,
          Math.max(result.get(log.referenceId) ?? 0, log.attempt),
        );
      }
    }
    return result;
  }

  async firstSentAt(
    kind: ReminderKind,
    channel: ReminderChannel,
    referenceIds: readonly string[],
    onDay: string,
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    const matching = this.items
      .filter(
        (log) =>
          log.kind === kind &&
          log.channel === channel &&
          log.sentOn === onDay &&
          referenceIds.includes(log.referenceId),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const log of matching) {
      if (!result.has(log.referenceId)) {
        result.set(log.referenceId, log.createdAt);
      }
    }
    return result;
  }

  async exhaustedRecalls(
    referenceIds: readonly string[],
  ): Promise<Set<string>> {
    return new Set(
      this.items
        .filter(
          (log) =>
            isEmailRecall(log) &&
            log.attempt >= MAX_RECALL_ATTEMPTS &&
            referenceIds.includes(log.referenceId),
        )
        .map((log) => log.referenceId),
    );
  }
}
