import { afterEach, describe, expect, it, vi } from 'vitest';
import { GetPatientPortalData } from '@/application/portal/get-patient-portal-data';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { NotFoundError } from '@/domain/shared/errors';
import { buildPatient } from '../support/builders';

const condition = (patientId: string, title: string) =>
  ClinicalCondition.create({ patientId, kind: 'wound', title });

const photo = (conditionId: string) =>
  ConditionPhoto.create({
    conditionId,
    contentType: 'image/jpeg',
    sizeBytes: 1000,
  });

/** Repositórios simulados que registram os argumentos de cada leitura. */
function setup(
  options: {
    patient?: ReturnType<typeof buildPatient> | null;
    conditions?: ClinicalCondition[];
    assessments?: ConditionAssessment[];
    photos?: ConditionPhoto[] | null;
  } = {},
) {
  const patient =
    options.patient === undefined ? buildPatient() : options.patient;
  const patients = { findById: vi.fn(async () => patient) };
  const appointments = { findByPatientId: vi.fn(async () => []) };
  const conditions = {
    findByPatientId: vi.fn(async () => options.conditions ?? []),
  };
  const assessments = {
    findByConditionIds: vi.fn(async () => options.assessments ?? []),
  };
  const invoices = { findAll: vi.fn(async () => []) };
  const followUps = { findAll: vi.fn(async () => []) };
  const photos =
    options.photos === null
      ? undefined
      : { findByConditionIds: vi.fn(async () => options.photos ?? []) };
  const useCase = new GetPatientPortalData(
    patients as never,
    appointments as never,
    conditions as never,
    assessments as never,
    invoices as never,
    followUps as never,
    photos as never,
  );
  return {
    patient,
    useCase,
    patients,
    appointments,
    conditions,
    assessments,
    invoices,
    followUps,
    photos,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Feature: portal do paciente só abre o titular ativo e só lê o que é dele', () => {
  it('Dado paciente inexistente, Quando carrega o portal, Então 404 de Paciente com o id pedido e nenhuma outra leitura', async () => {
    const s = setup({ patient: null });

    const error = await s.useCase
      .execute({ patientId: 'id-que-nao-existe' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      entity: 'Paciente',
      entityId: 'id-que-nao-existe',
      message: 'Paciente não encontrado(a)',
    });
    expect(s.appointments.findByPatientId).not.toHaveBeenCalled();
    expect(s.invoices.findAll).not.toHaveBeenCalled();
  });

  it('Dado paciente inativo, Quando carrega o portal, Então também 404 sem ler consultas, faturas nem retornos', async () => {
    const inactive = buildPatient().deactivate();
    const s = setup({ patient: inactive });

    const error = await s.useCase
      .execute({ patientId: inactive.id })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      entity: 'Paciente',
      entityId: inactive.id,
    });
    expect(s.appointments.findByPatientId).not.toHaveBeenCalled();
    expect(s.followUps.findAll).not.toHaveBeenCalled();
  });

  it('Dado paciente ativo, Quando carrega, Então cada leitura é filtrada pelo próprio paciente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
    const s = setup();

    await s.useCase.execute({ patientId: (s.patient as { id: string }).id });

    const id = (s.patient as { id: string }).id;
    expect(s.patients.findById).toHaveBeenCalledWith(id);
    expect(s.conditions.findByPatientId).toHaveBeenCalledWith(id);
    expect(s.invoices.findAll).toHaveBeenCalledWith({ patientId: id });
    expect(s.followUps.findAll).toHaveBeenCalledWith({
      patientId: id,
      status: 'pending',
    });
  });

  it('Dado o histórico de 24 meses, Quando carrega, Então consultas anteriores a 24 meses atrás não entram', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
    const s = setup();

    await s.useCase.execute({ patientId: (s.patient as { id: string }).id });

    const [, filter] = s.appointments.findByPatientId.mock
      .calls[0] as unknown as [string, { endsAfter: Date }];
    // 31/10/2024 no relógio da clínica (America/Sao_Paulo, UTC-3) = 12:00 local.
    const diffDays =
      (new Date('2026-10-31T15:00:00Z').getTime() -
        filter.endsAfter.getTime()) /
      86_400_000;
    expect(Math.round(diffDays)).toBe(730);
    expect(filter.endsAfter.getTime()).toBeLessThan(
      new Date('2026-10-31T15:00:00Z').getTime(),
    );
  });
});

