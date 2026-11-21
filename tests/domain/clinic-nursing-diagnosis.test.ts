import { describe, expect, it } from 'vitest';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { ValidationError } from '@/domain/shared/errors';
import {
  CLINIC_DIAGNOSIS_CSV_MAX_ROWS,
  parseClinicDiagnosisCsv,
} from '@/domain/taxonomy/clinic-diagnosis-csv';
import {
  ClinicNursingDiagnosis,
  clinicDiagnosisKey,
} from '@/domain/taxonomy/clinic-nursing-diagnosis';

const base = { clinicId: 'clinic-a', label: 'Integridade da pele prejudicada' };

describe('Feature: catálogo de diagnósticos da clínica (#954)', () => {
  it('Dado só o título, Quando criar, Então os opcionais ficam nulos e o item nasce ativo', () => {
    const diagnosis = ClinicNursingDiagnosis.create(base);
    expect(diagnosis.id).toEqual(expect.any(String));
    expect(diagnosis.clinicId).toBe('clinic-a');
    expect(diagnosis.code).toBeNull();
    expect(diagnosis.label).toBe('Integridade da pele prejudicada');
    expect(diagnosis.domain).toBeNull();
    expect(diagnosis.class).toBeNull();
    expect(diagnosis.edition).toBeNull();
    expect(diagnosis.definition).toBeNull();
    expect(diagnosis.isActive).toBe(true);
    expect(diagnosis.createdAt).toBeInstanceOf(Date);
  });

  it('Dado todos os campos com espaços, Quando criar, Então guarda o texto aparado', () => {
    const diagnosis = ClinicNursingDiagnosis.create({
      clinicId: 'clinic-a',
      code: ' 00046 ',
      label: '  Integridade   da pele  ',
      domain: ' Segurança/proteção ',
      class: ' Lesão física ',
      edition: ' NANDA-I 2024-2026 ',
      definition: ' Epiderme e/ou derme alteradas ',
    });
    expect(diagnosis.code).toBe('00046');
    expect(diagnosis.label).toBe('Integridade da pele');
    expect(diagnosis.domain).toBe('Segurança/proteção');
    expect(diagnosis.class).toBe('Lesão física');
    expect(diagnosis.edition).toBe('NANDA-I 2024-2026');
    expect(diagnosis.definition).toBe('Epiderme e/ou derme alteradas');
  });

  it('Dado código em branco, Quando criar, Então fica sem código', () => {
    expect(
      ClinicNursingDiagnosis.create({ ...base, code: '  ' }).code,
    ).toBeNull();
  });

  it.each([
    ['empresa vazia', { ...base, clinicId: ' ' }, 'Empresa é obrigatória'],
    ['código com 4 dígitos', { ...base, code: '0046' }, '5 dígitos'],
    ['código com letra', { ...base, code: '0004a' }, '5 dígitos'],
    [
      'título vazio',
      { ...base, label: '   ' },
      'Título do diagnóstico é obrigatório',
    ],
    ['título longo', { ...base, label: 'x'.repeat(201) }, 'no máximo 200'],
    [
      'domínio longo',
      { ...base, domain: 'x'.repeat(121) },
      'Domínio deve ter no máximo 120',
    ],
    [
      'classe longa',
      { ...base, class: 'x'.repeat(121) },
      'Classe deve ter no máximo 120',
    ],
    [
      'edição longa',
      { ...base, edition: 'x'.repeat(121) },
      'Edição deve ter no máximo 120',
    ],
    [
      'definição longa',
      { ...base, definition: 'x'.repeat(2001) },
      'Definição deve ter no máximo 2000',
    ],
  ])('Dado %s, Quando criar, Então recusa', (_caso, props, message) => {
    expect(() => ClinicNursingDiagnosis.create(props)).toThrow(ValidationError);
    expect(() => ClinicNursingDiagnosis.create(props)).toThrow(message);
  });

  it('Dado limites exatos, Quando criar, Então aceita', () => {
    const diagnosis = ClinicNursingDiagnosis.create({
      ...base,
      label: 'x'.repeat(200),
      domain: 'd'.repeat(120),
      definition: 'y'.repeat(2000),
    });
    expect(diagnosis.label).toHaveLength(200);
    expect(diagnosis.domain).toHaveLength(120);
    expect(diagnosis.definition).toHaveLength(2000);
  });

  it('Dado item ativo, Quando desativar e reativar, Então troca o estado sem mudar o original', () => {
    const diagnosis = ClinicNursingDiagnosis.create(base);
    const inactive = diagnosis.deactivate();
    expect(inactive.isActive).toBe(false);
    expect(diagnosis.isActive).toBe(true);
    expect(inactive.reactivate().isActive).toBe(true);
    expect(inactive.id).toBe(diagnosis.id);
  });

  it('Dado estado gravado, Quando restaurar, Então devolve os mesmos campos', () => {
    const state = {
      id: 'd1',
      clinicId: 'clinic-a',
      code: null,
      label: 'Dor crônica',
      domain: null,
      class: null,
      edition: null,
      definition: null,
      active: false,
      createdAt: new Date('2026-11-20T00:00:00Z'),
    };
    const diagnosis = ClinicNursingDiagnosis.restore(state);
    expect(diagnosis.id).toBe('d1');
    expect(diagnosis.isActive).toBe(false);
    expect(diagnosis.createdAt).toEqual(state.createdAt);
  });

  it('Dado títulos com caixa e espaços diferentes, Quando comparar a chave, Então são o mesmo item', () => {
    expect(clinicDiagnosisKey('  Dor   AGUDA ')).toBe('dor aguda');
    expect(
      ClinicNursingDiagnosis.create({ ...base, label: 'Dor Aguda' }).key,
    ).toBe(clinicDiagnosisKey('dor aguda'));
  });
});

