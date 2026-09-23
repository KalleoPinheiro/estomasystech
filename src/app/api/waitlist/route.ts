import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  AddToWaitlist,
  findWaitlistMatches,
} from '@/application/scheduling/waitlist';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { waitlistWithNames } from '@/lib/waitlist-names';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const addSchema = z.object({
  patientId: z.string().min(1),
  procedureId: z.string().min(1).nullish(),
  professionalId: z.string().min(1).nullish(),
  fromDate: z.string().regex(DATE),
  toDate: z.string().regex(DATE),
  notes: z.string().max(500).nullish(),
});

/**
 * Fila ativa por ordem de chegada. Com `date` (e `professionalId` opcional),
 * só quem aceita um horário vago nesse dia.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const date = request.nextUrl.searchParams.get('date');
  const professionalId = request.nextUrl.searchParams.get('professionalId');
  if (date !== null && !DATE.test(date)) {
    return fail('date deve estar em AAAA-MM-DD', 400);
  }

  return handleRequest(async () => {
    const services = await getRepositories(sessionScope(guard.session));
    const entries = date
      ? await findWaitlistMatches(services.waitlist, date, professionalId)
      : await services.waitlist.listWaiting();
    return waitlistWithNames(services, entries);
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = addSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    const entry = await new AddToWaitlist(
      services.waitlist,
      services.patients,
      services.procedures,
      services.professionals,
    ).execute({ ...body, source: 'staff' });

    recordAudit(services.auditEvents, guard.session, {
      action: 'create',
      resourceType: 'waitlist-entry',
      resourceId: entry.id,
      patientId: entry.patientId,
    });
    const [dto] = await waitlistWithNames(services, [entry]);
    return dto;
  });
}
