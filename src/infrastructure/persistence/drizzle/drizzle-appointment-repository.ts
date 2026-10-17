import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  APPOINTMENT_STATUSES,
  Appointment,
  type AppointmentCancellation,
  type AppointmentStatus,
} from '@/domain/scheduling/appointment';
import type {
  AppointmentRangeStats,
  AppointmentRepository,
  FindByPatientOptions,
  FindCalendarEventsOptions,
} from '@/domain/scheduling/appointment-repository';
import { SchedulingConflictError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { appointments } from './schema';
import { withTenant } from './tenant-scope';

const PG_EXCLUSION_VIOLATION = '23P01';

function isExclusionViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ((current as { code?: string }).code === PG_EXCLUSION_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

type AppointmentRow = typeof appointments.$inferSelect;

const ACTIVE_STATUSES = ['scheduled', 'confirmed'];

const toAppointment = (row: AppointmentRow, cipher: FieldCipher): Appointment =>
  Appointment.restore({
    id: row.id,
    patientId: row.patientId,
    slot: TimeSlot.create(row.startsAt, row.endsAt),
    procedure: row.procedure,
    price: Money.fromCents(row.priceCents),
    notes: cipher.decryptNullable(row.notes),
    status: row.status as AppointmentStatus,
    googleEventId: row.googleEventId,
    professionalId: row.professionalId,
    procedureId: row.procedureId,
    cancellation: toCancellation(row),
    createdAt: row.createdAt,
  });

function toCancellation(row: AppointmentRow): AppointmentCancellation | null {
  if (row.status !== 'cancelled' || !row.cancelledAt) {
    return null;
  }
  return {
    // Só o portal grava 'patient'; qualquer outro valor é da equipe.
    by: row.cancelledBy === 'patient' ? 'patient' : 'clinic',
    at: row.cancelledAt,
    reason: row.cancelReason,
    late: row.cancelledLate,
  };
}

export class DrizzleAppointmentRepository implements AppointmentRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  async save(appointment: Appointment): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar consulta (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: appointment.id,
      clinicId: this.clinicId,
      patientId: appointment.patientId,
      startsAt: appointment.slot.start,
      endsAt: appointment.slot.end,
      procedure: appointment.procedure,
      priceCents: appointment.price.cents,
      notes: this.cipher.encryptNullable(appointment.notes),
      status: appointment.status,
      googleEventId: appointment.googleEventId,
      professionalId: appointment.professionalId,
      procedureId: appointment.procedureId,
      cancelledAt: appointment.cancellation?.at ?? null,
      cancelledBy: appointment.cancellation?.by ?? null,
      cancelReason: appointment.cancellation?.reason ?? null,
      cancelledLate: appointment.cancellation?.late ?? false,
      createdAt: appointment.createdAt,
    };
    try {
      await this.db
        .insert(appointments)
        .values(values)
        .onConflictDoUpdate({ target: appointments.id, set: values });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new SchedulingConflictError(
          'Horário indisponível: conflito com outra consulta (intervalo mínimo de 15 minutos)',
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Appointment | null> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(withTenant(appointments, this.clinicId, eq(appointments.id, id)))
      .limit(1);
    return rows[0] ? toAppointment(rows[0], this.cipher) : null;
  }

  async findByIds(ids: string[]): Promise<Appointment[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        withTenant(
          appointments,
          this.clinicId,
          inArray(appointments.id, unique),
        ),
      );
    return rows.map((row) => toAppointment(row, this.cipher));
  }

  async findCalendarEventsToMinimize(
    options: FindCalendarEventsOptions,
  ): Promise<Appointment[]> {
    const conditions = [
      isNotNull(appointments.googleEventId),
      isNull(appointments.calendarMinimizedAt),
    ];
    if (options.startsAfter) {
      conditions.push(gte(appointments.startsAt, options.startsAfter));
    }
    const rows = await this.db
      .select()
      .from(appointments)
      .where(withTenant(appointments, this.clinicId, and(...conditions)))
      .orderBy(desc(appointments.startsAt), asc(appointments.id))
      .limit(options.limit);
    return rows.map((row) => toAppointment(row, this.cipher));
  }

  async markCalendarEventMinimized(
    appointmentId: string,
    at: Date,
  ): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode alterar consulta (somente leitura cross-empresa)',
      );
    }
    await this.db
      .update(appointments)
      .set({ calendarMinimizedAt: at })
      .where(
        withTenant(
          appointments,
          this.clinicId,
          eq(appointments.id, appointmentId),
        ),
      );
  }

  private patientConditions(
    base: SQL,
    options?: FindByPatientOptions,
  ): SQL | undefined {
    return withTenant(
      appointments,
      this.clinicId,
      options?.endsAfter
        ? and(base, gte(appointments.endsAt, options.endsAfter))
        : base,
    );
  }

  async findByPatientId(
    patientId: string,
    options?: FindByPatientOptions,
  ): Promise<Appointment[]> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        this.patientConditions(eq(appointments.patientId, patientId), options),
      )
      .orderBy(asc(appointments.startsAt));
    return rows.map((row) => toAppointment(row, this.cipher));
  }

  async findByPatientIds(
    patientIds: string[],
    options?: FindByPatientOptions,
  ): Promise<Appointment[]> {
    const unique = [...new Set(patientIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        this.patientConditions(
          inArray(appointments.patientId, unique),
          options,
        ),
      )
      .orderBy(asc(appointments.startsAt));
    return rows.map((row) => toAppointment(row, this.cipher));
  }

  async findInRange(
    start: Date,
    end: Date,
    options?: { professionalId?: string },
  ): Promise<Appointment[]> {
    const base = and(
      lt(appointments.startsAt, end),
      gt(appointments.endsAt, start),
    );
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        withTenant(
          appointments,
          this.clinicId,
          options?.professionalId
            ? and(base, eq(appointments.professionalId, options.professionalId))
            : base,
        ),
      )
      .orderBy(asc(appointments.startsAt));
    return rows.map((row) => toAppointment(row, this.cipher));
  }

  async getStatsInRange(
    start: Date,
    end: Date,
  ): Promise<AppointmentRangeStats> {
    const inRange = withTenant(
      appointments,
      this.clinicId,
      and(lt(appointments.startsAt, end), gt(appointments.endsAt, start)),
    );

    const statusRows = await this.db
      .select({
        status: appointments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .where(inRange)
      .groupBy(appointments.status);

    const byStatus = Object.fromEntries(
      APPOINTMENT_STATUSES.map((status) => [status, 0]),
    ) as Record<AppointmentStatus, number>;
    for (const row of statusRows) {
      if (row.status in byStatus) {
        byStatus[row.status as AppointmentStatus] = Number(row.count);
      }
    }

    const revenueRows = await this.db
      .select({
        procedure: appointments.procedure,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${appointments.priceCents}), 0)`,
      })
      .from(appointments)
      .where(and(inRange, eq(appointments.status, 'completed')))
      .groupBy(appointments.procedure)
      .orderBy(desc(sql`coalesce(sum(${appointments.priceCents}), 0)`));

    return {
      byStatus,
      revenueByProcedure: revenueRows.map((row) => ({
        procedure: row.procedure,
        count: Number(row.count),
        totalCents: Number(row.totalCents),
      })),
    };
  }

  async findConflicting(
    slot: TimeSlot,
    excludeId?: string,
    professionalId?: string | null,
  ): Promise<Appointment[]> {
    const conditions: SQL[] = [
      inArray(appointments.status, ACTIVE_STATUSES),
      lt(appointments.startsAt, slot.end),
      gt(appointments.endsAt, slot.start),
    ];
    if (excludeId) {
      conditions.push(ne(appointments.id, excludeId));
    }
    // Profissional definido: conflita com o mesmo profissional ou com consultas
    // sem atribuição. Sem profissional: conflita com tudo (comportamento global).
    if (professionalId) {
      const scoped = or(
        eq(appointments.professionalId, professionalId),
        isNull(appointments.professionalId),
      );
      if (scoped) {
        conditions.push(scoped);
      }
    }
    const rows = await this.db
      .select()
      .from(appointments)
      .where(withTenant(appointments, this.clinicId, and(...conditions)));
    return rows.map((row) => toAppointment(row, this.cipher));
  }
}
