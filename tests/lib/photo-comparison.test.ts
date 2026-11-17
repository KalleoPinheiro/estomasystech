import { describe, expect, it } from 'vitest';
import type { AssessmentDto, ConditionPhotoDto } from '@/lib/dto';
import {
  nearestAssessment,
  resolvePhotoPair,
  sortPhotosChronologically,
} from '@/lib/photo-comparison';

const photo = (
  id: string,
  createdAt: string,
  assessmentId: string | null = null,
): ConditionPhotoDto => ({ id, createdAt, assessmentId }) as ConditionPhotoDto;
const assessment = (id: string, createdAt: string): AssessmentDto =>
  ({ id, createdAt }) as AssessmentDto;

const p1 = photo('p1', '2026-01-01T10:00:00.000Z');
const p2 = photo('p2', '2026-02-01T10:00:00.000Z');
const p3 = photo('p3', '2026-03-01T10:00:00.000Z');

describe('Feature: comparar duas fotos da condição à escolha (#907)', () => {
  describe('sortPhotosChronologically', () => {
    it('ordena da mais antiga para a mais recente, sem alterar a lista original', () => {
      const original = [p3, p1, p2];
      expect(sortPhotosChronologically(original).map((p) => p.id)).toEqual([
        'p1',
        'p2',
        'p3',
      ]);
      expect(original.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
    });

    it('desempata data igual pelo id, de forma estável', () => {
      const a = photo('a', '2026-01-01T10:00:00.000Z');
      const b = photo('b', '2026-01-01T10:00:00.000Z');
      expect(sortPhotosChronologically([b, a]).map((p) => p.id)).toEqual([
        'a',
        'b',
      ]);
    });
  });

  describe('resolvePhotoPair', () => {
    it('sem escolha, o padrão é primeira × última', () => {
      expect(resolvePhotoPair([p1, p2, p3], null)).toEqual({
        before: p1,
        after: p3,
      });
    });

    it('com menos de duas fotos não há comparação', () => {
      expect(resolvePhotoPair([], null)).toBeNull();
      expect(resolvePhotoPair([p1], ['p1', 'p1'])).toBeNull();
    });

    it('escolha válida vale e a mais antiga fica à esquerda, em qualquer ordem', () => {
      expect(resolvePhotoPair([p1, p2, p3], ['p3', 'p2'])).toEqual({
        before: p2,
        after: p3,
      });
      expect(resolvePhotoPair([p1, p2, p3], ['p1', 'p2'])).toEqual({
        before: p1,
        after: p2,
      });
    });

    it('escolha com a mesma foto nos dois lados volta ao padrão', () => {
      expect(resolvePhotoPair([p1, p2, p3], ['p2', 'p2'])).toEqual({
        before: p1,
        after: p3,
      });
    });

    it('escolha que aponta para foto excluída volta ao padrão', () => {
      expect(resolvePhotoPair([p1, p2], ['p1', 'p9'])).toEqual({
        before: p1,
        after: p2,
      });
      expect(resolvePhotoPair([p1, p2], ['p9', 'p1'])).toEqual({
        before: p1,
        after: p2,
      });
    });
  });

  describe('nearestAssessment', () => {
    const a1 = assessment('a1', '2026-01-02T10:00:00.000Z');
    const a2 = assessment('a2', '2026-02-20T10:00:00.000Z');

    it('sem avaliações devolve null', () => {
      expect(nearestAssessment(p1, [])).toBeNull();
    });

    it('usa a avaliação vinculada à foto quando ela existe na lista', () => {
      const linked = photo('p', '2026-01-01T10:00:00.000Z', 'a2');
      expect(nearestAssessment(linked, [a1, a2])).toBe(a2);
    });

    it('vínculo para avaliação fora da lista cai na mais próxima por data', () => {
      const linked = photo('p', '2026-01-01T10:00:00.000Z', 'sumiu');
      expect(nearestAssessment(linked, [a1, a2])).toBe(a1);
    });

    it('sem vínculo, escolhe a mais próxima em qualquer direção', () => {
      expect(nearestAssessment(p1, [a2, a1])).toBe(a1);
      expect(nearestAssessment(p3, [a1, a2])).toBe(a2);
    });
  });
});
