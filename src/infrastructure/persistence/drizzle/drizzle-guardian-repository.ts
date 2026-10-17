import { asc, eq, ilike, or } from 'drizzle-orm';
import {
  Guardian,
  type GuardianRelationship,
} from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { type AppDb, MAX_ROWS } from './db';
import { guardians } from './schema';
import { withTenant } from './tenant-scope';

const toGuardian = (row: typeof guardians.$inferSelect): Guardian =>
  Guardian.restore({
    ...row,
    relationship: row.relationship as GuardianRelationship,
  });

export class DrizzleGuardianRepository implements GuardianRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(guardian: Guardian): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar responsável (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: guardian.id,
      clinicId: this.clinicId,
      fullName: guardian.fullName,
      relationship: guardian.relationship,
      phone: guardian.phone,
      email: guardian.email,
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
    return rows[0] ? toGuardian(rows[0]) : null;
  }

  async findAll(search?: string): Promise<Guardian[]> {
    const filter = search
      ? or(
          ilike(guardians.fullName, `%${search}%`),
          ilike(guardians.phone, `%${search}%`),
          ilike(guardians.email, `%${search}%`),
        )
      : undefined;
    const rows = await this.db
      .select()
      .from(guardians)
      .where(withTenant(guardians, this.clinicId, filter))
      .orderBy(asc(guardians.fullName), asc(guardians.id))
      .limit(MAX_ROWS);
    return rows.map(toGuardian);
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
