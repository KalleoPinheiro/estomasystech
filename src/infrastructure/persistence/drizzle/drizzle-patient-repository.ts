import {
  and,
  asc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { Patient } from '@/domain/patient/patient';
import type {
  PatientPage,
  PatientRepository,
} from '@/domain/patient/patient-repository';
import type { FieldCipher } from '@/lib/data-cipher';
import { decodeCursor } from '@/lib/pagination';
import { type AppDb, MAX_ROWS } from './db';
import { patients } from './schema';
import { withTenant } from './tenant-scope';

type PatientRow = typeof patients.$inferSelect;

const toPatient = (row: PatientRow, cipher: FieldCipher): Patient =>
  Patient.restore({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    cpf: cipher.decryptNullable(row.cpf),
    birthDate: row.birthDate,
    notes: cipher.decryptNullable(row.notes),
    referredByPartnerId: row.referredByPartnerId,
    guardianId: row.guardianId,
    guardianPortalRevokedAt: row.guardianPortalRevokedAt,
    majorityReviewedAt: row.majorityReviewedAt,
    active: row.active,
    createdAt: row.createdAt,
    anonymizedAt: row.anonymizedAt,
  });

export class DrizzlePatientRepository implements PatientRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  async save(patient: Patient): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar paciente (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: patient.id,
      clinicId: this.clinicId,
      fullName: patient.fullName,
      email: patient.email,
      phone: patient.phone,
      cpf: this.cipher.encryptNullable(patient.cpf),
      birthDate: patient.birthDate,
      notes: this.cipher.encryptNullable(patient.notes),
      referredByPartnerId: patient.referredByPartnerId,
      guardianId: patient.guardianId,
      guardianPortalRevokedAt: patient.guardianPortalRevokedAt,
      majorityReviewedAt: patient.majorityReviewedAt,
      active: patient.isActive,
      createdAt: patient.createdAt,
    };
    await this.db
      .insert(patients)
      .values(values)
      .onConflictDoUpdate({ target: patients.id, set: values });
  }

  async findById(id: string): Promise<Patient | null> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(withTenant(patients, this.clinicId, eq(patients.id, id)))
      .limit(1);
    return rows[0] ? toPatient(rows[0], this.cipher) : null;
  }

  async findByIdForUpdate(id: string): Promise<Patient | null> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(withTenant(patients, this.clinicId, eq(patients.id, id)))
      .limit(1)
      .for('update');
    return rows[0] ? toPatient(rows[0], this.cipher) : null;
  }

  async findByIds(ids: string[]): Promise<Patient[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(patients)
      .where(withTenant(patients, this.clinicId, inArray(patients.id, unique)));
    return rows.map((row) => toPatient(row, this.cipher));
  }

  async findClinicIdById(id: string): Promise<string | null> {
    const rows = await this.db
      .select({ clinicId: patients.clinicId })
      .from(patients)
      .where(eq(patients.id, id))
      .limit(1);
    return rows[0]?.clinicId ?? null;
  }

  async findByReferrer(partnerId: string): Promise<Patient[]> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(
        withTenant(
          patients,
          this.clinicId,
          eq(patients.referredByPartnerId, partnerId),
        ),
      )
      .limit(MAX_ROWS);
    return rows.map((row) => toPatient(row, this.cipher));
  }

  async findAdultsAwaitingMajorityReview(
    guardianIds: string[],
    birthCutoff: Date,
  ): Promise<Patient[]> {
    if (guardianIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(patients)
      .where(
        withTenant(
          patients,
          this.clinicId,
          and(
            inArray(patients.guardianId, guardianIds),
            eq(patients.active, true),
            lte(patients.birthDate, birthCutoff),
            isNull(patients.guardianPortalRevokedAt),
            isNull(patients.majorityReviewedAt),
          ),
        ),
      )
      .orderBy(asc(patients.fullName), asc(patients.id))
      .limit(MAX_ROWS);
    return rows.map((row) => toPatient(row, this.cipher));
  }

  async findByGuardian(guardianId: string): Promise<Patient[]> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(
        withTenant(
          patients,
          this.clinicId,
          eq(patients.guardianId, guardianId),
        ),
      )
      .orderBy(asc(patients.fullName), asc(patients.id))
      .limit(MAX_ROWS);
    return rows.map((row) => toPatient(row, this.cipher));
  }

  async findAll(search?: string, page: PatientPage = {}): Promise<Patient[]> {
    if (page.ids && page.ids.length === 0) {
      return [];
    }
    const limit = Math.min(page.limit ?? MAX_ROWS, MAX_ROWS);
    const filter = buildPatientFilter(search, page.ids);
    const cursorFilter = buildPatientCursorFilter(page.cursor);
    const rows = await this.db
      .select()
      .from(patients)
      .where(withTenant(patients, this.clinicId, and(filter, cursorFilter)))
      .orderBy(asc(patients.fullName), asc(patients.id))
      .limit(limit);
    return rows.map((row) => toPatient(row, this.cipher));
  }
}

/** Predicado de keyset: retoma estritamente depois de (fullName, id) do cursor. */
function buildPatientCursorFilter(cursor?: string) {
  const decoded = decodeCursor<{ fullName: string; id: string }>(cursor);
  if (!decoded) return undefined;
  return or(
    gt(patients.fullName, decoded.fullName),
    and(eq(patients.fullName, decoded.fullName), gt(patients.id, decoded.id)),
  );
}

const MIN_PHONE_SEARCH_DIGITS = 3;

/**
 * Combina o filtro de busca textual (nome/e-mail/telefone) com o filtro de
 * ids da página, quando ambos existem. Extraída de `findAll` para manter a
 * complexidade dentro do limite do projeto (issue #48).
 */
function buildPatientFilter(
  search: string | undefined,
  ids: string[] | undefined,
) {
  const searchDigits = search?.replace(/\D/g, '') ?? '';
  const searchFilter = search
    ? or(
        ilike(patients.fullName, `%${search}%`),
        ilike(patients.email, `%${search}%`),
        ilike(patients.phone, `%${search}%`),
        // Telefone é guardado em E.164: "(11) 99999" também deve achar.
        searchDigits.length >= MIN_PHONE_SEARCH_DIGITS
          ? ilike(patients.phone, `%${searchDigits}%`)
          : undefined,
      )
    : undefined;
  const idsFilter = ids ? inArray(patients.id, ids) : undefined;
  if (searchFilter && idsFilter) {
    return and(searchFilter, idsFilter);
  }
  return searchFilter ?? idsFilter;
}
