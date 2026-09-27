import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateAccount } from '@/application/auth/create-account';
import { sendInvite } from '@/application/auth/send-invite';
import { visibleAccounts } from '@/domain/auth/account-management';
import { USER_ROLES } from '@/domain/auth/user-role';
import { ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
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
    // Só super_admin (clinicId de sessão nulo) pode/precisa escolher a empresa-alvo.
    clinicId: z.string().max(100).nullish(),
    professionalId: z.string().max(100).nullish(),
    // Conta de portal nasce vinculada ao cadastro (#196).
    patientId: z.string().max(100).nullish(),
    partnerId: z.string().max(100).nullish(),
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
    // "Modo aberto" (sem autenticação configurada) equivale ao acesso total de
    // antes — trata a chamada como super_admin, exigindo clinicId explícito.
    const actor = guard.session
      ? { role: guard.session.role, clinicId: guard.session.clinicId }
      : { role: 'super_admin' as const, clinicId: null };

    const targetClinicId =
      actor.role === 'super_admin'
        ? writeClinicId({ clinicId: body.clinicId ?? null })
        : writeClinicId(actor);

    const services = await getRepositories(clinicScope(targetClinicId));
    const { userAccounts, professionals, patients, partners, auditEvents } =
      services;

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

    const account = await new CreateAccount(userAccounts).execute(actor, {
      email: body.email,
      passwordHash: UNSET_PASSWORD_HASH,
      role: body.role,
      clinicId: targetClinicId,
      professionalId: body.professionalId ?? null,
      patientId: body.patientId ?? null,
      partnerId: body.partnerId ?? null,
    });
    const { delivered } = await sendInvite(services, account);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'account',
      resourceId: account.id,
    });
    return { ...toUserAccountDto(account), delivered };
  });
}
