import { describe, expect, it } from 'vitest';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import { classifyRoute } from '@/lib/auth/route-family';
import {
  type CarePlanDiagnosisDto,
  carePlanDiagnosisTitle,
  toCarePlanDetailDto,
  toClinicNursingDiagnosisDto,
} from '@/lib/dto';
import { diagnosisCodeLabel, pesSentence } from '@/lib/format';
import { diagnosisSchema } from '@/lib/patient-record-schemas';
import { canRoleAccess } from '@/lib/staff-pages';

const dto = (over: Partial<CarePlanDiagnosisDto>): CarePlanDiagnosisDto => ({
  id: 'd1',
  carePlanId: 'p1',
  diagnosisCode: null,
  diagnosisLabel: 'Dor aguda',
  type: 'real',
  relatedFactors: 'Lesão',
  definingCharacteristics: 'Relato verbal',
  createdAt: '2026-11-20T00:00:00.000Z',
  ...over,
});

describe('Feature: catálogo da clínica e diagnóstico sem código na camada lib (#954)', () => {
  it('Dado item da clínica, Quando converter, Então expõe os campos e o estado', () => {
    const item = ClinicNursingDiagnosis.create({
      clinicId: 'c1',
      code: '00132',
      label: 'Dor aguda',
      edition: 'NANDA-I 2024-2026',
    });
    expect(toClinicNursingDiagnosisDto(item)).toEqual({
      id: item.id,
      code: '00132',
      label: 'Dor aguda',
      domain: null,
      class: null,
      edition: 'NANDA-I 2024-2026',
      definition: null,
      active: true,
    });
  });

  it('Dado título no plano, Quando montar o título, Então vence o do catálogo; sem nenhum, usa o código e por fim um texto fixo', () => {
    const base = {
      id: 'x',
      carePlanId: 'p1',
      type: 'real' as const,
      relatedFactors: 'a',
      definingCharacteristics: 'b',
      createdAt: new Date(),
    };
    const restore = (
      diagnosisCode: string | null,
      diagnosisLabel: string | null,
    ) => CarePlanDiagnosis.restore({ ...base, diagnosisCode, diagnosisLabel });
    expect(
      carePlanDiagnosisTitle(restore('00046', 'Da clínica'), 'Global'),
    ).toBe('Da clínica');
    expect(carePlanDiagnosisTitle(restore('00046', null), 'Global')).toBe(
      'Global',
    );
    expect(carePlanDiagnosisTitle(restore('00046', null))).toBe('00046');
    expect(carePlanDiagnosisTitle(restore(null, null))).toBe(
      'Diagnóstico sem título',
    );
  });

  it('Dado plano com diagnóstico sem código, Quando montar o detalhe, Então não consulta o catálogo global para ele', () => {
    const typed = CarePlanDiagnosis.create({
      carePlanId: 'p1',
      diagnosisCode: null,
      diagnosisLabel: 'Pele periestomal irritada',
      type: 'real',
      relatedFactors: 'Efluente',
      definingCharacteristics: 'Eritema',
    });
    const detail = toCarePlanDetailDto(
      {
        plan: {
          id: 'p1',
          patientId: 'pa',
          conditionId: null,
          professionalId: null,
          status: 'active',
          createdAt: new Date(),
        } as never,
        diagnoses: [typed],
        outcomes: [],
        interventions: [],
      },
      { diagnoses: new Map(), outcomes: new Map(), interventions: new Map() },
    );
    expect(detail.diagnoses[0]).toMatchObject({
      diagnosisCode: null,
      diagnosisLabel: 'Pele periestomal irritada',
    });
  });

  it('Dado código nulo, Quando rotular, Então mostra «Sem código»', () => {
    expect(diagnosisCodeLabel(null)).toBe('Sem código');
    expect(diagnosisCodeLabel('00046')).toBe('00046');
  });

  it('Dado risco cujo título já começa com "Risco", Quando montar a frase, Então não repete o prefixo', () => {
    expect(
      pesSentence(
        dto({
          type: 'risco',
          diagnosisLabel: 'Risco de infecção',
          relatedFactors: 'Lesão aberta',
        }),
      ),
    ).toBe('Risco de infecção relacionado a Lesão aberta');
    expect(
      pesSentence(
        dto({
          type: 'risco',
          diagnosisLabel: 'Infecção',
          relatedFactors: 'Lesão aberta',
        }),
      ),
    ).toBe('Risco de Infecção relacionado a Lesão aberta');
  });

  it('Dado síndrome com e sem etiologia, Quando montar a frase, Então inclui a etiologia só quando existe', () => {
    expect(
      pesSentence(
        dto({
          type: 'sindrome',
          diagnosisLabel: 'Síndrome X',
          relatedFactors: 'Hospitalização',
          definingCharacteristics: 'Fadiga',
        }),
      ),
    ).toBe('Síndrome X relacionado a Hospitalização, evidenciado por Fadiga');
    expect(
      pesSentence(
        dto({
          type: 'sindrome',
          diagnosisLabel: 'Síndrome X',
          relatedFactors: null,
          definingCharacteristics: 'Fadiga',
        }),
      ),
    ).toBe('Síndrome X evidenciado por Fadiga');
  });

  it.each([
    ['código global', { diagnosisCode: '00046' }, true],
    ['item da clínica', { clinicDiagnosisId: 'c-1' }, true],
    ['texto livre', { diagnosisLabel: 'Pele irritada' }, true],
    ['nenhuma origem', {}, false],
    [
      'duas origens',
      { diagnosisCode: '00046', diagnosisLabel: 'Pele irritada' },
      false,
    ],
    ['texto curto demais', { diagnosisLabel: 'ab' }, false],
  ])(
    'Dado %s, Quando validar a origem do diagnóstico, Então aceita=%s',
    (_caso, source, ok) => {
      const result = diagnosisSchema.safeParse({
        ...source,
        type: 'real',
        relatedFactors: 'Umidade',
        definingCharacteristics: 'Ruptura',
      });
      expect(result.success).toBe(ok);
    },
  );

  it('Dado síndrome, Quando validar, Então exige os diagnósticos do conjunto e aceita etiologia opcional', () => {
    const sindrome = { diagnosisCode: '00257', type: 'sindrome' as const };
    expect(
      diagnosisSchema.safeParse({
        ...sindrome,
        definingCharacteristics: 'Fadiga',
      }).success,
    ).toBe(true);
    expect(
      diagnosisSchema.safeParse({
        ...sindrome,
        relatedFactors: 'Idade',
        definingCharacteristics: 'Fadiga',
      }).success,
    ).toBe(true);
    const missing = diagnosisSchema.safeParse({
      ...sindrome,
      relatedFactors: 'Idade',
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe(
      'Síndrome exige os diagnósticos do conjunto (evidenciado por)',
    );
  });

  it('Dado a rota do catálogo da clínica, Quando classificar, Então é administrativa: só o Admin de Empresa', () => {
    expect(classifyRoute('/api/settings/nursing-diagnoses')).toBe(
      'administrative',
    );
    expect(
      canRoleAccess('/api/settings/nursing-diagnoses', 'company_admin'),
    ).toBe(true);
    expect(
      canRoleAccess('/api/settings/nursing-diagnoses', 'profissional'),
    ).toBe(false);
    expect(classifyRoute('/api/taxonomy/clinic-diagnoses')).toBe('clinical');
  });
});
