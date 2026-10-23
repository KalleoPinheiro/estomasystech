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
  const trends = areaTrends(assessments);
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
          // Lista textual das medições: é também a alternativa acessível ao
          // gráfico, que o leitor de tela e o celular pequeno não leem bem (#517).
          <ul
            aria-label="Medições registradas"
            className="flex flex-col gap-2 text-sm"
          >
            {assessments.map((assessment) => {
              const trend = trends.get(assessment.id);
              return (
                <li key={assessment.id} className="rounded bg-bg px-3 py-2">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-xs">
                    <span className="font-medium text-ink-3">
                      {formatDate(assessment.createdAt)}
                    </span>
                    {trend != null && (
                      <span
                        className={
                          trend <= 0
                            ? 'font-medium text-success'
                            : 'font-medium text-warning'
                        }
                      >
                        {trendLabel(trend)}
                      </span>
                    )}
                  </div>
                  <p>{describeAssessment(assessment)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Variação da área em relação à medição anterior com área, em %, por avaliação.
 * Sem variação (primeira medição, área zerada ou duas medições no mesmo
 * instante, em que não se sabe qual veio antes — mesmo critério do gráfico, #473)
 * a avaliação fica fora do mapa.
 */
function areaTrends(assessments: PortalAssessmentDto[]): Map<string, number> {
  const measured = assessments
    .filter((a) => a.areaMm2 != null)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const trends = new Map<string, number>();
  for (let i = 1; i < measured.length; i++) {
    const previous = measured[i - 1];
    const current = measured[i];
    const sameInstant =
      new Date(previous.createdAt).getTime() ===
      new Date(current.createdAt).getTime();
    if (!sameInstant && (previous.areaMm2 as number) > 0) {
      const delta =
        ((current.areaMm2 as number) - (previous.areaMm2 as number)) /
        (previous.areaMm2 as number);
      trends.set(current.id, Math.round(delta * 100));
    }
  }
  return trends;
}

function trendLabel(trend: number): string {
  if (trend === 0) return 'Área igual à anterior';
  return trend < 0
    ? `Área ↓ ${Math.abs(trend)}% desde a anterior`
    : `Área ↑ ${trend}% desde a anterior`;
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
