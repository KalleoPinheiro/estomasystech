import type { ClinicTheme } from '@/domain/clinic/clinic-identity';
import { parseClinicTheme } from '@/domain/clinic/clinic-identity';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { NotFoundError } from '@/domain/shared/errors';

/**
 * Tema da clínica (#426): o Admin de Empresa escolhe o modo padrão e a cor; a
 * rota confere o papel. O escopo vem do repositório (clínica da sessão).
 */
export class UpdateClinicTheme {
  constructor(private readonly clinics: ClinicRepository) {}

  async execute(
    clinicId: string,
    input: { mode?: unknown; accent?: unknown },
  ): Promise<ClinicTheme> {
    const theme = parseClinicTheme(input);
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) throw new NotFoundError('Clínica', clinicId);
    await this.clinics.saveTheme(clinic.withTheme(theme));
    return theme;
  }
}