describe('Feature: importação CSV do catálogo da clínica (#954)', () => {
  it('Dado CSV do Excel com ponto e vírgula e BOM, Quando ler, Então mapeia as colunas por nome sem acento', () => {
    const csv =
      '﻿Código;Título;Domínio;Classe;Edição;Definição\r\n00046;Integridade da pele prejudicada;Segurança;Lesão física;NANDA-I 2024-2026;Pele alterada\r\n;Risco de infecção;;;;\r\n';
    expect(parseClinicDiagnosisCsv(csv)).toEqual([
      {
        line: 2,
        code: '00046',
        label: 'Integridade da pele prejudicada',
        domain: 'Segurança',
        class: 'Lesão física',
        edition: 'NANDA-I 2024-2026',
        definition: 'Pele alterada',
      },
      {
        line: 3,
        code: null,
        label: 'Risco de infecção',
        domain: null,
        class: null,
        edition: null,
        definition: null,
      },
    ]);
  });

  it('Dado CSV com vírgula, aspas e quebra de linha no campo, Quando ler, Então respeita as aspas', () => {
    const csv =
      'titulo,definicao,observacao\n"Dor aguda, intensa","Linha 1\nLinha ""2""",ignorada\n';
    expect(parseClinicDiagnosisCsv(csv)).toEqual([
      {
        line: 2,
        code: null,
        label: 'Dor aguda, intensa',
        domain: null,
        class: null,
        edition: null,
        definition: 'Linha 1\nLinha "2"',
      },
    ]);
  });

  it('Dado coluna "diagnostico" e linhas em branco no meio, Quando ler, Então usa como título e numera pela linha do arquivo', () => {
    const rows = parseClinicDiagnosisCsv(
      'Diagnostico\nDor aguda\n\n  \nAnsiedade\n',
    );
    expect(rows.map((row) => [row.line, row.label])).toEqual([
      [2, 'Dor aguda'],
      [5, 'Ansiedade'],
    ]);
  });

  it('Dado coluna repetida, Quando ler, Então vale a primeira', () => {
    const rows = parseClinicDiagnosisCsv('titulo;titulo\nPrimeiro;Segundo\n');
    expect(rows[0]?.label).toBe('Primeiro');
  });

  it('Dado linha com menos colunas que o cabeçalho, Quando ler, Então o que falta fica vazio', () => {
    const rows = parseClinicDiagnosisCsv('codigo;titulo\n00046\n');
    expect(rows[0]).toMatchObject({ code: '00046', label: '' });
  });

  it('Dado arquivo sem coluna de título, Quando ler, Então recusa explicando o formato', () => {
    expect(() => parseClinicDiagnosisCsv('codigo;nome\n00046;Dor\n')).toThrow(
      'O arquivo precisa de uma coluna "titulo"',
    );
  });

  it('Dado arquivo vazio, Quando ler, Então recusa', () => {
    expect(() => parseClinicDiagnosisCsv('')).toThrow(ValidationError);
  });

  it('Dado só o cabeçalho, Quando ler, Então avisa que não há diagnóstico', () => {
    expect(() => parseClinicDiagnosisCsv('titulo\n\n')).toThrow(
      'O arquivo não tem nenhum diagnóstico',
    );
  });

  it('Dado mais linhas que o limite, Quando ler, Então recusa; no limite, aceita', () => {
    const lines = (n: number) =>
      `titulo\n${Array.from({ length: n }, (_, i) => `Diagnóstico ${i}`).join('\n')}`;
    expect(
      parseClinicDiagnosisCsv(lines(CLINIC_DIAGNOSIS_CSV_MAX_ROWS)),
    ).toHaveLength(CLINIC_DIAGNOSIS_CSV_MAX_ROWS);
    expect(() =>
      parseClinicDiagnosisCsv(lines(CLINIC_DIAGNOSIS_CSV_MAX_ROWS + 1)),
    ).toThrow(`no máximo ${CLINIC_DIAGNOSIS_CSV_MAX_ROWS}`);
  });
});

