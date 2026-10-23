'use client';

import { ChartAxis, ChartContainer, ChartLine } from '@still-void/ui/react';
import { useMediaQuery } from '@still-void/ui/react/client';
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

interface Geometry {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  /** Tamanho do texto no sistema de coordenadas do SVG (px na tela quando o SVG não é reduzido). */
  font: number;
  /** Linha de base dos rótulos de valor máximo (no alto) e das datas (embaixo). */
  labelY: number;
  dateY: number;
}

const GEOMETRY: Geometry = {
  width: 640,
  height: 180,
  padLeft: 44,
  padRight: 40,
  padTop: 16,
  padBottom: 28,
  font: 10,
  labelY: 20,
  dateY: 172,
};

/**
 * Celular estreito (#517): o SVG de 640 de largura encolhia para ~0,5 e o texto
 * de 10 ia a ~5px. Aqui o sistema de coordenadas tem a largura útil do gráfico
 * em 360px (~280, tela menos margens e cartão), então o texto de 12 sai a ~12px, e o gráfico ganha
 * altura para as linhas não ficarem achatadas.
 */
const COMPACT_GEOMETRY: Geometry = {
  width: 280,
  height: 200,
  padLeft: 12,
  padRight: 12,
  padTop: 32,
  padBottom: 32,
  font: 12,
  labelY: 18,
  dateY: 190,
};

const PAIN_MAX = 10;
const MIN_MEASURED_POINTS = 2;

interface ChartPoint {
  x: number;
  y: number;
}

function yOf(geo: Geometry, value: number, min: number, max: number) {
  const span = max - min || 1;
  return (
    geo.padTop +
    (geo.height - geo.padTop - geo.padBottom) * (1 - (value - min) / span)
  );
}

function toPoints(
  geo: Geometry,
  values: SeriesPoint[],
  min: number,
  max: number,
  xOf: (d: Date) => number,
): ChartPoint[] {
  return values.map((p) => ({
    x: xOf(p.date),
    y: yOf(geo, p.value, min, max),
  }));
}

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

function buildChartModel(
  assessments: ChartAssessment[],
  geo: Geometry,
): ChartModel | null {
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
  const orderIsAmbiguous =
    areaSeries.length >= MIN_MEASURED_POINTS &&
    (areaSeries[0].date.getTime() === areaSeries[1].date.getTime() ||
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
      geo.padLeft +
      (geo.width - geo.padLeft - geo.padRight) * ((d.getTime() - minT) / spanT),
  };
}

