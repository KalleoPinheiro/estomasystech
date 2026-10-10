import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { IssueAuthToken } from '@/application/auth/auth-token-flow';
import { appUrlFromEnv } from '@/application/auth/send-invite';
import { adminStatusOf } from '@/application/platform/clinic-overview';
import { CreateClinic } from '@/application/platform/create-clinic';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  toPlatformClinicDto,
  toPlatformClinicSummaryDto,
  toUserAccountDto,
} from '@/lib/dto';

const createSchema = z.object({
  name: z.string().max(200),
  cnpj: z.string().max(30),
  contactPhone: z.string().max(50),
  contactEmail: z.string().max(200),
  adminEmail: z.string().min(3).max(200),
  professionalName: z.string().max(200).nullish(),
  professionalRegistry: z.string().max(60).nullish(),
});

/**
 * Clínicas da plataforma (B4, #214). O catálogo de clínicas não tem empresa
 * (`systemScope`); o estado do admin e o status do canal de e-mail (C4, #267)
 * de cada uma são lidos no escopo dela.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { clinics } = await getRepositories(systemScope());
    const all = await clinics.findAll();
    const rows = await Promise.all(
      all.map(async (clinic) => {
        const { userAccounts, clinicChannels } = await getRepositories(
          clinicScope(clinic.id),
        );
        const [admins, emailStatus] = await Promise.all([
          userAccounts.findByRole('company_admin'),
          clinicChannels.findStatus('email'),
        ]);
        return toPlatformClinicSummaryDto(
          clinic,
          adminStatusOf(admins),
          emailStatus,
        );
      }),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
}

/**
 * Cria a clínica, o primeiro `company_admin` e os eventos de auditoria da
 * criação numa única transação (#243) — falha na auditoria desfaz clínica e
 * admin junto — e só então emite o convite do admin. A clínica nova ainda não
 * tem canal de e-mail (ADR-011), então o convite nunca é enviado: o link volta
 * na resposta para o super admin repassar à mão (C2, #265).
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    const { clinics, clinicProvisioning } = await getRepositories(
      systemScope(),
    );
    const { clinic, admin } = await new CreateClinic(
      clinics,
      clinicProvisioning,
    ).execute(
      { ...body, createdBy: guard.session?.subject ?? 'anonymous' },
      async (auditEvents, createdClinic, createdAdmin) => {
        await recordAuditNow(auditEvents, guard.session, {
          action: 'create',
          resourceType: 'clinic',
          resourceId: createdClinic.id,
          clinicId: createdClinic.id,
        });
        await recordAuditNow(auditEvents, guard.session, {
          action: 'create',
          resourceType: 'account',
          resourceId: createdAdmin.id,
          clinicId: createdClinic.id,
        });
      },
    );

    const { authTokens, email } = await getRepositories(clinicScope(clinic.id));
    const inviteUrl = await new IssueAuthToken(authTokens, email).issue({
      account: admin,
      purpose: 'invite',
      appUrl: appUrlFromEnv(),
    });
    return {
      clinic: toPlatformClinicDto(clinic),
      admin: {
        ...toUserAccountDto(admin),
        role: admin.role,
        clinicId: admin.clinicId,
        delivered: false,
        inviteUrl,
      },
    };
  });
}
