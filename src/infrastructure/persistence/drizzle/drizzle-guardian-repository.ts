import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import {
  Guardian,
  type GuardianRelationship,
} from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { selectPatientPage } from '@/domain/patient/patient-search';
import {
  type BlindIndex,
  type BlindIndexKind,
  blindIndexFromEnv,
  orFallbackOnInvalid,
} from '@/lib/blind-index';
import type { FieldCipher } from '@/lib/data-cipher';
import { logger } from '@/lib/observability/logger';
import { type AppDb, MAX_ROWS } from './db';
import {
  type BlindIndexSource,
  hashOrNull,
} from './drizzle-patient-repository';
import { guardians } from './schema';
import { withTenant } from './tenant-scope';

/**
 * Teto de responsáveis varridos por busca (ADR-096): como no paciente, o nome
 * cifrado só se filtra em memória. Uma clínica tem bem menos responsáveis que
 * pacientes; passar do teto gera aviso (sem dado pessoal) e a lista é truncada.
 */
export const GUARDIAN_SCAN_CAP = 20_000;

type GuardianRow = typeof guardians.$inferSelect;

const toGuardian = (row: GuardianRow, cipher: FieldCipher): Guardian =>
  Guardian.restore({
    id: row.id,
    // Leitura tolerante: valor em claro (linha anterior à cifra) passa como está.
    fullName: cipher.decrypt(row.fullName),
    relationship: row.relationship as GuardianRelationship,
    phone: cipher.decrypt(row.phone),
    email: cipher.decryptNullable(row.email),
    createdAt: row.createdAt,
  });

export class DrizzleGuardianRepository implements GuardianRepository {
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

  async save(guardian: Guardian): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar responsável (somente leitura cross-empresa)',
      );
    }
    const clinicId = this.clinicId;
    const values = {
      id: guardian.id,
      clinicId,
      // PII cifrada em repouso (ADR-096); o índice cego serve à busca exata.
      fullName: this.cipher.encrypt(guardian.fullName),
      relationship: guardian.relationship,
      phone: this.cipher.encrypt(guardian.phone),
      email: this.cipher.encryptNullable(guardian.email),
      phoneHash: hashOrNull(this.blindIndex, clinicId, 'phone', guardian.phone),
      emailHash: hashOrNull(this.blindIndex, clinicId, 'email', guardian.email),
      createdAt: guardian.createdAt,
    };
    await this.db
      .insert(guardians)
      .values(values)
      .onConflictDoUpdate({ target: guardians.id, set: values });
  }

  async findById(id: string): Promise<Guardian | null> {
    const rows = await this.db
      .select()
      .from(guardians)
      .where(withTenant(guardians, this.clinicId, eq(guardians.id, id)))
      .limit(1);
    return rows[0] ? toGuardian(rows[0], this.cipher) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Guardian[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(guardians)
      .where(
        withTenant(guardians, this.clinicId, inArray(guardians.id, unique)),
      );
    return rows.map((row) => toGuardian(row, this.cipher));
  }

  /**
   * Nome em memória (sem acento nem caixa) e telefone ou e-mail exatos pelo
   * índice cego; só as linhas da página voltam inteiras do banco (ADR-096).
   */
  async findAll(search?: string): Promise<Guardian[]> {
    const rows = await this.db
      .select({ id: guardians.id, fullName: guardians.fullName })
      .from(guardians)
      .where(withTenant(guardians, this.clinicId))
      .orderBy(asc(guardians.id))
      .limit(GUARDIAN_SCAN_CAP + 1);
    if (rows.length > GUARDIAN_SCAN_CAP) {
      logger.warn(
        `[guardians] busca truncada: a empresa passa de ${GUARDIAN_SCAN_CAP} responsáveis (ADR-096)`,
      );
      rows.length = GUARDIAN_SCAN_CAP;
    }
    const term = search?.trim();
    const selected = selectPatientPage(
      rows.map((row) => ({
        id: row.id,
        fullName: this.cipher.decrypt(row.fullName),
      })),
      {
        term,
        matchedIds: term ? await this.findIdsByExactValue(term) : undefined,
        limit: MAX_ROWS,
      },
    );
    return this.loadInOrder(selected.map((entry) => entry.id));
  }

  /**
   * Telefone ou e-mail exatos pelo índice cego; termo que não normaliza não
   * acha nada. Linhas ainda sem hash (antes do backfill) são comparadas
   * decifrando, para o responsável não sumir da busca na janela do deploy.
   */
  private async findIdsByExactValue(term: string): Promise<Set<string>> {
    const clinicId = this.clinicId;
    if (clinicId === null) return new Set();
    const kinds: [BlindIndexKind, PgColumn, PgColumn][] = [
      ['phone', guardians.phoneHash, guardians.phone],
      ['email', guardians.emailHash, guardians.email],
    ];
    const matched = new Set<string>();
    for (const [kind, hashColumn, valueColumn] of kinds) {
      const candidates = orFallbackOnInvalid(
        () => this.blindIndex.candidates(clinicId, kind, term),
        [],
      );
      if (candidates.length === 0) continue;
      for (const id of await this.matchKind(
        clinicId,
        kind,
        hashColumn,
        valueColumn,
        candidates,
      )) {
        matched.add(id);
      }
    }
    return matched;
  }

  private async matchKind(
    clinicId: string,
    kind: BlindIndexKind,
    hashColumn: PgColumn,
    valueColumn: PgColumn,
    candidates: string[],
  ): Promise<string[]> {
    const hashed = await this.db
      .select({ id: guardians.id })
      .from(guardians)
      .where(withTenant(guardians, clinicId, inArray(hashColumn, candidates)));
    const legacy = await this.db
      .select({ id: guardians.id, value: valueColumn })
      .from(guardians)
      .where(
        withTenant(
          guardians,
          clinicId,
          and(isNull(hashColumn), isNotNull(valueColumn)),
        ),
      )
      .limit(GUARDIAN_SCAN_CAP);
    const legacyMatches = legacy.filter((row) => {
      const hash = hashOrNull(
        this.blindIndex,
        clinicId,
        kind,
        this.cipher.decrypt(String(row.value)),
      );
      return hash !== null && candidates.includes(hash);
    });
    return [...hashed, ...legacyMatches].map((row) => row.id);
  }

  private async loadInOrder(ids: string[]): Promise<Guardian[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(guardians)
      .where(withTenant(guardians, this.clinicId, inArray(guardians.id, ids)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toGuardian(row, this.cipher)] : [];
    });
  }

  async delete(id: string): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode excluir responsável (somente leitura cross-empresa)',
      );
    }
    await this.db
      .delete(guardians)
      .where(withTenant(guardians, this.clinicId, eq(guardians.id, id)));
  }
}
