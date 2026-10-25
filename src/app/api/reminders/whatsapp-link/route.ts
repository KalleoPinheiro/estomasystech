import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SendWhatsAppReminder } from '@/application/reminders/send-whatsapp-reminder';
import { REMINDER_KINDS } from '@/domain/messaging/reminder-log';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeClinicId, writeScope } from '@/lib/auth/tenant-scope';
import { whatsappSentToday } from '@/lib/server/data/reminders';

const bodySchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  referenceId: z.string().min(1),
});

const querySchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  referenceIds: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.string().min(1)).max(200)),
});

/**
 * Cliques de hoje na empresa da sessão: `{ [referenceId]: sentAt }` só para as
 * referências com clique — alimenta o "enviado hoje às HH:MM" das telas.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const params = request.nextUrl.searchParams;
    const query = querySchema.parse({
      kind: params.get('kind') ?? undefined,
      referenceIds: params.get('referenceIds') ?? '',
    });
    return whatsappSentToday(guard.session, query.kind, query.referenceIds);
  });
}

/** Registra o clique da recepção e devolve o link `wa.me` com a mensagem pronta. */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = bodySchema.parse(await request.json());
    const { appointments, followUps, patients, clinics, reminderLog } =
      await getRepositories(writeScope(guard.session));
    const result = await new SendWhatsAppReminder(
      appointments,
      followUps,
      patients,
      clinics,
      reminderLog,
    ).execute({
      kind: body.kind,
      referenceId: body.referenceId,
      clinicId: writeClinicId(guard.session),
    });
    return { url: result.url, sentAt: result.sentAt.toISOString() };
  });
}