describe('Feature: portal do paciente agrupa avaliações e fotos por condição', () => {
  it('Dado duas condições com avaliações e fotos, Quando carrega, Então cada uma traz só as suas, na ordem em que vieram', async () => {
    const patient = buildPatient();
    const a = condition(patient.id, 'Ferida A');
    const b = condition(patient.id, 'Ferida B');
    const c = condition(patient.id, 'Ferida sem nada');
    const a1 = ConditionAssessment.create({
      conditionId: a.id,
      exudate: 'high',
    });
    const a2 = ConditionAssessment.create({
      conditionId: a.id,
      exudate: 'low',
    });
    const b1 = ConditionAssessment.create({
      conditionId: b.id,
      exudate: 'low',
    });
    const pa1 = photo(a.id);
    const pa2 = photo(a.id);
    const pb1 = photo(b.id);
    const s = setup({
      patient,
      conditions: [a, b, c],
      assessments: [a1, b1, a2],
      photos: [pa1, pb1, pa2],
    });

    const data = await s.useCase.execute({ patientId: patient.id });

    expect(s.assessments.findByConditionIds).toHaveBeenCalledWith([
      a.id,
      b.id,
      c.id,
    ]);
    expect(s.photos?.findByConditionIds).toHaveBeenCalledWith([
      a.id,
      b.id,
      c.id,
    ]);
    expect(data.conditions.map((entry) => entry.condition.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
    expect(data.conditions[0].assessments).toEqual([a1, a2]);
    expect(data.conditions[0].photos).toEqual([pa1, pa2]);
    expect(data.conditions[1].assessments).toEqual([b1]);
    expect(data.conditions[1].photos).toEqual([pb1]);
    expect(data.conditions[2].assessments).toEqual([]);
    expect(data.conditions[2].photos).toEqual([]);
  });

  it('Dado portal sem repositório de fotos, Quando carrega, Então as condições vêm com lista de fotos vazia e as avaliações continuam', async () => {
    const patient = buildPatient();
    const a = condition(patient.id, 'Ferida A');
    const a1 = ConditionAssessment.create({
      conditionId: a.id,
      exudate: 'low',
    });
    const s = setup({
      patient,
      conditions: [a],
      assessments: [a1],
      photos: null,
    });

    const data = await s.useCase.execute({ patientId: patient.id });

    expect(data.conditions).toHaveLength(1);
    expect(data.conditions[0].photos).toEqual([]);
    expect(data.conditions[0].assessments).toEqual([a1]);
  });

  it('Dado paciente sem condições, Quando carrega, Então a lista vem vazia e devolve o titular, consultas, faturas e retornos lidos', async () => {
    const patient = buildPatient();
    const s = setup({ patient });
    const appointment = { id: 'a1' };
    const invoice = { id: 'i1' };
    const followUp = { id: 'f1' };
    s.appointments.findByPatientId.mockResolvedValue([appointment] as never);
    s.invoices.findAll.mockResolvedValue([invoice] as never);
    s.followUps.findAll.mockResolvedValue([followUp] as never);

    const data = await s.useCase.execute({ patientId: patient.id });

    expect(data.patient).toBe(patient);
    expect(data.conditions).toEqual([]);
    expect(data.appointments).toEqual([appointment]);
    expect(data.invoices).toEqual([invoice]);
    expect(data.followUps).toEqual([followUp]);
  });
});
