import type { AuditEvent } from '@/domain/audit/audit-event';
import type {
  AuditEventFilter,
  AuditEventPage,
  AuditEventRepository,
} from '@/domain/audit/audit-event-repository';

function violatesFilter(event: AuditEvent, filter: AuditEventFilter): boolean {
  const checks: boolean[] = [
    Boolean(filter.clinicId) && event.clinicId !== filter.clinicId,
    Boolean(filter.patientId) && event.patientId !== filter.patientId,
    Boolean(filter.from) &&
      event.occurredAt.getTime() < (filter.from as Date).getTime(),
    Boolean(filter.to) &&
      event.occurredAt.getTime() >= (filter.to as Date).getTime(),
    Boolean(filter.resourceType) && event.resourceType !== filter.resourceType,
    Boolean(filter.resourceId) && event.resourceId !== filter.resourceId,
  ];
  return checks.some(Boolean);
}

function matchesFilter(event: AuditEvent, filter: AuditEventFilter): boolean {
  return !violatesFilter(event, filter);
}

export class InMemoryAuditEventRepository implements AuditEventRepository {
  private readonly items: AuditEvent[] = [];

  async save(event: AuditEvent): Promise<void> {
    this.items.push(event);
  }

  async findAll(
    filter: AuditEventFilter = {},
    page: AuditEventPage = {},
  ): Promise<AuditEvent[]> {
    const filtered = this.items
      .filter((e) => matchesFilter(e, filter))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const offset = page.offset ?? 0;
    return page.limit != null
      ? filtered.slice(offset, offset + page.limit)
      : filtered.slice(offset);
  }
}
