import { Appointment } from "@/domain/scheduling/appointment";
import { UserAccount } from "@/domain/auth/user-account";
import { Procedure } from "@/domain/catalog/procedure";
import { Clinic } from "@/domain/clinic/clinic";
import { ClinicalCondition } from "@/domain/clinical/clinical-condition";
import { ConditionAssessment } from "@/domain/clinical/condition-assessment";
import { Guardian } from "@/domain/guardian/guardian";
import { Invoice } from "@/domain/billing/invoice";
import { Supply } from "@/domain/inventory/supply";
import { SupplyBatch } from "@/domain/inventory/supply-batch";
import { Patient } from "@/domain/patient/patient";
import { Professional } from "@/domain/professional/professional";
import { Money } from "@/domain/shared/money";
import { TimeSlot } from "@/domain/shared/time-slot";
import { getRepositories } from "@/infrastructure/container";
import { hashPassword } from "@/lib/auth/password";
import { clinicScope, systemScope } from "@/lib/auth/tenant-scope";
import { validCnpj } from "../../tests/support/cnpj";
import {
  birthDateForAge,
  fakeCpf,
  fakeEmail,
  fakePersonName,
  fakePhone,
  initFaker,
  int,
  PROCEDURES,
  pick,
  SUPPLIES,
} from "./data";

/**
 * Massa fictícia de homologação (ADR-041): sucesso e erro. Passa pelos
 * repositórios da aplicação, então o dado clínico sai cifrado com a
 * `DATA_ENCRYPTION_KEY` do ambiente. Idempotente por clínica: se a clínica
 * principal já existe, não altera nada.
 */
export const MAIN_CLINIC_ID = "hml-clinica-principal";
export const SUSPENDED_CLINIC_ID = "hml-clinica-suspensa";
export const PATIENT_COUNT = 40;
const DAY_MS = 86_400_000;

export interface SeedOptions {
  /** Senha das contas fictícias (>= 10 caracteres). Obrigatória: nada de senha no repositório. */
  password: string;
  now?: Date;
}

