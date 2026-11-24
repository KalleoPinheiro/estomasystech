import { describe, expect, it } from 'vitest';
import {
  type DressingContent,
  type DressingLaser,
  DressingRecord,
  LASER_JOULES_INVALID_MESSAGE,
  LASER_POINTS_INVALID_MESSAGE,
  LASER_REGION_LABELS,
  LASER_REGIONS,
  LASER_WAVELENGTH_INVALID_MESSAGE,
  type LaserRegion,
} from '@/domain/clinical/dressing-record';

const base: DressingContent = {
  painBefore: null,
  removal: null,
  cleansingMethod: null,
  cleansingSolution: null,
  debridementType: null,
  debridementResult: null,
  adjuvantTherapy: null,
  periwoundProtection: null,
  primaryCover: 'Alginato',
  secondaryCover: null,
  fixation: null,
  guidance: null,
  painAfter: null,
  nextChangeOn: '2026-12-01',
};

const noLaser: DressingLaser = {
  bed: null,
  edge: null,
  periwound: null,
  pdt: false,
  ilib: false,
};

const contentOf = (laser: DressingLaser | null | undefined) =>
  DressingRecord.create({
    patientId: 'p-1',
    appointmentId: 'a-1',
    content: { ...base, laser },
  }).content;

const region = (partial: Partial<LaserRegion>): LaserRegion => ({
  wavelengthNm: null,
  joulesPerPoint: null,
  points: null,
  ...partial,
});

describe('Feature: laser no curativo (#963, T3; D5 número livre, PDT e ILIB sim/não)', () => {
  it('Dado laser no leito e na borda com ILIB, Quando cria, Então guarda o que foi informado e a periferia fica vazia', () => {
    const laser: DressingLaser = {
      ...noLaser,
      bed: region({ wavelengthNm: 660, joulesPerPoint: 1, points: 8 }),
      edge: region({ wavelengthNm: 808, joulesPerPoint: 2.5, points: 12 }),
      periwound: region({}),
      ilib: true,
    };

    expect(contentOf(laser)?.laser).toEqual({
      bed: { wavelengthNm: 660, joulesPerPoint: 1, points: 8 },
      edge: { wavelengthNm: 808, joulesPerPoint: 2.5, points: 12 },
      periwound: null,
      pdt: false,
      ilib: true,
    });
  });

  it('Dado só PDT, Quando cria, Então o laser fica com PDT e sem região', () => {
    expect(contentOf({ ...noLaser, pdt: true })?.laser).toEqual({
      ...noLaser,
      pdt: true,
    });
  });

  it('Dado região com só um parâmetro, Quando cria, Então aceita o parcial', () => {
    expect(
      contentOf({ ...noLaser, periwound: region({ points: 4 }) })?.laser
        ?.periwound,
    ).toEqual(region({ points: 4 }));
  });

  it.each([
    ['sem laser', undefined],
    ['laser nulo', null],
    ['laser sem nada marcado', noLaser],
    ['regiões vazias', { ...noLaser, bed: region({}), edge: region({}) }],
  ])('Dado %s, Quando cria, Então o conteúdo não tem laser', (_, laser) => {
    expect(contentOf(laser)).not.toHaveProperty('laser');
  });

  it.each([
    [{ wavelengthNm: 0 }, LASER_WAVELENGTH_INVALID_MESSAGE],
    [{ wavelengthNm: 660.5 }, LASER_WAVELENGTH_INVALID_MESSAGE],
    [{ wavelengthNm: 10_001 }, LASER_WAVELENGTH_INVALID_MESSAGE],
    [{ wavelengthNm: Number.NaN }, LASER_WAVELENGTH_INVALID_MESSAGE],
    [{ joulesPerPoint: 0 }, LASER_JOULES_INVALID_MESSAGE],
    [{ joulesPerPoint: 1001 }, LASER_JOULES_INVALID_MESSAGE],
    [
      { joulesPerPoint: Number.POSITIVE_INFINITY },
      LASER_JOULES_INVALID_MESSAGE,
    ],
    [{ points: 0 }, LASER_POINTS_INVALID_MESSAGE],
    [{ points: 2.5 }, LASER_POINTS_INVALID_MESSAGE],
    [{ points: 1001 }, LASER_POINTS_INVALID_MESSAGE],
  ])(
    'Dado parâmetro inválido %o, Quando cria, Então recusa',
    (partial, message) => {
      expect(() => contentOf({ ...noLaser, edge: region(partial) })).toThrow(
        message,
      );
    },
  );

  it('Dados os limites exatos, Quando cria, Então aceita', () => {
    const limits = region({
      wavelengthNm: 10_000,
      joulesPerPoint: 1000,
      points: 1000,
    });

    expect(contentOf({ ...noLaser, bed: limits })?.laser?.bed).toEqual(limits);
  });

  it('Dadas as regiões, Quando busca o rótulo, Então são leito, borda e periferia', () => {
    expect(LASER_REGIONS.map((key) => LASER_REGION_LABELS[key])).toEqual([
      'Leito',
      'Borda',
      'Periferia',
    ]);
  });
});
