// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ConditionPhotos } from '@/app/(staff)/pacientes/[id]/condition-photos';
import { ConditionProgress } from '@/app/portal/condition-progress';
import { TriagePhotoList } from '@/components/triage-photo-list';
import type { ConditionDto, ConditionPhotoDto } from '@/lib/dto';

vi.mock('@/lib/use-condition-photos', () => ({
  useConditionPhotos: () => ({
    photos: [
      photo('p1', '2026-01-01T00:00:00.000Z'),
      photo('p2', '2026-02-01T00:00:00.000Z'),
    ],
    listError: null,
    isLoading: false,
    actionError: null,
    uploading: false,
    refresh: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  }),
}));

afterEach(cleanup);

function photo(id: string, createdAt: string): ConditionPhotoDto {
  return { id, conditionId: 'cond-1', createdAt } as ConditionPhotoDto;
}

const condition: ConditionDto = {
  id: 'cond-1',
  patientId: 'pac-1',
  kind: 'wound',
  title: 'Úlcera venosa',
  stomaType: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  notes: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Foto autenticada nunca pode ir ao otimizador: ele busca sem cookie (401) e cacheia em disco. */
function expectDiretoNaApi(images: HTMLImageElement[], prefix: string) {
  expect(images.length).toBeGreaterThan(0);
  for (const img of images) {
    expect(img.getAttribute('src')?.startsWith(prefix)).toBe(true);
    expect(img.getAttribute('src')).not.toContain('/_next/image');
    expect(img.getAttribute('srcset')).toBeNull();
  }
}

describe('Feature: Fotos clínicas fora do otimizador de imagem (#542, ADR-069)', () => {
  it('Dado a fila de triagem com foto, Quando renderizar, Então a miniatura vai direto a /api/photos', () => {
    renderWithToast(
      <TriagePhotoList
        queue={[
          {
            id: 'photo-1',
            conditionTitle: 'Ferida',
            patientId: 'pat-1',
            patientName: 'Maria',
            patientNote: null,
            createdAt: '2026-07-18T10:00:00.000Z',
            waitingHours: 1,
            latestScore: null,
          },
        ]}
        actionError={null}
        submittingId={null}
        onTriage={vi.fn()}
      />,
    );
    expectDiretoNaApi(
      screen.getAllByRole('img') as HTMLImageElement[],
      '/api/photos/',
    );
  });

  it('Dado a ficha da condição com duas fotos, Quando renderizar, Então miniaturas e comparação vão direto a /api/photos', () => {
    render(<ConditionPhotos conditionId="cond-1" canUpload={false} />);
    const images = screen.getAllByRole('img') as HTMLImageElement[];
    expect(images).toHaveLength(4);
    expectDiretoNaApi(images, '/api/photos/');
  });

  it('Dado o portal com foto, Quando renderizar, Então a miniatura vai direto à rota do portal', () => {
    render(
      <ConditionProgress
        condition={condition}
        assessments={[]}
        photos={[photo('p1', '2026-01-01T00:00:00.000Z')]}
        photoUrlBase="/api/portal/photos"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver foto' }));
    expectDiretoNaApi(
      screen.getAllByRole('img') as HTMLImageElement[],
      '/api/portal/photos/',
    );
  });
});
