import { asc, eq, inArray } from 'drizzle-orm';
import {
  Clinic,
  type ClinicKind,
  isClinicSuspensionReason,
} from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import {
  type BlindIndex,
  blindIndexFromEnv,
  PROVIDER_INDEX_SCOPE,
} from '@/lib/blind-index';
import { dataCipherFromEnv, type FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { clinics } from './schema';

type ClinicRow = typeof clinics.$inferSelect;

/** A chave, ou quem a fornece quando precisar (leitura preguiçosa do ambiente). */
export type CipherSource = FieldCipher | (() => FieldCipher);
export type ClinicBlindIndexSource = BlindIndex | (() => BlindIndex);

/** Lê a fonte na primeira vez que for pedida e guarda o resultado. */
function lazy<T extends object>(source: T | (() => T)): () => T {
  let value: T | undefined;
  return () => {
    value ??= typeof source === 'function' ? (source as () => T)() : source;
    return value;
  };
}

/** Índice cego do CPF da autônoma (#977): escopo fixo, para a unicidade entre clientes. */
export function providerCpfHash(
  blindIndex: BlindIndex,
  cpf: string | null,
): string | null {
  return blindIndex.hash(PROVIDER_INDEX_SCOPE, 'provider-cpf', cpf);
}

const toClinic = (row: ClinicRow, cipher: () => FieldCipher): Clinic =>
  Clinic.restore({
    id: row.id,
    name: row.name,
    // Valor fora da lista vale clínica (`Clinic.restore`).
    kind: row.kind as ClinicKind,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    cnpj: row.cnpj,
    // Só a autônoma tem CPF: a clínica nunca resolve a chave.
    cpf: row.cpf === null ? null : cipher().decryptNullable(row.cpf),
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

/**
 * Dados cadastrais gravados por `create` e `update`. O tipo entra porque a
 * autônoma que abre CNPJ passa a clínica (#986).
 */
const infoColumns = (
  clinic: Clinic,
  cipher: () => FieldCipher,
  blindIndex: () => BlindIndex,
) => ({
  kind: clinic.kind,
  name: clinic.name,
  cnpj: clinic.cnpj,
  ...(clinic.cpf === null
    ? { cpf: null, cpfHash: null }
    : {
        cpf: cipher().encrypt(clinic.cpf),
        cpfHash: providerCpfHash(blindIndex(), clinic.cpf),
      }),
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
  private readonly cipher: () => FieldCipher;
  private readonly blindIndex: () => BlindIndex;
  private readonly toClinic: (row: ClinicRow) => Clinic;

  /**
   * Chave e índice cego só são resolvidos quando há CPF a cifrar ou decifrar
   * (#977): a clínica com CNPJ nunca depende deles.
   */
  constructor(
    private readonly db: AppDb,
    cipherSource: CipherSource = dataCipherFromEnv,
    blindIndexSource: ClinicBlindIndexSource = blindIndexFromEnv,
  ) {
    this.cipher = lazy(cipherSource);
    this.blindIndex = lazy(blindIndexSource);
    this.toClinic = (row) => toClinic(row, this.cipher);
  }

  async create(clinic: Clinic): Promise<void> {
    await this.db.insert(clinics).values({
      id: clinic.id,
      createdBy: clinic.createdBy,
      createdAt: clinic.createdAt,
      ...infoColumns(clinic, this.cipher, this.blindIndex),
      ...statusColumns(clinic),
      themeMode: clinic.theme.mode,
      themeAccent: clinic.theme.accent,
    });
  }

  async findByCnpj(cnpj: string): Promise<Clinic | null> {
    const rows = await this.db
      .select()
      .from(clinics)
      .where(eq(clinics.cnpj, cnpj))
      .limit(1);
    return rows[0] ? this.toClinic(rows[0]) : null;
  }

  async findByCpf(cpf: string): Promise<Clinic | null> {
    const candidates = this.blindIndex().candidates(
      PROVIDER_INDEX_SCOPE,
      'provider-cpf',
      cpf,
    );
    if (candidates.length === 0) return null;
    const rows = await this.db
      .select()
      .from(clinics)
      .where(inArray(clinics.cpfHash, candidates))
      .limit(1);
    return rows[0] ? this.toClinic(rows[0]) : null;
  }

  async findById(id: string): Promise<Clinic | null> {
    const rows = await this.db
      .select()
      .from(clinics)
      .where(eq(clinics.id, id))
      .limit(1);
    return rows[0] ? this.toClinic(rows[0]) : null;
  }

  async findAll(): Promise<Clinic[]> {
    const rows = await this.db
      .select()
      .from(clinics)
      .orderBy(asc(clinics.createdAt));
    return rows.map(this.toClinic);
  }

  async update(clinic: Clinic): Promise<void> {
    await this.db
      .update(clinics)
      .set(infoColumns(clinic, this.cipher, this.blindIndex))
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
