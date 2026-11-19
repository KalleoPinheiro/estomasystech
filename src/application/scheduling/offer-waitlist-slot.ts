import type { EmailGateway } from '@/application/ports/email-gateway';
import type { ClinicStatus } from '@/domain/clinic/clinic';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { firstNameOf } from '@/domain/messaging/reminder-content';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { localDateKey } from '@/domain/scheduling/schedule-availability';
import type {
  WaitlistEntry,
  WaitlistRepository,
} from '@/domain/scheduling/waitlist';
import {
  offerDeadline,
  waitlistOfferContent,
} from '@/domain/scheduling/waitlist-offer';
import { logError } from '@/lib/log-error';
import { recordSignal } from '@/lib/observability/signals';

export interface OfferCounts {
  sent: number;
  skipped: number;
  failed: number;
  expired: number;
}

export interface OfferServices {
  appointments: AppointmentRepository;
  waitlist: WaitlistRepository;
  patients: PatientRepository;
  guardians: GuardianRepository;
  email: EmailGateway;
}

interface ClinicLookup {
  findById(id: string): Promise<{ name: string; status: ClinicStatus } | null>;
}

interface OfferRecipient {
  email: string;
  firstName: string;
  onBehalfOf?: string;
}

const emptyCounts = (): OfferCounts => ({
  sent: 0,
  skipped: 0,
  failed: 0,
  expired: 0,
});

const addCounts = (left: OfferCounts, right: OfferCounts): OfferCounts => ({
  sent: left.sent + right.sent,
  skipped: left.skipped + right.skipped,
  failed: left.failed + right.failed,
  expired: left.expired + right.expired,
});

const cleared = (): OfferCounts => ({ ...emptyCounts(), expired: 1 });

/**
 * Quem recebe a oferta: o e-mail do paciente, ou o do responsável quando o
 * paciente não tem (a mesma ordem do lembrete, #325 e #329).
 */
async function recipientFor(
  patient: Patient,
  guardians: GuardianRepository,
): Promise<OfferRecipient | null> {
  if (!patient.isActive) return null;
  const firstName = firstNameOf(patient.fullName);
  if (patient.email) return { email: patient.email, firstName };
  if (!patient.guardianId) return null;
  const guardian = await guardians.findById(patient.guardianId);
  if (!guardian?.email) return null;
  return {
    email: guardian.email,
    firstName: firstNameOf(guardian.fullName),
    onBehalfOf: firstName,
  };
}

/**
 * Oferta da vaga liberada por um cancelamento (ADR-114). Os repositórios já
 * estão no escopo da empresa. O sistema não marca a consulta (AGE-RN-08).
 */
export class WaitlistSlotOffers {
  constructor(
    private readonly services: OfferServices,
    private readonly clinicName: string,
  ) {}

