import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreatePartner } from '@/application/partners/create-partner';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toPartnerDto } from '@/lib/dto';
import { listPartnersFor } from '@/lib/server/data/partners';
import { createdAudit } from '@/lib/server/team-audit';

const partnerSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().min(1).max(200).email('Email inválido'),
  phone: z.string().min(1).max(50),
  crm: z.string().max(50).nullish(),
  specialty: z.string().max(200).nullish(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listPartnersFor(guard.session));
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = partnerSchema.parse(await request.json());
    const { transactions } = await getRepositories(writeScope(guard.session));
    // Auditoria na MESMA transação da gravação (ADR-075, EQP-RN-09).
    return transactions.run(async (tx) => {
      const partner = await new CreatePartner(tx.partners).execute({
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        crm: body.crm ?? null,
        specialty: body.specialty ?? null,
      });
      await recordAuditNow(
        tx.auditEvents,
        guard.session,
        createdAudit('partner', partner.id),
      );
      return toPartnerDto(partner);
    });
  });
}
