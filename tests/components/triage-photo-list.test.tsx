// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { TriagePhotoList } from '@/components/triage-photo-list';
import type { TriagePhotoDto } from '@/lib/dto';

afterEach(() => cleanup());

function fixture(overrides: Partial<TriagePhotoDto> = {}): TriagePhotoDto {
  return {
    id: 'photo-1',
    conditionTitle: 'Ferida perna E',
    patientId: 'pat-1',
    patientName: 'Maria Souza',
    patientNote: 'Está coçando',
    createdAt: '2026-07-18T10:00:00.000Z',
    waitingHours: 2,
    latestScore: null,
    ...overrides,
  };
}

function renderQueue(score: TriagePhotoDto['latestScore']) {
  renderWithToast(
    <TriagePhotoList
      queue={[fixture({ latestScore: score })]}
      actionError={null}
      submittingId={null}
      onTriage={vi.fn()}
    />,
  );
  return screen.getByRole('button', { name: /PUSH|DET/ });
}

describe('TriagePhotoList — cor do badge de score por severidade', () => {
  it('PUSH baixo (0–5) usa estilo normal', () => {
    const badge = renderQueue({ kind: 'push', value: 5 });
    expect(badge.className).toContain('text-accent-ink');
    expect(badge.className).not.toContain('text-warning');
    expect(badge.className).not.toContain('text-danger');
  });

  it('PUSH médio (6–11) usa estilo de warning', () => {
    const badge = renderQueue({ kind: 'push', value: 6 });
    expect(badge.className).toContain('text-warning');
  });

  it('PUSH alto (12–17) usa estilo de danger', () => {
    const badge = renderQueue({ kind: 'push', value: 12 });
    expect(badge.className).toContain('text-danger');
  });

  it('DET baixo (0–5) usa estilo normal', () => {
    const badge = renderQueue({ kind: 'det', value: 5 });
    expect(badge.className).toContain('text-accent-ink');
    expect(badge.className).not.toContain('text-warning');
    expect(badge.className).not.toContain('text-danger');
  });

  it('DET médio (6–10) usa estilo de warning', () => {
    const badge = renderQueue({ kind: 'det', value: 6 });
    expect(badge.className).toContain('text-warning');
  });

  it('DET alto (11–15) usa estilo de danger', () => {
    const badge = renderQueue({ kind: 'det', value: 11 });
    expect(badge.className).toContain('text-danger');
  });

  it('sem score não renderiza badge', () => {
    renderWithToast(
      <TriagePhotoList
        queue={[fixture({ latestScore: null })]}
        actionError={null}
        submittingId={null}
        onTriage={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /PUSH|DET/ })).toBeNull();
  });
});

describe('TriagePhotoList — alerta de infecção (ADR-063)', () => {
  it('Dado infecção local na última avaliação, Quando listar, Então mostra o alerta', () => {
    renderWithToast(
      <TriagePhotoList
        queue={[fixture({ infectionAlert: 'local' })]}
        actionError={null}
        submittingId={null}
        onTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('Infecção local')).toBeInTheDocument();
  });

  it('Dado código de infecção desconhecido, Quando listar, Então mostra o código', () => {
    renderWithToast(
      <TriagePhotoList
        queue={[fixture({ infectionAlert: 'novo' })]}
        actionError={null}
        submittingId={null}
        onTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('novo')).toBeInTheDocument();
  });

  it('Dado sem infecção, Quando listar, Então não mostra alerta', () => {
    renderWithToast(
      <TriagePhotoList
        queue={[fixture({ infectionAlert: null })]}
        actionError={null}
        submittingId={null}
        onTriage={vi.fn()}
      />,
    );
    expect(screen.queryByText('Infecção local')).toBeNull();
  });
});
