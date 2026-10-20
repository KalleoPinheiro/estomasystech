import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import { InterventionRecord } from '@/domain/clinical/intervention-record';
import { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import {
  InMemoryCarePlanDiagnosisRepository,
  InMemoryCarePlanInterventionRepository,
  InMemoryCarePlanOutcomeRepository,
  InMemoryCarePlanRepository,
  InMemoryInterventionRecordRepository,
  InMemoryOutcomeEvaluationRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-care-plan-repositories';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T10:00:00Z');

/** Cria na data pedida; o mais recente deve vir primeiro, e empate sai por id. */
const at = <T>(date: Date, make: () => T): T => {
  vi.setSystemTime(date);
  return make();
};
const ids = (items: { id: string }[]) => items.map((i) => i.id);
const tieBreak = (items: { id: string }[]) =>
  [...ids(items)].sort((a, b) => a.localeCompare(b));

describe('Feature: Repositórios em memória do plano de cuidados (SAE) ordenam do mais recente ao mais antigo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Dado planos do paciente e da condição, Quando consultar por condição, Então só os da condição, recentes primeiro e empate por id', async () => {
    const repo = new InMemoryCarePlanRepository();
    const velho = at(T1, () =>
      CarePlan.create({ patientId: 'p1', conditionId: 'c1' }),
    );
    const novo = at(T2, () =>
      CarePlan.create({ patientId: 'p1', conditionId: 'c1' }),
    );
    const gemeo = at(T2, () =>
      CarePlan.create({ patientId: 'p1', conditionId: 'c1' }),
    );
    const outraCondicao = at(T2, () =>
      CarePlan.create({ patientId: 'p1', conditionId: 'c2' }),
    );
    for (const p of [velho, novo, gemeo, outraCondicao]) await repo.save(p);

    const result = await repo.findByConditionId('c1');

    expect(result).toHaveLength(3);
    expect(ids(result).at(-1)).toBe(velho.id);
    expect(ids(result.slice(0, 2))).toEqual(tieBreak(result.slice(0, 2)));
    const doPaciente = await repo.findByPatientId('p1');
    expect(ids(doPaciente.slice(0, 3))).toEqual(
      tieBreak(doPaciente.slice(0, 3)),
    );
  });

  it('Dado diagnósticos de vários planos, Quando consultar por um plano ou por vários, Então ordena por recência e desempata por id', async () => {
    const repo = new InMemoryCarePlanDiagnosisRepository();
    const make = (planId: string) =>
      CarePlanDiagnosis.create({
        carePlanId: planId,
        diagnosisCode: '00046',
        type: 'real',
        relatedFactors: 'pressão',
        definingCharacteristics: 'ferida',
      });
    const velho = at(T1, () => make('a'));
    const novo = at(T2, () => make('a'));
    const gemeo = at(T2, () => make('a'));
    const outro = at(T2, () => make('b'));
    const fora = at(T2, () => make('c'));
    for (const d of [velho, novo, gemeo, outro, fora]) await repo.save(d);

    const porUm = await repo.findByCarePlanId('a');
    const porVarios = await repo.findByCarePlanIds(['a', 'b']);

    expect(ids(porUm).at(-1)).toBe(velho.id);
    expect(ids(porUm.slice(0, 2))).toEqual(tieBreak(porUm.slice(0, 2)));
    expect(porVarios).toHaveLength(4);
    expect(ids(porVarios.slice(0, 3))).toEqual(tieBreak(porVarios.slice(0, 3)));
    expect(ids(porVarios)).not.toContain(fora.id);
  });

  it('Dado resultados NOC prescritos, Quando consultar por plano ou por vários, Então ordena por recência e desempata por id', async () => {
    const repo = new InMemoryCarePlanOutcomeRepository();
    const make = (planId: string) =>
      CarePlanOutcome.create({
        carePlanId: planId,
        outcomeCode: '1101',
        baselineScore: 2,
        targetScore: 4,
      });
    const velho = at(T1, () => make('a'));
    const novo = at(T2, () => make('a'));
    const gemeo = at(T2, () => make('a'));
    const outro = at(T2, () => make('b'));
    for (const o of [velho, novo, gemeo, outro]) await repo.save(o);

    const porUm = await repo.findByCarePlanId('a');
    const porVarios = await repo.findByCarePlanIds(['a', 'b']);

    expect(ids(porUm).at(-1)).toBe(velho.id);
    expect(ids(porUm.slice(0, 2))).toEqual(tieBreak(porUm.slice(0, 2)));
    expect(porVarios).toHaveLength(4);
    expect(ids(porVarios.slice(0, 3))).toEqual(tieBreak(porVarios.slice(0, 3)));
  });

  it('Dado intervenções NIC prescritas, Quando consultar por plano ou por vários, Então ordena por recência e desempata por id', async () => {
    const repo = new InMemoryCarePlanInterventionRepository();
    const make = (planId: string) =>
      CarePlanIntervention.create({
        carePlanId: planId,
        interventionCode: '3660',
        frequency: 'a cada troca',
        priority: 'alta',
      });
    const velho = at(T1, () => make('a'));
    const novo = at(T2, () => make('a'));
    const gemeo = at(T2, () => make('a'));
    const outro = at(T2, () => make('b'));
    for (const i of [velho, novo, gemeo, outro]) await repo.save(i);

    const porUm = await repo.findByCarePlanId('a');
    const porVarios = await repo.findByCarePlanIds(['a', 'b']);

    expect(ids(porUm).at(-1)).toBe(velho.id);
    expect(ids(porUm.slice(0, 2))).toEqual(tieBreak(porUm.slice(0, 2)));
    expect(porVarios).toHaveLength(4);
    expect(ids(porVarios.slice(0, 3))).toEqual(tieBreak(porVarios.slice(0, 3)));
  });

  it('Dado reavaliações NOC, Quando consultar por resultado ou por vários, Então a mais recente vem primeiro e empate sai por id', async () => {
    const repo = new InMemoryOutcomeEvaluationRepository();
    const make = (outcomeId: string) =>
      OutcomeEvaluation.create({ outcomeId, score: 3 });
    const velha = at(T1, () => make('a'));
    const nova = at(T2, () => make('a'));
    const gemea = at(T2, () => make('a'));
    const outra = at(T2, () => make('b'));
    for (const e of [velha, nova, gemea, outra]) await repo.save(e);

    const porUm = await repo.findByOutcomeId('a');
    const porVarios = await repo.findByOutcomeIds(['a', 'b']);

    expect(ids(porUm).at(-1)).toBe(velha.id);
    expect(ids(porUm.slice(0, 2))).toEqual(tieBreak(porUm.slice(0, 2)));
    expect(porVarios).toHaveLength(4);
    expect(ids(porVarios.slice(0, 3))).toEqual(tieBreak(porVarios.slice(0, 3)));
  });

  it('Dado execuções de intervenção, Quando consultar por intervenção ou por várias, Então a mais recente vem primeiro e empate sai por id', async () => {
    const repo = new InMemoryInterventionRecordRepository();
    const make = (interventionId: string) =>
      InterventionRecord.create({ interventionId });
    const velha = at(T1, () => make('a'));
    const nova = at(T2, () => make('a'));
    const gemea = at(T2, () => make('a'));
    const outra = at(T2, () => make('b'));
    for (const r of [velha, nova, gemea, outra]) await repo.save(r);

    const porUma = await repo.findByInterventionId('a');
    const porVarias = await repo.findByInterventionIds(['a', 'b']);

    expect(ids(porUma).at(-1)).toBe(velha.id);
    expect(ids(porUma.slice(0, 2))).toEqual(tieBreak(porUma.slice(0, 2)));
    expect(porVarias).toHaveLength(4);
    expect(ids(porVarias.slice(0, 3))).toEqual(tieBreak(porVarias.slice(0, 3)));
  });
});
