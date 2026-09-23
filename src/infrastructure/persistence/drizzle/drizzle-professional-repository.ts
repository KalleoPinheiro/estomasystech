import { asc, eq, inArray } from 'drizzle-orm';
import {
  type CommissionType,
  Professional,
} from '@/domain/professional/professional';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import { type AppDb, MAX_ROWS } from './db';
import { professionals } from './schema';
import { withTenant } from './tenant-scope';

const toProfessional = (row: typeof professionals.$inferSelect) =>
  Professional.restore({
    ...row,
    commissionType: row.commissionType as CommissionType,
  });

export class DrizzleProfessionalRepository implements ProfessionalRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(professional: Professional): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar profissional (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: professional.id,
      clinicId: this.clinicId,
      fullName: professional.fullName,
      registry: professional.registry,
      commissionType: professional.commissionType,
      commissionPct: professional.commissionPct,
      commissionFixedCents: professional.commissionFixedCents,
      active: professional.isActive,
      createdAt: professional.createdAt,
    };
    await this.db
      .insert(professionals)
      .values(values)
      .onConflictDoUpdate({ target: professionals.id, set: values });
  }

  async findById(id: string): Promise<Professional | null> {
    const rows = await this.db
      .select()
      .from(professionals)
      .where(withTenant(professionals, this.clinicId, eq(professionals.id, id)))
      .limit(1);
    return rows[0] ? toProfessional(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<Professional[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(professionals)
      .where(
        withTenant(
          professionals,
          this.clinicId,
          inArray(professionals.id, unique),
        ),
      );
    return rows.map((row) => toProfessional(row));
  }

  async findAll(): Promise<Professional[]> {
    const rows = await this.db
      .select()
      .from(professionals)
      .where(withTenant(professionals, this.clinicId))
      .orderBy(asc(professionals.fullName))
      .limit(MAX_ROWS);
    return rows.map((row) => toProfessional(row));
  }
}
