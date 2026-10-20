import { describe, expect, it } from 'vitest';
import { AuthToken } from '@/domain/auth/auth-token';
import { base32Encode } from '@/domain/auth/totp';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import { FollowUp } from '@/domain/followup/follow-up';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { ValidationError } from '@/domain/shared/errors';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';

describe('Feature: Cadastro clínico exige paciente e rótulos preenchidos', () => {
  it('Dado paciente em branco, Quando registrar retorno, Então recusa (retorno sem paciente não pode ser agendado)', () => {
    expect(() =>
      FollowUp.create({
        patientId: '  ',
        dueDate: new Date('2026-11-01T12:00:00Z'),
        reason: 'Reavaliar lesão',
      }),
    ).toThrow(new ValidationError('Paciente é obrigatório'));
  });

  it('Dado paciente em branco, Quando registrar evolução SOAP, Então recusa', () => {
    expect(() =>
      EvolutionNote.create({
        patientId: ' ',
        subjective: 'Dor leve',
        objective: '',
        assessment: '',
        plan: '',
      }),
    ).toThrow(new ValidationError('Paciente é obrigatório'));
  });

  it('Dado paciente em branco, Quando abrir condição clínica, Então recusa', () => {
    expect(() =>
      ClinicalCondition.create({
        patientId: '',
        kind: 'wound',
        title: 'Lesão por pressão sacral',
      }),
    ).toThrow(new ValidationError('Paciente é obrigatório'));
  });

  it('Dado condição em branco, Quando registrar avaliação seriada, Então recusa', () => {
    expect(() => ConditionAssessment.create({ conditionId: '   ' })).toThrow(
      new ValidationError('Condição é obrigatória'),
    );
  });

  it('Dado prioridade fora da escala, Quando prescrever intervenção NIC, Então recusa', () => {
    expect(() =>
      CarePlanIntervention.create({
        carePlanId: 'plano-1',
        interventionCode: '3660',
        frequency: 'a cada troca',
        priority: 'urgente' as never,
      }),
    ).toThrow(new ValidationError('Prioridade da intervenção inválida'));
  });
});

describe('Feature: Taxonomia NANDA/NIC/NOC exige classificação completa', () => {
  const base = {
    code: '1101',
    label: 'Integridade tissular',
    domain: 'Domínio 2',
    class: 'Classe L',
    edition: 'NOC 6ª ed.',
  };
  const anchors = ['a', 'b', 'c', 'd', 'e'] as never;

  it('Dado diagnóstico sem domínio ou sem classe, Quando criar, Então recusa', () => {
    const diagnosis = {
      code: '00046',
      label: 'Integridade da pele prejudicada',
      definition: 'Epiderme alterada',
      edition: 'NANDA-I 2021',
      domain: 'Domínio 11',
      class: 'Classe 2',
    };
    expect(() =>
      NursingDiagnosis.create({ ...diagnosis, domain: ' ' }),
    ).toThrow('Domínio e classe NANDA-I são obrigatórios');
    expect(() => NursingDiagnosis.create({ ...diagnosis, class: '' })).toThrow(
      'Domínio e classe NANDA-I são obrigatórios',
    );
  });

  it('Dado intervenção sem rótulo ou sem edição, Quando criar, Então recusa', () => {
    const intervention = { ...base, code: '3660' };
    expect(() =>
      NursingIntervention.create({ ...intervention, label: ' ' }),
    ).toThrow('Rótulo da intervenção é obrigatório');
    expect(() =>
      NursingIntervention.create({ ...intervention, edition: ' ' }),
    ).toThrow('Edição da taxonomia é obrigatória');
  });

  it('Dado resultado sem rótulo, domínio, classe ou edição, Quando criar, Então recusa cada caso', () => {
    const create = (over: Partial<typeof base>) =>
      NursingOutcome.create({ ...base, ...over, scaleAnchors: anchors });
    expect(() => create({ label: ' ' })).toThrow(
      'Rótulo do resultado é obrigatório',
    );
    expect(() => create({ domain: ' ' })).toThrow(
      'Domínio e classe NOC são obrigatórios',
    );
    expect(() => create({ class: ' ' })).toThrow(
      'Domínio e classe NOC são obrigatórios',
    );
    expect(() => create({ edition: ' ' })).toThrow(
      'Edição da taxonomia é obrigatória',
    );
  });
});

describe('Feature: Fila de espera valida o período desejado', () => {
  it('Dado data fora do formato AAAA-MM-DD, Quando entrar na fila, Então recusa o período', () => {
    expect(() =>
      WaitlistEntry.create({
        patientId: 'pac-1',
        fromDate: '01/11/2026',
        toDate: '2026-11-10',
        source: 'staff',
      }),
    ).toThrow(new ValidationError('Período desejado deve estar em AAAA-MM-DD'));
  });
});

describe('Feature: Escala DET só soma quando todos os domínios foram avaliados', () => {
  it('Dado os três domínios com área e severidade, Quando somar o DET, Então é a soma simples; sem avaliação completa, é nulo', () => {
    const completa = ConditionAssessment.create({
      conditionId: 'cond-1',
      detDiscolorationArea: 1,
      detDiscolorationSeverity: 1,
      detErosionArea: 2,
      detErosionSeverity: 0,
      detOvergrowthArea: 3,
      detOvergrowthSeverity: 2,
    });
    expect(completa.detScore).toBe(9);

    const parcial = ConditionAssessment.create({
      conditionId: 'cond-1',
      detDiscolorationArea: 1,
    });
    expect(parcial.detScore).toBeNull();
  });
});

describe('Feature: Base32 do segredo TOTP', () => {
  it('Dado bytes múltiplos de 5 (sem sobra de bits), Quando codificar, Então não acrescenta caractere extra', () => {
    expect(base32Encode(Buffer.from('hello'))).toBe('NBSWY3DP');
    expect(base32Encode(Buffer.from('hi'))).toBe('NBUQ');
  });
});

describe('Feature: Estados legados sem coluna preenchida', () => {
  it('Dada clínica restaurada com status indefinido, Quando ler o status, Então é ativa', () => {
    const clinic = Clinic.restore({
      id: 'c1',
      name: 'Legada',
      createdBy: 'sistema',
      createdAt: new Date(),
      status: undefined,
    });
    expect(clinic.status).toBe('active');
  });

  it('Dada conta restaurada sem versão de sessão, Quando ler, Então é 0', () => {
    const account = UserAccount.restore({
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'scrypt$1$s$h',
      role: 'profissional',
      clinicId: 'c1',
      active: true,
      createdAt: new Date(),
    });
    expect(account.sessionVersion).toBe(0);
  });

  it('Dado convite emitido sem relógio informado, Quando emitir, Então usa o relógio do sistema', () => {
    const antes = Date.now();
    const { token } = AuthToken.issue({ accountId: 'a1', purpose: 'invite' });
    expect(token.expiresAt.getTime()).toBeGreaterThan(antes);
  });
});
