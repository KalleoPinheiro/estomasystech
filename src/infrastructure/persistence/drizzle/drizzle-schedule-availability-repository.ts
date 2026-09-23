import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type {
  ScheduleAvailabilityRepository,
  ScheduleClosure,
  WeeklyWindow,
} from '@/domain/scheduling/schedule-availability';
import { newId } from '@/domain/shared/id';
import { type AppDb, MAX_ROWS } from './db';
import { professionalAvailability, scheduleClosures } from './schema';
import { withTenant } from './tenant-scope';

type ClosureRow = typeof scheduleClosures.$inferSelect;

const toClosure = (row: ClosureRow): ScheduleClosure => ({
  id: row.id,
  professionalId: row.professionalId,
  startsOn: row.startsOn,
  endsOn: row.endsOn,
  reason: row.reason,
  createdAt: row.createdAt,
});

export class DrizzleScheduleAvailabilityRepository
  implements ScheduleAvailabilityRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private requireClinic(): string {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode alterar a agenda (somente leitura cross-empresa)',
      );
    }
    return this.clinicId;
  }

  async listClosures(range: {
    from: string;
    to: string;
  }): Promise<ScheduleClosure[]> {
    const rows = await this.db
      .select()
      .from(scheduleClosures)
      .where(
        withTenant(
          scheduleClosures,
          this.clinicId,
          and(
            lte(scheduleClosures.startsOn, range.to),
            gte(scheduleClosures.endsOn, range.from),
          ),
        ),
      )
      .orderBy(asc(scheduleClosures.startsOn))
      .limit(MAX_ROWS);
    return rows.map(toClosure);
  }

  async findClosureById(id: string): Promise<ScheduleClosure | null> {
    const rows = await this.db
      .select()
      .from(scheduleClosures)
      .where(
        withTenant(
          scheduleClosures,
          this.clinicId,
          eq(scheduleClosures.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? toClosure(rows[0]) : null;
  }

  async saveClosure(closure: ScheduleClosure): Promise<void> {
    await this.db.insert(scheduleClosures).values({
      ...closure,
      clinicId: this.requireClinic(),
    });
  }

  async deleteClosure(id: string): Promise<void> {
    const clinicId = this.requireClinic();
    await this.db
      .delete(scheduleClosures)
      .where(
        and(
          eq(scheduleClosures.id, id),
          eq(scheduleClosures.clinicId, clinicId),
        ),
      );
  }

  async getProfessionalHours(professionalId: string): Promise<WeeklyWindow[]> {
    const rows = await this.db
      .select()
      .from(professionalAvailability)
      .where(
        withTenant(
          professionalAvailability,
          this.clinicId,
          eq(professionalAvailability.professionalId, professionalId),
        ),
      )
      .orderBy(
        asc(professionalAvailability.weekday),
        asc(professionalAvailability.startMinute),
      );
    return rows.map(({ weekday, startMinute, endMinute }) => ({
      weekday,
      startMinute,
      endMinute,
    }));
  }

  async replaceProfessionalHours(
    professionalId: string,
    windows: readonly WeeklyWindow[],
  ): Promise<void> {
    const clinicId = this.requireClinic();
    await this.db.transaction(async (tx) => {
      await tx
        .delete(professionalAvailability)
        .where(
          and(
            eq(professionalAvailability.professionalId, professionalId),
            eq(professionalAvailability.clinicId, clinicId),
          ),
        );
      if (windows.length > 0) {
        await tx.insert(professionalAvailability).values(
          windows.map((window) => ({
            id: newId(),
            clinicId,
            professionalId,
            ...window,
          })),
        );
      }
    });
  }
}
