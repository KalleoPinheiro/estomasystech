'use client';

import { ChartAxis, ChartContainer, ChartLine } from '@still-void/ui/react';
import { formatDate } from '@/lib/format';

/**
 * Só os campos numéricos usados no gráfico — aceita tanto `AssessmentDto`
 * (staff) quanto `PortalAssessmentDto` (portal, sem `notes`/`complications`,
 * #93), sem acoplar o componente ao DTO mais amplo por engano.
 */
interface ChartAssessment {
  areaMm2: number | null;
  painScale: number | null;
  pushScore: number | null;
  detScore: number | null;
  createdAt: string;
}

interface HealingChartProps {
  assessments: ChartAssessment[];
}

interface SeriesPoint {
  date: Date;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 180;
const PAD_LEFT = 44;
const PAD_RIGHT = 40;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PAIN_MAX = 10;
const MIN_MEASURED_POINTS = 2;

interface ChartPoint {
  x: number;
  y: number;
}

function toPoints(
  values: SeriesPoint[],
  min: number,
  max: number,
  xOf: (d: Date) => number,
): ChartPoint[] {
  const span = max - min || 1;
  return values.map((p) => {
    const y =
      PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - (p.value - min) / span);
    return { x: xOf(p.date), y };
  });
}

/** Intervalo mínimo entre a primeira e a última medição para falar em tendência. */
const MIN_TREND_SPAN_MS = 24 * 60 * 60 * 1000;
const CLINICAL_SCORE_MAX = 17; // PUSH 0–17 (DET 0–15 compartilha o eixo)

/**
 * Séries do gráfico nos tokens do Still Void. A área usa o accent do site; as
 * outras duas usam cores semânticas, que são fixas no sistema justamente para
 * não colidirem com o accent quando ele muda. Sempre a variante -ink, a que
 * mantém contraste no tema claro.
 */
const SERIES_AREA = 'var(--sv-accent-ink)';
const SERIES_SCORE = 'var(--sv-info-ink)';
const SERIES_PAIN = 'var(--sv-warning-ink)';

interface ChartModel {
  areaSeries: SeriesPoint[];
  painSeries: SeriesPoint[];
  scoreSeries: SeriesPoint[];
  minT: number;
  maxT: number;
  areaMax: number;
  trend: number | null;
  xOf: (d: Date) => number;
}

