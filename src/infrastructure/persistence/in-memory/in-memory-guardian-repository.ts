import type { Guardian } from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';

export class InMemoryGuardianRepository implements GuardianRepository {
  private readonly guardians = new Map<string, Guardian>();

  async save(guardian: Guardian): Promise<void> {
    this.guardians.set(guardian.id, guardian);
  }

  async findById(id: string): Promise<Guardian | null> {
    return this.guardians.get(id) ?? null;
  }

  async findByIds(ids: readonly string[]): Promise<Guardian[]> {
    return ids.flatMap((id) => {
      const guardian = this.guardians.get(id);
      return guardian ? [guardian] : [];
    });
  }

  async findAll(search?: string): Promise<Guardian[]> {
    const term = search?.toLowerCase();
    return [...this.guardians.values()]
      .filter(
        (g) =>
          !term ||
          g.fullName.toLowerCase().includes(term) ||
          g.phone.includes(term) ||
          (g.email ?? '').includes(term),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async delete(id: string): Promise<void> {
    this.guardians.delete(id);
  }
}
