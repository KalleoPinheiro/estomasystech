import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import { localDateKey } from '@/domain/scheduling/schedule-availability';
import {
  WaitlistEntry,
  type WaitlistRepository,
  type WaitlistSource,
} from '@/domain/scheduling/waitlist';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

export interface AddToWaitlistInput {
  patientId: string;
  procedureId?: string | null;
  professionalId?: string | null;
  fromDate: string;
  toDate: string;
  notes?: string | null;
  source: WaitlistSource;
  now?: Date;
}

/** Coloca o paciente na fila — pela recepção ou pelo próprio paciente. */
export class AddToWaitlist {
  constructor(
    private readonly waitlist: WaitlistRepository,
    private readonly patients: PatientRepository,
    private readonly procedures: ProcedureRepository,
    private readonly professionals: ProfessionalRepository,
  ) {}

  async execute(input: AddToWaitlistInput): Promise<WaitlistEntry> {
    const patient = await this.patients.findById(input.patientId);
    if (!patient?.isActive) {
      throw new NotFoundError('Paciente', input.patientId);
    }
    if (input.procedureId) {
      const procedure = await this.procedures.findById(input.procedureId);
      if (!procedure?.isActive) {
        throw new NotFoundError('Procedimento', input.procedureId);
      }
    }
    if (
      input.professionalId &&
      !(await this.professionals.findById(input.professionalId))
    ) {
      throw new NotFoundError('Profissional', input.professionalId);
    }
    const now = input.now ?? new Date();
    const today = localDateKey(now);
    if (input.toDate < today) {
      throw new ValidationError('O período desejado já passou');
    }
    // O paciente só pede datas a partir de hoje; a recepção pode registrar um
    // pedido que já estava em andamento.
    if (input.source === 'patient' && input.fromDate < today) {
      throw new ValidationError('Escolha um período a partir de hoje');
    }

    // Mesmo pedido ainda na fila (duplo clique, nova aba): não duplica.
    const existing = (await this.waitlist.findByPatient(patient.id)).find(
      (entry) =>
        entry.status === 'waiting' &&
        entry.procedureId === (input.procedureId ?? null) &&
        entry.professionalId === (input.professionalId ?? null) &&
        entry.fromDate === input.fromDate &&
        entry.toDate === input.toDate,
    );
    if (existing) {
      return existing;
    }

    const entry = WaitlistEntry.create(
      {
        patientId: patient.id,
        procedureId: input.procedureId ?? null,
        professionalId: input.professionalId ?? null,
        fromDate: input.fromDate,
        toDate: input.toDate,
        notes: input.notes,
        source: input.source,
      },
      now,
    );
    await this.waitlist.save(entry);
    return entry;
  }
}

export type WaitlistResolution = 'scheduled' | 'removed';

/** Tira da fila: vaga marcada ou desistência. */
export class ResolveWaitlistEntry {
  constructor(private readonly waitlist: WaitlistRepository) {}

  async execute(
    id: string,
    resolution: WaitlistResolution,
    options: { patientId?: string } = {},
  ): Promise<WaitlistEntry> {
    const entry = await this.waitlist.findById(id);
    // Pelo portal, só a própria entrada — de outro paciente responde NotFound.
    if (
      !entry ||
      (options.patientId !== undefined && entry.patientId !== options.patientId)
    ) {
      throw new NotFoundError('Entrada da lista de espera', id);
    }
    const resolved =
      resolution === 'scheduled' ? entry.markScheduled() : entry.remove();
    await this.waitlist.save(resolved);
    return resolved;
  }
}

/**
 * Quem aceita um horário que vagou neste dia com este profissional — por
 * ordem de chegada. A recepção oferece a vaga; o sistema não marca sozinho.
 */
export async function findWaitlistMatches(
  waitlist: WaitlistRepository,
  day: string,
  professionalId: string | null,
): Promise<WaitlistEntry[]> {
  return (await waitlist.listWaiting()).filter((entry) =>
    entry.accepts(day, professionalId),
  );
}
