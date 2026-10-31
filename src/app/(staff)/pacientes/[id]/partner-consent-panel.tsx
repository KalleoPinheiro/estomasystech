'use client';

import { Button, Card } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { unwrapAction } from '@/lib/action-result';
import type { PartnerShareConsentDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useStaffIdentity } from '@/lib/staff-access';
import {
  registerPaperConsent,
  revokePartnerConsent,
} from './actions/consentimento';

const REVOKED_BY = { patient: 'pelo paciente', staff: 'pela equipe' };

const PAPER_ROLES = ['company_admin', 'atendente'];

/** Só Admin de Empresa e Atendente registram o consentimento em papel (#310); a API repete a regra. */
function useCanRegisterPaper(): boolean {
  const identity = useStaffIdentity();
  // Sem provider (tela isolada) ou sem papel conhecido não restringe: a API é a barreira.
  if (identity === null) return true;
  if (identity.loading) return false;
  return identity.role === null || PAPER_ROLES.includes(identity.role);
}

function describeAccepted(consent: PartnerShareConsentDto, at: string): string {
  const version = `texto ${consent.acceptedVersion ?? '—'}`;
  if (consent.acceptedSource === 'paper') {
    const by = consent.acceptedBy ? ` por ${consent.acceptedBy}` : '';
    return `Autorizado em papel, registrado pela equipe${by} em ${formatDateTime(at)} (${version}).`;
  }
  return `Autorizado pelo paciente em ${formatDateTime(at)} (${version}).`;
}

function describe(consent: PartnerShareConsentDto): string {
  if (consent.active && consent.acceptedAt) {
    return describeAccepted(consent, consent.acceptedAt);
  }
  if (consent.revoked && consent.revokedAt) {
    const by = consent.revokedBy ? ` ${REVOKED_BY[consent.revokedBy]}` : '';
    return `Revogado${by} em ${formatDateTime(consent.revokedAt)}.`;
  }
  if (consent.acceptedAt) {
    return 'O texto do consentimento mudou: o paciente precisa autorizar de novo pelo portal.';
  }
  return 'O paciente não autorizou. O parceiro vê só se ele foi atendido.';
}

/**
 * Consentimento do paciente para o parceiro indicador ver a evolução clínica
 * no portal (#292). A equipe revoga (ex.: pedido na recepção) e, no Admin de
 * Empresa e no Atendente, registra o consentimento dado em papel (#310), com
 * origem e autoria auditadas. Sem parceiro indicador, não aparece.
 */
export function PartnerConsentPanel({
  patientId,
  consent,
  onChanged,
}: {
  patientId: string;
  /** Lido no servidor; `null` sem parceiro indicador ativo (o painel some). */
  consent: PartnerShareConsentDto | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const canRegisterPaper = useCanRegisterPaper();

  if (!consent) return null;

  const registerPaper = async () => {
    setRegistering(true);
    setError(null);
    try {
      await unwrapAction(registerPaperConsent({ patientId }));
      toast({
        description: 'Consentimento em papel registrado',
        variant: 'success',
      });
      onChanged();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro ao registrar consentimento em papel';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setRegistering(false);
    }
  };

  const revoke = async () => {
    setRevoking(true);
    setError(null);
    try {
      await unwrapAction(revokePartnerConsent({ patientId }));
      toast({ description: 'Consentimento revogado', variant: 'success' });
      onChanged();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao revogar consentimento';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card className="mb-6 flex flex-col gap-2 p-4" data-partner-consent-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">
          Compartilhamento com {consent.partnerName} (parceiro indicador)
        </h2>
        <StatusBadge
          status={consent.active ? 'completed' : 'cancelled'}
          label={consent.active ? 'Autorizado' : 'Não autorizado'}
        />
      </div>
      {error && <ErrorAlert message={error} />}
      <p className="text-ink-2 text-sm">{describe(consent)}</p>
      {!consent.active && canRegisterPaper && (
        <ConfirmAction
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={registering}
              className="self-start"
            >
              {registering
                ? 'Registrando…'
                : 'Registrar consentimento em papel'}
            </Button>
          }
          title="Registrar consentimento em papel"
          description={`Confirme que o paciente assinou o termo em papel autorizando ${consent.partnerName} a ver condições e avaliações dele (texto ${consent.textVersion}). O registro guarda a origem "papel", seu nome e a data, e libera o parceiro de imediato.\n\n${consent.consentText}`}
          confirmLabel="Registrar"
          onConfirm={() => void registerPaper()}
        />
      )}
      {consent.active && (
        <ConfirmAction
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revoking}
              className="self-start"
            >
              {revoking ? 'Revogando…' : 'Revogar a pedido do paciente'}
            </Button>
          }
          title="Revogar consentimento"
          description={`${consent.partnerName} deixa de ver condições e avaliações deste paciente. Só o paciente pode autorizar de novo, pelo portal. Confirma?`}
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={() => void revoke()}
        />
      )}
    </Card>
  );
}
