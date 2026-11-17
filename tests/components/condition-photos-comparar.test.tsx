// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConditionPhotos } from '@/app/(staff)/pacientes/[id]/condition-photos';
import type { AssessmentDto, ConditionPhotoDto } from '@/lib/dto';

const state = vi.hoisted(() => ({ photos: [] as unknown[] }));

vi.mock('@/lib/use-condition-photos', () => ({
  useConditionPhotos: () => ({
    photos: state.photos,
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

const photo = (id: string, createdAt: string): ConditionPhotoDto =>
  ({
    id,
    conditionId: 'c1',
    createdAt,
    assessmentId: null,
  }) as ConditionPhotoDto;

const avaliacao = (
  id: string,
  createdAt: string,
  extra: Partial<AssessmentDto> = {},
): AssessmentDto => ({ id, createdAt, ...extra }) as AssessmentDto;

const fotos = [
  photo('p1', '2026-01-10T12:00:00.000Z'),
  photo('p2', '2026-02-10T12:00:00.000Z'),
  photo('p3', '2026-03-10T12:00:00.000Z'),
];
const avaliacoes = [
  avaliacao('a1', '2026-01-09T12:00:00.000Z', {
    infectionLevel: 'local',
    granulationPct: 30,
  }),
  avaliacao('a3', '2026-03-11T12:00:00.000Z', { woundEdges: 'attached' }),
];

function painel() {
  return document.querySelector('[data-photo-compare]') as HTMLElement;
}
const srcs = () =>
  within(painel())
    .getAllByRole('img')
    .map((img) => img.getAttribute('src'));

describe('Feature: comparar duas fotos à escolha na ficha (#907)', () => {
  it('Dado três fotos, Quando renderizar, Então o padrão é primeira × última com a avaliação mais próxima de cada uma', () => {
    state.photos = fotos;
    render(
      <ConditionPhotos
        conditionId="c1"
        canUpload={false}
        assessments={avaliacoes}
      />,
    );
    expect(srcs()).toEqual(['/api/photos/p1', '/api/photos/p3']);
    expect(within(painel()).getByText(/^Primeira — /)).toBeTruthy();
    expect(within(painel()).getByText(/^Atual — /)).toBeTruthy();
    const notas = painel().querySelectorAll('[data-compare-assessment]');
    expect(notas[0].textContent).toMatch(/^Avaliação de .* · .*Granulação 30%/);
    expect(notas[1].textContent).toMatch(/^Avaliação de /);
    expect(screen.queryByLabelText('Foto 1')).toBeNull();
  });

  it('Dado duas fotos sem avaliações, Quando renderizar, Então avisa que não há avaliação', () => {
    state.photos = fotos.slice(0, 2);
    render(<ConditionPhotos conditionId="c1" canUpload={false} />);
    const notas = painel().querySelectorAll('[data-compare-assessment]');
    expect([...notas].map((n) => n.textContent)).toEqual([
      'Sem avaliação registrada.',
      'Sem avaliação registrada.',
    ]);
  });

  it('Dado uma só foto, Quando renderizar, Então não oferece comparação', () => {
    state.photos = fotos.slice(0, 1);
    render(<ConditionPhotos conditionId="c1" canUpload={false} />);
    expect(painel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escolher fotos' })).toBeNull();
  });

  it('Dado «Escolher fotos», Quando escolher outras duas datas, Então compara as escolhidas, a mais antiga à esquerda', () => {
    state.photos = fotos;
    render(
      <ConditionPhotos
        conditionId="c1"
        canUpload={false}
        assessments={avaliacoes}
      />,
    );
    const abrir = screen.getByRole('button', { name: 'Escolher fotos' });
    expect(abrir.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(abrir);
    const foto1 = screen.getByLabelText('Foto 1') as HTMLSelectElement;
    const foto2 = screen.getByLabelText('Foto 2') as HTMLSelectElement;
    expect([foto1.value, foto2.value]).toEqual(['p1', 'p3']);
    // a foto já escolhida do outro lado não pode ser repetida
    expect([...foto1.options].find((o) => o.value === 'p3')?.disabled).toBe(
      true,
    );

    fireEvent.change(foto1, { target: { value: 'p2' } });
    expect(srcs()).toEqual(['/api/photos/p2', '/api/photos/p3']);
    expect(within(painel()).getAllByText(/^Foto [12] — /)).toHaveLength(2);

    // trocar o lado 2 para uma foto mais antiga inverte a exibição, sem inverter a regra
    fireEvent.change(screen.getByLabelText('Foto 2'), {
      target: { value: 'p1' },
    });
    expect(srcs()).toEqual(['/api/photos/p1', '/api/photos/p2']);
  });

  it('Dado a escolha feita, Quando voltar a primeira × última, Então restaura o padrão e fecha os seletores', () => {
    state.photos = fotos;
    render(<ConditionPhotos conditionId="c1" canUpload={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Escolher fotos' }));
    fireEvent.change(screen.getByLabelText('Foto 1'), {
      target: { value: 'p2' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Voltar a primeira × última' }),
    );
    expect(srcs()).toEqual(['/api/photos/p1', '/api/photos/p3']);
    expect(screen.queryByLabelText('Foto 1')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Escolher fotos' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });
});
