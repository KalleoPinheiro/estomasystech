'use client';

import { Button, Card, Prose } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { type ActionResult, unwrapAction } from '@/lib/action-result';
import type { PartnerShareConsentDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { acceptPartnerConsent, revokePartnerConsent } from './actions';
import { usePortalRefresh } from './use-portal-refresh';

function statusLine(consent: PartnerShareConsentDto): string {
  if (consent.active && consent.acceptedAt) {
    const by = consent.signedByRelationship ? ' pelo representante legal' : '';
    return `Autorizado${by} em ${formatDateTime(consent.acceptedAt)}.`;
  }
  if (consent.representativeExpired) {
    return 'A autorização dada pelo seu representante legal venceu 90 dias depois dos seus 18 anos. Autorize em seu nome para o médico continuar acompanhando.';
  }
  if (consent.revoked && consent.revokedAt) {
    return `Autorização revogada em ${formatDateTime(consent.revokedAt)}.`;
  }
  return 'Você ainda não autorizou.';
}

/**
 * Consentimento para o médico que indicou o paciente ver condições e
 * avaliações no portal do parceiro (#292). Opcional: sem ele, o médico vê só
 * que o paciente foi atendido. Não aparece para quem não foi indicado. O
 * representante legal decide pelo menor (#375); o paciente adulto pode
 * confirmar em nome próprio o que o representante autorizou.
 */
export function PartnerConsentSection({
  consent,
  asRepresentative = false,
}: {
  /** Lido no servidor; `null` quando o paciente não foi indicado por parceiro. */
  consent: PartnerShareConsentDto | null;
  asRepresentative?: boolean;
}) {
  const { toast } = useToast();
  const refresh = usePortalRefresh();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!consent) return null;

  const run = async (
    action: (input: Record<string, never>) => Promise<ActionResult<unknown>>,
    success: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await unwrapAction(action({}));
      toast({ description: success, variant: 'success' });
      refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao registrar sua escolha';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-partner-consent={consent.active ? 'active' : 'inactive'}>
      <h2 className="mb-3 font-semibold text-lg">
        Compartilhar com {consent.partnerName}
      </h2>
      <Card className="flex flex-col gap-3 p-4">
        {error && <ErrorAlert message={error} />}
        <p className="text-ink-2 text-sm">{statusLine(consent)}</p>
        {consent.active &&
          consent.signedByRelationship &&
          !asRepresentative && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="self-start"
              onClick={() =>
                void run(
                  acceptPartnerConsent,
                  'Autorização registrada em seu nome',
                )
              }
            >
              Autorizar em meu nome
            </Button>
          )}
        {consent.active ? (
          <ConfirmAction
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                className="self-start"
              >
                {busy ? 'Revogando…' : 'Revogar autorização'}
              </Button>
            }
            title="Revogar autorização"
            description={`${consent.partnerName} deixa de ver sua evolução clínica e passa a ver só que você foi atendido(a). Confirma?`}
            confirmLabel="Revogar"
            variant="danger"
            onConfirm={() =>
              void run(revokePartnerConsent, 'Autorização revogada')
            }
          />
        ) : (
          <>
            <Prose
              tabIndex={0}
              role="region"
              aria-label="Texto do termo de compartilhamento"
              className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-sv-surface p-3 text-sm"
            >
              {consent.consentText}
            </Prose>
            <Button
              type="button"
              variant="accent"
              disabled={busy}
              className="self-start"
              onClick={() =>
                void run(acceptPartnerConsent, 'Autorização registrada')
              }
            >
              {busy ? 'Registrando…' : 'Li e autorizo'}
            </Button>
          </>
        )}
      </Card>
    </section>
  );
}
