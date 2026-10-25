import 'server-only';
import { dateKey, type ReminderKind } from '@/domain/messaging/reminder-log';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/**
 * Cliques de hoje na empresa da sessão: `{ [referenceId]: sentAt }` só para as
 * referências com clique — alimenta o «enviado hoje às HH:MM» das telas. Mesma
 * resposta de `GET /api/reminders/whatsapp-link`.
 */
export async function whatsappSentToday(
  session: Session,
  kind: ReminderKind,
  referenceIds: readonly string[],
): Promise<Record<string, string>> {
  const { reminderLog } = await getRepositories(sessionScope(session));
  const sent = await reminderLog.firstSentAt(
    kind,
    'whatsapp_link',
    referenceIds,
    dateKey(new Date()),
  );
  return Object.fromEntries(
    [...sent].map(([id, at]) => [id, at.toISOString()]),
  );
}
