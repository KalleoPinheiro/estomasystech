'use client';

import { Button, NativeSelect } from '@still-void/ui/react';
import Image from 'next/image';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { FilePicker } from '@/components/file-picker';
import type { AssessmentDto, ConditionPhotoDto } from '@/lib/dto';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  nearestAssessment,
  type PhotoPair,
  resolvePhotoPair,
  sortPhotosChronologically,
} from '@/lib/photo-comparison';
import { useConditionPhotos } from '@/lib/use-condition-photos';
import { timeSummary, tissueProfile } from '@/lib/wound-time-summary';

interface ConditionPhotosProps {
  conditionId: string;
  canUpload: boolean;
  /** Avaliações da condição: cada lado da comparação mostra a avaliação TIME mais próxima da foto. */
  assessments?: AssessmentDto[];
}

/** Galeria de fotos de evolução da condição: upload, comparação (padrão primeira × última, ou duas à escolha), exclusão. */
export function ConditionPhotos({
  conditionId,
  canUpload,
  assessments = [],
}: ConditionPhotosProps) {
  const { photos, listError, actionError, uploading, refresh, upload, remove } =
    useConditionPhotos(conditionId);

  const list = photos ?? [];
  const chronological = sortPhotosChronologically(list);

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-ink-3 text-xs uppercase">
          Fotos de evolução
        </h4>
        {canUpload && (
          <FilePicker
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        )}
      </div>

      {listError && <ErrorAlert message={listError} onRetry={refresh} />}
      {actionError && <ErrorAlert message={actionError} />}

      {listError ? null : photos === null ? (
        <p className="text-ink-3 text-xs">Carregando fotos…</p>
      ) : list.length === 0 ? (
        <p className="text-ink-3 text-xs">Nenhuma foto registrada.</p>
      ) : (
        <>
          <PhotoComparison photos={chronological} assessments={assessments} />
          <div className="flex flex-wrap gap-2">
            {chronological.map((photo) => (
              <figure key={photo.id} className="w-24">
                <div className="relative h-24 w-24 overflow-hidden rounded border border-border">
                  <Image
                    src={`/api/photos/${photo.id}`}
                    alt={`Foto de ${formatDate(photo.createdAt)}`}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-0.5 flex items-center justify-between text-[10px] text-ink-3">
                  {formatDate(photo.createdAt)}
                  {canUpload && (
                    <ConfirmAction
                      trigger={
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-danger"
                        >
                          excluir
                        </Button>
                      }
                      title="Excluir esta foto?"
                      description="A evidência clínica é removida permanentemente."
                      confirmLabel="Excluir"
                      variant="danger"
                      onConfirm={() => remove(photo)}
                    />
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Comparação lado a lado. Padrão primeira × última; «Escolher fotos» abre dois seletores por data
 * (a escolha é opcional e só vive na tela). Empilha abaixo de `sm` (360 e 390 px).
 */
function PhotoComparison({
  photos,
  assessments,
}: {
  photos: ConditionPhotoDto[];
  assessments: AssessmentDto[];
}) {
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState<[string, string] | null>(null);
  const pair = resolvePhotoPair(photos, choice);
  if (!pair) return null;
  const labels = choice
    ? (['Foto 1', 'Foto 2'] as const)
    : (['Primeira', 'Atual'] as const);
  return (
    <div className="mb-3" data-photo-compare>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h5 className="font-medium text-ink-3 text-xs">Comparar fotos</h5>
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-11 p-0 text-xs"
          aria-expanded={choosing}
          onClick={() => {
            setChoosing((open) => !open);
            setChoice(null);
          }}
        >
          {choosing ? 'Voltar a primeira × última' : 'Escolher fotos'}
        </Button>
      </div>
      {choosing && (
        <ComparePicker
          photos={photos}
          pair={pair}
          onChange={(before, after) => setChoice([before, after])}
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ComparePane
          label={`${labels[0]} — ${formatDate(pair.before.createdAt)}`}
          photoId={pair.before.id}
          assessment={nearestAssessment(pair.before, assessments)}
        />
        <ComparePane
          label={`${labels[1]} — ${formatDate(pair.after.createdAt)}`}
          photoId={pair.after.id}
          assessment={nearestAssessment(pair.after, assessments)}
        />
      </div>
    </div>
  );
}

function ComparePicker({
  photos,
  pair,
  onChange,
}: {
  photos: ConditionPhotoDto[];
  pair: PhotoPair;
  onChange: (before: string, after: string) => void;
}) {
  const options = (other: string) =>
    photos.map((photo) => (
      <option key={photo.id} value={photo.id} disabled={photo.id === other}>
        {formatDateTime(photo.createdAt)}
      </option>
    ));
  return (
    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="text-ink-3 text-xs">
        Foto 1
        <NativeSelect
          className="mt-1"
          value={pair.before.id}
          onChange={(e) => onChange(e.target.value, pair.after.id)}
        >
          {options(pair.after.id)}
        </NativeSelect>
      </label>
      <label className="text-ink-3 text-xs">
        Foto 2
        <NativeSelect
          className="mt-1"
          value={pair.after.id}
          onChange={(e) => onChange(pair.before.id, e.target.value)}
        >
          {options(pair.before.id)}
        </NativeSelect>
      </label>
    </div>
  );
}

function ComparePane({
  label,
  photoId,
  assessment,
}: {
  label: string;
  photoId: string;
  assessment: AssessmentDto | null;
}) {
  return (
    <figure>
      <figcaption className="mb-1 font-medium text-ink-3 text-xs">
        {label}
      </figcaption>
      <div className="relative aspect-square w-full overflow-hidden rounded border border-border">
        <Image
          src={`/api/photos/${photoId}`}
          alt={label}
          fill
          unoptimized
          className="object-contain"
        />
      </div>
      <p className="mt-1 text-ink-3 text-xs" data-compare-assessment>
        {assessment
          ? `Avaliação de ${formatDate(assessment.createdAt)} · ${[timeSummary(assessment), tissueProfile(assessment)].filter(Boolean).join(' · ')}`
          : 'Sem avaliação registrada.'}
      </p>
    </figure>
  );
}