describe('Feature: diagnóstico do plano sem código e síndrome (#954)', () => {
  const pes = {
    carePlanId: 'plan-1',
    type: 'real' as const,
    relatedFactors: 'Umidade',
    definingCharacteristics: 'Ruptura da epiderme',
  };

  it('Dado título digitado sem código, Quando criar, Então guarda o título e código nulo', () => {
    const diagnosis = CarePlanDiagnosis.create({
      ...pes,
      diagnosisCode: null,
      diagnosisLabel: '  Pele   periestomal irritada ',
    });
    expect(diagnosis.diagnosisCode).toBeNull();
    expect(diagnosis.diagnosisLabel).toBe('Pele periestomal irritada');
  });

  it('Dado código do catálogo global, Quando criar, Então o título fica nulo', () => {
    const diagnosis = CarePlanDiagnosis.create({
      ...pes,
      diagnosisCode: '00046',
    });
    expect(diagnosis.diagnosisCode).toBe('00046');
    expect(diagnosis.diagnosisLabel).toBeNull();
  });

  it('Dado código e título em branco, Quando criar, Então exige o diagnóstico', () => {
    expect(() =>
      CarePlanDiagnosis.create({
        ...pes,
        diagnosisCode: ' ',
        diagnosisLabel: ' ',
      }),
    ).toThrow('Diagnóstico é obrigatório');
    expect(() =>
      CarePlanDiagnosis.create({ ...pes, diagnosisCode: null }),
    ).toThrow('Diagnóstico é obrigatório');
  });

  it('Dado título acima do limite, Quando criar, Então recusa; no limite, aceita', () => {
    expect(() =>
      CarePlanDiagnosis.create({
        ...pes,
        diagnosisCode: null,
        diagnosisLabel: 'x'.repeat(201),
      }),
    ).toThrow('no máximo 200');
    expect(
      CarePlanDiagnosis.create({
        ...pes,
        diagnosisCode: null,
        diagnosisLabel: 'x'.repeat(200),
      }).diagnosisLabel,
    ).toHaveLength(200);
  });

  it('Dado síndrome com o conjunto e sem etiologia, Quando criar, Então aceita', () => {
    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: 'plan-1',
      diagnosisCode: null,
      diagnosisLabel: 'Síndrome do idoso frágil',
      type: 'sindrome',
      definingCharacteristics: 'Mobilidade física prejudicada; fadiga',
    });
    expect(diagnosis.type).toBe('sindrome');
    expect(diagnosis.relatedFactors).toBeNull();
  });

  it('Dado síndrome com etiologia, Quando criar, Então guarda a etiologia', () => {
    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: 'plan-1',
      diagnosisCode: '00257',
      type: 'sindrome',
      relatedFactors: 'Hospitalização prolongada',
      definingCharacteristics: 'Fadiga',
    });
    expect(diagnosis.relatedFactors).toBe('Hospitalização prolongada');
  });

  it('Dado síndrome sem o conjunto de diagnósticos, Quando criar, Então recusa', () => {
    expect(() =>
      CarePlanDiagnosis.create({
        carePlanId: 'plan-1',
        diagnosisCode: '00257',
        type: 'sindrome',
        relatedFactors: 'Hospitalização',
      }),
    ).toThrow('Síndrome exige características definidoras');
  });
});
