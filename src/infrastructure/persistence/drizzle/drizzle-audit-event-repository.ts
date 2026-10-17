import { and, desc, eq, gte, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import { type AuditAction, AuditEvent } from '@/domain/audit/audit-event';
import {
  type AuditEventFilter,
  type AuditEventPage,
  type AuditEventRepository,
  clinicIdForSave,
  PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE,
  type PlatformTrailFilter,
} from '@/domain/audit/audit-event-repository';
import { decodeAuditCursor } from '@/lib/audit-cursor';
import { type AppDb, MAX_ROWS } from './db';
import { auditEvents } from './schema';
import { withTenant } from './tenant-scope';

function periodConditions(filter: PlatformTrailFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.from) conditions.push(gte(auditEvents.occurredAt, filter.from));
  if (filter.to) conditions.push(lt(auditEvents.occurredAt, filter.to));
  return conditions;
}

function buildConditions(filter: AuditEventFilter): SQL[] {
  const conditions = periodConditions(filter);
  if (filter.patientId)
    conditions.push(eq(auditEvents.patientId, filter.patientId));
  if (filter.resourceType)
    conditions.push(eq(auditEvents.resourceType, filter.resourceType));
  if (filter.resourceId)
    conditions.push(eq(auditEvents.resourceId, filter.resourceId));
  return conditions;
}

/** Evento de plataforma: sem empresa, ou do super_admin (inclusive numa clínica). */
const PLATFORM_EVENT = or(
  isNull(auditEvents.clinicId),
  eq(auditEvents.actorRole, 'super_admin'),
) as SQL;

type AuditRow = typeof auditEvents.$inferSelect;

/**
 * Keyset: retoma estritamente depois de (occurredAt, id) do cursor, ordem desc
 * (#322). Comparação de linha, e não `a < x OR (a = x AND b < y)`: só ela vira
 * condição do índice e dispensa o Sort.
 */
function cursorCondition(cursor?: string): SQL | undefined {
  const decoded = decodeAuditCursor(cursor);
  if (!decoded) return undefined;
  return sql`(${auditEvents.occurredAt}, ${auditEvents.id}) < (${decoded.occurredAt.toISOString()}::timestamptz, ${decoded.id})`;
}

const toEvent = (row: AuditRow): AuditEvent =>
  AuditEvent.restore({ ...row, action: row.action as AuditAction });

/** Escopado por empresa como os demais repositórios (AD-017, B6). */
export class DrizzleAuditEventRepository implements AuditEventRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(event: AuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values({
      id: event.id,
      clinicId: clinicIdForSave(this.clinicId, event),
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
    return this.select(
      withTenant(
        auditEvents,
        this.clinicId,
        conditions.length > 0 ? and(...conditions) : undefined,
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
    return this.select(and(PLATFORM_EVENT, ...periodConditions(filter)), page);
  }

  private async select(
    where: SQL | undefined,
    page: AuditEventPage,
  ): Promise<AuditEvent[]> {
    const limit = Math.min(page.limit ?? MAX_ROWS, MAX_ROWS);
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(and(where, cursorCondition(page.cursor)))
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit);
    return rows.map(toEvent);
  }
}
