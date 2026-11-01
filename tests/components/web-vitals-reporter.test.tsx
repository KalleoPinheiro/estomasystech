// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Report = (metric: {
  name: string;
  value: number;
  rating?: string;
}) => void;
let report: Report = () => undefined;

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: (callback: Report) => {
    report = callback;
  },
}));

import {
  flushWebVitals,
  WebVitalsReporter,
} from '@/components/web-vitals-reporter';

const sendBeacon = vi.fn();

beforeEach(() => {
  sendBeacon.mockReset().mockReturnValue(true);
  Object.defineProperty(navigator, 'sendBeacon', {
    value: sendBeacon,
    configurable: true,
  });
  window.history.pushState(
    {},
    '',
    '/pacientes/3f2504e0-4f89-41d3-9a0c-0305e82c3301?nome=Maria',
  );
  Object.defineProperty(window, 'innerWidth', {
    value: 390,
    configurable: true,
  });
  flushWebVitals();
  sendBeacon.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function sentPayload() {
  const blob = sendBeacon.mock.calls[0]?.[1] as Blob;
  return JSON.parse(await blob.text());
}

const hide = () => {
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('Feature: Web Vitals de campo no navegador (#559)', () => {
  it('Dadas métricas medidas, Quando a aba é escondida, Então manda uma só requisição com rota sem id e largura arredondada', async () => {
    render(<WebVitalsReporter />);
    report({ name: 'LCP', value: 1500, rating: 'good' });
    report({ name: 'CLS', value: 0.01, rating: 'good' });
    hide();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/api/me/web-vitals');
    expect(await sentPayload()).toEqual({
      route: '/pacientes/:id',
      width: 400,
      metrics: [
        { name: 'LCP', value: 1500, rating: 'good' },
        { name: 'CLS', value: 0.01, rating: 'good' },
      ],
    });
  });

  it('Dada a mesma métrica medida de novo, Quando envia, Então vale a última', async () => {
    render(<WebVitalsReporter />);
    report({ name: 'CLS', value: 0.01 });
    report({ name: 'CLS', value: 0.2, rating: 'poor' });
    window.dispatchEvent(new Event('pagehide'));

    expect((await sentPayload()).metrics).toEqual([
      { name: 'CLS', value: 0.2, rating: 'poor' },
    ]);
  });

  it('Dada uma métrica fora do catálogo ou rating desconhecido, Quando envia, Então ignora a métrica e descarta o rating', async () => {
    render(<WebVitalsReporter />);
    report({ name: 'Next.js-hydration', value: 10 });
    report({ name: 'FCP', value: 900, rating: 'desconhecido' });
    window.dispatchEvent(new Event('pagehide'));

    expect((await sentPayload()).metrics).toEqual([
      { name: 'FCP', value: 900 },
    ]);
  });

  it('Dada a aba visível ou nada medido, Quando o evento dispara, Então não envia', () => {
    render(<WebVitalsReporter />);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    report({ name: 'LCP', value: 1 });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sendBeacon).not.toHaveBeenCalled();

    flushWebVitals();
    sendBeacon.mockClear();
    flushWebVitals();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('Dado que o sendBeacon recusa, Quando envia, Então cai para fetch com keepalive', () => {
    sendBeacon.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<WebVitalsReporter />);
    report({ name: 'TTFB', value: 80 });
    window.dispatchEvent(new Event('pagehide'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me/web-vitals',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  it('Dado um navegador sem sendBeacon e com fetch falhando, Quando envia, Então não lança', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: undefined,
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<WebVitalsReporter />);
    report({ name: 'TTFB', value: 80 });

    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
    await Promise.resolve();
  });

  it('Dado o componente desmontado, Quando a página some, Então não envia mais', () => {
    const { unmount } = render(<WebVitalsReporter />);
    unmount();
    report({ name: 'LCP', value: 1 });
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).not.toHaveBeenCalled();
    flushWebVitals();
  });
});
