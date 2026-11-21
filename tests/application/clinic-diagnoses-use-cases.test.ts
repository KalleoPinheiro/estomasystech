import { beforeEach, describe, expect, it } from 'vitest';
import { AddCarePlanDiagnosis } from '@/application/clinical/add-care-plan-diagnosis';
import {
  CreateClinicDiagnosis,
  ImportClinicDiagnoses,
  ListClinicDiagnoses,
  SearchClinicDiagnoses,
  SetClinicDiagnosisActive,
} from '@/application/taxonomy/clinic-diagnoses';
import { CarePlan } from '@/domain/clinical/care-plan';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import type { ClinicNursingDiagnosisRepository } from '@/domain/taxonomy/taxonomy-repositories';
import {
  InMemoryCarePlanDiagnosisRepository,
  InMemoryCarePlanRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-care-plan-repositories';
import {
  InMemoryClinicDiagnosisRepository,
  InMemoryNursingDiagnosisRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-taxonomy-repositories';

const CLINIC = 'clinic-a';

describe('Feature: catálogo de diagnósticos da clínica — casos de uso (#954)', () => {
  let repo: InMemoryClinicDiagnosisRepository;

  beforeEach(() => {
    repo = new InMemoryClinicDiagnosisRepository();
  });

  it('Dado um título novo, Quando cadastrar, Então entra no catálogo e na lista', async () => {
    const created = await new CreateClinicDiagnosis(repo).execute({
      clinicId: CLINIC,
      code: '00046',
      label: 'Integridade da pele prejudicada',
    });
    const list = await new ListClinicDiagnoses(repo).execute();
    expect(list.map((item) => item.id)).toEqual([created.id]);
  });

  it('Dado título já cadastrado com outra caixa, Quando cadastrar, Então recusa por duplicidade', async () => {
    const create = new CreateClinicDiagnosis(repo);
    await create.execute({ clinicId: CLINIC, label: 'Dor aguda' });
    await expect(
      create.execute({ clinicId: CLINIC, label: '  DOR   aguda ' }),
    ).rejects.toThrow(ConflictError);
    expect(await repo.list()).toHaveLength(1);
  });

  it('Dado item ativo, Quando desativar e reativar, Então a busca o esconde e mostra de novo', async () => {
    const created = await new CreateClinicDiagnosis(repo).execute({
      clinicId: CLINIC,
      label: 'Dor aguda',
    });
    const toggle = new SetClinicDiagnosisActive(repo);
    const search = new SearchClinicDiagnoses(repo);

    expect(
      (await toggle.execute({ id: created.id, active: false })).isActive,
    ).toBe(false);
    expect(await search.execute({ term: 'dor' })).toEqual([]);
    expect(
      (await toggle.execute({ id: created.id, active: true })).isActive,
    ).toBe(true);
    expect(
      (await search.execute({ term: 'dor', limit: 5 })).map((d) => d.id),
    ).toEqual([created.id]);
  });

  it('Dado id inexistente, Quando desativar, Então responde não encontrado', async () => {
    await expect(
      new SetClinicDiagnosisActive(repo).execute({ id: 'nope', active: false }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado CSV com linhas válidas, inválidas e repetidas, Quando importar, Então grava só as válidas e relata o resto por linha', async () => {
    await new CreateClinicDiagnosis(repo).execute({
      clinicId: CLINIC,
      label: 'Dor aguda',
    });
    const csv = [
      'codigo;titulo',
      '00046;Integridade da pele prejudicada',
      '123;Código errado',
      ';dor aguda',
      ';Risco de infecção',
      ';Risco  de infecção',
    ].join('\n');

    const result = await new ImportClinicDiagnoses(repo).execute({
      clinicId: CLINIC,
      csv,
    });

    expect(result.created.map((item) => item.label)).toEqual([
      'Integridade da pele prejudicada',
      'Risco de infecção',
    ]);
    expect(result.errors).toEqual([
      { line: 3, message: expect.stringContaining('5 dígitos') },
    ]);
    expect(result.duplicates).toEqual([
      { line: 4, message: '"dor aguda" já está no catálogo' },
      { line: 6, message: '"Risco de infecção" já está no catálogo' },
    ]);
    expect(await repo.list()).toHaveLength(3);
    expect(result.created.every((item) => item.clinicId === CLINIC)).toBe(true);
  });

  it('Dado CSV sem coluna de título, Quando importar, Então recusa sem gravar', async () => {
    await expect(
      new ImportClinicDiagnoses(repo).execute({
        clinicId: CLINIC,
        csv: 'codigo\n00046',
      }),
    ).rejects.toThrow(ValidationError);
    expect(await repo.list()).toEqual([]);
  });

  it('Dado falha inesperada ao montar uma linha, Quando importar, Então propaga o erro', async () => {
    const broken = {
      ...repo,
      list: async () => [],
      saveMany: async () => undefined,
    } as unknown as ClinicNursingDiagnosisRepository;
    await expect(
      new ImportClinicDiagnoses(broken).execute({
        // clinicId inválido em tempo de execução faz a entidade lançar TypeError, não ValidationError.
        clinicId: undefined as unknown as string,
        csv: 'titulo\nDor aguda',
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe('Feature: prescrever diagnóstico do catálogo da clínica ou digitado (#954)', () => {
  let diagnoses: InMemoryCarePlanDiagnosisRepository;
  let carePlans: InMemoryCarePlanRepository;
  let catalog: InMemoryNursingDiagnosisRepository;
  let clinicCatalog: InMemoryClinicDiagnosisRepository;
  let plan: CarePlan;
  const pes = {
    type: 'real' as const,
    relatedFactors: 'Umidade',
    definingCharacteristics: 'Ruptura da epiderme',
  };

  beforeEach(async () => {
    diagnoses = new InMemoryCarePlanDiagnosisRepository();
    carePlans = new InMemoryCarePlanRepository();
    catalog = new InMemoryNursingDiagnosisRepository();
    clinicCatalog = new InMemoryClinicDiagnosisRepository();
    plan = CarePlan.create({ patientId: 'patient-1' });
    await carePlans.save(plan);
    await catalog.save(
      NursingDiagnosis.create({
        code: '00046',
        label: 'Integridade da pele prejudicada',
        domain: 'Segurança/proteção',
        class: 'Lesão física',
        edition: 'NANDA-I 2021-2023',
      }),
    );
  });

  const useCase = () =>
    new AddCarePlanDiagnosis(diagnoses, carePlans, catalog, clinicCatalog);

  it('Dado item ativo do catálogo da clínica, Quando prescrever, Então copia código e título para o plano', async () => {
    const entry = ClinicNursingDiagnosis.create({
      clinicId: CLINIC,
      code: '00312',
      label: 'Lesão por pressão no adulto',
    });
    await clinicCatalog.save(entry);

    const diagnosis = await useCase().execute({
      carePlanId: plan.id,
      clinicDiagnosisId: entry.id,
      ...pes,
    });

    expect(diagnosis.diagnosisCode).toBe('00312');
    expect(diagnosis.diagnosisLabel).toBe('Lesão por pressão no adulto');
    expect(await diagnoses.findByCarePlanId(plan.id)).toHaveLength(1);
  });

  it('Dado item desativado ou inexistente da clínica, Quando prescrever, Então responde não encontrado', async () => {
    const entry = ClinicNursingDiagnosis.create({
      clinicId: CLINIC,
      label: 'Dor aguda',
    }).deactivate();
    await clinicCatalog.save(entry);

    await expect(
      useCase().execute({
        carePlanId: plan.id,
        clinicDiagnosisId: entry.id,
        ...pes,
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      useCase().execute({
        carePlanId: plan.id,
        clinicDiagnosisId: 'nope',
        ...pes,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado caso de uso sem catálogo da clínica, Quando pedir item da clínica, Então responde não encontrado', async () => {
    await expect(
      new AddCarePlanDiagnosis(diagnoses, carePlans, catalog).execute({
        carePlanId: plan.id,
        clinicDiagnosisId: 'qualquer',
        ...pes,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado diagnóstico digitado à mão, Quando prescrever, Então grava sem código', async () => {
    const diagnosis = await useCase().execute({
      carePlanId: plan.id,
      diagnosisLabel: 'Pele periestomal irritada',
      ...pes,
    });
    expect(diagnosis.diagnosisCode).toBeNull();
    expect(diagnosis.diagnosisLabel).toBe('Pele periestomal irritada');
  });

  it('Dado nenhuma origem, Quando prescrever, Então exige o diagnóstico', async () => {
    await expect(
      useCase().execute({ carePlanId: plan.id, ...pes }),
    ).rejects.toThrow('Diagnóstico é obrigatório');
  });

  it('Dado código do catálogo global, Quando prescrever, Então segue como antes, sem título copiado', async () => {
    const diagnosis = await useCase().execute({
      carePlanId: plan.id,
      diagnosisCode: '00046',
      ...pes,
    });
    expect(diagnosis.diagnosisCode).toBe('00046');
    expect(diagnosis.diagnosisLabel).toBeNull();
  });
});
