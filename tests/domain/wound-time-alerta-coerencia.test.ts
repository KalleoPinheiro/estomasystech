import { describe, expect, it } from 'vitest';
import {
  infectionCoherenceWarnings,
  isInfectionAlertLevel,
} from '@/domain/clinical/wound-time';

describe('Feature: infecção local ou pior gera alerta (ADR-063)', () => {
  it.each(['local', 'spreading', 'systemic'])(
    'Dado o nível %s, Quando conferir, Então gera alerta',
    (level) => {
      expect(isInfectionAlertLevel(level)).toBe(true);
    },
  );

  it.each(['none', 'inflammation', null, undefined, 'outro'])(
    'Dado o nível %s, Quando conferir, Então não gera alerta',
    (level) => {
      expect(isInfectionAlertLevel(level)).toBe(false);
    },
  );
});

describe('Feature: coerência nível × sinais é aviso, não bloqueio (ADR-063)', () => {
  it('Dado nível vazio ou desconhecido, Quando conferir, Então sem avisos', () => {
    expect(infectionCoherenceWarnings(null, 'fever')).toEqual([]);
    expect(infectionCoherenceWarnings('', 'fever')).toEqual([]);
    expect(infectionCoherenceWarnings('grave', 'fever')).toEqual([]);
  });

  it('Dado sem infecção com sinais marcados, Quando conferir, Então avisa', () => {
    expect(infectionCoherenceWarnings('none', 'erythema')).toEqual([
      'Há sinais marcados, mas o nível é «sem sinais de infecção».',
    ]);
  });

  it('Dado sem infecção e sem sinais, Quando conferir, Então sem avisos', () => {
    expect(infectionCoherenceWarnings('none', null)).toEqual([]);
    expect(infectionCoherenceWarnings('inflammation', 'erythema')).toEqual([]);
  });

  it('Dado infecção local sem nenhum sinal, Quando conferir, Então avisa', () => {
    expect(infectionCoherenceWarnings('local', '')).toEqual([
      'O nível indica infecção, mas nenhum sinal foi marcado.',
    ]);
  });

  it('Dado infecção local com sinal local, Quando conferir, Então sem avisos', () => {
    expect(infectionCoherenceWarnings('local', 'malodor, heat')).toEqual([]);
  });

  it('Dado sinal de disseminação com nível local, Quando conferir, Então sugere nível maior', () => {
    expect(infectionCoherenceWarnings('local', 'lymphangitis')).toEqual([
      'Há sinais de disseminação; confira se o nível não deveria ser «infecção com disseminação» ou pior.',
    ]);
  });

  it('Dado febre com nível de disseminação, Quando conferir, Então sugere sistêmica', () => {
    expect(infectionCoherenceWarnings('spreading', 'fever')).toEqual([
      'Há sinais sistêmicos (febre ou mal-estar); confira se o nível não deveria ser «infecção sistêmica».',
    ]);
  });

  it('Dado infecção sistêmica com febre, Quando conferir, Então sem avisos', () => {
    expect(infectionCoherenceWarnings('systemic', 'fever,malaise')).toEqual([]);
  });
});