export interface SeedReport {
  skipped: boolean;
  counts: Record<string, number>;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isWeekend(date: Date): boolean {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

async function seedClinics(now: Date): Promise<void> {
  const { clinics } = await getRepositories(systemScope());
  const base = { createdBy: "homologacao-seed", createdAt: now } as const;
  await clinics.create(
    Clinic.restore({
      ...base,
      id: MAIN_CLINIC_ID,
      name: "Clínica Homologação (fictícia)",
      cnpj: validCnpj("111111110001"),
      contactPhone: "11 3333-4444",
      contactEmail: "contato@homologacao.invalid",
      status: "active",
    }),
  );
  const suspended = Clinic.restore({
    ...base,
    id: SUSPENDED_CLINIC_ID,
    name: "Clínica Suspensa (fictícia)",
    cnpj: validCnpj("222222220001"),
    contactPhone: "11 3333-5555",
    contactEmail: "suspensa@homologacao.invalid",
    status: "active",
  }).suspend("homologacao-seed", now, { reason: "non_payment" });
  await clinics.create(suspended);
}

async function seedAccounts(
  password: string,
  professionalId: string,
): Promise<number> {
  const passwordHash = await hashPassword(password);
  const accounts = [
    { email: "super@homologacao.invalid", role: "super_admin", clinicId: null },
    { email: "admin@homologacao.invalid", role: "company_admin", clinicId: MAIN_CLINIC_ID },
    { email: "atendente@homologacao.invalid", role: "atendente", clinicId: MAIN_CLINIC_ID },
    {
      email: "profissional@homologacao.invalid",
      role: "profissional",
      clinicId: MAIN_CLINIC_ID,
      professionalId,
    },
    // Cenário de erro: login de clínica suspensa.
    { email: "admin-suspensa@homologacao.invalid", role: "company_admin", clinicId: SUSPENDED_CLINIC_ID },
  ] as const;
  const { userAccounts } = await getRepositories(systemScope());
  for (const account of accounts) {
    await userAccounts.save(UserAccount.create({ ...account, passwordHash }));
  }
  return accounts.length;
}

async function seedPatients(now: Date) {
  const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  const patients: Patient[] = [];
  for (let index = 0; index < PATIENT_COUNT; index += 1) {
    const name = fakePersonName();
    // Cenários: sem e-mail (lembrete impossível), sem CPF (recibo bloqueado), idoso, menor com responsável.
    const isMinor = index % 13 === 0;
    let guardianId: string | null = null;
    if (isMinor) {
      const guardian = Guardian.create({
        fullName: fakePersonName(),
        relationship: pick(["mae", "pai", "representante_legal"] as const),
        phone: fakePhone(),
      });
      await repos.guardians.save(guardian);
      guardianId = guardian.id;
    }
    const patient = Patient.create({
      fullName: name,
      email: index % 7 === 0 ? null : fakeEmail(name, index),
      phone: fakePhone(),
      cpf: index % 5 === 0 || isMinor ? null : fakeCpf(),
      birthDate: birthDateForAge(isMinor ? int(4, 15) : int(18, 90), now),
      guardianId,
      notes: index % 9 === 0 ? "Dificuldade de locomoção; atender no térreo." : null,
    });
    await repos.patients.save(patient);
    patients.push(patient);
  }
  return patients;
}

async function seedCatalog() {
  const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  const professionals = [
    Professional.create({ fullName: "Ana Souza (fictícia)", registry: "COREN-SP 000001" }),
    Professional.create({
      fullName: "Bruno Lima (fictício)",
      registry: "COREN-SP 000002",
      commissionType: "fixed",
      commissionFixedCents: 3000,
    }),
  ];
  for (const professional of professionals) {
    await repos.professionals.save(professional);
  }
  const procedures = PROCEDURES.map((procedure) => Procedure.create(procedure));
  for (const procedure of procedures) {
    await repos.procedures.save(procedure);
  }
  return { professionals, procedures };
}

async function seedAppointments(
  now: Date,
  patients: Patient[],
  professionals: Professional[],
  procedures: Procedure[],
): Promise<{ appointments: number; invoices: number }> {
  const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  const today = startOfUtcDay(now);
  let appointments = 0;
  let invoices = 0;
  for (let offset = -35; offset <= 14; offset += 1) {
    const day = new Date(today.getTime() + offset * DAY_MS);
    if (isWeekend(day)) {
      continue;
    }
    for (const [slotIndex, professional] of professionals.entries()) {
      const procedure = procedures[(appointments + slotIndex) % procedures.length];
      const start = new Date(day.getTime() + (12 + slotIndex * 2) * 3_600_000);
      const end = new Date(start.getTime() + procedure.durationMinutes * 60_000);
      const patient = patients[(appointments * 3 + slotIndex) % patients.length];
      let appointment = Appointment.create({
        patientId: patient.id,
        slot: TimeSlot.create(start, end),
        procedure: procedure.name,
        price: Money.fromCents(procedure.priceCents),
        professionalId: professional.id,
        procedureId: procedure.id,
      });
      if (offset < 0) {
        const fate = appointments % 6;
        if (fate === 4) {
          appointment = appointment.cancel({ by: "patient", at: start, reason: "Paciente desmarcou", late: true });
        } else if (fate === 5) {
          appointment = appointment.markNoShow();
        } else {
          appointment = appointment.complete();
        }
      }
      await repos.appointments.save(appointment);
      appointments += 1;
      if (offset < 0 && appointment.status === "completed") {
        // Faturas: pendentes vencidas (cenário de cobrança) e pagas.
        const invoice = Invoice.create({
          patientId: patient.id,
          appointmentId: appointment.id,
          description: procedure.name,
          amount: Money.fromCents(procedure.priceCents),
          dueDate: new Date(day.getTime() + 7 * DAY_MS),
        });
        await repos.invoices.save(
          appointments % 3 === 0
            ? invoice.registerPayment({
                amount: Money.fromCents(procedure.priceCents),
                method: "pix",
                paidAt: end,
              })
            : invoice,
        );
        invoices += 1;
      }
    }
  }
  return { appointments, invoices };
}

async function seedClinical(now: Date, patients: Patient[]): Promise<number> {
  const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  let assessments = 0;
  for (const [index, patient] of patients.slice(0, 20).entries()) {
    const isStoma = index % 4 === 0;
    const condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: isStoma ? "stoma" : "wound",
      stomaType: isStoma ? pick(["colostomia", "ileostomia", "urostomia"] as const) : null,
      title: isStoma ? "Estomia de eliminação" : pick(["Lesão por pressão", "Úlcera venosa", "Pé diabético"] as const),
      startedAt: new Date(now.getTime() - 60 * DAY_MS),
    });
    await repos.conditions.save(condition);
    // Evolução seriada: melhora (área menor) ou piora, cenário de alerta.
    const worsening = index % 5 === 1;
    for (let visit = 0; visit < 5; visit += 1) {
      const size = worsening ? 20 + visit * 8 : 60 - visit * 10;
      await repos.assessments.save(
        ConditionAssessment.create({
          conditionId: condition.id,
          lengthMm: isStoma ? null : size,
          widthMm: isStoma ? null : Math.round(size * 0.7),
          depthMm: isStoma ? null : 4,
          tissueType: isStoma ? null : worsening ? "slough" : visit > 2 ? "granulation" : "slough",
          exudate: worsening ? "high" : "low",
          painScale: worsening ? 8 : int(1, 4),
          notes: "Avaliação fictícia gerada pelo seed de homologação.",
        }),
      );
      assessments += 1;
    }
  }
  return assessments;
}

async function seedInventory(now: Date): Promise<number> {
  const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  let batches = 0;
  for (const item of SUPPLIES) {
    const supply = Supply.create({
      name: item.name,
      unit: item.unit,
      minQty: item.minQty,
      priceCents: item.priceCents,
    });
    await repos.supplies.save(supply);
    if (item.stock === "zero") {
      continue;
    }
    const quantity = item.stock === "low" ? 3 : 40;
    const expiresAt = new Date(
      now.getTime() + (item.stock === "expired" ? -10 : 180) * DAY_MS,
    );
    await repos.supplyBatches.save(
      SupplyBatch.create({ supplyId: supply.id, quantity, label: `LOTE-${batches + 1}`, expiresAt }),
    );
    await repos.supplies.adjustStock(supply.id, quantity);
    batches += 1;
  }
  return batches;
}

export async function seedHomologation(options: SeedOptions): Promise<SeedReport> {
  const now = options.now ?? new Date();
  const { clinics } = await getRepositories(systemScope());
  if (await clinics.findById(MAIN_CLINIC_ID)) {
    return { skipped: true, counts: {} };
  }
  initFaker(now);
  await seedClinics(now);
  const { professionals, procedures } = await seedCatalog();
  const accounts = await seedAccounts(options.password, professionals[0].id);
  const patients = await seedPatients(now);
  const { appointments, invoices } = await seedAppointments(now, patients, professionals, procedures);
  const assessments = await seedClinical(now, patients);
  const batches = await seedInventory(now);
  return {
    skipped: false,
    counts: {
      clinics: 2,
      accounts,
      professionals: professionals.length,
      procedures: procedures.length,
      patients: patients.length,
      appointments,
      invoices,
      assessments,
      supplyBatches: batches,
    },
  };
}
