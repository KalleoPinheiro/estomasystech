import { PARTNER_HISTORY_MONTHS } from '@/application/portal/get-partner-portal-data';
import type { EmailGateway } from '@/application/ports/email-gateway';
import type { ClinicStatus } from '@/domain/clinic/clinic';
import { firstNameOf } from '@/domain/messaging/reminder-content';
import {
  closedMonthLabelOf,
  partnerMonthlyReportContent,
} from '@/domain/partner/monthly-report';
import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { shiftZonedMonths, zonedMonthKey } from '@/domain/shared/time-zone';
import { logError } from '@/lib/log-error';
import { recordSignal } from '@/lib/observability/signals';

export interface PartnerReportCounts {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Repositórios de UMA empresa (`clinicScope`). `email` é o canal dela:
 * sem canal, o relatório não sai e o mês não fica gravado (ADR-011).
 */
export interface PartnerReportServices {
  email: EmailGateway;
  partners: PartnerRepository;
  patients: PatientRepository;
  appointments: AppointmentRepository;
}

export interface PartnerReportClinic {
  id: string;
  name: string;
  /** Clínica `suspended` não envia; ausente = `active`. */
  status?: ClinicStatus;
}

const emptyCounts = (): PartnerReportCounts => ({
  sent: 0,
  skipped: 0,
  failed: 0,
});

const addCounts = (
  total: PartnerReportCounts,
  part: PartnerReportCounts,
): void => {
  total.sent += part.sent;
  total.skipped += part.skipped;
  total.failed += part.failed;
};

/**
 * Relatório mensal ao parceiro que indica pacientes (RM-15, ADR-114).
 * Uma empresa por vez. O mês (`AAAA-MM` no fuso da aplicação) é a chave
 * de idempotência: a segunda execução no mesmo mês não envia de novo.
 * O texto cita o mês anterior já fechado. Clínica suspensa fica de fora.
 * Falha numa empresa não impede as demais.
 */
export class SendPartnerMonthlyReports {
  constructor(
    private readonly clinics: readonly PartnerReportClinic[],
    private readonly servicesFor: (
      clinicId: string,
    ) => Promise<PartnerReportServices>,
  ) {}

  async execute(now: Date = new Date()): Promise<PartnerReportCounts> {
    const total = emptyCounts();
    const monthKey = zonedMonthKey(now);
    for (const clinic of this.clinics) {
      if (clinic.status === 'suspended') continue;
      addCounts(total, await this.runClinic(clinic, now, monthKey));
    }
    return total;
  }

  private async runClinic(
    clinic: PartnerReportClinic,
    now: Date,
    monthKey: string,
  ): Promise<PartnerReportCounts> {
    try {
      const services = await this.servicesFor(clinic.id);
      return await new ClinicPartnerReports(clinic.name, services).run(
        now,
        monthKey,
      );
    } catch (error) {
      logError(`Relatório de parceiros da empresa ${clinic.id}: falha`, error);
      return { ...emptyCounts(), failed: 1 };
    }
  }
}

class ClinicPartnerReports {
  constructor(
    private readonly clinicName: string,
    private readonly services: PartnerReportServices,
  ) {}

  async run(now: Date, monthKey: string): Promise<PartnerReportCounts> {
    const summary = emptyCounts();
    const enabled = await this.services.email.isEnabled();
    const active = (await this.services.partners.findAll()).filter(
      (partner) => partner.isActive,
    );
    const referred = await this.referredByPartner(active);
    const attended = await this.attendedPatientIds(referred, now);
    for (const partner of active) {
      const lines = referred.get(partner.id) ?? [];
      if (lines.length === 0) {
        summary.skipped += 1;
        continue;
      }
      const outcome = await this.deliver(
        partner,
        lines,
        attended,
        enabled,
        now,
        monthKey,
      );
      summary[outcome] += 1;
    }
    return summary;
  }

  private async referredByPartner(
    partners: readonly Partner[],
  ): Promise<Map<string, Patient[]>> {
    const map = new Map<string, Patient[]>();
    for (const partner of partners) {
      const patients = await this.services.patients.findByReferrer(partner.id);
      if (patients.length > 0) map.set(partner.id, patients);
    }
    return map;
  }

  private async attendedPatientIds(
    referred: ReadonlyMap<string, Patient[]>,
    now: Date,
  ): Promise<Set<string>> {
    const ids = [...referred.values()].flatMap((group) =>
      group.map((patient) => patient.id),
    );
    if (ids.length === 0) return new Set();
    const cutoff = shiftZonedMonths(now, -PARTNER_HISTORY_MONTHS);
    const appointments = await this.services.appointments.findByPatientIds(
      ids,
      { endsAfter: cutoff },
    );
    const attended = new Set<string>();
    for (const appointment of appointments) {
      if (appointment.status === 'completed') {
        attended.add(appointment.patientId);
      }
    }
    return attended;
  }

  private async deliver(
    partner: Partner,
    patients: readonly Patient[],
    attended: ReadonlySet<string>,
    enabled: boolean,
    now: Date,
    monthKey: string,
  ): Promise<keyof PartnerReportCounts> {
    const content = partnerMonthlyReportContent({
      firstName: firstNameOf(partner.fullName),
      clinicName: this.clinicName,
      monthLabel: closedMonthLabelOf(now),
      patients: patients.map((patient) => ({
        fullName: patient.fullName,
        attended: attended.has(patient.id),
      })),
    });
    const message = {
      to: partner.email,
      subject: content.subject,
      text: content.text,
    };
    if (!enabled) {
      await this.services.email.send(message);
      return 'skipped';
    }
    const claimed = await this.services.partners.claimMonthlyReport(
      partner.id,
      monthKey,
    );
    if (!claimed) return 'skipped';
    try {
      await this.services.email.send(message);
    } catch (error) {
      logError(`Relatório do parceiro ${partner.id}: falha no envio`, error);
      recordSignal('delivery-failure');
      await this.services.partners.releaseMonthlyReport(partner.id, monthKey);
      return 'failed';
    }
    return 'sent';
  }
}
