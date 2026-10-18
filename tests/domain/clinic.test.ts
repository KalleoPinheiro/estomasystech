import { describe, expect, it } from 'vitest';
import { Clinic, isClinicInfoComplete } from '@/domain/clinic/clinic';

/** Clínica só com nome, como a `legacy-clinic` nasceu (migração 0019). */
const bareClinic = (): Clinic =>
  Clinic.restore({
    id: 'clinic-alfa',
    name: 'Clínica Alfa',
    createdBy: 'admin@vitta.com',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

describe('Feature: Dados cadastrais da clínica (issue #61/#62)', () => {
  describe('Cenário: clínica só com nome (restore)', () => {
    it('Dado nome e createdBy, Quando restaurar, Então campos cadastrais nascem nulos', () => {
      const clinic = bareClinic();

      expect(clinic.contactPhone).toBeNull();
      expect(clinic.contactEmail).toBeNull();
      expect(clinic.cnpj).toBeNull();
      expect(clinic.address).toBeNull();
      expect(clinic.city).toBeNull();
      expect(clinic.professionalName).toBeNull();
      expect(clinic.professionalRegistry).toBeNull();
    });
  });

  describe('Cenário: updateInfo é imutável', () => {
    it('Dada uma clínica, Quando atualizar CNPJ, Então retorna nova instância sem mutar a original', () => {
      const clinic = bareClinic();

      const updated = clinic.updateInfo({ cnpj: '12.345.678/0001-95' });

      expect(clinic.cnpj).toBeNull();
      expect(updated.cnpj).toBe('12.345.678/0001-95');
      expect(updated).not.toBe(clinic);
    });

    it('Dada uma clínica com dados salvos, Quando atualizar só um campo, Então os demais são preservados', () => {
      const clinic = bareClinic().updateInfo({
        cnpj: '12.345.678/0001-95',
        professionalName: 'Enf. Ana',
        professionalRegistry: 'COREN-SP 123456',
      });

      const updated = clinic.updateInfo({ city: 'São Paulo' });

      expect(updated.cnpj).toBe('12.345.678/0001-95');
      expect(updated.professionalName).toBe('Enf. Ana');
      expect(updated.city).toBe('São Paulo');
    });

    it('Dada uma clínica, Quando atualizar o nome, Então persiste a nova razão social', () => {
      const clinic = bareClinic();

      const updated = clinic.updateInfo({ name: 'Clínica Alfa Ltda' });

      expect(updated.name).toBe('Clínica Alfa Ltda');
      expect(clinic.name).toBe('Clínica Alfa');
    });

    it('Dado nome vazio, Quando atualizar, Então lança ValidationError', () => {
      const clinic = bareClinic();

      expect(() => clinic.updateInfo({ name: '   ' })).toThrow(
        'Nome da clínica é obrigatório',
      );
    });

    it('Dado nenhum campo name no update, Quando atualizar outro campo, Então o nome permanece intacto', () => {
      const clinic = bareClinic();

      const updated = clinic.updateInfo({ cnpj: '12.345.678/0001-95' });

      expect(updated.name).toBe('Clínica Alfa');
    });

    it('Dado um campo com espaços em branco, Quando atualizar, Então normaliza para null', () => {
      const clinic = bareClinic().updateInfo({
        cnpj: '12.345.678/0001-95',
      });

      const updated = clinic.updateInfo({ cnpj: '   ' });

      expect(updated.cnpj).toBeNull();
    });
  });

  describe('Cenário: completude para emissão de documento (#62)', () => {
    it('Dados os 3 campos obrigatórios preenchidos, Quando checar completude, Então retorna true', () => {
      const clinic = bareClinic().updateInfo({
        cnpj: '12.345.678/0001-95',
        professionalName: 'Enf. Ana',
        professionalRegistry: 'COREN-SP 123456',
      });

      expect(clinic.isCompleteForDocumentEmission()).toBe(true);
    });

    it.each([
      [
        'cnpj',
        {
          professionalName: 'Enf. Ana',
          professionalRegistry: 'COREN-SP 123456',
        },
      ],
      [
        'professionalName',
        { cnpj: '12.345.678/0001-95', professionalRegistry: 'COREN-SP 123456' },
      ],
      [
        'professionalRegistry',
        { cnpj: '12.345.678/0001-95', professionalName: 'Enf. Ana' },
      ],
    ])(
      'Dado %s ausente, Quando checar completude, Então retorna false',
      (_field, fields) => {
        const clinic = bareClinic().updateInfo(fields);

        expect(clinic.isCompleteForDocumentEmission()).toBe(false);
      },
    );

    it('Dado endereço e cidade ausentes mas os 3 obrigatórios presentes, Quando checar completude, Então retorna true', () => {
      const clinic = bareClinic().updateInfo({
        cnpj: '12.345.678/0001-95',
        professionalName: 'Enf. Ana',
        professionalRegistry: 'COREN-SP 123456',
      });

      expect(clinic.address).toBeNull();
      expect(clinic.city).toBeNull();
      expect(clinic.isCompleteForDocumentEmission()).toBe(true);
    });

    it('Dado info nula, Quando checar isClinicInfoComplete, Então retorna false', () => {
      expect(isClinicInfoComplete(null)).toBe(false);
    });
  });
});

const VALID_REGISTRATION = {
  name: 'Clínica Beta',
  cnpj: '12.345.678/0001-95',
  contactPhone: '11 99999-0000',
  contactEmail: 'contato@beta.com',
  createdBy: 'dono@vitta.app',
};

describe('Feature: Cadastro de clínica pela plataforma (B4, #214)', () => {
  it('Dado o cadastro completo, Quando criar, Então a clínica nasce com os campos obrigatórios e o responsável técnico opcional', () => {
    const clinic = Clinic.create({
      ...VALID_REGISTRATION,
      professionalName: ' Enf. Ana ',
      professionalRegistry: 'COREN-SP 123456',
    });

    expect(clinic.name).toBe('Clínica Beta');
    expect(clinic.cnpj).toBe('12.345.678/0001-95');
    expect(clinic.contactPhone).toBe('11 99999-0000');
    expect(clinic.contactEmail).toBe('contato@beta.com');
    expect(clinic.professionalName).toBe('Enf. Ana');
    expect(clinic.professionalRegistry).toBe('COREN-SP 123456');
    expect(Clinic.create(VALID_REGISTRATION).professionalName).toBeNull();
  });

  it.each([
    ['name', 'Nome da clínica é obrigatório'],
    ['cnpj', 'CNPJ é obrigatório'],
    ['contactPhone', 'Telefone de contato é obrigatório'],
    ['contactEmail', 'E-mail de contato é obrigatório'],
  ] as const)(
    'Dado %s vazio, Quando criar, Então recusa: campos obrigatórios na criação',
    (field, message) => {
      expect(() =>
        Clinic.create({ ...VALID_REGISTRATION, [field]: '   ' }),
      ).toThrow(message);
    },
  );

  it.each([
    ['12.345.678/0001-95', '12.345.678/0001-95'],
    ['12345678000195', '12.345.678/0001-95'],
    [' 12 345 678 0001 95 ', '12.345.678/0001-95'],
    ['12abc34501de35', '12.ABC.345/01DE-35'],
  ])(
    'Dado o CNPJ %s, Quando criar ou editar, Então normaliza o CNPJ para %s',
    (raw, canonical) => {
      expect(Clinic.create({ ...VALID_REGISTRATION, cnpj: raw }).cnpj).toBe(
        canonical,
      );
      expect(bareClinic().updateInfo({ cnpj: raw }).cnpj).toBe(canonical);
    },
  );

  it.each([
    ['1234567800019', '13 caracteres'],
    ['123456780001955', '15 caracteres'],
    ['12.345.678/0001-9A', 'letra no dígito verificador'],
    ['12.345.678/0001*95', 'símbolo estranho'],
  ])(
    'Dado o CNPJ %s (%s), Quando criar ou editar, Então recusa CNPJ malformado',
    (raw) => {
      const message =
        'CNPJ inválido: use 14 caracteres (12 letras ou números e 2 dígitos)';
      expect(() => Clinic.create({ ...VALID_REGISTRATION, cnpj: raw })).toThrow(
        message,
      );
      expect(() => bareClinic().updateInfo({ cnpj: raw })).toThrow(message);
    },
  );

  it('Dado contato com espaços e maiúsculas, Quando criar ou editar, Então normaliza o contato', () => {
    const created = Clinic.create({
      ...VALID_REGISTRATION,
      contactPhone: '  (11) 3333-4444  ',
      contactEmail: '  Contato@Beta.COM ',
    });
    expect(created.contactPhone).toBe('(11) 3333-4444');
    expect(created.contactEmail).toBe('contato@beta.com');

    const edited = bareClinic().updateInfo({ contactEmail: 'Outro@Beta.com' });
    expect(edited.contactEmail).toBe('outro@beta.com');
    expect(() =>
      Clinic.create({ ...VALID_REGISTRATION, contactEmail: 'sem-arroba' }),
    ).toThrow('E-mail de contato inválido');
    expect(() => bareClinic().updateInfo({ contactEmail: 'a@b' })).toThrow(
      'E-mail de contato inválido',
    );
  });

  it('Dada clínica criada, Quando checar o cadastro completo, Então só é true com nome, CNPJ, telefone e e-mail', () => {
    const complete = Clinic.create(VALID_REGISTRATION);
    expect(complete.isRegistrationComplete()).toBe(true);

    expect(bareClinic().isRegistrationComplete()).toBe(false);
    for (const field of ['cnpj', 'contactPhone', 'contactEmail'] as const) {
      expect(
        complete.updateInfo({ [field]: null }).isRegistrationComplete(),
      ).toBe(false);
    }
  });
});

describe('Feature: Estado da clínica (B5, #214)', () => {
  const props = {
    name: 'Clínica Estado',
    cnpj: '12.345.678/0001-95',
    contactPhone: '11 3333-4444',
    contactEmail: 'contato@estado.com',
    createdBy: 'root@vitta.com',
  };

  it('Dada clínica nova, Quando suspender e reativar, Então o estado da clínica segue as transições e updateInfo o preserva', () => {
    const clinic = Clinic.create(props);
    expect(clinic.status).toBe('active');
    expect(clinic.isSuspended).toBe(false);
    expect(clinic.statusChangedAt).toBeNull();
    expect(clinic.statusChangedBy).toBeNull();

    const at = new Date('2026-09-27T12:00:00Z');
    const suspended = clinic.suspend('root@vitta.com', at, {
      reason: 'security_incident',
      note: '  Acesso indevido  ',
    });
    expect(suspended.status).toBe('suspended');
    expect(suspended.isSuspended).toBe(true);
    expect(suspended.statusChangedAt).toEqual(at);
    expect(suspended.statusChangedBy).toBe('root@vitta.com');
    expect(suspended.statusReason).toBe('security_incident');
    expect(suspended.statusReasonNote).toBe('Acesso indevido');
    expect(clinic.status).toBe('active');

    const edited = suspended.updateInfo({ name: 'Outro nome' });
    expect(edited.status).toBe('suspended');
    expect(edited.statusChangedAt).toEqual(at);

    const later = new Date('2026-09-28T12:00:00Z');
    const reactivated = suspended.reactivate('outro@vitta.com', later);
    expect(reactivated.status).toBe('active');
    expect(reactivated.isSuspended).toBe(false);
    expect(reactivated.statusChangedAt).toEqual(later);
    expect(reactivated.statusChangedBy).toBe('outro@vitta.com');
    expect(reactivated.statusReason).toBeNull();
    expect(reactivated.statusReasonNote).toBeNull();
  });

  it('Dado motivo ausente, fora da lista ou observação longa demais, Quando suspender, Então ValidationError e a clínica não muda', () => {
    const clinic = Clinic.create(props);
    const at = new Date();

    expect(() =>
      clinic.suspend('root@vitta.com', at, {
        reason: undefined as unknown as 'other',
      }),
    ).toThrow('Motivo da suspensão é obrigatório');
    expect(() =>
      clinic.suspend('root@vitta.com', at, {
        reason: 'por-que-sim' as unknown as 'other',
      }),
    ).toThrow('Motivo da suspensão é obrigatório');
    expect(() =>
      clinic.suspend('root@vitta.com', at, {
        reason: 'other',
        note: 'x'.repeat(501),
      }),
    ).toThrow('no máximo 500 caracteres');
    expect(clinic.status).toBe('active');
  });

  it('Dada observação em branco, Quando suspender, Então a observação fica nula', () => {
    const suspended = Clinic.create(props).suspend(
      'root@vitta.com',
      new Date(),
      {
        reason: 'clinic_request',
        note: '   ',
      },
    );
    expect(suspended.statusReason).toBe('clinic_request');
    expect(suspended.statusReasonNote).toBeNull();
  });

  it('Dada clínica restaurada sem estado, Quando ler o estado da clínica, Então é active', () => {
    const clinic = Clinic.restore({
      id: 'x',
      name: 'Sem estado',
      createdBy: 'fixture',
      createdAt: new Date(),
    });
    expect(clinic.status).toBe('active');
    expect(clinic.statusChangedAt).toBeNull();
  });
});

describe('Feature: CNPJ antigo marcado para correção (#355, ACE-RN-57)', () => {
  const INVALID = '12.345.678/0001-96';
  const at = new Date('2026-10-18T10:00:00.000Z');
  const legacy = () =>
    Clinic.restore({
      id: 'c1',
      name: 'Antiga',
      createdBy: 'system',
      createdAt: at,
      cnpj: INVALID,
    });

  it('Dado CNPJ gravado, Quando marcar, Então o número fica intacto e a marca é idempotente', () => {
    const flagged = legacy().flagCnpjForReview(at);

    expect(flagged.cnpj).toBe(INVALID);
    expect(flagged.cnpjReviewSince).toEqual(at);
    expect(flagged.flagCnpjForReview(new Date())).toBe(flagged);
  });

  it('Dado clínica sem CNPJ, Quando marcar, Então nada muda', () => {
    const bare = Clinic.restore({
      id: 'c2',
      name: 'Sem CNPJ',
      createdBy: 'system',
      createdAt: at,
    });

    expect(bare.flagCnpjForReview(at)).toBe(bare);
    expect(bare.cnpjReviewSince).toBeNull();
  });

  it('Dado marca, Quando editar outro campo, Então a marca permanece', () => {
    const edited = legacy()
      .flagCnpjForReview(at)
      .updateInfo({ city: 'Recife' });

    expect(edited.cnpjReviewSince).toEqual(at);
  });

  it('Dado marca, Quando reenviar o CNPJ inválido, Então recusa; com CNPJ válido a marca cai', () => {
    const flagged = legacy().flagCnpjForReview(at);

    expect(() => flagged.updateInfo({ cnpj: INVALID })).toThrow(
      'dígito verificador',
    );
    const fixed = flagged.updateInfo({ cnpj: '12.345.678/0001-95' });
    expect(fixed.cnpj).toBe('12.345.678/0001-95');
    expect(fixed.cnpjReviewSince).toBeNull();
  });
});
