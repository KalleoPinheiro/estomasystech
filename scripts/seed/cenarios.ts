import { eq } from "drizzle-orm";
import { Appointment } from "@/domain/scheduling/appointment";
import { Invoice } from "@/domain/billing/invoice";
import { ClinicalCondition } from "@/domain/clinical/clinical-condition";
import { ConditionAssessment } from "@/domain/clinical/condition-assessment";
import { PartnerShareConsent } from "@/domain/consent/partner-share-consent";
import { FollowUp } from "@/domain/followup/follow-up";
import type { Partner } from "@/domain/partner/partner";
import type { Patient } from "@/domain/patient/patient";
import type { Procedure } from "@/domain/catalog/procedure";
import type { Professional } from "@/domain/professional/professional";
import { DEFAULT_SCHEDULE_CONFIG } from "@/domain/scheduling/schedule-config";
import { Money } from "@/domain/shared/money";
import { TimeSlot } from "@/domain/shared/time-slot";
import { getRepositories } from "@/infrastructure/container";
import { getDb } from "@/infrastructure/persistence/drizzle/db";
import * as schema from "@/infrastructure/persistence/drizzle/schema";
import { PARTNER_SHARE_CONSENT } from "@/lib/partner-share-consent-text";
import { clinicScope } from "@/lib/auth/tenant-scope";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PORTAL_RETURN_REASON = "Retorno para reavaliar a lesão";
const GAP_MS = 15 * 60_000;

/** Reposiciona a data de criação de uma avaliação (o domínio sempre carimba "agora"). */
export async function backdateAssessment(id: string, createdAt: Date): Promise<void> {
  const db = await getDb();
  await db.update(schema.conditionAssessments).set({ createdAt }).where(eq(schema.conditionAssessments.id, id));
}

/** Reposiciona a emissão de uma fatura (o domínio sempre carimba "agora"). */
export async function backdateInvoice(id: string, issuedAt: Date): Promise<void> {
  const db = await getDb();
  await db.update(schema.invoices).set({ issuedAt }).where(eq(schema.invoices.id, id));
}

export interface ScenarioContext {
  now: Date;
  mainClinicId: string;
  neighborClinicId: string;
  patients: Patient[];
  professionals: Professional[];
  procedures: Procedure[];
  /** Paciente do portal com termos aceitos (conta `paciente@`), se existir. */
  portalPatient: Patient | null;
  partner: Partner | null;
}

/**
 * Cenários do roteiro de homologação que dependem de dado específico (#477).
 * Aditivos e idempotentes: cada bloco só age se o dado ainda não existe, então
 * rodam também em banco já semeado (ADR-059). Devolve quantos blocos agiram.
 */
export async function seedScenarios(context: ScenarioContext): Promise<number> {
  let changed = 0;
  changed += await seedClinicRegistration(context.mainClinicId);
  changed += await seedLunchBreak(context.mainClinicId);
  changed += await seedCommissionRule(context);
  changed += await seedProcedureKits(context);
  changed += await seedNeighborBilling(context);
  changed += await seedPortalPatientHistory(context);
  changed += await seedReferrals(context);
  return changed;
}

/** Responsável técnico da principal: sem ele atestado, relatório e plano ficam bloqueados. */
async function seedClinicRegistration(clinicId: string): Promise<number> {
  const { clinics } = await getRepositories(clinicScope(clinicId));
  const clinic = await clinics.findById(clinicId);
  if (!clinic || clinic.isCompleteForDocumentEmission()) {
    return 0;
  }
  await clinics.update(
    clinic.updateInfo({
      professionalName: "Ana Souza (fictícia)",
      professionalRegistry: "COREN-SP 000001",
    }),
  );
  return 1;
}

/** Pausa para almoço 12:00–13:00 na grade da principal (cenário 10: almoço recusado). */
async function seedLunchBreak(clinicId: string): Promise<number> {
  const { scheduleConfig } = await getRepositories(clinicScope(clinicId));
  const current = await scheduleConfig.get();
  if (current?.lunchBreak) {
    return 0;
  }
  await scheduleConfig.save({
    ...DEFAULT_SCHEDULE_CONFIG,
    ...current,
    lunchBreak: { startMinute: 12 * 60, endMinute: 13 * 60 },
  });
  return 1;
}

