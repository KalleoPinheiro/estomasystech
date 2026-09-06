'use client';

import { Button, FileInput } from '@still-void/ui/react';
import Image from 'next/image';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { formatDate } from '@/lib/format';
import { useConditionPhotos } from '@/lib/use-condition-photos';

interface ConditionPhotosProps {
  conditionId: string;
  canUpload: boolean;
}

/** Galeria de fotos de evolução da condição: upload, comparação primeira × última, exclusão. */
export function ConditionPhotos({
  conditionId,
  canUpload,
}: ConditionPhotosProps) {
  const {
    photos,
    listError,
    isLoading,
    actionError,
    uploading,
    refresh,
    upload,
    remove,
  } = useConditionPhotos(conditionId);

  const list = photos ?? [];
  const chronological = [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  const showCompare = chronological.length >= 2 && first.id !== last.id;

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-ink-3 text-xs uppercase">
          Fotos de evolução
        </h4>
        {canUpload && (
          <FileInput
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

      {listError ? null : isLoading ? (
        <p className="text-ink-3 text-xs">Carregando fotos…</p>
      ) : list.length === 0 ? (
        <p className="text-ink-3 text-xs">Nenhuma foto registrada.</p>
      ) : (
        <>
          {showCompare && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <ComparePane
                label={`Primeira — ${formatDate(first.createdAt)}`}
                photoId={first.id}
              />
              <ComparePane
                label={`Atual — ${formatDate(last.createdAt)}`}
                photoId={last.id}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {chronological.map((photo) => (
              <figure key={photo.id} className="w-24">
                <div className="relative h-24 w-24 overflow-hidden rounded border border-border">
                  <Image
                    src={`/api/photos/${photo.id}`}
                    alt={`Foto de ${formatDate(photo.createdAt)}`}
                    fill
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

function ComparePane({ label, photoId }: { label: string; photoId: string }) {
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
          className="object-contain"
        />
      </div>
    </figure>
  );
}
