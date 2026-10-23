'use client';

import { Button, Card, CardContent } from '@still-void/ui/react';
import Image from 'next/image';
import { useState } from 'react';
import { HealingChart } from '@/components/healing-chart';
import { StatusBadge } from '@/components/status-badge';
import type {
  ConditionDto,
  ConditionPhotoDto,
  PortalAssessmentDto,
} from '@/lib/dto';
import {
  CONDITION_KIND_LABELS,
  EXUDATE_LABELS,
  formatDate,
  STOMA_TYPE_LABELS,
  TISSUE_TYPE_LABELS,
} from '@/lib/format';

export interface ConditionWithAssessmentsDto {
  condition: ConditionDto;
  /** DTO já filtrado pro portal (PORT-03, #93) — sem `notes`/`complications` livres. */
  assessments: PortalAssessmentDto[];
  /** Fotos só chegam ao próprio paciente — parceiro não recebe (minimização LGPD). */
  photos?: ConditionPhotoDto[];
  /** Base da URL autorizada para servir as fotos no contexto atual. */
  photoUrlBase?: string;
}

/** Linha do tempo de evolução clínica de uma condição (compartilhada entre os portais). */
export function ConditionProgress({
  condition,
  assessments,
  photos,
  photoUrlBase,
}: ConditionWithAssessmentsDto) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-medium">{condition.title}</span>
          <span className="text-ink-3 text-xs">
            {CONDITION_KIND_LABELS[condition.kind]}
            {condition.stomaType
              ? ` · ${STOMA_TYPE_LABELS[condition.stomaType]}`
              : ''}
          </span>
          <StatusBadge
            status={condition.status === 'active' ? 'confirmed' : 'completed'}
            label={
              condition.status === 'active' ? 'Em acompanhamento' : 'Resolvida'
            }
          />
        </div>
        {assessments.length === 0 ? (
          <p className="text-ink-3 text-sm">
            Nenhuma avaliação registrada ainda.
          </p>
        ) : (
          <div className="mb-3">
            <HealingChart assessments={assessments} />
          </div>
        )}
        <PortalPhotoGallery photos={photos} photoUrlBase={photoUrlBase} />
        {assessments.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {assessments.map((assessment) => (
              <li key={assessment.id} className="rounded bg-bg px-3 py-2">
                <span className="mr-2 font-medium text-ink-3 text-xs">
                  {formatDate(assessment.createdAt)}
                </span>
                {describeAssessment(assessment)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PortalPhotoGallery({
  photos,
  photoUrlBase,
}: {
  photos?: ConditionPhotoDto[];
  photoUrlBase?: string;
}) {
  // PORT-12 (#93): fotos de ferida/estomia começam borradas — a imagem antes
  // aparecia de imediato, mesmo na sala de espera, sem o paciente pedir.
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  if (!photoUrlBase || !photos || photos.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {photos.map((photo) => {
        const revealed = revealedIds.has(photo.id);
        return (
          <Button
            key={photo.id}
            type="button"
            variant="ghost"
            className="h-24 w-24 rounded p-0"
            aria-label={revealed ? 'Ocultar foto' : 'Ver foto'}
            onClick={() =>
              setRevealedIds((current) => {
                const next = new Set(current);
                if (next.has(photo.id)) next.delete(photo.id);
                else next.add(photo.id);
                return next;
              })
            }
          >
            <div
              className={`relative h-24 w-24 overflow-hidden rounded border border-border ${revealed ? '' : 'blur-md'}`}
            >
              <Image
                src={`${photoUrlBase}/${photo.id}`}
                alt={`Foto da condição em ${formatDate(photo.createdAt)}`}
                fill
                className="object-cover"
              />
            </div>
          </Button>
        );
      })}
    </div>
  );
}

// PORT-03 (#93): sem `complications`/`notes` — texto livre interno da equipe,
// removido do próprio DTO do portal (`PortalAssessmentDto`). Só dados
// estruturados (medidas, códigos, escalas) chegam até aqui.
function describeAssessment(assessment: PortalAssessmentDto): string {
  const parts: string[] = [];
  if (assessment.areaMm2 != null) {
    parts.push(
      `ferida ${assessment.lengthMm}×${assessment.widthMm}mm (área ${assessment.areaMm2}mm²)`,
    );
  }
  if (assessment.tissueType)
    parts.push(
      `tecido: ${TISSUE_TYPE_LABELS[assessment.tissueType]?.toLowerCase() ?? assessment.tissueType}`,
    );
  if (assessment.exudate)
    parts.push(
      `exsudato: ${EXUDATE_LABELS[assessment.exudate] ?? assessment.exudate}`,
    );
  if (assessment.painScale != null)
    parts.push(`dor ${assessment.painScale}/10`);
  if (assessment.skinCondition)
    parts.push(`pele periestomal: ${assessment.skinCondition}`);
  return parts.length > 0 ? parts.join(' · ') : 'Avaliação registrada';
}
