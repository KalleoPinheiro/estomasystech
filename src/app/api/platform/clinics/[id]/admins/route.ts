import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateAccount } from '@/application/auth/create-account';
import { sendInvite } from '@/application/auth/send-invite';
import { ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { isUniqueViolation } from '@/lib/db-errors';
import { toUserAccountDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  email: z.string().min(3).max(200),
});

const DUPLICATE_EMAIL_MESSAGE = 'Já existe conta com este email';

/** Só o super_admin chega aqui: a família `platform` barra os demais papéis. */
const PLATFORM_ACTOR = { role: 'super_admin', clinicId: null } as const;

/**
 * Convite do primeiro Admin de Empresa de uma clínica (B1, ADR-007). A conta
 * nasce sem senha usável e a pessoa define a própria senha pelo convite. A
 * resposta nunca traz o link: com ele, o operador da plataforma entraria na
 * clínica com acesso clínico.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId } = await context.params;
  const services = await getRepositories(clinicScope(clinicId));
  if (!(await services.clinics.findById(clinicId))) {
    return fail('Clínica não encontrada', 404);
  }

  return handleRequest(async () => {
    const body = bodySchema.parse(await request.json());
    const account = await new CreateAccount(services.userAccounts)
      .execute(PLATFORM_ACTOR, {
        email: body.email,
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'company_admin',
        clinicId,
      })
      .catch((error: unknown) => {
        // Corrida: dois convites do mesmo e-mail passam pela checagem prévia;
        // `uq_user_accounts_clinic_email` deixa só um gravar.
        throw isUniqueViolation(error)
          ? new ValidationError(DUPLICATE_EMAIL_MESSAGE)
          : error;
      });
    const { delivered } = await sendInvite(services, account);
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
