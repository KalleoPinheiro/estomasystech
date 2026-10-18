import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { isValidCnpj } from '@/domain/clinic/cnpj';

export const CNPJ_REVIEW_ACTOR = 'cnpj-review-job';

export interface InvalidCnpjClinic {
  clinicId: string;
  name: string;
  cnpj: string;
  /** `true` quando esta execução gravou a marca; `false` se já estava marcada (ou foi só listagem). */
  flaggedNow: boolean;
}

/**
 * Saneamento dos CNPJs gravados antes da conferência do dígito verificador
 * (#355, ACE-RN-57). Nunca apaga nem corrige o número: marca a empresa para
 * correção (`cnpj_review_since`) e deixa um evento na auditoria dela, sem o CNPJ.
 * Sem `apply` só lista. Idempotente: quem já está marcado não é regravado.
 */
export class FlagInvalidClinicCnpjs {
  constructor(
    private readonly clinics: ClinicRepository,
    private readonly auditFor: (clinicId: string) => AuditEventRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(options: { apply: boolean }): Promise<InvalidCnpjClinic[]> {
    const found: InvalidCnpjClinic[] = [];
    for (const clinic of await this.clinics.findAll()) {
      if (!clinic.cnpj || isValidCnpj(clinic.cnpj)) continue;
      const flagged = clinic.flagCnpjForReview(this.now());
      const flaggedNow = options.apply && flagged !== clinic;
      if (flaggedNow) {
        await this.clinics.saveCnpjReview(flagged);
        await this.auditFor(clinic.id).save(
          AuditEvent.create({
            clinicId: clinic.id,
            actorRole: 'system',
            actorId: CNPJ_REVIEW_ACTOR,
            action: 'update',
            resourceType: 'clinic-cnpj-review',
            resourceId: clinic.id,
            detail: 'cnpj marcado para correção (dígito verificador inválido)',
          }),
        );
      }
      found.push({
        clinicId: clinic.id,
        name: clinic.name,
        cnpj: clinic.cnpj,
        flaggedNow,
      });
    }
    return found;
  }
}