/** Ana ganha repasse percentual (o roteiro de repasse parte dele); Bruno segue com valor fixo. */
async function seedCommissionRule(context: ScenarioContext): Promise<number> {
  const { professionals } = await getRepositories(clinicScope(context.mainClinicId));
  const ana = context.professionals[0];
  const current = ana && (await professionals.findById(ana.id));
  if (!current || current.commissionPct != null || current.commissionType !== "percentage") {
    return 0;
  }
  await professionals.save(current.update({ commissionPct: 40 }));
  return 1;
}

/** Kits (EST-RN-05): curativo simples e troca de bolsa passam a baixar insumo ao concluir. */
async function seedProcedureKits(context: ScenarioContext): Promise<number> {
  const repos = await getRepositories(clinicScope(context.mainClinicId));
  const counts = await repos.procedureKits.countByProcedure();
  const supplies = await repos.supplies.findAll();
  const supplyOf = (name: string) => supplies.find((supply) => supply.name.startsWith(name));
  const kits: [string, [string, number][]][] = [
    ["Curativo simples", [["Hidrocoloide", 1]]],
    ["Troca de bolsa de estomia", [["Alginato", 1]]],
  ];
  let changed = 0;
  for (const [procedureName, items] of kits) {
    const procedure = context.procedures.find((candidate) => candidate.name === procedureName);
    const wanted = items.flatMap(([name, quantity]) => {
      const supply = supplyOf(name);
      return supply ? [{ supplyId: supply.id, quantity }] : [];
    });
    if (!procedure || wanted.length === 0 || (counts[procedure.id] ?? 0) > 0) {
      continue;
    }
    await repos.procedureKits.setKit(procedure.id, wanted);
    changed += 1;
  }
  return changed;
}

/** A vizinha ganha uma consulta concluída e uma fatura paga: recibo bloqueado por falta de CNPJ (cenário 11). */
async function seedNeighborBilling(context: ScenarioContext): Promise<number> {
  const repos = await getRepositories(clinicScope(context.neighborClinicId));
  if ((await repos.invoices.findAll()).length > 0) {
    return 0;
  }
  const [professional] = await repos.professionals.findAll();
  const [patient] = await repos.patients.findAll();
  if (!professional || !patient) {
    return 0;
  }
  const start = new Date(startOfUtcDay(context.now).getTime() - 3 * DAY_MS + 13 * HOUR_MS);
  const end = new Date(start.getTime() + 30 * 60_000);
  const appointment = Appointment.create({
    patientId: patient.id,
    slot: TimeSlot.create(start, end),
    procedure: "Curativo simples",
    price: Money.fromCents(9000),
    professionalId: professional.id,
  }).complete();
  await repos.appointments.save(appointment);
  const invoice = Invoice.create({
    patientId: patient.id,
    appointmentId: appointment.id,
    description: "Curativo simples",
    amount: Money.fromCents(9000),
  }).registerPayment({ amount: Money.fromCents(9000), method: "pix", paidAt: end });
  await repos.invoices.save(invoice);
  await backdateInvoice(invoice.id, end);
  return 1;
}

/**
 * Histórico do paciente do portal (`paciente@`): duas consultas futuras (uma a
 * menos de 24 h, outra daqui a 10 dias) para o prazo e o teto do portal, uma
 * consulta concluída com fatura pendente, uma condição e um retorno pendente.
 * Só age se o paciente não tem consulta nenhuma.
 */
async function seedPortalPatientHistory(context: ScenarioContext): Promise<number> {
  const patient = context.portalPatient;
  const professional = context.professionals[0];
  const procedure = context.procedures.find((candidate) => candidate.name === "Curativo simples");
  if (!patient || !professional || !procedure) {
    return 0;
  }
  const repos = await getRepositories(clinicScope(context.mainClinicId));
  // Uma vez por banco: se a conta do portal for recriada em outro paciente, o histórico não se repete.
  const alreadySeeded = (await repos.followUps.findAll()).some((item) => item.reason === PORTAL_RETURN_REASON);
  if (alreadySeeded || (await repos.appointments.findByPatientId(patient.id)).length > 0) {
    return 0;
  }
  const today = startOfUtcDay(context.now);
  const draft = (slot: TimeSlot) =>
    Appointment.create({
      patientId: patient.id,
      slot,
      procedure: procedure.name,
      price: Money.fromCents(procedure.priceCents),
      professionalId: professional.id,
      procedureId: procedure.id,
    });
  const soon = new Date(context.now.getTime() + 2 * HOUR_MS);
  const later = new Date(nextWeekday(new Date(today.getTime() + 10 * DAY_MS)).getTime() + 13 * HOUR_MS);
  const past = new Date(nextWeekday(new Date(today.getTime() - 15 * DAY_MS)).getTime() + 13 * HOUR_MS);
  const free = (start: Date) => freeSlot(repos, start, procedure.durationMinutes, professional.id);
  await repos.appointments.save(draft(await free(soon)));
  await repos.appointments.save(draft(await free(later)));
  const pastSlot = await free(past);
  const done = draft(pastSlot).complete();
  await repos.appointments.save(done);
  const invoice = Invoice.create({
    patientId: patient.id,
    appointmentId: done.id,
    description: procedure.name,
    amount: Money.fromCents(procedure.priceCents),
    dueDate: new Date(past.getTime() + 7 * DAY_MS),
  });
  await repos.invoices.save(invoice);
  await backdateInvoice(invoice.id, pastSlot.end);
  await seedPortalCondition(context, patient.id);
  await repos.followUps.save(
    FollowUp.create({
      patientId: patient.id,
      appointmentId: done.id,
      dueDate: new Date(today.getTime() + 3 * DAY_MS),
      reason: PORTAL_RETURN_REASON,
    }),
  );
  return 1;
}

