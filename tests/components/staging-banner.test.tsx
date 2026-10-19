// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StagingBanner } from '@/components/staging-banner';

afterEach(() => {
  cleanup();
});

describe('Feature: Faixa de homologação (ADR-041)', () => {
  it.each(['staging', 'preview'])(
    'Dado APP_ENV=%s, Então avisa que os dados são fictícios',
    (appEnv) => {
      render(<StagingBanner env={{ APP_ENV: appEnv }} />);
      expect(screen.getByText(/dados fictícios/).textContent).toContain(appEnv);
    },
  );

  it.each(['production', 'development'])(
    'Dado APP_ENV=%s, Então não renderiza nada',
    (appEnv) => {
      const { container } = render(<StagingBanner env={{ APP_ENV: appEnv }} />);
      expect(container.innerHTML).toBe('');
    },
  );
});
