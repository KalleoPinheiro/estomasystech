'use client';

import { Button } from '@still-void/ui/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@still-void/ui/react/client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { Modal } from '@/components/modal';
import type { TriagePhotoDto } from '@/lib/dto';
import { formatDate, INFECTION_LEVEL_LABELS } from '@/lib/format';

export type TriageDecision = 'reviewed' | 'escalated';

const TRIAGE_ATTENTION_HOURS = 24;

const DECISION_CONFIRMATION: Record<
  TriageDecision,
  {
    title: string;
    description: string;
    confirmLabel: string;
    className: string;
  }
> = {
  reviewed: {
    title: 'Manter o plano de cuidados?',
    description:
      'A foto é marcada como revisada sem intervenção. Não há ação de reabrir depois.',
    confirmLabel: 'Confirmar',
    className: 'bg-danger text-white hover:bg-danger/90',
  },
  escalated: {
    title: 'Antecipar o retorno do paciente?',
    description: 'O retorno do paciente é antecipado com base nesta foto.',
    confirmLabel: 'Confirmar antecipação',
    className: 'bg-success text-white hover:bg-success/90',
  },
};

// why: cortes por terço da escala (PUSH 0–17, DET 0–15 somado em
// condition-assessment.ts) — aproximação não validada clinicamente,
// ver decisão registrada na issue #136.
const PUSH_WARNING_MIN = 6;
const PUSH_DANGER_MIN = 12;
const DET_WARNING_MIN = 6;
const DET_DANGER_MIN = 11;

function scoreBadgeClassName(
  score: NonNullable<TriagePhotoDto['latestScore']>,
) {
  const [warningMin, dangerMin] =
    score.kind === 'push'
      ? [PUSH_WARNING_MIN, PUSH_DANGER_MIN]
      : [DET_WARNING_MIN, DET_DANGER_MIN];

  if (score.value >= dangerMin) return 'bg-danger-soft text-danger';
  if (score.value >= warningMin) return 'bg-warning-soft text-warning';
  return 'bg-sv-surface text-accent-ink';
}

interface TriagePhotoListProps {
  queue: TriagePhotoDto[];
  actionError: string | null;
  submittingId: string | null;
  onTriage: (photo: TriagePhotoDto, decision: TriageDecision) => void;
}

/**
 * Item + ações da fila de triagem, compartilhado entre o resumo no dashboard
 * (`src/app/(staff)/page.tsx`, capado) e a página dedicada
 * (`src/app/(staff)/triagem/page.tsx`, issue #135, sem cap) — mesmo markup,
 * uma correção vale pros dois lugares.
 */
export function TriagePhotoList({
  queue,
  actionError,
  submittingId,
  onTriage,
}: TriagePhotoListProps) {
  const [previewPhoto, setPreviewPhoto] = useState<TriagePhotoDto | null>(null);
  // why: um único AlertDialog para a fila toda — dois por linha custavam
  // hidratação proporcional ao tamanho da fila (#549).
  const [confirming, setConfirming] = useState<{
    photo: TriagePhotoDto;
    decision: TriageDecision;
  } | null>(null);
  const confirmTriggerRef = useRef<HTMLElement | null>(null);
  const confirmation = confirming && DECISION_CONFIRMATION[confirming.decision];
  const askConfirmation = (
    photo: TriagePhotoDto,
    decision: TriageDecision,
    trigger: HTMLElement,
  ) => {
    confirmTriggerRef.current = trigger;
    setConfirming({ photo, decision });
  };

  return (
    <>
      {actionError && <ErrorAlert message={actionError} />}
      <ul className="flex flex-col gap-2">
        {queue.map((photo) => (
          <li
            key={photo.id}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <Button
              type="button"
              variant="link"
              onClick={() => setPreviewPhoto(photo)}
              aria-label={`Ampliar foto de ${photo.patientName}`}
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-border p-0"
            >
              {/* biome-ignore lint/performance/noImgElement: miniatura autenticada, sempre sem otimizador (ADR-069); o next/image custa hidratação por linha da fila */}
              <img
                src={`/api/photos/${photo.id}`}
                alt={`Foto de ${photo.patientName}`}
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {photo.patientName} — {photo.conditionTitle}
                {photo.infectionAlert && (
                  <span className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 font-semibold text-danger text-xs">
                    {INFECTION_LEVEL_LABELS[photo.infectionAlert] ??
                      photo.infectionAlert}
                  </span>
                )}
                {photo.latestScore && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="link"
                        className={`ml-2 h-auto rounded px-1.5 py-0.5 font-semibold text-xs no-underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-ink focus-visible:outline-offset-2 ${scoreBadgeClassName(photo.latestScore)}`}
                      >
                        {photo.latestScore.kind === 'push' ? 'PUSH' : 'DET'}{' '}
                        {photo.latestScore.value}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {photo.latestScore.kind === 'push'
                        ? 'PUSH — Pressure Ulcer Scale for Healing: escala de cicatrização de lesão por pressão'
                        : 'DET — índice Débito/Exsudato/Tecido da avaliação de estomia'}
                    </TooltipContent>
                  </Tooltip>
                )}
              </p>
              <p className="truncate text-ink-2 text-xs">
                {photo.patientNote ?? 'sem observação'} ·{' '}
                {formatDate(photo.createdAt)} ·{' '}
                <span
                  className={
                    photo.waitingHours >= TRIAGE_ATTENTION_HOURS
                      ? 'font-semibold text-danger'
                      : undefined
                  }
                >
                  aguardando há {photo.waitingHours}h
                </span>
              </p>
            </div>
            <Button
              type="button"
              variant="link"
              disabled={submittingId === photo.id}
              onClick={(event) =>
                askConfirmation(photo, 'reviewed', event.currentTarget)
              }
              className="h-auto min-h-11 min-w-11 p-0 text-danger"
            >
              {submittingId === photo.id ? 'Enviando…' : 'Ok, manter plano'}
            </Button>
            <Button
              type="button"
              variant="link"
              disabled={submittingId === photo.id}
              onClick={(event) =>
                askConfirmation(photo, 'escalated', event.currentTarget)
              }
              className="h-auto min-h-11 min-w-11 p-0 text-success"
            >
              {submittingId === photo.id ? 'Enviando…' : 'Antecipar retorno'}
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        {confirming && confirmation && (
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              confirmTriggerRef.current?.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmation.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onTriage(confirming.photo, confirming.decision)}
                className={confirmation.className}
              >
                {confirmation.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
      {previewPhoto && (
        <Modal
          title={`Foto de ${previewPhoto.patientName}`}
          onClose={() => setPreviewPhoto(null)}
        >
          <div className="relative mt-4 aspect-square w-full">
            <Image
              src={`/api/photos/${previewPhoto.id}`}
              alt={`Foto de ${previewPhoto.patientName}`}
              fill
              unoptimized
              className="rounded object-contain"
            />
          </div>
        </Modal>
      )}
    </>
  );
}
