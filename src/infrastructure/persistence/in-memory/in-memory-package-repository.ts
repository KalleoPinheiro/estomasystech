import type {
  SessionPackage,
  SessionPackageRepository,
} from '@/domain/billing/package';

export class InMemorySessionPackageRepository
  implements SessionPackageRepository
{
  private readonly items = new Map<string, SessionPackage>();
  private readonly consumptions = new Map<string, string>();

  async save(pkg: SessionPackage): Promise<void> {
    this.items.set(pkg.id, pkg);
  }

  async findById(id: string): Promise<SessionPackage | null> {
    return this.items.get(id) ?? null;
  }

  async findByPatientId(patientId: string): Promise<SessionPackage[]> {
    return [...this.items.values()]
      .filter((p) => p.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findUsable(
    patientId: string,
    procedureId: string,
    now: Date = new Date(),
  ): Promise<SessionPackage | null> {
    return (
      [...this.items.values()]
        .filter(
          (p) =>
            p.patientId === patientId &&
            p.procedureId === procedureId &&
            p.isUsableAt(now),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ??
      null
    );
  }

  async recordConsumption(
    packageId: string,
    appointmentId: string,
  ): Promise<void> {
    if (!this.consumptions.has(appointmentId)) {
      this.consumptions.set(appointmentId, packageId);
    }
  }

  async wasConsumedBy(appointmentId: string): Promise<boolean> {
    return this.consumptions.has(appointmentId);
  }

  /** Pacote que cobriu a consulta — usado pela leitura de produção em memória. */
  consumedBy(appointmentId: string): SessionPackage | null {
    const packageId = this.consumptions.get(appointmentId);
    return packageId ? (this.items.get(packageId) ?? null) : null;
  }
}
