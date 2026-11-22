import type { Patient } from '@/domain/patient/patient';
import type {
  PatientPage,
  PatientRepository,
} from '@/domain/patient/patient-repository';
import {
  comparePatientEntries,
  selectPatientPage,
} from '@/domain/patient/patient-search';
import {
  type DuplicateCandidate,
  matchesNameAndBirthDate,
} from '@/domain/patient/possible-duplicates';
import {
  type BlindIndexKind,
  normalizeForBlindIndex,
  orFallbackOnInvalid,
} from '@/lib/blind-index';
import { decodeCursor } from '@/lib/pagination';

export class InMemoryPatientRepository implements PatientRepository {
  private readonly patients = new Map<string, Patient>();

  async save(patient: Patient): Promise<void> {
    this.patients.set(patient.id, patient);
  }

  async findById(id: string): Promise<Patient | null> {
    return this.patients.get(id) ?? null;
  }

  findByIdForUpdate(id: string): Promise<Patient | null> {
    return this.findById(id);
  }

  /** Repositório in-memory não é tenant-aware — usado só em testes de camada de aplicação. */
  async findClinicIdById(): Promise<string | null> {
    return null;
  }

  async findByReferrer(partnerId: string): Promise<Patient[]> {
    return [...this.patients.values()].filter(
      (p) => p.referredByPartnerId === partnerId,
    );
  }

  async findAdultsAwaitingMajorityReview(
    guardianIds: string[],
    birthCutoff: Date,
  ): Promise<Patient[]> {
    return [...this.patients.values()]
      .filter(
        (p) =>
          p.guardianId !== null &&
          guardianIds.includes(p.guardianId) &&
          p.isActive &&
          p.birthDate !== null &&
          p.birthDate.getTime() <= birthCutoff.getTime() &&
          !p.guardianPortalRevokedAt &&
          !p.majorityReviewedAt,
      )
      .sort(comparePatientEntries);
  }

  async findByGuardian(guardianId: string): Promise<Patient[]> {
    return [...this.patients.values()].filter(
      (p) => p.guardianId === guardianId,
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
    const scope = page.ids
      ? [...this.patients.values()].filter((p) => page.ids?.includes(p.id))
      : [...this.patients.values()];
    const term = search?.trim();
    // Mesmas regras do repositório Drizzle (ADR-096): nome sem acento nem caixa
    // por trecho; CPF, telefone e e-mail só por valor exato; cursor só com o id.
    return selectPatientPage(scope, {
      term,
      matchedIds: term ? exactValueMatches(scope, term) : undefined,
      cursorId: decodeCursor<{ id?: string }>(page.cursor)?.id ?? null,
      limit: page.limit ?? Number.POSITIVE_INFINITY,
    });
  }

  async findPossibleDuplicates(
    candidate: DuplicateCandidate,
  ): Promise<Patient[]> {
    const phone = normalizedOrNull('phone', candidate.phone);
    return [...this.patients.values()]
      .filter(
        (p) =>
          (phone !== null && normalizedOrNull('phone', p.phone) === phone) ||
          matchesNameAndBirthDate(candidate, p),
      )
      .sort(comparePatientEntries);
  }
}

function normalizedOrNull(
  kind: BlindIndexKind,
  raw: string | null,
): string | null {
  return orFallbackOnInvalid(() => normalizeForBlindIndex(kind, raw), null);
}

function exactValueMatches(
  patients: readonly Patient[],
  term: string,
): Set<string> {
  const kinds: Exclude<BlindIndexKind, 'login-email' | 'provider-cpf'>[] = [
    'cpf',
    'phone',
    'email',
  ];
  const wanted = kinds.map(
    (kind) => [kind, normalizedOrNull(kind, term)] as const,
  );
  const matched = new Set<string>();
  for (const patient of patients) {
    const values = {
      cpf: patient.cpf,
      phone: patient.phone,
      email: patient.email,
    };
    for (const [kind, normalized] of wanted) {
      if (
        normalized !== null &&
        normalizedOrNull(kind, values[kind]) === normalized
      ) {
        matched.add(patient.id);
      }
    }
  }
  return matched;
}
