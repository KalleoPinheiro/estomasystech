import { describe, expect, it } from 'vitest';
import type { AssessmentDto } from '@/lib/dto';
import { timeSummary, tissueProfile } from '@/lib/wound-time-summary';

const base = { id: 'a1' } as AssessmentDto;

describe('Feature: Resumo do TIME na tabela de avaliações (#464)', () => {
  it('Dado avaliação sem TIME, Quando resumir, Então traço e sem perfil de tecido', () => {
    expect(timeSummary(base)).toBe('—');
    expect(tissueProfile(base)).toBeNull();
  });

  it('Dado infecção e bordas, Quando resumir, Então junta os dois com rótulo em pt-BR', () => {
    expect(
      timeSummary({
        ...base,
        infectionLevel: 'spreading',
        woundEdges: 'undermined',
      }),
    ).toBe('Infecção com disseminação · Bordas: solapadas');
  });

  it('Dado só bordas, Quando resumir, Então mostra apenas as bordas', () => {
    expect(timeSummary({ ...base, woundEdges: 'attached' })).toBe(
      'Bordas: aderidas',
    );
  });

  it('Dado código fora do vocabulário (dado legado), Quando resumir, Então mostra o código cru', () => {
    expect(
      timeSummary({ ...base, infectionLevel: 'x1', woundEdges: 'Y2' }),
    ).toBe('x1 · Bordas: y2');
  });

  it('Dado percentuais, Quando montar o perfil, Então lista só os informados, inclusive 0%', () => {
    expect(
      tissueProfile({
        ...base,
        granulationPct: 70,
        epithelialPct: 0,
        necroticPct: 30,
      }),
    ).toBe('Granulação 70% · Epitelização 0% · Necrose 30%');
  });
});