  /** Cria a primeira oferta, reenvia a que falhou ou passa ao próximo. */
  offerCancelled(
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<OfferCounts> {
    return this.sync(appointmentId, now);
  }

  /** Expira o que venceu e oferece a vaga seguinte. Idempotente. */
  async advance(now: Date = new Date()): Promise<OfferCounts> {
    let total = emptyCounts();
    const ids = new Set<string>();
    for (const entry of await this.services.waitlist.listWaiting()) {
      const id = entry.openOffer?.appointmentId;
      if (id) ids.add(id);
    }
    for (const id of ids) {
      total = addCounts(total, await this.sync(id, now));
    }
    return total;
  }

  private async sync(appointmentId: string, now: Date): Promise<OfferCounts> {
    const appointment =
      await this.services.appointments.findById(appointmentId);
    if (appointment?.status !== 'cancelled') return emptyCounts();
    const waiting = await this.services.waitlist.listWaiting();
    const holder =
      waiting.find(
        (entry) => entry.openOffer?.appointmentId === appointmentId,
      ) ?? null;
    if (await this.slotBlocked(appointment)) {
      return holder ? this.clear(holder) : emptyCounts();
    }
    const deadline = offerDeadline(now, appointment.slot.start);
    if (!deadline) return holder ? this.clear(holder) : emptyCounts();
    if (!holder) return this.offerToNext(appointment, deadline, now);
    return this.keepOrPass(holder, appointment, deadline, now);
  }

  /** Horário ocupado de novo: a vaga cancelada não está mais livre. */
  private async slotBlocked(appointment: Appointment): Promise<boolean> {
    const conflicts = await this.services.appointments.findConflicting(
      appointment.slot,
      appointment.id,
      appointment.professionalId,
    );
    return conflicts.length > 0;
  }

  private async clear(holder: WaitlistEntry): Promise<OfferCounts> {
    await this.services.waitlist.save(holder.withdrawOffer());
    return cleared();
  }

  private async keepOrPass(
    holder: WaitlistEntry,
    appointment: Appointment,
    deadline: Date,
    now: Date,
  ): Promise<OfferCounts> {
    if (holder.offerExpiresAfter(now)) {
      return holder.offerEmailWasSent()
        ? emptyCounts()
        : this.deliver(holder, appointment, now);
    }
    await this.services.waitlist.save(holder.expireOffer(now));
    return addCounts(
      cleared(),
      await this.offerToNext(appointment, deadline, now),
    );
  }

  private async offerToNext(
    appointment: Appointment,
    deadline: Date,
    now: Date,
  ): Promise<OfferCounts> {
    const day = localDateKey(appointment.slot.start);
    for (const entry of await this.services.waitlist.listWaiting()) {
      const recipient = await this.candidate(
        entry,
        appointment.id,
        day,
        appointment.professionalId,
      );
      if (!recipient) continue;
      const held = entry.holdOffer(appointment.id, deadline);
      await this.services.waitlist.save(held);
      return this.deliver(held, appointment, now);
    }
    return emptyCounts();
  }

  private async candidate(
    entry: WaitlistEntry,
    appointmentId: string,
    day: string,
    professionalId: string | null,
  ): Promise<OfferRecipient | null> {
    if (!entry.accepts(day, professionalId)) return null;
    if (entry.wasOffered(appointmentId) || entry.openOffer) return null;
    const patient = await this.services.patients.findById(entry.patientId);
    if (!patient) return null;
    return recipientFor(patient, this.services.guardians);
  }

  private async deliver(
    holder: WaitlistEntry,
    appointment: Appointment,
    now: Date,
  ): Promise<OfferCounts> {
    const patient = await this.services.patients.findById(holder.patientId);
    const recipient = patient
      ? await recipientFor(patient, this.services.guardians)
      : null;
    if (!recipient) return emptyCounts();
    const content = waitlistOfferContent({
      firstName: recipient.firstName,
      clinicName: this.clinicName,
      startsAt: appointment.slot.start,
      expiresAt: holder.offerExpiresAt(),
      onBehalfOf: recipient.onBehalfOf,
    });
    const message = {
      to: recipient.email,
      subject: content.subject,
      text: content.text,
    };
    if (!(await this.services.email.isEnabled())) {
      await this.services.email.send(message);
      return { ...emptyCounts(), skipped: 1 };
    }
    try {
      await this.services.email.send(message);
    } catch (error) {
      logError(
        `Oferta de vaga ${appointment.id}/${holder.id}: falha no envio`,
        error,
      );
      recordSignal('delivery-failure');
      return { ...emptyCounts(), failed: 1 };
    }
    await this.services.waitlist.save(holder.markOfferEmailSent(now));
    return { ...emptyCounts(), sent: 1 };
  }
}

/**
 * Uma empresa por vez, cada uma com os próprios repositórios (`clinicScope`).
 * Clínica suspensa fica de fora, como no job de lembretes.
 */
export class AdvanceWaitlistOffers {
  constructor(
    private readonly clinics: readonly {
      id: string;
      name: string;
      status?: ClinicStatus;
    }[],
    private readonly servicesFor: (clinicId: string) => Promise<OfferServices>,
  ) {}

  async execute(now: Date = new Date()): Promise<OfferCounts> {
    let total = emptyCounts();
    for (const clinic of this.clinics) {
      if (clinic.status === 'suspended') continue;
      total = addCounts(total, await this.runClinic(clinic, now));
    }
    return total;
  }

  private async runClinic(
    clinic: { id: string; name: string },
    now: Date,
  ): Promise<OfferCounts> {
    try {
      const services = await this.servicesFor(clinic.id);
      return await new WaitlistSlotOffers(services, clinic.name).advance(now);
    } catch (error) {
      logError(`Oferta de vaga da empresa ${clinic.id}: falha`, error);
      return { ...emptyCounts(), failed: 1 };
    }
  }
}

/** Disparo no cancelamento: acha o nome da clínica e oferece a vaga. */
export async function offerCancelledSlot(
  services: OfferServices & { clinics: ClinicLookup },
  clinicId: string,
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  const clinic = await services.clinics.findById(clinicId);
  if (!clinic || clinic.status === 'suspended') return;
  await new WaitlistSlotOffers(services, clinic.name).offerCancelled(
    appointmentId,
    now,
  );
}