function ChartLegend({ model }: { model: ChartModel }) {
  const items = [
    {
      show: model.areaSeries.length >= MIN_MEASURED_POINTS,
      label: 'Área da ferida (mm²)',
      color: SERIES_AREA,
      dash: undefined,
      marker: 'circle' as const,
    },
    {
      show: model.scoreSeries.length >= MIN_MEASURED_POINTS,
      label: 'Gravidade clínica',
      color: SERIES_SCORE,
      dash: '1 3',
      marker: 'square' as const,
    },
    {
      show: model.painSeries.length >= MIN_MEASURED_POINTS,
      label: 'Dor (0–10)',
      color: SERIES_PAIN,
      dash: '4 3',
      marker: undefined,
    },
  ].filter((item) => item.show);
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ink-2 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {/* Chave com o mesmo traço e marcador da série: não depende só da cor. */}
          <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
            <line
              x1="1"
              y1="5"
              x2="27"
              y2="5"
              stroke={item.color}
              strokeWidth="2"
              strokeDasharray={item.dash}
              strokeLinecap={item.dash === '1 3' ? 'round' : undefined}
            />
            {item.marker === 'circle' && (
              <circle cx="14" cy="5" r="3" fill={item.color} />
            )}
            {item.marker === 'square' && (
              <rect x="11" y="2" width="6" height="6" fill={item.color} />
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function ChartSvg({ model, geo }: { model: ChartModel; geo: Geometry }) {
  const { areaSeries, painSeries, scoreSeries, minT, maxT, areaMax, xOf } =
    model;
  const font = String(geo.font);
  return (
    <ChartContainer
      width={geo.width}
      height={geo.height}
      className="healing-chart__svg w-full rounded border"
      aria-label="Gráfico de evolução da condição"
    >
      <g transform={`translate(${geo.padLeft}, ${geo.height - geo.padBottom})`}>
        <ChartAxis
          orientation="bottom"
          ticks={[]}
          length={geo.width - geo.padLeft - geo.padRight}
        />
      </g>
      {areaSeries.length >= MIN_MEASURED_POINTS && (
        <>
          <ChartLine
            points={toPoints(geo, areaSeries, 0, areaMax, xOf)}
            color={SERIES_AREA}
          />
          {areaSeries.map((p) => (
            <circle
              key={`a-${p.date.getTime()}`}
              cx={xOf(p.date)}
              cy={yOf(geo, p.value, 0, areaMax)}
              r="3"
              fill={SERIES_AREA}
            />
          ))}
          <text x={4} y={geo.labelY} fontSize={font} fill={SERIES_AREA}>
            {areaMax}mm²
          </text>
        </>
      )}
      {scoreSeries.length >= MIN_MEASURED_POINTS && (
        <>
          <ChartLine
            points={toPoints(geo, scoreSeries, 0, CLINICAL_SCORE_MAX, xOf)}
            color={SERIES_SCORE}
            className="healing-chart__score-line"
          />
          {/* #94, DOC-07: marcador quadrado (a área usa círculo) — forma
              distinta reforça a diferenciação por traço em P&B/daltonismo. */}
          {scoreSeries.map((p) => (
            <rect
              key={`s-${p.date.getTime()}`}
              x={xOf(p.date) - 3}
              y={yOf(geo, p.value, 0, CLINICAL_SCORE_MAX) - 3}
              width="6"
              height="6"
              fill={SERIES_SCORE}
            />
          ))}
        </>
      )}
      {painSeries.length >= MIN_MEASURED_POINTS && (
        <>
          <ChartLine
            points={toPoints(geo, painSeries, 0, PAIN_MAX, xOf)}
            color={SERIES_PAIN}
            className="healing-chart__pain-line"
          />
          <text
            x={geo.width - geo.padRight + 4}
            y={geo.labelY}
            fontSize={font}
            fill={SERIES_PAIN}
            textAnchor={geo === COMPACT_GEOMETRY ? 'end' : undefined}
          >
            dor /10
          </text>
        </>
      )}
      <text
        x={geo.padLeft}
        y={geo.dateY}
        fontSize={font}
        fill="var(--sv-text-3)"
      >
        {formatDate(new Date(minT).toISOString())}
      </text>
      <text
        x={geo.width - geo.padRight}
        y={geo.dateY}
        fontSize={font}
        fill="var(--sv-text-3)"
        textAnchor="end"
      >
        {formatDate(new Date(maxT).toISOString())}
      </text>
    </ChartContainer>
  );
}

/**
 * Tendência de cicatrização: área da ferida (C×L) e dor ao longo das avaliações.
 * SVG via primitivos do Still Void (ChartContainer/ChartAxis/ChartLine) onde a
 * lib cobre; círculos de dado e todo `<text>` continuam manuais — a lib não
 * expõe primitivo de marcador de ponto nem de legenda livre (AD-014). A legenda
 * é HTML (chaves com o traço de cada série), legível no celular (#517).
 *
 * SPEC_DEVIATION: ChartContainerProps (dist/react/index.d.ts) só aceita
 * width/height/aria-label/className/children — sem `style` nem `viewBox`
 * (o viewBox é montado internamente a partir de width/height). O
 * background/borda que antes vinham de `style` inline agora são a
 * classe `.healing-chart__svg` em globals.css; visual idêntico.
 */
export function HealingChart({ assessments }: HealingChartProps) {
  const compact = useMediaQuery('(max-width: 479px)');
  const geo = compact ? COMPACT_GEOMETRY : GEOMETRY;
  const model = buildChartModel(assessments, geo);
  if (!model) {
    return (
      <p className="text-ink-3 text-xs">
        Registre medidas (C×L) ou dor em pelo menos duas avaliações para
        acompanhar a tendência.
      </p>
    );
  }
  const { trend } = model;

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
      <ChartSvg model={model} geo={geo} />
      <ChartLegend model={model} />
    </div>
  );
}
