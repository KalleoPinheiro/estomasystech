import type { Clinic } from '@/domain/clinic/clinic';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories, type Services } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';

/**
 * 404 com a mensagem exata do contrato da plataforma ("Clínica não
 * encontrada", "Admin não encontrado"), lançado dentro do `handleRequest`.
 */
export class PlatformNotFoundError extends NotFoundError {
  constructor(message: string) {
    super('', '');
    this.message = message;
  }
}

/**
 * Lê a clínica-alvo das rotas `/api/platform/clinics/[id]/**`. Chame dentro do
 * `handleRequest` (#245): erro de banco vira o envelope `500` padrão em vez do
 * 500 cru do Next.
 */
export async function loadPlatformClinic(
  id: string,
): Promise<{ services: Services; clinic: Clinic }> {
  const services = await getRepositories(clinicScope(id));
  const clinic = await services.clinics.findById(id);
  if (!clinic) throw new PlatformNotFoundError('Clínica não encontrada');
  return { services, clinic };
}
