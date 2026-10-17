import { describe, expect, it } from 'vitest';
import {
  ANONYMIZED_PATIENT_REACTIVATION,
  Patient,
} from '@/domain/patient/patient';
import { ConflictError, ValidationError } from '@/domain/shared/errors';

const validProps = {
  fullName: 'Maria da Silva',
  email: 'maria@example.com',
  phone: '11999990000',
};

describe('Feature: Telefone do paciente em E.164 (#324)', () => {
  it('Dado telefone mascarado, Quando criar, Então guarda em E.164', () => {
    const patient = Patient.create({
      ...validProps,
      phone: '(011) 99999-0000',
    });

    expect(patient.phone).toBe('+5511999990000');
    expect(patient.phoneNeedsCorrection).toBe(false);
  });

  it.each(['99999-0000', '+1 415 555 2671', '(10) 99999-0000'])(
    'Dado telefone inválido %s, Quando criar, Então ValidationError',
    (phone) => {
      expect(() => Patient.create({ ...validProps, phone })).toThrow(
        ValidationError,
      );
    },
  );

  it('Dado telefone novo, Quando atualizar, Então normaliza e rejeita inválido', () => {
    const patient = Patient.create(validProps);

    expect(patient.update({ phone: '11 3333-4444' }).phone).toBe(
      '+551133334444',
    );
    expect(() => patient.update({ phone: '3333-4444' })).toThrow(
      ValidationError,
    );
  });

  describe('Cenário: telefone legado (guardado antes da #324)', () => {
    const legacy = () =>
      Patient.restore({
        ...validProps,
        phone: '(11) 9999',
        id: 'p1',
        active: true,
        createdAt: new Date(),
      });

    it('Então é sinalizado para correção', () => {
      expect(legacy().phoneNeedsCorrection).toBe(true);
    });

    it('Quando anonimizado (sem telefone), Então não pede correção', () => {
      const anonymized = Patient.restore({
        ...validProps,
        phone: '',
        id: 'p2',
        active: false,
        createdAt: new Date(),
        anonymizedAt: new Date(),
      });

      expect(anonymized.phoneNeedsCorrection).toBe(false);
    });

    it('Quando edita outro campo ou reenvia o mesmo telefone, Então não trava', () => {
      expect(legacy().update({ fullName: 'Maria Souza' }).phone).toBe(
        '(11) 9999',
      );
      expect(legacy().update({ phone: ' (11) 9999 ' }).phone).toBe('(11) 9999');
    });

    it('Quando troca por um telefone válido, Então normaliza e sai da lista', () => {
      const fixed = legacy().update({ phone: '11 99999-0000' });

      expect(fixed.phone).toBe('+5511999990000');
      expect(fixed.phoneNeedsCorrection).toBe(false);
    });

    it('Quando troca por um telefone inválido, Então rejeita', () => {
      expect(() => legacy().update({ phone: '123' })).toThrow(ValidationError);
    });
  });
});

