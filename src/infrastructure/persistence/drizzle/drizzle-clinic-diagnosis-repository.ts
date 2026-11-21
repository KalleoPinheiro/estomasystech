import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import type { ClinicNursingDiagnosisRepository } from '@/domain/taxonomy/taxonomy-repositories';
import type { AppDb } from './db';
import { clinicDiagnoses } from './schema';
import { withTenant } from './tenant-scope';

const DEFAULT_SEARCH_LIMIT = 20;

/** `%` e `_` digitados na busca são texto, não curinga do ILIKE. */
const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');

/**
 * Catálogo de diagnósticos da clínica (#954). Grava sempre na empresa do repositório (regra 1) e,
 * no banco, a política `clinic_isolation` com FORCE barra o resto.
 */
export class DrizzleClinicDiagnosisRepository
  implements ClinicNursingDiagnosisRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private values(diagnosis: ClinicNursingDiagnosis) {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar diagnóstico da clínica (somente leitura cross-empresa)',
      );
    }
    if (diagnosis.clinicId !== this.clinicId) {
      throw new Error('Diagnóstico de outra empresa');
    }
    return {
      id: diagnosis.id,
      clinicId: this.clinicId,
      code: diagnosis.code,
      label: diagnosis.label,
      domain: diagnosis.domain,
      class: diagnosis.class,
      edition: diagnosis.edition,
      definition: diagnosis.definition,
      active: diagnosis.isActive,
      createdAt: diagnosis.createdAt,
    };
  }

  async save(diagnosis: ClinicNursingDiagnosis): Promise<void> {
    const values = this.values(diagnosis);
    const {
      id: _id,
      clinicId: _clinicId,
      createdAt: _createdAt,
      ...set
    } = values;
    await this.db
      .insert(clinicDiagnoses)
      .values(values)
      .onConflictDoUpdate({ target: clinicDiagnoses.id, set });
  }

  async saveMany(diagnoses: ClinicNursingDiagnosis[]): Promise<void> {
    if (diagnoses.length === 0) {
      return;
    }
    await this.db
      .insert(clinicDiagnoses)
      .values(diagnoses.map((diagnosis) => this.values(diagnosis)));
  }

  async findById(id: string): Promise<ClinicNursingDiagnosis | null> {
    const rows = await this.db
      .select()
      .from(clinicDiagnoses)
      .where(
        withTenant(clinicDiagnoses, this.clinicId, eq(clinicDiagnoses.id, id)),
      )
      .limit(1);
    return rows[0] ? ClinicNursingDiagnosis.restore(rows[0]) : null;
  }

  async list(): Promise<ClinicNursingDiagnosis[]> {
    const rows = await this.db
      .select()
      .from(clinicDiagnoses)
      .where(withTenant(clinicDiagnoses, this.clinicId))
      .orderBy(asc(clinicDiagnoses.label), asc(clinicDiagnoses.id));
    return rows.map((row) => ClinicNursingDiagnosis.restore(row));
  }

  async search(
    term: string,
    options?: { limit?: number },
  ): Promise<ClinicNursingDiagnosis[]> {
    const pattern = `%${escapeLike(term)}%`;
    const rows = await this.db
      .select()
      .from(clinicDiagnoses)
      .where(
        withTenant(
          clinicDiagnoses,
          this.clinicId,
          and(
            eq(clinicDiagnoses.active, true),
            or(
              ilike(clinicDiagnoses.label, pattern),
              ilike(clinicDiagnoses.code, pattern),
            ),
          ),
        ),
      )
      .orderBy(asc(clinicDiagnoses.label))
      .limit(options?.limit ?? DEFAULT_SEARCH_LIMIT);
    return rows.map((row) => ClinicNursingDiagnosis.restore(row));
  }
}
