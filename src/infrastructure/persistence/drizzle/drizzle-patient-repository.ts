import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { Patient } from '@/domain/patient/patient';
import type {
  PatientPage,
  PatientRepository,
} from '@/domain/patient/patient-repository';
import {
  comparePatientEntries,
  selectPatientPage,
} from '@/domain/patient/patient-search';
import {
  type BlindIndex,
  type BlindIndexKind,
  blindIndexFromEnv,
  orFallbackOnInvalid,
} from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import { logger } from '@/lib/observability/logger';
import { decodeCursor } from '@/lib/pagination';
import { type AppDb, MAX_ROWS } from './db';
import { patients } from './schema';
import { withTenant } from './tenant-scope';

/** O índice cego, ou quem o fornece quando precisar (leitura preguiçosa do ambiente). */
export type BlindIndexSource = BlindIndex | (() => BlindIndex);

type PatientRow = typeof patients.$inferSelect;

/**
 * Teto de pacientes varridos por busca (ADR-096): a busca por nome decifra a
 * empresa em memória. Uma clínica de estomaterapia tem de centenas a poucos
 * milhares; passar do teto gera aviso (sem dado pessoal) e a lista é truncada.
 */
export const PATIENT_SCAN_CAP = 20_000;

/** Nascimento: coluna cifrada (ADR-096); a coluna legada em claro só vale até a recifra. */
function readBirthDate(row: PatientRow, cipher: FieldCipher): Date | null {
  if (row.birthDateEnc) return new Date(cipher.decrypt(row.birthDateEnc));
  return row.birthDate;
}

const toPatient = (row: PatientRow, cipher: FieldCipher): Patient =>
  Patient.restore({
    id: row.id,
    // Leitura tolerante: valor em claro (linha anterior à cifra) passa como está.
    fullName: cipher.decrypt(row.fullName),
    email: cipher.decryptNullable(row.email),
    phone: cipher.decrypt(row.phone),
    cpf: cipher.decryptNullable(row.cpf),
    birthDate: readBirthDate(row, cipher),
    notes: cipher.decryptNullable(row.notes),
    referredByPartnerId: row.referredByPartnerId,
    guardianId: row.guardianId,
    guardianPortalRevokedAt: row.guardianPortalRevokedAt,
    majorityReviewedAt: row.majorityReviewedAt,
    active: row.active,
    createdAt: row.createdAt,
    anonymizedAt: row.anonymizedAt,
  });

export function hashOrNull(
  blindIndex: BlindIndex,
  clinicId: string,
  kind: BlindIndexKind,
  raw: string | null,
): string | null {
  return orFallbackOnInvalid(() => blindIndex.hash(clinicId, kind, raw), null);
}

export class DrizzlePatientRepository implements PatientRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
    private readonly blindIndexSource: BlindIndexSource = blindIndexFromEnv,
  ) {}

  /** Resolvido só no uso: uma empresa sem pepper (ambiente de teste) não quebra repositórios que nunca indexam. */
  private get blindIndex(): BlindIndex {
    return typeof this.blindIndexSource === 'function'
      ? this.blindIndexSource()
      : this.blindIndexSource;
  }

  async save(patient: Patient): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar paciente (somente leitura cross-empresa)',
      );
    }
    const clinicId = this.clinicId;
    const hash = (kind: BlindIndexKind, raw: string | null) =>
      hashOrNull(this.blindIndex, clinicId, kind, raw);
    const values = {
      id: patient.id,
      clinicId,
      // PII cifrada em repouso (ADR-096); o nascimento sai da coluna em claro.
      fullName: this.cipher.encrypt(patient.fullName),
      email: this.cipher.encryptNullable(patient.email),
      phone: this.cipher.encrypt(patient.phone),
      cpf: this.cipher.encryptNullable(patient.cpf),
      birthDate: null,
      birthDateEnc: this.cipher.encryptNullable(
        patient.birthDate?.toISOString() ?? null,
      ),
      cpfHash: hash('cpf', patient.cpf),
      phoneHash: hash('phone', patient.phone),
      emailHash: hash('email', patient.email),
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
    // O nascimento está cifrado: o SQL restringe por responsável (indexado) e
    // a comparação com o corte acontece em memória (ADR-096).
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
            isNull(patients.guardianPortalRevokedAt),
            isNull(patients.majorityReviewedAt),
          ),
        ),
      )
      .limit(PATIENT_SCAN_CAP);
    return rows
      .map((row) => toPatient(row, this.cipher))
      .filter(
        (patient) =>
          patient.birthDate !== null &&
          patient.birthDate.getTime() <= birthCutoff.getTime(),
      )
      .sort(compareByNameThenId);
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
      .limit(MAX_ROWS);
    return rows
      .map((row) => toPatient(row, this.cipher))
      .sort(compareByNameThenId);
  }

  async findAll(search?: string, page: PatientPage = {}): Promise<Patient[]> {
    if (page.ids && page.ids.length === 0) {
      return [];
    }
    const limit = Math.min(page.limit ?? MAX_ROWS, MAX_ROWS);
    // Nome cifrado: lê só id + nome da empresa, decifra e decide a página em
    // memória (ADR-096); só as linhas da página voltam inteiras do banco.
    const rows = await this.db
      .select({ id: patients.id, fullName: patients.fullName })
      .from(patients)
      .where(
        withTenant(
          patients,
          this.clinicId,
          page.ids ? inArray(patients.id, page.ids) : undefined,
        ),
      )
      .orderBy(asc(patients.id))
      .limit(PATIENT_SCAN_CAP + 1);
    if (rows.length > PATIENT_SCAN_CAP) {
      logger.warn(
        `[patients] busca truncada: a empresa passa de ${PATIENT_SCAN_CAP} pacientes (ADR-096, plano B: índice cego de primeiro nome)`,
      );
      rows.length = PATIENT_SCAN_CAP;
    }
    const entries = rows.map((row) => ({
      id: row.id,
      fullName: this.cipher.decrypt(row.fullName),
    }));
    const term = search?.trim();
    const selected = selectPatientPage(entries, {
      term,
      matchedIds: term ? await this.findIdsByExactValue(term) : undefined,
      cursorId: decodeCursor<{ id?: string }>(page.cursor)?.id ?? null,
      limit,
    });
    return this.loadInOrder(selected.map((entry) => entry.id));
  }

  /** CPF, telefone ou e-mail exatos pelo índice cego; termo que não normaliza não acha nada. */
  private async findIdsByExactValue(term: string): Promise<Set<string>> {
    const clinicId = this.clinicId;
    if (clinicId === null) return new Set();
    const kinds: [BlindIndexKind, PgColumn][] = [
      ['cpf', patients.cpfHash],
      ['phone', patients.phoneHash],
      ['email', patients.emailHash],
    ];
    const conditions = kinds.flatMap(([kind, column]) => {
      const candidates = orFallbackOnInvalid(
        () => this.blindIndex.candidates(clinicId, kind, term),
        [],
      );
      return candidates.length > 0 ? [inArray(column, candidates)] : [];
    });
    if (conditions.length === 0) return new Set();
    const rows = await this.db
      .select({ id: patients.id })
      .from(patients)
      .where(withTenant(patients, this.clinicId, or(...conditions)));
    return new Set(rows.map((row) => row.id));
  }

  private async loadInOrder(ids: string[]): Promise<Patient[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(patients)
      .where(withTenant(patients, this.clinicId, inArray(patients.id, ids)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toPatient(row, this.cipher)] : [];
    });
  }
}

function compareByNameThenId(a: Patient, b: Patient): number {
  return comparePatientEntries(a, b);
}