describe('Feature: Cadastro de paciente', () => {
  describe('Cenário: criar paciente válido', () => {
    it('Dado dados válidos, Quando criar, Então paciente ativo com id gerado', () => {
      const patient = Patient.create(validProps);

      expect(patient.id).toBeTruthy();
      expect(patient.fullName).toBe('Maria da Silva');
      expect(patient.isActive).toBe(true);
      expect(patient.createdAt).toBeInstanceOf(Date);
    });

    it('Dado nome com espaços nas bordas, Quando criar, Então nome é normalizado', () => {
      const patient = Patient.create({
        ...validProps,
        fullName: '  João Souza  ',
      });

      expect(patient.fullName).toBe('João Souza');
    });
  });

  describe('Cenário: rejeitar dados inválidos', () => {
    it('Dado nome muito curto, Quando criar, Então lança ValidationError', () => {
      expect(() => Patient.create({ ...validProps, fullName: 'Jo' })).toThrow(
        ValidationError,
      );
    });

    it('Dado email inválido, Quando criar, Então lança ValidationError', () => {
      expect(() =>
        Patient.create({ ...validProps, email: 'not-an-email' }),
      ).toThrow(ValidationError);
    });

    it('Dado cadastro sem e-mail, Quando criar, Então email é null (#325)', () => {
      const { email: _email, ...withoutEmail } = validProps;

      expect(Patient.create(withoutEmail).email).toBeNull();
      expect(Patient.create({ ...withoutEmail, email: null }).email).toBeNull();
      expect(Patient.create({ ...withoutEmail, email: '  ' }).email).toBeNull();
    });

    it('Dado telefone vazio, Quando criar, Então lança ValidationError', () => {
      expect(() => Patient.create({ ...validProps, phone: '' })).toThrow(
        ValidationError,
      );
    });
  });

  describe('Cenário: atualizar dados do paciente', () => {
    it('Dado paciente existente, Quando atualizar nome, Então retorna novo Patient com nome novo', () => {
      const patient = Patient.create(validProps);

      const updated = patient.update({ fullName: 'Maria Oliveira' });

      expect(updated.fullName).toBe('Maria Oliveira');
      expect(updated.id).toBe(patient.id);
      expect(patient.fullName).toBe('Maria da Silva');
    });

    it('Dado paciente com e-mail, Quando atualizar com null, Então remove; sem o campo, mantém (#325)', () => {
      const patient = Patient.create(validProps);

      expect(patient.update({ fullName: 'Maria Oliveira' }).email).toBe(
        'maria@example.com',
      );
      expect(patient.update({ email: null }).email).toBeNull();
    });

    it('Dado atualização inválida, Quando atualizar, Então lança ValidationError', () => {
      const patient = Patient.create(validProps);

      expect(() => patient.update({ email: 'broken' })).toThrow(
        ValidationError,
      );
    });
  });

  describe('Cenário: desativar e reativar paciente', () => {
    it('Dado paciente ativo, Quando desativar, Então isActive é false', () => {
      const patient = Patient.create(validProps);

      const deactivated = patient.deactivate();

      expect(deactivated.isActive).toBe(false);
      expect(patient.isActive).toBe(true);
    });

    it('Dado paciente inativo, Quando reativar, Então isActive é true', () => {
      const patient = Patient.create(validProps).deactivate();

      expect(patient.reactivate().isActive).toBe(true);
    });
  });

  describe('Cenário: reconstituir paciente da persistência', () => {
    it('Dado props completas com id, Quando restore, Então mantém id e datas', () => {
      const createdAt = new Date('2026-01-01T12:00:00Z');
      const patient = Patient.restore({
        id: 'abc-123',
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
        birthDate: null,
        notes: null,
        active: false,
        createdAt,
      });

      expect(patient.id).toBe('abc-123');
      expect(patient.isActive).toBe(false);
      expect(patient.createdAt).toEqual(createdAt);
    });
  });

  describe('Cenário: paciente anonimizado (ADR-017)', () => {
    const restored = (anonymizedAt: Date | null) =>
      Patient.restore({
        id: 'pat-anon',
        fullName: 'Paciente anonimizado',
        email: 'anonimizado+pat-anon@anonimizado.invalid',
        phone: '',
        birthDate: null,
        notes: null,
        active: false,
        createdAt: new Date('2006-01-01T00:00:00Z'),
        anonymizedAt,
      });

    it('Dado paciente anonimizado, Quando reativar, Então recusa com erro claro', () => {
      const patient = restored(new Date('2026-10-12T00:00:00Z'));

      expect(patient.isAnonymized).toBe(true);
      expect(() => patient.reactivate()).toThrow(
        ANONYMIZED_PATIENT_REACTIVATION,
      );
      expect(() => patient.reactivate()).toThrow(ConflictError);
    });

    it('Dado paciente desativado comum, Quando reativar, Então reativa', () => {
      const patient = restored(null);

      expect(patient.isAnonymized).toBe(false);
      expect(patient.reactivate().isActive).toBe(true);
    });
  });
});

describe('Feature: CPF do paciente (#326)', () => {
  it('Dado cadastro sem CPF, Quando criar, Então o CPF é opcional (null)', () => {
    const patient = Patient.create(validProps);

    expect(patient.cpf).toBeNull();
    expect(patient.cpfMasked).toBeNull();
  });

  it('Dado CPF com máscara, Quando criar, Então guarda os 11 dígitos e expõe só a máscara', () => {
    const patient = Patient.create({ ...validProps, cpf: '529.982.247-25' });

    expect(patient.cpf).toBe('52998224725');
    expect(patient.cpfMasked).toBe('***.***.247-**');
  });

  it('Dado CPF com dígito verificador errado, Quando criar, Então ValidationError', () => {
    expect(() =>
      Patient.create({ ...validProps, cpf: '529.982.247-24' }),
    ).toThrow(ValidationError);
  });

  it('Dado CPF em branco, Quando criar, Então vira null', () => {
    expect(Patient.create({ ...validProps, cpf: '  ' }).cpf).toBeNull();
  });

  describe('Cenário: atualizar', () => {
    const withCpf = () => Patient.create({ ...validProps, cpf: '52998224725' });

    it('Quando edita outro campo sem enviar o CPF, Então o CPF é mantido', () => {
      expect(withCpf().update({ fullName: 'Maria Souza' }).cpf).toBe(
        '52998224725',
      );
    });

    it('Quando envia CPF novo, Então troca e valida', () => {
      expect(withCpf().update({ cpf: '111.444.777-35' }).cpf).toBe(
        '11144477735',
      );
      expect(() => withCpf().update({ cpf: '123' })).toThrow(ValidationError);
    });

    it('Quando envia null ou vazio, Então remove o CPF', () => {
      expect(withCpf().update({ cpf: null }).cpf).toBeNull();
      expect(withCpf().update({ cpf: '' }).cpf).toBeNull();
    });
  });
});