/** Primeiro horário livre do profissional a partir de `start` (a massa pesada ocupa vários). */
async function freeSlot(
  repos: Awaited<ReturnType<typeof getRepositories>>,
  start: Date,
  minutes: number,
  professionalId: string,
): Promise<TimeSlot> {
  for (let shift = 0; shift < 12; shift += 1) {
    const from = new Date(start.getTime() + shift * HOUR_MS);
    const slot = TimeSlot.create(from, new Date(from.getTime() + minutes * 60_000));
    // O banco exige 15 min de folga entre consultas do mesmo profissional.
    const padded = TimeSlot.create(new Date(slot.start.getTime() - GAP_MS), new Date(slot.end.getTime() + GAP_MS));
    if ((await repos.appointments.findConflicting(padded, undefined, professionalId)).length === 0) {
      return slot;
    }
  }
  throw new Error("Sem horário livre para o cenário do seed");
}

async function seedPortalCondition(context: ScenarioContext, patientId: string): Promise<void> {
  const repos = await getRepositories(clinicScope(context.mainClinicId));
  const condition = ClinicalCondition.create({
    patientId,
    kind: "wound",
    stomaType: null,
    title: "Úlcera venosa",
    startedAt: new Date(context.now.getTime() - 40 * DAY_MS),
  });
  await repos.conditions.save(condition);
  for (const [visit, areaSide] of [48, 40, 33].entries()) {
    const assessment = ConditionAssessment.create({
      conditionId: condition.id,
      lengthMm: areaSide,
      widthMm: Math.round(areaSide * 0.6),
      depthMm: 3,
      tissueType: visit === 0 ? "slough" : "granulation",
      exudate: "low",
      painScale: 4 - visit,
      notes: "Avaliação fictícia gerada pelo seed de homologação.",
    });
    await repos.assessments.save(assessment);
    await backdateAssessment(assessment.id, new Date(context.now.getTime() - (28 - visit * 14) * DAY_MS));
  }
}

/** Parceira indica dois pacientes; o aceite de compartilhamento de um deles já está registrado (portal do parceiro). */
async function seedReferrals(context: ScenarioContext): Promise<number> {
  const partner = context.partner;
  if (!partner) {
    return 0;
  }
  const repos = await getRepositories(clinicScope(context.mainClinicId));
  const all = await repos.patients.findAll();
  if (all.some((patient) => patient.referredByPartnerId === partner.id)) {
    return 0;
  }
  const candidates = context.patients.filter((patient) => !patient.guardianId).slice(-2);
  for (const patient of candidates) {
    await repos.patients.save(patient.update({ referredByPartnerId: partner.id }));
  }
  const [shared] = candidates;
  if (shared) {
    await repos.partnerShareConsents.save(
      PartnerShareConsent.accept({
        patientId: shared.id,
        partnerId: partner.id,
        consentText: PARTNER_SHARE_CONSENT.text,
        textVersion: PARTNER_SHARE_CONSENT.version,
      }),
    );
  }
  return 1;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Avança sábado/domingo para a segunda seguinte. */
function nextWeekday(date: Date): Date {
  const day = date.getUTCDay();
  return new Date(date.getTime() + (day === 6 ? 2 : day === 0 ? 1 : 0) * DAY_MS);
}
