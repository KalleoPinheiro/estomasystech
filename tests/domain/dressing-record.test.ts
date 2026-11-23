import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DRESSING_TEXT_MAX,
  DRESSING_TEXT_TOO_LONG_MESSAGE,
  type DressingContent,
  DressingRecord,
  NEXT_CHANGE_INVALID_MESSAGE,
  NEXT_CHANGE_REQUIRED_MESSAGE,
  PAIN_INVALID_MESSAGE,
  PRIMARY_COVER_REQUIRED_MESSAGE,
} from '@/domain/clinical/dressing-record';
import { ValidationError } from '@/domain/shared/errors';

/**
 * Registro do curativo em etapas (#963, T1): etapas estruturadas, imutável
 * depois de salvo. Só cobertura primária e próxima troca são obrigatórias (D3);
 * ferida opcional (D7); limpeza, desbridamento e adjuvante em texto livre (D8).
 */

const empty: DressingContent = {
  painBefore: null,
  removal: null,
  cleansingMethod: null,
  cleansingSolution: null,
  debridementType: null,
  debridementResult: null,
  adjuvantTherapy: null,
  periwoundProtection: null,
  primaryCover: 'Hidrofibra com prata',
  secondaryCover: null,
  fixation: null,
  guidance: null,
  painAfter: null,
  nextChangeOn: '2026-11-26',
};

const create = (content: Partial<DressingContent> = {}, extra = {}) =>
  DressingRecord.create({
    patientId: 'pac-1',
    appointmentId: 'cons-1',
    content: { ...empty, ...content },
    ...extra,
  });

