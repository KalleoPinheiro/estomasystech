import type { TimeSlot } from '../shared/time-slot';
import type { Appointment, AppointmentStatus } from './appointment';

export interface ProcedureRevenue {
  procedure: string;
  count: number;
  totalCents: number;
}

export interface AppointmentRangeStats {
  byStatus: Record<AppointmentStatus, number>;
  revenueByProcedure: ProcedureRevenue[];
}

export interface FindByPatientOptions {
  /** Só consultas cujo fim é a partir desta data (corte de histórico no banco). */
  endsAfter?: Date;
}

export interface FindCalendarEventsOptions {
  limit: number;
  /** Só consultas que começam a partir desta data (janela da minimização). */
  startsAfter?: Date;
}

export interface AppointmentRepository {
  save(appointment: Appointment): Promise<void>;
  findById(id: string): Promise<Appointment | null>;
  findByIds(ids: string[]): Promise<Appointment[]>;
  findByPatientId(
    patientId: string,
    options?: FindByPatientOptions,
  ): Promise<Appointment[]>;
  /** Busca em lote — evita N+1 ao montar dados de vários pacientes. */
  findByPatientIds(
    patientIds: string[],
    options?: FindByPatientOptions,
  ): Promise<Appointment[]>;
  findInRange(
    start: Date,
    end: Date,
    options?: { professionalId?: string },
  ): Promise<Appointment[]>;
  /**
   * Conflitos de horário: mesmo profissional, ou quando um dos lados não tem
   * profissional atribuído (regra global preservada para dados sem atribuição).
   */
  findConflicting(
    slot: TimeSlot,
    excludeId?: string,
    professionalId?: string | null,
  ): Promise<Appointment[]>;
  /** Agregação no banco — contagens e receita corretas independentemente do volume. */
  getStatsInRange(start: Date, end: Date): Promise<AppointmentRangeStats>;
  /**
   * Consultas com evento no Google Agenda ainda não reescritas só com iniciais
   * (#339), das mais recentes/futuras para as mais antigas.
   */
  findCalendarEventsToMinimize(
    options: FindCalendarEventsOptions,
  ): Promise<Appointment[]>;
  /** Marca o evento como reescrito; a reexecução do job o ignora. */
  markCalendarEventMinimized(appointmentId: string, at: Date): Promise<void>;
}
