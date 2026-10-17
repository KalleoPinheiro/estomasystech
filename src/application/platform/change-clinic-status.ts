import type { ClinicProvisioning } from '@/application/ports/clinic-provisioning';
import type { Clinic, ClinicSuspension } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';

export interface ClinicStatusServices {
  clinics: ClinicRepository;
  clinicProvisioning: ClinicProvisioning;
}

export interface ClinicStatusChange {
  clinic: Clinic;
  /** `false` quando a clínica já estava no estado pedido (nada gravado). */
  changed: boolean;
}

/** Quem muda o estado e quando — `status_changed_by`/`status_changed_at`. */
export interface ClinicStatusActor {
  by: string;
  at: Date;
  /**
   * Auditoria write-ahead (#184): roda antes de gravar; se falha, nada muda.
   * `detail` é a ação, e na suspensão leva o código do motivo (`suspend:non_payment`,
   * #251) — nunca a observação em texto livre, que pode citar pessoa.
   */
  audit: (detail: string) => Promise<void>;
}

/**
 * Suspende a clínica (B5, Journey 7) com o motivo obrigatório (#251). Na mesma transação, o estado vira
 * `suspended` e toda conta da clínica tem a `session_version` incrementada: as
 * sessões emitidas antes da suspensão não voltam a valer na reativação
 * (Journey 8, "com novo login"). Repetir é idempotente. `null` = inexistente.
 */
export class SuspendClinic {
  constructor(private readonly services: ClinicStatusServices) {}

  async execute(
    clinicId: string,
    actor: ClinicStatusActor,
    suspension: ClinicSuspension,
  ): Promise<ClinicStatusChange | null> {
    const clinic = await this.services.clinics.findById(clinicId);
    if (!clinic) return null;
    if (clinic.isSuspended) return { clinic, changed: false };
    const suspended = clinic.suspend(actor.by, actor.at, suspension);
    await actor.audit(`suspend:${suspension.reason}`);
    await this.services.clinicProvisioning.run(
      clinicId,
      async ({ clinics, userAccounts }) => {
        await clinics.saveStatus(suspended);
        await userAccounts.revokeAllSessions();
      },
    );
    return { clinic: suspended, changed: true };
  }
}

/**
 * Reativa a clínica (B5, Journey 8): as contas voltam a entrar com novo login;
 * os lembretes voltam no próximo disparo. Repetir é idempotente.
 */
export class ReactivateClinic {
  constructor(private readonly clinics: ClinicRepository) {}

  async execute(
    clinicId: string,
    actor: ClinicStatusActor,
  ): Promise<ClinicStatusChange | null> {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) return null;
    if (!clinic.isSuspended) return { clinic, changed: false };
    await actor.audit('reactivate');
    const reactivated = clinic.reactivate(actor.by, actor.at);
    await this.clinics.saveStatus(reactivated);
    return { clinic: reactivated, changed: true };
  }
}