const rejects = (fn: () => unknown, message: string) => {
  expect(fn).toThrow(ValidationError);
  expect(fn).toThrow(message);
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Feature: registro do curativo em etapas (#963)', () => {
  it('Dado as etapas preenchidas, Quando cria, Então guarda cada uma aparada, com id e data', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T13:00:00Z'));

    const record = create(
      {
        painBefore: 7,
        removal: '  Removida com SF 0,9%  ',
        cleansingMethod: ' Irrigação ',
        cleansingSolution: ' PHMB ',
        debridementType: ' Instrumental conservador ',
        debridementResult: ' Esfacelo removido ',
        adjuvantTherapy: ' Laser ',
        periwoundProtection: ' Película de polímero ',
        primaryCover: '  Alginato de cálcio  ',
        secondaryCover: ' Gaze ',
        fixation: ' Atadura de crepom ',
        guidance: ' Manter o membro elevado ',
        painAfter: 3,
        nextChangeOn: ' 2026-11-26 ',
      },
      { conditionId: ' ferida-1 ', professionalId: ' prof-1 ' },
    );

    expect(record.id).toMatch(/\S{8,}/);
    expect(record.createdAt).toEqual(new Date('2026-11-23T13:00:00Z'));
    expect(record.patientId).toBe('pac-1');
    expect(record.appointmentId).toBe('cons-1');
    expect(record.conditionId).toBe('ferida-1');
    expect(record.professionalId).toBe('prof-1');
    expect(record.content).toEqual({
      painBefore: 7,
      removal: 'Removida com SF 0,9%',
      cleansingMethod: 'Irrigação',
      cleansingSolution: 'PHMB',
      debridementType: 'Instrumental conservador',
      debridementResult: 'Esfacelo removido',
      adjuvantTherapy: 'Laser',
      periwoundProtection: 'Película de polímero',
      primaryCover: 'Alginato de cálcio',
      secondaryCover: 'Gaze',
      fixation: 'Atadura de crepom',
      guidance: 'Manter o membro elevado',
      painAfter: 3,
      nextChangeOn: '2026-11-26',
    });
  });

  it('Dado só a cobertura primária e a próxima troca, Quando cria, Então o resto fica nulo e ferida e autor também', () => {
    const record = create({
      removal: '   ',
      guidance: '',
    });

    expect(record.content).toEqual(empty);
    expect(record.conditionId).toBeNull();
    expect(record.professionalId).toBeNull();
    expect(
      create({}, { conditionId: '  ', professionalId: '' }).conditionId,
    ).toBeNull();
    expect(
      create({}, { conditionId: null, professionalId: null }).professionalId,
    ).toBeNull();
  });

  it('Dado dois registros, Quando cria, Então cada um tem o seu id', () => {
    expect(create().id).not.toBe(create().id);
  });

  it('Dado sem paciente ou sem consulta, Quando cria, Então recusa', () => {
    const base = {
      patientId: 'pac-1',
      appointmentId: 'cons-1',
      content: empty,
    };
    rejects(
      () => DressingRecord.create({ ...base, patientId: '  ' }),
      'Paciente é obrigatório',
    );
    rejects(
      () => DressingRecord.create({ ...base, appointmentId: '' }),
      'Consulta é obrigatória',
    );
  });

  it('Dado cobertura primária em branco, Quando cria, Então pede a cobertura', () => {
    rejects(
      () => create({ primaryCover: '   ' }),
      PRIMARY_COVER_REQUIRED_MESSAGE,
    );
  });

  it('Dado próxima troca vazia, fora do formato ou inexistente, Quando cria, Então recusa com a mensagem certa', () => {
    rejects(() => create({ nextChangeOn: '  ' }), NEXT_CHANGE_REQUIRED_MESSAGE);
    for (const value of [
      '26/11/2026',
      '2026-11-26T00:00',
      'x2026-11-26',
      '2026-11-26x',
      '2026-1-26',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
    ]) {
      rejects(
        () => create({ nextChangeOn: value }),
        NEXT_CHANGE_INVALID_MESSAGE,
      );
    }
    expect(create({ nextChangeOn: '2028-02-29' }).content?.nextChangeOn).toBe(
      '2028-02-29',
    );
    expect(create({ nextChangeOn: '2026-12-31' }).content?.nextChangeOn).toBe(
      '2026-12-31',
    );
  });

  it('Dado dor fora de 0 a 10 ou fracionada, Quando cria, Então recusa; nos limites aceita', () => {
    for (const value of [-1, 11, 2.5, Number.NaN]) {
      rejects(() => create({ painBefore: value }), PAIN_INVALID_MESSAGE);
      rejects(() => create({ painAfter: value }), PAIN_INVALID_MESSAGE);
    }
    const limits = create({ painBefore: 0, painAfter: 10 });
    expect(limits.content?.painBefore).toBe(0);
    expect(limits.content?.painAfter).toBe(10);
  });

  it('Dado etapa acima do limite, Quando cria, Então recusa; no limite aceita', () => {
    const atLimit = 'a'.repeat(DRESSING_TEXT_MAX);
    const over = `${atLimit}a`;
    expect(create({ guidance: atLimit }).content?.guidance).toBe(atLimit);
    expect(create({ primaryCover: ` ${atLimit} ` }).content?.primaryCover).toBe(
      atLimit,
    );
    rejects(() => create({ removal: over }), DRESSING_TEXT_TOO_LONG_MESSAGE);
    rejects(
      () => create({ primaryCover: over }),
      DRESSING_TEXT_TOO_LONG_MESSAGE,
    );
  });

  it('Dado estado salvo, Quando restaura, Então devolve igual, inclusive conteúdo apagado pela retenção', () => {
    const createdAt = new Date('2026-11-01T10:00:00Z');
    const restored = DressingRecord.restore({
      id: 'cur-1',
      patientId: 'pac-1',
      appointmentId: 'cons-1',
      conditionId: 'ferida-1',
      professionalId: 'prof-1',
      createdAt,
      content: empty,
    });
    expect(restored.id).toBe('cur-1');
    expect(restored.createdAt).toBe(createdAt);
    expect(restored.conditionId).toBe('ferida-1');
    expect(restored.professionalId).toBe('prof-1');
    expect(restored.content).toEqual(empty);

    const anonymized = DressingRecord.restore({
      id: 'cur-2',
      patientId: 'pac-1',
      appointmentId: 'cons-1',
      createdAt,
      content: null,
    });
    expect(anonymized.content).toBeNull();
    expect(anonymized.conditionId).toBeNull();
    expect(anonymized.professionalId).toBeNull();
  });
});
