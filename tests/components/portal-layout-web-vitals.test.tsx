// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalLayout from '@/app/portal/layout';

const reporter = vi.fn();

vi.mock('@/components/web-vitals-reporter', () => ({
  WebVitalsReporter: (props: { endpoint?: string }) => {
    reporter(props);
    return null;
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/server/data/version', () => ({
  getAppVersion: async () => null,
}));

afterEach(() => {
  cleanup();
  reporter.mockClear();
});

describe('Feature: Web Vitals de campo no portal (#643)', () => {
  it('Dado o layout do portal, Quando renderiza, Então monta o reporter com o endpoint do portal', async () => {
    render(await PortalLayout({ children: <p>Conteúdo</p> }));

    expect(reporter).toHaveBeenCalledWith({
      endpoint: '/api/portal/web-vitals',
    });
  });
});
