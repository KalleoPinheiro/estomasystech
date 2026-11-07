// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Report = (metric: { name: string; value: number }) => void;
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
  window.history.pushState({}, '', '/portal');
  flushWebVitals();
  sendBeacon.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: endpoint do WebVitalsReporter por parâmetro (#643)', () => {
  it('Dado o reporter do portal, Quando a página some, Então envia ao endpoint do portal', () => {
    render(<WebVitalsReporter endpoint="/api/portal/web-vitals" />);
    report({ name: 'LCP', value: 1200 });
    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/api/portal/web-vitals');
  });

  it('Dado o reporter do portal sem sendBeacon, Quando a página some, Então o fetch de reserva usa o endpoint do portal', () => {
    sendBeacon.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<WebVitalsReporter endpoint="/api/portal/web-vitals" />);
    report({ name: 'TTFB', value: 80 });
    window.dispatchEvent(new Event('pagehide'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/web-vitals',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  it('Dado o reporter sem endpoint, Quando a página some, Então envia à rota da equipe', () => {
    render(<WebVitalsReporter />);
    report({ name: 'FCP', value: 700 });
    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/api/me/web-vitals');
  });
});
