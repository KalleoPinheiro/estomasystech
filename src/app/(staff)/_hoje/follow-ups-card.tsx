import { Badge } from '@still-void/ui/react';
import Link from 'next/link';
import { SummaryCard } from '@/components/summary-card';
import type { Session } from '@/lib/auth/session';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { listFollowUpsFor } from '@/lib/server/data/follow-ups';
import { whatsappSentToday } from '@/lib/server/data/reminders';
import { loadBlock } from '@/lib/server/load-block';
import { FollowUpRowActions } from './follow-up-row-actions';

// Altura previsível acima da dobra (CLS, #548): 3 retornos; o resto fica em «Ver todos».
const FOLLOW_UPS_CAP = 3;

export async function FollowUpsCard({
  session,
  showAll = false,
}: {
  session: Session;
  showAll?: boolean;
}) {
  const { data: followUps, error } = await loadBlock(() =>
    listFollowUpsFor(session, { status: 'pending' }),
  );
  const total = followUps?.length ?? 0;
  const visible = showAll
    ? (followUps ?? [])
    : (followUps ?? []).slice(0, FOLLOW_UPS_CAP);
  const homonyms = homonymPatientIds(visible);
  // O «enviado hoje às HH:MM» é um enfeite: se falhar, a lista continua.
  const { data: sent } = await loadBlock(() =>
    visible.length > 0
      ? whatsappSentToday(
          session,
          'recall',
          visible.map((f) => f.id),
        )
      : Promise.resolve<Record<string, string>>({}),
  );

  return (
    <SummaryCard
      title="Retornos pendentes"
      error={error}
      isEmpty={!followUps || followUps.length === 0}
      emptyMessage="Nenhum retorno pendente."
    >
      <ul className="divide-y divide-border">
        {visible.map((followUp) => (
          <li
            key={followUp.id}
            data-follow-up-row
            className="flex flex-col gap-1 py-3 text-sm"
          >
            <div className="min-w-0 flex-1" data-follow-up-text>
              <p className="break-words font-medium sm:truncate">
                <Link
                  href={`/pacientes/${followUp.patientId}`}
                  className="hover:underline"
                >
                  {listPatientName(followUp, homonyms)}
                </Link>
              </p>
              <p className="break-words text-ink-3 sm:truncate">
                {followUp.reason}
              </p>
              {followUp.recallExhausted && (
                <Badge variant="secondary" data-recall-exhausted>
                  3 lembretes sem resposta
                </Badge>
              )}
            </div>
            <FollowUpRowActions
              followUp={followUp}
              whatsappSentAt={sent?.[followUp.id] ?? null}
            />
          </li>
        ))}
      </ul>
      {total > FOLLOW_UPS_CAP && (
        <Link
          href={showAll ? '/' : '/?retornos=todos'}
          className="mt-2 inline-flex min-h-11 items-center font-medium text-accent-ink text-sm hover:underline"
        >
          {showAll ? 'Mostrar menos' : `Ver todos (${total})`}
        </Link>
      )}
    </SummaryCard>
  );
}
