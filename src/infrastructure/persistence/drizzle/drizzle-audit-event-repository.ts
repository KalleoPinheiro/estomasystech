import { and, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { type AuditAction, AuditEvent } from '@/domain/audit/audit-event';
import type {
  AuditEventFilter,
  AuditEventPage,
  AuditEventRepository,
} from '@/domain/audit/audit-event-repository';
import { type AppDb, MAX_ROWS } from './db';
import { auditEvents } from './schema';

function buildConditions(filter: AuditEventFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.clinicId)
    conditions.push(eq(auditEvents.clinicId, filter.clinicId));
  if (filter.patientId)
    conditions.push(eq(auditEvents.patientId, filter.patientId));
  if (filter.from) conditions.push(gte(auditEvents.occurredAt, filter.from));
  if (filter.to) conditions.push(lt(auditEvents.occurredAt, filter.to));
  if (filter.resourceType)
    conditions.push(eq(auditEvents.resourceType, filter.resourceType));
  if (filter.resourceId)
    conditions.push(eq(auditEvents.resourceId, filter.resourceId));
  return conditions;
}

export class DrizzleAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: AppDb) {}

  async save(event: AuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values({
      id: event.id,
      clinicId: event.clinicId,
      actorRole: event.actorRole,
      actorId: event.actorId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      patientId: event.patientId,
      detail: event.detail,
      occurredAt: event.occurredAt,
    });
  }

  async findAll(
    filter: AuditEventFilter = {},
    page: AuditEventPage = {},
  ): Promise<AuditEvent[]> {
    const conditions = buildConditions(filter);
    const limit = Math.min(page.limit ?? MAX_ROWS, MAX_ROWS);
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit)
      .offset(page.offset ?? 0);
    return rows.map((row) =>
      AuditEvent.restore({ ...row, action: row.action as AuditAction }),
    );
  }
}
