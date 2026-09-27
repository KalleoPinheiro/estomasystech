import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ManageClinicAdmins } from '@/application/platform/manage-clinic-admins';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { toClinicAdminDto, toUserAccountDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  email: z.string().min(3).max(200),
});

/** Admins de Empresa da clínica (B4): só `company_admin`, nada da equipe. */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId } = await context.params;
  const services = await getRepositories(clinicScope(clinicId));
  if (!(await services.clinics.findById(clinicId))) {
    return fail('Clínica não encontrada', 404);
  }
  return handleRequest(async () =>
    (await new ManageClinicAdmins(services).list()).map(toClinicAdminDto),
  );
}

/**
 * Convite de um Admin de Empresa da clínica (B1, ADR-007; B4 exige o cadastro
 * completo antes). A conta nasce sem senha usável e a pessoa define a própria
 * senha pelo convite. A resposta nunca traz o link: com ele, o operador da
 * plataforma entraria na clínica com acesso clínico.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId } = await context.params;
  const services = await getRepositories(clinicScope(clinicId));
  const clinic = await services.clinics.findById(clinicId);
  if (!clinic) {
    return fail('Clínica não encontrada', 404);
  }

  return handleRequest(async () => {
    const body = bodySchema.parse(await request.json());
    const { account, delivered } = await new ManageClinicAdmins(
      services,
    ).invite(clinic, body.email);
    recordAudit(services.auditEvents, guard.session, {
      action: 'create',
      resourceType: 'account',
      resourceId: account.id,
      clinicId,
    });
    return {
      ...toUserAccountDto(account),
      role: account.role,
      clinicId: account.clinicId,
      delivered,
    };
  });
}
