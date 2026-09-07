import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import type { Procedure } from '@/domain/catalog/procedure';
import {
  type ProcedureKitItem,
  type ProcedureKitRepository,
  validateKitItems,
} from '@/domain/catalog/procedure-kit';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type {
  ScheduleConfig,
  ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';

export class InMemoryProcedureRepository implements ProcedureRepository {
  private readonly items = new Map<string, Procedure>();

  async save(procedure: Procedure): Promise<void> {
    this.items.set(procedure.id, procedure);
  }

  async findById(id: string): Promise<Procedure | null> {
    return this.items.get(id) ?? null;
  }

  async findByName(name: string): Promise<Procedure | null> {
    const normalized = name.trim().toLowerCase();
    return (
      [...this.items.values()].find(
        (p) => p.name.toLowerCase() === normalized,
      ) ?? null
    );
  }

  async findAll(): Promise<Procedure[]> {
    return [...this.items.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
}

export class InMemoryUserAccountRepository implements UserAccountRepository {
  private readonly items = new Map<string, UserAccount>();

  async save(account: UserAccount): Promise<void> {
    this.items.set(account.id, account);
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    const normalized = email.trim().toLowerCase();
    return [...this.items.values()].find((a) => a.email === normalized) ?? null;
  }

  async findAllByEmail(email: string): Promise<UserAccount[]> {
    const normalized = email.trim().toLowerCase();
    return [...this.items.values()].filter((a) => a.email === normalized);
  }

  async findById(id: string): Promise<UserAccount | null> {
    return this.items.get(id) ?? null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const existing = this.items.get(id);
    if (existing) {
      this.items.set(id, existing.withPasswordHash(passwordHash));
    }
  }

  async hasAnyAccount(): Promise<boolean> {
    return this.items.size > 0;
  }

  async findAll(): Promise<UserAccount[]> {
    return [...this.items.values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    );
  }
}

export class InMemoryScheduleConfigRepository
  implements ScheduleConfigRepository
{
  private config: ScheduleConfig | null = null;

  async get(): Promise<ScheduleConfig | null> {
    return this.config;
  }

  async save(config: ScheduleConfig): Promise<void> {
    this.config = config;
  }
}

export class InMemoryProcedureKitRepository implements ProcedureKitRepository {
  private readonly kits = new Map<string, ProcedureKitItem[]>();

  async getKit(procedureId: string): Promise<ProcedureKitItem[]> {
    return [...(this.kits.get(procedureId) ?? [])];
  }

  async setKit(procedureId: string, items: ProcedureKitItem[]): Promise<void> {
    this.kits.set(procedureId, validateKitItems(items));
  }

  async countByProcedure(): Promise<Record<string, number>> {
    return Object.fromEntries(
      [...this.kits.entries()]
        .filter(([, items]) => items.length > 0)
        .map(([procedureId, items]) => [procedureId, items.length]),
    );
  }
}
