'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';
import {
  normalizeRoute,
  roundWidth,
  WEB_VITAL_NAMES,
  type WebVitalName,
} from '@/lib/web-vitals';
import type { WebVitalsPayload } from '@/lib/web-vitals-schema';

const ENDPOINT = '/api/me/web-vitals';

type Metric = WebVitalsPayload['metrics'][number];

const isVitalName = (name: string): name is WebVitalName =>
  (WEB_VITAL_NAMES as readonly string[]).includes(name);

// Uma entrada por métrica: CLS e INP se atualizam durante a visita e vale a última.
const buffer = new Map<WebVitalName, Metric>();

/** Manda o que foi medido numa só requisição e esvazia o buffer (uma chamada `/api` por visita, não cinco). */
export function flushWebVitals(): void {
  if (buffer.size === 0) return;
  const payload: WebVitalsPayload = {
    route: normalizeRoute(window.location.pathname),
    width: roundWidth(window.innerWidth),
    metrics: [...buffer.values()],
  };
  buffer.clear();
  const body = JSON.stringify(payload);
  const sent =
    typeof navigator.sendBeacon === 'function' &&
    navigator.sendBeacon(
      ENDPOINT,
      new Blob([body], { type: 'application/json' }),
    );
  if (!sent) {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }
}

function collect(metric: { name: string; value: number; rating?: string }) {
  if (!isVitalName(metric.name)) return;
  buffer.set(metric.name, {
    name: metric.name,
    value: metric.value,
    ...(metric.rating === 'good' ||
    metric.rating === 'needs-improvement' ||
    metric.rating === 'poor'
      ? { rating: metric.rating }
      : {}),
  });
}

/**
 * Web Vitals de campo (#559): coleta LCP, INP, CLS, TTFB e FCP e envia quando a
 * aba é escondida ou fechada. Só entra nas áreas com sessão (equipe, portal,
 * plataforma): a rota exige login e, sem ele, a requisição só poluiria o console.
 */
export function WebVitalsReporter() {
  useReportWebVitals(collect);
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushWebVitals();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flushWebVitals);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flushWebVitals);
    };
  }, []);
  return null;
}
