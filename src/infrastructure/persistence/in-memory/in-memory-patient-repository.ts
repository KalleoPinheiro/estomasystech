import type { Patient } from '@/domain/patient/patient';
import type {
  PatientPage,
  PatientRepository,
} from '@/domain/patient/patient-repository';
import { decodeCursor } from '@/lib/pagination';

export class InMemoryPatientRepository implements PatientRepository {
  private readonly patients = new Map<string, Patient>();

  async save(patient: Patient): Promise<void> {
    this.patients.set(patient.id, patient);
  }

  async findById(id: string): Promise<Patient | null> {
    return this.patients.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<Patient | null> {
    const normalized = email.trim().toLowerCase();
    return (
      [...this.patients.values()].find((p) => p.email === normalized) ?? null
    );
  }

  /** Repositório in-memory não é tenant-aware — usado só em testes de camada de aplicação. */
  async findClinicIdById(): Promise<string | null> {
    return null;
  }

  async countByEmail(email: string): Promise<number> {
    const normalized = email.trim().toLowerCase();
    return [...this.patients.values()].filter((p) => p.email === normalized)
      .length;
  }

  async findByReferrer(partnerId: string): Promise<Patient[]> {
    return [...this.patients.values()].filter(
      (p) => p.referredByPartnerId === partnerId,
    );
  }

  async findByIds(ids: string[]): Promise<Patient[]> {
    const unique = [...new Set(ids)];
    return unique.flatMap((id) => {
      const patient = this.patients.get(id);
      return patient ? [patient] : [];
    });
  }

  async findAll(search?: string, page: PatientPage = {}): Promise<Patient[]> {
    if (page.ids && page.ids.length === 0) {
      return [];
    }
    const all = [...this.patients.values()].sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id),
    );
    const term = search?.toLowerCase();
    const termDigits = search?.replace(/\D/g, '') ?? '';
    const byTerm = term
      ? all.filter(
          (p) =>
            p.fullName.toLowerCase().includes(term) ||
            p.email.toLowerCase().includes(term) ||
            p.phone.includes(term) ||
            (termDigits.length >= 3 && p.phone.includes(termDigits)),
        )
      : all;
    const filtered = page.ids
      ? byTerm.filter((p) => page.ids?.includes(p.id))
      : byTerm;
    const decoded = decodeCursor<{ fullName: string; id: string }>(page.cursor);
    // Mesmo comparador do sort acima (localeCompare) — comparação por `>` usaria
    // ordem UTF-16 e poderia excluir/repetir itens quando os dois divergem
    // (ex.: acentos), pulando a página seguinte.
    const afterCursor = decoded
      ? filtered.filter((p) => {
          const cmp =
            p.fullName.localeCompare(decoded.fullName) ||
            p.id.localeCompare(decoded.id);
          return cmp > 0;
        })
      : filtered;
    return page.limit != null ? afterCursor.slice(0, page.limit) : afterCursor;
  }
}
