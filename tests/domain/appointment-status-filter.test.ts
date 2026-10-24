import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUS_FILTER,
  parseStatusFilter,
  serializeStatusFilter,
  toggleStatus,
} from '@/domain/scheduling/appointment-status-filter';

describe('Feature: Filtro de status da agenda (#538)', () => {
  describe('Cenário: padrão (AGE-FLT-02)', () => {
    it('Dado nenhum parâmetro, Quando interpretar, Então todos os status menos cancelada', () => {
      expect(DEFAULT_STATUS_FILTER).toEqual([
        'scheduled',
        'confirmed',
        'completed',
        'no_show',
      ]);
      expect(parseStatusFilter(null)).toEqual(DEFAULT_STATUS_FILTER);
      expect(parseStatusFilter(undefined)).toEqual(DEFAULT_STATUS_FILTER);
    });
  });

  describe('Cenário: valor na URL (AGE-FLT-01, AGE-FLT-04)', () => {
    it('Dado lista válida, Quando interpretar, Então mantém a ordem canônica e sem repetição', () => {
      expect(parseStatusFilter('no_show,confirmed,confirmed')).toEqual([
        'confirmed',
        'no_show',
      ]);
    });

    it('Dado parâmetro vazio, Quando interpretar, Então nenhum status marcado', () => {
      expect(parseStatusFilter('')).toEqual([]);
    });

    it('Dado valor inválido, Quando interpretar, Então cai no padrão', () => {
      expect(parseStatusFilter('xyz')).toEqual(DEFAULT_STATUS_FILTER);
      expect(parseStatusFilter('xyz,abc')).toEqual(DEFAULT_STATUS_FILTER);
    });

    it('Dado mistura de válido e inválido, Quando interpretar, Então ignora só o inválido', () => {
      expect(parseStatusFilter('completed,xyz')).toEqual(['completed']);
    });

    it('Dado cancelada explícita, Quando interpretar, Então ela entra', () => {
      expect(parseStatusFilter('cancelled')).toEqual(['cancelled']);
    });
  });

  describe('Cenário: serialização', () => {
    it('Dado o padrão, Quando serializar, Então omite o parâmetro', () => {
      expect(serializeStatusFilter(DEFAULT_STATUS_FILTER)).toBeNull();
    });

    it('Dado recorte diferente do padrão, Quando serializar, Então lista em ordem canônica', () => {
      expect(serializeStatusFilter(['no_show', 'completed'])).toBe(
        'completed,no_show',
      );
    });

    it('Dado nenhum status, Quando serializar, Então parâmetro vazio', () => {
      expect(serializeStatusFilter([])).toBe('');
    });
  });

  describe('Cenário: alternar chip', () => {
    it('Dado status marcado, Quando alternar, Então desmarca', () => {
      expect(toggleStatus(['confirmed', 'no_show'], 'no_show')).toEqual([
        'confirmed',
      ]);
    });

    it('Dado status desmarcado, Quando alternar, Então marca em ordem canônica', () => {
      expect(toggleStatus(['no_show'], 'scheduled')).toEqual([
        'scheduled',
        'no_show',
      ]);
    });
  });
});
