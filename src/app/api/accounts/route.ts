import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateAccount } from '@/application/auth/create-account';
import { assertCanGrantGuardianAccess } from '@/application/auth/grant-guardian-access';
import { sendInvite } from '@/application/auth/send-invite';
import { visibleAccounts } from '@/domain/auth/account-management';
import { USER_ROLES } from '@/domain/auth/user-role';
import { ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit, recordAuditNow } from '@/lib/audit';
import { accountManager } from '@/lib/auth/account-manager';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { requireStaffSession } from '@/lib/auth/require-session';
import {
  clinicScope,
  sessionScope,
  writeClinicId,
} from '@/lib/auth/tenant-scope';
import { toUserAccountDto } from '@/lib/dto';

const createSchema = z
  .object({
    email: z.string().min(3).max(200),
    // Sem `password`: quem define a senha é a própria pessoa, pelo link do
    // convite enviado por e-mail (ADR-004). A conta nasce sem senha usável.
    role: z.enum(USER_ROLES),
    professionalId: z.string().max(100).nullish(),
    // Conta de portal nasce vinculada ao cadastro (#196).
    patientId: z.string().max(100).nullish(),
    partnerId: z.string().max(100).nullish(),
    guardianId: z.string().max(100).nullish(),
    // Acesso do responsável ao portal (ADR-027): a equipe atesta que o paciente
    // (ou seu representante legal) autorizou.
    guardianAuthorization: z.boolean().optional(),
  })
  .refine((data) => data.role !== 'profissional' || !!data.professionalId, {
    // Sem professionalId, a sessão do profissional nasce com vínculo nulo e o
    // escopo dinâmico (R4) nega acesso a todo paciente — conta inutilizável.
    message: 'professionalId é obrigatório para o papel profissional',
    path: ['professionalId'],
  });

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { userAccounts } = await getRepositories(sessionScope(guard.session));
    const accounts = await userAccounts.findAll();
    // Atendente/Profissional só enxergam patient/partner (#184).
    const { role } = accountManager(guard.session);
    return visibleAccounts(role, accounts).map(toUserAccountDto);
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    // A conta nasce sempre na empresa da sessão: o super_admin convida pela
    // plataforma (`/api/platform/clinics/[id]/admins`, ADR-007).
    const targetClinicId = writeClinicId(guard.session);
    const actor = {
      role: guard.session.role,
      clinicId: targetClinicId,
    };

    const services = await getRepositories(clinicScope(targetClinicId));
    const {
      userAccounts,
      professionals,
      patients,
      partners,
      guardians,
      auditEvents,
    } = services;

    if (body.professionalId) {
      const professional = await professionals.findById(body.professionalId);
      if (!professional) {
        throw new ValidationError('Profissional vinculado não encontrado');
      }
    }
    // Repositórios escopados à empresa-alvo: cadastro de outra empresa não é
    // encontrado — mesma resposta de um id inexistente.
    if (body.role === 'patient' && body.patientId) {
      if (!(await patients.findById(body.patientId))) {
        throw new ValidationError('Paciente vinculado não encontrado');
      }
    }
    if (body.role === 'partner' && body.partnerId) {
      if (!(await partners.findById(body.partnerId))) {
        throw new ValidationError('Parceiro vinculado não encontrado');
      }
    }

    if (body.role === 'guardian') {
      await assertCanGrantGuardianAccess(
        { guardians, patients },
        body.guardianId,
        body.guardianAuthorization === true,
      );
    }

    const account = await new CreateAccount(userAccounts).execute(actor, {
      email: body.email,
      passwordHash: UNSET_PASSWORD_HASH,
      role: body.role,
      clinicId: targetClinicId,
      professionalId: body.professionalId ?? null,
      patientId: body.patientId ?? null,
      partnerId: body.partnerId ?? null,
      guardianId: body.guardianId ?? null,
    });
    const { delivered, inviteUrl } = await sendInvite(services, account);
    const audit = {
      action: 'create' as const,
      resourceType: 'account',
      resourceId: account.id,
    };
    if (account.role === 'guardian') {
      // Conceder acesso a dado de saúde de terceiro: write-ahead, com a
      // atestação da equipe na trilha (ADR-027).
      await recordAuditNow(auditEvents, guard.session, {
        ...audit,
        detail:
          'acesso do responsável ao portal; autorização do paciente atestada pela equipe',
      });
    } else {
      recordAudit(auditEvents, guard.session, audit);
    }
    return { ...toUserAccountDto(account), delivered, inviteUrl };
  });
}
