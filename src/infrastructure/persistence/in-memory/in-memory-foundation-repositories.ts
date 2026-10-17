import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import type { Procedure } from '@/domain/catalog/procedure';
import {
  type ProcedureKitItem,
  type ProcedureKitRepository,
  validateKitItems,
} from '@/domain/catalog/procedure-kit';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type {
  ScheduleAvailabilityRepository,
  ScheduleClosure,
  WeeklyWindow,
} from '@/domain/scheduling/schedule-availability';
import type {
  ScheduleConfig,
  ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import type {
  WaitlistEntry,
  WaitlistRepository,
} from '@/domain/scheduling/waitlist';

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

function snapshot(account: UserAccount) {
  return {
    id: account.id,
    email: account.email,
    passwordHash: account.passwordHash,
    role: account.role,
    clinicId: account.clinicId,
    professionalId: account.professionalId,
    patientId: account.patientId,
    partnerId: account.partnerId,
    guardianId: account.guardianId,
    active: account.isActive,
    createdAt: account.createdAt,
    sessionVersion: account.sessionVersion,
  };
}

function bumpSessionVersion(account: UserAccount): UserAccount {
  return UserAccount.restore({
    ...snapshot(account),
    sessionVersion: account.sessionVersion + 1,
  });
}

export class InMemoryUserAccountRepository implements UserAccountRepository {
  private readonly items = new Map<string, UserAccount>();

  async save(account: UserAccount): Promise<void> {
    // Espelha o Drizzle (#194): `save` nunca altera a versão já gravada.
    const stored = this.items.get(account.id);
    this.items.set(
      account.id,
      UserAccount.restore({
        ...snapshot(account),
        sessionVersion: stored?.sessionVersion ?? account.sessionVersion,
      }),
    );
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
      this.items.set(
        id,
        bumpSessionVersion(existing.withPasswordHash(passwordHash)),
      );
    }
  }

  async upgradePasswordHash(
    id: string,
    currentHash: string,
    upgradedHash: string,
  ): Promise<void> {
    const existing = this.items.get(id);
    if (existing?.passwordHash === currentHash) {
      this.items.set(id, existing.withPasswordHash(upgradedHash));
    }
  }

  async revokeSessions(id: string): Promise<void> {
    const existing = this.items.get(id);
    if (existing) {
      this.items.set(id, bumpSessionVersion(existing));
    }
  }

  async revokeAllSessions(): Promise<void> {
    for (const [id, account] of this.items) {
      this.items.set(id, bumpSessionVersion(account));
    }
  }

  async findByPortalLink(
    link:
      | { patientId: string }
      | { partnerId: string }
      | { guardianId: string },
  ): Promise<UserAccount | null> {
    const matches = (a: UserAccount) => {
      if ('patientId' in link) return a.patientId === link.patientId;
      if ('partnerId' in link) return a.partnerId === link.partnerId;
      return a.guardianId === link.guardianId;
    };
    return [...this.items.values()].find(matches) ?? null;
  }

  async hasAnyAccount(): Promise<boolean> {
    return this.items.size > 0;
  }

  async findByRole(role: UserRole): Promise<UserAccount[]> {
    return (await this.findAll()).filter((a) => a.role === role);
  }

  /** Sem transação real (in-memory, CONS2-03): delega sem lock. */
  findByRoleForUpdate(role: UserRole): Promise<UserAccount[]> {
    return this.findByRole(role);
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

export class InMemoryScheduleAvailabilityRepository
  implements ScheduleAvailabilityRepository
{
  private readonly closures = new Map<string, ScheduleClosure>();
  private readonly hours = new Map<string, WeeklyWindow[]>();

  async listClosures(range: {
    from: string;
    to: string;
  }): Promise<ScheduleClosure[]> {
    return [...this.closures.values()]
      .filter((c) => c.startsOn <= range.to && c.endsOn >= range.from)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }

  async findClosureById(id: string): Promise<ScheduleClosure | null> {
    return this.closures.get(id) ?? null;
  }

  async saveClosure(closure: ScheduleClosure): Promise<void> {
    this.closures.set(closure.id, closure);
  }

  async deleteClosure(id: string): Promise<void> {
    this.closures.delete(id);
  }

  async getProfessionalHours(professionalId: string): Promise<WeeklyWindow[]> {
    return [...(this.hours.get(professionalId) ?? [])];
  }

  async replaceProfessionalHours(
    professionalId: string,
    windows: readonly WeeklyWindow[],
  ): Promise<void> {
    this.hours.set(professionalId, [...windows]);
  }
}

export class InMemoryWaitlistRepository implements WaitlistRepository {
  private readonly entries = new Map<string, WaitlistEntry>();

  async save(entry: WaitlistEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async findById(id: string): Promise<WaitlistEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async listWaiting(): Promise<WaitlistEntry[]> {
    return [...this.entries.values()]
      .filter((e) => e.status === 'waiting')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByPatient(patientId: string): Promise<WaitlistEntry[]> {
    return [...this.entries.values()]
      .filter((e) => e.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
