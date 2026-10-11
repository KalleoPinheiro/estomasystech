import type { PhotoStorage } from '@/application/ports/photo-storage';
import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import {
  type RetentionKind,
  retentionCutoffs,
} from '@/domain/retention/retention-policy';
import type { RetentionRepository } from '@/domain/retention/retention-repository';
import { logError } from '@/lib/log-error';

/** Pacientes anonimizados por clínica a cada execução; o resto fica para a próxima. */
export const PATIENT_BATCH = 200;
/** Arquivos de foto apagados por clínica a cada execução. */
export const PHOTO_BATCH = 500;

export const RETENTION_ACTOR = 'retention-job';

export interface RetentionCounts {
  clinicalRecords: number;
  photos: number;
  auditEvents: number;
  waitlistEntries: number;
  accounts: number;
}

export interface ClinicRetentionSummary extends RetentionCounts {
  clinicId: string;
  /** Presente quando a clínica falhou; os contadores vêm zerados. */
  error?: string;
}

export interface RetentionRunSummary extends RetentionCounts {
  /** Trilha de plataforma (eventos sem empresa). */
  platform: { auditEvents: number; error?: string };
  clinics: ClinicRetentionSummary[];
}

export interface RetentionServices {
  retention: RetentionRepository;
  auditEvents: AuditEventRepository;
}

export interface ClinicRetentionServices extends RetentionServices {
  photoStorage: PhotoStorage;
}

const ZERO: RetentionCounts = {
  clinicalRecords: 0,
  photos: 0,
  auditEvents: 0,
  waitlistEntries: 0,
  accounts: 0,
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Job de retenção (#294): anonimiza, empresa a empresa, o que passou do prazo
 * de cada tipo de dado, e a trilha de plataforma. Idempotente; cada empresa que
 * mudou algo ganha um evento de auditoria só com as contagens.
 */
export class RunRetention {
  private readonly cutoffs: Record<RetentionKind, Date>;

  constructor(
    private readonly clinicIds: string[],
    private readonly clinicServices: (
      clinicId: string,
    ) => Promise<ClinicRetentionServices>,
    private readonly platformServices: () => Promise<RetentionServices>,
    private readonly now: Date = new Date(),
  ) {
    this.cutoffs = retentionCutoffs(now);
  }

  async execute(): Promise<RetentionRunSummary> {
    const clinics: ClinicRetentionSummary[] = [];
    for (const clinicId of this.clinicIds) {
      clinics.push(await this.runClinic(clinicId));
    }
    const platform = await this.runPlatform();
    const totals = { ...ZERO, auditEvents: platform.auditEvents };
    for (const clinic of clinics) {
      for (const key of Object.keys(ZERO) as (keyof RetentionCounts)[]) {
        totals[key] += clinic[key];
      }
    }
    return { ...totals, platform, clinics };
  }

  private async runClinic(clinicId: string): Promise<ClinicRetentionSummary> {
    try {
      const services = await this.clinicServices(clinicId);
      const counts = await this.anonymizeClinic(services);
      await this.recordRun(services.auditEvents, clinicId, counts);
      return { clinicId, ...counts };
    } catch (error) {
      logError(`Retenção da empresa ${clinicId}: falha`, error);
      return { clinicId, ...ZERO, error: errorMessage(error) };
    }
  }

  private async anonymizeClinic(
    services: ClinicRetentionServices,
  ): Promise<RetentionCounts> {
    const { retention } = services;
    let clinicalRecords = 0;
    const due = await retention.findPatientsDue(
      this.cutoffs.clinicalRecord,
      PATIENT_BATCH,
    );
    for (const patientId of due) {
      clinicalRecords += await retention.anonymizePatient(patientId, this.now);
    }
    return {
      clinicalRecords,
      photos: await this.removePhotos(services),
      auditEvents: await retention.anonymizeAuditEvents(
        this.cutoffs.auditTrail,
      ),
      waitlistEntries: await retention.anonymizeWaitlistEntries(
        this.cutoffs.waitlist,
      ),
      accounts: await retention.anonymizeInactiveAccounts(
        this.cutoffs.inactiveAccount,
        this.now,
      ),
    };
  }

  /**
   * Apaga o arquivo antes de marcar a foto: se o armazenamento falhar, ela
   * segue pendente e volta na próxima execução.
   */
  private async removePhotos({
    retention,
    photoStorage,
  }: ClinicRetentionServices): Promise<number> {
    let removed = 0;
    for (const photo of await retention.findPendingPhotos(PHOTO_BATCH)) {
      try {
        await photoStorage.remove(photo.id);
        await retention.markPhotoAnonymized(photo.id, this.now);
        removed += 1;
      } catch (error) {
        logError(`Retenção: falha ao apagar a foto ${photo.id}`, error);
      }
    }
    return removed;
  }

  private async runPlatform(): Promise<RetentionRunSummary['platform']> {
    try {
      const services = await this.platformServices();
      const auditEvents = await services.retention.anonymizeAuditEvents(
        this.cutoffs.auditTrail,
      );
      await this.recordRun(services.auditEvents, null, {
        ...ZERO,
        auditEvents,
      });
      return { auditEvents };
    } catch (error) {
      logError('Retenção da trilha de plataforma: falha', error);
      return { auditEvents: 0, error: errorMessage(error) };
    }
  }

  /** Evento só com as contagens (nada de PII), e só se algo mudou. */
  private async recordRun(
    auditEvents: AuditEventRepository,
    clinicId: string | null,
    counts: RetentionCounts,
  ): Promise<void> {
    if (Object.values(counts).every((count) => count === 0)) return;
    await auditEvents.save(
      AuditEvent.create({
        clinicId,
        actorRole: 'system',
        actorId: RETENTION_ACTOR,
        action: 'update',
        resourceType: 'retention',
        resourceId: this.now.toISOString().slice(0, 10),
        detail: JSON.stringify(counts),
      }),
    );
  }
}