function buildChartModel(assessments: ChartAssessment[]): ChartModel | null {
  const ordered = [...assessments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const areaSeries: SeriesPoint[] = ordered
    .filter((a) => a.areaMm2 != null)
    .map((a) => ({ date: new Date(a.createdAt), value: a.areaMm2 as number }));
  const painSeries: SeriesPoint[] = ordered
    .filter((a) => a.painScale != null)
    .map((a) => ({
      date: new Date(a.createdAt),
      value: a.painScale as number,
    }));
  // Score clínico validado: PUSH (ferida) ou DET (estomia) — nunca ambos na mesma condição.
  const scoreSeries: SeriesPoint[] = ordered
    .filter((a) => a.pushScore != null || a.detScore != null)
    .map((a) => ({
      date: new Date(a.createdAt),
      value: (a.pushScore ?? a.detScore) as number,
    }));

  const hasEnough = [areaSeries, painSeries, scoreSeries].some(
    (series) => series.length >= MIN_MEASURED_POINTS,
  );
  if (!hasEnough) {
    return null;
  }

  const allDates = [...areaSeries, ...painSeries, ...scoreSeries].map((p) =>
    p.date.getTime(),
  );
  const minT = Math.min(...allDates);
  const maxT = Math.max(...allDates);
  const spanT = maxT - minT || 1;
  const first = areaSeries[0];
  const last = areaSeries[areaSeries.length - 1];
  // Duas medições no mesmo instante nas pontas: não se sabe qual veio antes, e a
  // mensagem "reduziu/aumentou" poderia contradizer a tabela (#473).
  // Medições com menos de um dia entre a primeira e a última (ex.: lote lançado
  // de uma vez) também não têm ordem confiável: "reduziu 89%" seria ruído.
  const orderIsAmbiguous =
    areaSeries.length >= MIN_MEASURED_POINTS &&
    (last.date.getTime() - first.date.getTime() < MIN_TREND_SPAN_MS ||
      areaSeries[0].date.getTime() === areaSeries[1].date.getTime() ||
      last.date.getTime() === areaSeries[areaSeries.length - 2].date.getTime());
  const trend =
    areaSeries.length >= MIN_MEASURED_POINTS &&
    first.value > 0 &&
    !orderIsAmbiguous
      ? Math.round(((last.value - first.value) / first.value) * 100)
      : null;

  return {
    areaSeries,
    painSeries,
    scoreSeries,
    minT,
    maxT,
    areaMax: Math.max(...areaSeries.map((p) => p.value), 1),
    trend,
    xOf: (d: Date) =>
      PAD_LEFT +
      (WIDTH - PAD_LEFT - PAD_RIGHT) * ((d.getTime() - minT) / spanT),
  };
}

/**
 * Tendência de cicatrização: área da ferida (C×L) e dor ao longo das avaliações.
 * SVG via primitivos do Still Void (ChartContainer/ChartAxis/ChartLine) onde a
 * lib cobre; círculos de dado e todo `<text>` continuam manuais — a lib não
 * expõe primitivo de marcador de ponto nem de legenda livre (AD-014).
 */
export function HealingChart({ assessments }: HealingChartProps) {
  const model = buildChartModel(assessments);
  if (!model) {
    return (
      <p className="text-ink-3 text-xs">
        Registre medidas (C×L) ou dor em pelo menos duas avaliações para
        acompanhar a tendência.
      </p>
    );
  }
  const {
    areaSeries,
    painSeries,
    scoreSeries,
    minT,
    maxT,
    areaMax,
    trend,
    xOf,
  } = model;

  return (
    <div>
      {trend != null && (
        <p
          className={`mb-1 font-medium text-xs ${trend <= 0 ? 'text-success' : 'text-warning'}`}
        >
          {trend <= 0
            ? `Área reduziu ${Math.abs(trend)}% desde a primeira medição`
            : `Área aumentou ${trend}% desde a primeira medição`}
        </p>
      )}
      {/*
        SPEC_DEVIATION: ChartContainerProps (dist/react/index.d.ts) só aceita
        width/height/aria-label/className/children — sem `style` nem `viewBox`
        (o viewBox é montado internamente a partir de width/height). O
        background/borda que antes vinham de `style` inline agora são a
        classe `.healing-chart__svg` em globals.css; visual idêntico.
      */}
      <ChartContainer
        width={WIDTH}
        height={HEIGHT}
        className="healing-chart__svg w-full rounded border"
        aria-label="Gráfico de evolução da condição"
      >
        <g transform={`translate(${PAD_LEFT}, ${HEIGHT - PAD_BOTTOM})`}>
          <ChartAxis
            orientation="bottom"
            ticks={[]}
            length={WIDTH - PAD_LEFT - PAD_RIGHT}
          />
        </g>
        {areaSeries.length >= MIN_MEASURED_POINTS && (
          <>
            <ChartLine
              points={toPoints(areaSeries, 0, areaMax, xOf)}
              color={SERIES_AREA}
            />
            {areaSeries.map((p) => (
              <circle
                key={`a-${p.date.getTime()}`}
                cx={xOf(p.date)}
                cy={
                  PAD_TOP +
                  (HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - p.value / areaMax)
                }
                r="3"
                fill={SERIES_AREA}
              />
            ))}
            <text x={4} y={PAD_TOP + 4} fontSize="10" fill={SERIES_AREA}>
              {areaMax}mm²
            </text>
          </>
        )}
        {scoreSeries.length >= MIN_MEASURED_POINTS && (
          <>
            <ChartLine
              points={toPoints(scoreSeries, 0, CLINICAL_SCORE_MAX, xOf)}
              color={SERIES_SCORE}
              className="healing-chart__score-line"
            />
            {/* #94, DOC-07: marcador quadrado (a área usa círculo) — forma
                distinta reforça a diferenciação por traço em P&B/daltonismo. */}
            {scoreSeries.map((p) => {
              const cy =
                PAD_TOP +
                (HEIGHT - PAD_TOP - PAD_BOTTOM) *
                  (1 - p.value / CLINICAL_SCORE_MAX);
              return (
                <rect
                  key={`s-${p.date.getTime()}`}
                  x={xOf(p.date) - 3}
                  y={cy - 3}
                  width="6"
                  height="6"
                  fill={SERIES_SCORE}
                />
              );
            })}
          </>
        )}
        {painSeries.length >= MIN_MEASURED_POINTS && (
          <>
            <ChartLine
              points={toPoints(painSeries, 0, PAIN_MAX, xOf)}
              color={SERIES_PAIN}
              className="healing-chart__pain-line"
            />
            <text
              x={WIDTH - PAD_RIGHT + 4}
              y={PAD_TOP + 4}
              fontSize="10"
              fill={SERIES_PAIN}
            >
              dor /10
            </text>
          </>
        )}
        <text x={PAD_LEFT} y={HEIGHT - 8} fontSize="10" fill="var(--sv-text-3)">
          {formatDate(new Date(minT).toISOString())}
        </text>
        <text
          x={WIDTH - PAD_RIGHT}
          y={HEIGHT - 8}
          fontSize="10"
          fill="var(--sv-text-3)"
          textAnchor="end"
        >
          {formatDate(new Date(maxT).toISOString())}
        </text>
      </ChartContainer>
      <p className="mt-1 text-ink-3 text-xs">
        Sólida no accent: área da ferida (mm²) · sólida azul: gravidade clínica
        · tracejada âmbar: dor (0–10)
      </p>
    </div>
  );
}
