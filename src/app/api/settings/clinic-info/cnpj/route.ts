import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ConvertClinicToCompany } from '@/application/platform/convert-clinic-to-company';
import { AuditEvent } from '@/domain/audit/audit-event';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { toClinicRegistrationDto } from '@/lib/dto';

const convertSchema = z.object({
  cnpj: z.string().min(1).max(20),
  name: z.string().max(200).nullish(),
});

/**
 * Autônoma que abriu CNPJ (#986): o Admin troca o cadastro para clínica e o
 * timbre passa a sair com o CNPJ. Troca e auditoria gravam juntas: sem trilha,
 * nada muda.
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  // Defesa em profundidade: a família administrativa já barra os outros papéis.
  if (guard.session.role !== 'company_admin') {
    return fail('Apenas Admin de Empresa pode trocar o CPF pelo CNPJ', 403);
  }
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const body = convertSchema.parse(await request.json());
    const { transactions } = await getRepositories(clinicScope(clinicId));
    const converted = await transactions.run(async (tx) => {
      const clinic = await new ConvertClinicToCompany(tx.clinics).execute(
        clinicId,
        body,
      );
      if (!clinic) throw new NotFoundError('Clínica', clinicId);
      await tx.auditEvents.save(
        AuditEvent.create({
          clinicId,
          actorRole: guard.session.role,
          actorId: guard.session.subject,
          action: 'update',
          resourceType: 'clinic-info',
          resourceId: clinicId,
          detail: 'troca de CPF para CNPJ',
        }),
      );
      return clinic;
    });
    return { info: toClinicRegistrationDto(converted) };
  });
}
