import { AuditEvent } from '@/domain/audit/audit-event';
import {
  type AuditEventFilter,
  type AuditEventPage,
  type AuditEventRepository,
  clinicIdForSave,
  PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE,
  type PlatformTrailFilter,
} from '@/domain/audit/audit-event-repository';

function outsidePeriod(
  event: AuditEvent,
  filter: PlatformTrailFilter,
): boolean {
  const at = event.occurredAt.getTime();
  return (
    (Boolean(filter.from) && at < (filter.from as Date).getTime()) ||
    (Boolean(filter.to) && at >= (filter.to as Date).getTime())
  );
}

function violatesFilter(event: AuditEvent, filter: AuditEventFilter): boolean {
  const checks: boolean[] = [
    Boolean(filter.patientId) && event.patientId !== filter.patientId,
    outsidePeriod(event, filter),
    Boolean(filter.resourceType) && event.resourceType !== filter.resourceType,
    Boolean(filter.resourceId) && event.resourceId !== filter.resourceId,
  ];
  return checks.some(Boolean);
}

const isPlatformEvent = (event: AuditEvent): boolean =>
  event.clinicId === null || event.actorRole === 'super_admin';

function paginate(events: AuditEvent[], page: AuditEventPage): AuditEvent[] {
  const sorted = [...events].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  const offset = page.offset ?? 0;
  return page.limit != null
    ? sorted.slice(offset, offset + page.limit)
    : sorted.slice(offset);
}

/**
 * Mesmas regras de escopo do repositório Drizzle (B6). Instâncias do mesmo
 * `store` compartilham os eventos, como tabelas vistas por escopos diferentes.
 */
export class InMemoryAuditEventRepository implements AuditEventRepository {
  constructor(
    private readonly clinicId: string | null = null,
    private readonly items: AuditEvent[] = [],
  ) {}

  async save(event: AuditEvent): Promise<void> {
    const clinicId = clinicIdForSave(this.clinicId, event);
    this.items.push(
      clinicId === event.clinicId
        ? event
        : AuditEvent.restore({
            clinicId,
            actorRole: event.actorRole,
            actorId: event.actorId,
            action: event.action,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            patientId: event.patientId,
            detail: event.detail,
            id: event.id,
            occurredAt: event.occurredAt,
          }),
    );
  }

  async findAll(
    filter: AuditEventFilter = {},
    page: AuditEventPage = {},
  ): Promise<AuditEvent[]> {
    return paginate(
      this.items.filter(
        (e) =>
          (this.clinicId === null || e.clinicId === this.clinicId) &&
          !violatesFilter(e, filter),
      ),
      page,
    );
  }

  async findPlatformTrail(
    filter: PlatformTrailFilter = {},
    page: AuditEventPage = {},
  ): Promise<AuditEvent[]> {
    if (this.clinicId !== null) {
      throw new Error(PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE);
    }
    return paginate(
      this.items.filter((e) => isPlatformEvent(e) && !outsidePeriod(e, filter)),
      page,
    );
  }
}
