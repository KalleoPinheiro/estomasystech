import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';

export class InMemoryPartnerRepository implements PartnerRepository {
  private readonly partners = new Map<string, Partner>();
  /** Mês AAAA-MM já reivindicado, por parceiro (RM-15). */
  private readonly reportMonths = new Map<string, string>();

  async save(partner: Partner): Promise<void> {
    this.partners.set(partner.id, partner);
  }

  async findById(id: string): Promise<Partner | null> {
    return this.partners.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<Partner | null> {
    const normalized = email.trim().toLowerCase();
    return (
      [...this.partners.values()].find((p) => p.email === normalized) ?? null
    );
  }

  async findAll(): Promise<Partner[]> {
    return [...this.partners.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );
  }

  async claimMonthlyReport(
    partnerId: string,
    monthKey: string,
  ): Promise<boolean> {
    if (!this.partners.has(partnerId)) return false;
    if (this.reportMonths.get(partnerId) === monthKey) return false;
    this.reportMonths.set(partnerId, monthKey);
    return true;
  }

  async releaseMonthlyReport(
    partnerId: string,
    monthKey: string,
  ): Promise<void> {
    if (this.reportMonths.get(partnerId) === monthKey) {
      this.reportMonths.delete(partnerId);
    }
  }
}
