import { asc, eq } from 'drizzle-orm';
import { Clinic, isClinicSuspensionReason } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import type { AppDb } from './db';
import { clinics } from './schema';

type ClinicRow = typeof clinics.$inferSelect;

const toClinic = (row: ClinicRow): Clinic =>
  Clinic.restore({
    id: row.id,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    cnpj: row.cnpj,
    address: row.address,
    city: row.city,
    professionalName: row.professionalName,
    professionalRegistry: row.professionalRegistry,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    status: row.status === 'suspended' ? 'suspended' : 'active',
    statusChangedAt: row.statusChangedAt,
    statusChangedBy: row.statusChangedBy,
    statusReason: isClinicSuspensionReason(row.statusReason)
      ? row.statusReason
      : null,
    statusReasonNote: row.statusReasonNote,
    cnpjReviewSince: row.cnpjReviewSince,
    dpoName: row.dpoName,
    dpoContact: row.dpoContact,
    logoKey: row.logoKey,
    themeMode: row.themeMode,
    themeAccent: row.themeAccent,
  });

/** Dados cadastrais gravados por `create` e `update`. */
const infoColumns = (clinic: Clinic) => ({
  name: clinic.name,
  cnpj: clinic.cnpj,
  cnpjReviewSince: clinic.cnpjReviewSince,
  address: clinic.address,
  city: clinic.city,
  professionalName: clinic.professionalName,
  professionalRegistry: clinic.professionalRegistry,
  contactPhone: clinic.contactPhone,
  contactEmail: clinic.contactEmail,
  dpoName: clinic.dpoName,
  dpoContact: clinic.dpoContact,
});

/** Estado da clínica (B5) — gravado por `create` e `saveStatus`. */
const statusColumns = (clinic: Clinic) => ({
  status: clinic.status,
  statusChangedAt: clinic.statusChangedAt,
  statusChangedBy: clinic.statusChangedBy,
  statusReason: clinic.statusReason,
  statusReasonNote: clinic.statusReasonNote,
});

export class DrizzleClinicRepository implements ClinicRepository {
  constructor(private readonly db: AppDb) {}

  async create(clinic: Clinic): Promise<void> {
    await this.db.insert(clinics).values({
      id: clinic.id,
      createdBy: clinic.createdBy,
      createdAt: clinic.createdAt,
      ...infoColumns(clinic),
      ...statusColumns(clinic),
    });
  }

  async findByCnpj(cnpj: string): Promise<Clinic | null> {
    const rows = await this.db
      .select()
      .from(clinics)
      .where(eq(clinics.cnpj, cnpj))
      .limit(1);
    return rows[0] ? toClinic(rows[0]) : null;
  }

  async findById(id: string): Promise<Clinic | null> {
    const rows = await this.db
      .select()
      .from(clinics)
      .where(eq(clinics.id, id))
      .limit(1);
    return rows[0] ? toClinic(rows[0]) : null;
  }

  async findAll(): Promise<Clinic[]> {
    const rows = await this.db
      .select()
      .from(clinics)
      .orderBy(asc(clinics.createdAt));
    return rows.map(toClinic);
  }

  async update(clinic: Clinic): Promise<void> {
    await this.db
      .update(clinics)
      .set(infoColumns(clinic))
      .where(eq(clinics.id, clinic.id));
  }

  async saveStatus(clinic: Clinic): Promise<void> {
    await this.db
      .update(clinics)
      .set(statusColumns(clinic))
      .where(eq(clinics.id, clinic.id));
  }

  async saveCnpjReview(clinic: Clinic): Promise<void> {
    await this.db
      .update(clinics)
      .set({ cnpjReviewSince: clinic.cnpjReviewSince })
      .where(eq(clinics.id, clinic.id));
  }

  async saveLogoKey(clinic: Clinic): Promise<void> {
    await this.db
      .update(clinics)
      .set({ logoKey: clinic.logoKey })
      .where(eq(clinics.id, clinic.id));
  }

  async saveTheme(clinic: Clinic): Promise<void> {
    await this.db
      .update(clinics)
      .set({
        themeMode: clinic.theme.mode,
        themeAccent: clinic.theme.accent,
      })
      .where(eq(clinics.id, clinic.id));
  }
}
