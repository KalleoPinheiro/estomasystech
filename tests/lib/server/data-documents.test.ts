import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import type { Session } from '@/lib/auth/session';

const repos = vi.hoisted(() => ({
  appointments: { findById: vi.fn() },
  patients: { findById: vi.fn() },
  invoices: { findById: vi.fn() },
  clinics: { findById: vi.fn() },
  auditEvents: {},
  commissionPayouts: { findById: vi.fn() },
  professionals: { findById: vi.fn() },
  conditions: { findById: vi.fn() },
  assessments: { findByConditionId: vi.fn() },
}));
const mocks = vi.hoisted(() => ({
  getPatientRecord: vi.fn(),
  recordAudit: vi.fn(),
  assertClinicalResourceAccessible: vi.fn(),
  resolveReceipt: vi.fn(),
}));

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => repos,
}));
vi.mock('@/lib/server/data/patient-record', () => ({
  getPatientRecord: mocks.getPatientRecord,
}));
vi.mock('@/lib/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/lib/auth/clinical-resource-scope', () => ({
  assertClinicalResourceAccessible: mocks.assertClinicalResourceAccessible,
}));
vi.mock('@/application/billing/resolve-receipt', () => ({
  ResolveReceipt: class {
    execute = mocks.resolveReceipt;
  },
}));
vi.mock('@/lib/dto', () => ({
  toAppointmentDto: (a: { id: string }, patientName?: string) => ({
    id: a.id,
    patientName,
  }),
  toInvoiceDto: (i: { id: string }, patientName?: string) => ({
    id: i.id,
    patientName,
  }),
  toCommissionPayoutDto: (p: { id: string }, name: string) => ({
    id: p.id,
    professionalName: name,
  }),
  toConditionDto: (c: { id: string }) => ({ id: c.id }),
  toAssessmentDto: (a: { id: string }) => ({ id: a.id }),
  toProfessionalDto: (p: { id: string }) => ({ id: p.id }),
}));

import {
  getAttendanceDocumentData,
  getConditionDocumentData,
  getInvoiceDocumentData,
  getPayoutReceiptFor,
  getPrescribingProfessionalFor,
  getReceiptPartiesFor,
  listConditionAssessmentsFor,
} from '@/lib/server/data/documents';

const session = (role: string, professionalId?: string) =>
  ({
    role,
    subject: `${role}@clinica.com`,
    clinicId: 'clinica-a',
    professionalId,
  }) as unknown as Session;
const admin = session('company_admin');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Feature: leituras dos documentos imprimíveis no servidor (#546)', () => {
  describe('Cenário: consulta da declaração de comparecimento', () => {
    it('Dada consulta inexistente na empresa, Quando ler, Então não há consulta nem paciente', async () => {
      repos.appointments.findById.mockResolvedValue(null);

      expect(await getAttendanceDocumentData(admin, 'apt-x')).toEqual({
        appointment: null,
        patient: null,
      });
    });

    it('Dada consulta existente, Quando ler, Então traz o nome do paciente e a ficha para a data de nascimento', async () => {
      repos.appointments.findById.mockResolvedValue({
        id: 'apt-1',
        patientId: 'pac-1',
      });
      repos.patients.findById.mockResolvedValue({ fullName: 'Maria Souza' });
      mocks.getPatientRecord.mockResolvedValue({ id: 'pac-1' });

      const data = await getAttendanceDocumentData(admin, 'apt-1');

      expect(data.appointment).toEqual({
        id: 'apt-1',
        patientName: 'Maria Souza',
      });
      expect(data.patient).toEqual({ id: 'pac-1' });
    });

    it('Dado Profissional sem vínculo com o paciente (R4), Quando ler, Então a declaração sai sem a ficha', async () => {
      repos.appointments.findById.mockResolvedValue({
        id: 'apt-1',
        patientId: 'pac-1',
      });
      repos.patients.findById.mockResolvedValue(null);
      mocks.getPatientRecord.mockRejectedValue(
        new NotFoundError('Paciente', 'pac-1'),
      );

      const data = await getAttendanceDocumentData(
        session('profissional'),
        'apt-1',
      );

      expect(data.appointment).toEqual({ id: 'apt-1', patientName: undefined });
      expect(data.patient).toBeNull();
    });
  });

  describe('Cenário: fatura e recibo', () => {
    it('Dada fatura inexistente, Quando ler, Então 404', async () => {
      repos.invoices.findById.mockResolvedValue(null);

      await expect(
        getInvoiceDocumentData(admin, 'inv-x'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dada fatura de paciente que não está mais no cadastro, Quando ler, Então segue sem o nome', async () => {
      repos.invoices.findById.mockResolvedValue({
        id: 'inv-1',
        patientId: 'pac-x',
      });
      repos.patients.findById.mockResolvedValue(null);

      expect(await getInvoiceDocumentData(admin, 'inv-1')).toEqual({
        id: 'inv-1',
        patientName: undefined,
      });
    });

    it('Dada fatura existente, Quando ler, Então traz o nome do paciente', async () => {
      repos.invoices.findById.mockResolvedValue({
        id: 'inv-1',
        patientId: 'pac-1',
      });
      repos.patients.findById.mockResolvedValue({ fullName: 'Maria Souza' });

      expect(await getInvoiceDocumentData(admin, 'inv-1')).toEqual({
        id: 'inv-1',
        patientName: 'Maria Souza',
      });
    });

    it('Dado recibo com CPF e CNPJ, Quando ler as partes, Então devolve e audita a leitura do CPF sem o número', async () => {
      const parties = { payerIsPatient: true };
      mocks.resolveReceipt.mockResolvedValue(parties);
      repos.invoices.findById.mockResolvedValue({ patientId: 'pac-1' });

      expect(await getReceiptPartiesFor(admin, 'inv-1', 'pay-1')).toBe(parties);
      expect(mocks.resolveReceipt).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        paymentId: 'pay-1',
        clinicId: 'clinica-a',
      });
      expect(mocks.recordAudit).toHaveBeenCalledWith(
        repos.auditEvents,
        admin,
        expect.objectContaining({
          action: 'read',
          resourceType: 'recibo',
          resourceId: 'pay-1',
          patientId: 'pac-1',
          detail: 'CPF no recibo',
        }),
      );
    });

    it('Dada fatura que sumiu entre as leituras, Quando auditar, Então o evento segue sem paciente', async () => {
      mocks.resolveReceipt.mockResolvedValue({});
      repos.invoices.findById.mockResolvedValue(null);

      await getReceiptPartiesFor(admin, 'inv-1', 'pay-1');

      expect(mocks.recordAudit).toHaveBeenCalledWith(
        repos.auditEvents,
        admin,
        expect.objectContaining({ patientId: null }),
      );
    });

    it('Dado recibo sem CPF, Quando ler as partes, Então o erro sobe e nada é auditado', async () => {
      mocks.resolveReceipt.mockRejectedValue(new Error('sem CPF'));

      await expect(
        getReceiptPartiesFor(admin, 'inv-1', 'pay-1'),
      ).rejects.toThrow('sem CPF');
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: comprovante de repasse', () => {
    const payout = { id: 'po-1', professionalId: 'prof-1' };

    it('Dado Admin, Quando ler qualquer repasse da clínica, Então traz o profissional com o registro', async () => {
      repos.commissionPayouts.findById.mockResolvedValue(payout);
      repos.professionals.findById.mockResolvedValue({
        fullName: 'Ana Lima',
        registry: 'COREN-SP 1',
      });

      expect(await getPayoutReceiptFor(admin, 'po-1')).toEqual({
        payout: { id: 'po-1', professionalName: 'Ana Lima' },
        professional: { fullName: 'Ana Lima', registry: 'COREN-SP 1' },
      });
    });

    it('Dado profissional removido do cadastro, Quando ler, Então o nome sai «—» e sem registro', async () => {
      repos.commissionPayouts.findById.mockResolvedValue(payout);
      repos.professionals.findById.mockResolvedValue(null);

      expect((await getPayoutReceiptFor(admin, 'po-1')).professional).toEqual({
        fullName: '—',
        registry: null,
      });
    });

    it('Dado repasse inexistente, Quando ler, Então 404', async () => {
      repos.commissionPayouts.findById.mockResolvedValue(null);

      await expect(getPayoutReceiptFor(admin, 'po-x')).rejects.toThrow(
        'Repasse',
      );
    });

    it('Dado Profissional, Quando ler o próprio repasse, Então devolve', async () => {
      repos.commissionPayouts.findById.mockResolvedValue(payout);
      repos.professionals.findById.mockResolvedValue({
        fullName: 'Ana Lima',
        registry: null,
      });

      const receipt = await getPayoutReceiptFor(
        session('profissional', 'prof-1'),
        'po-1',
      );

      expect(receipt.payout).toEqual({
        id: 'po-1',
        professionalName: 'Ana Lima',
      });
    });

    it('Dado Profissional, Quando ler repasse de outro, Então 404 (nem a existência é revelada)', async () => {
      repos.commissionPayouts.findById.mockResolvedValue(payout);

      await expect(
        getPayoutReceiptFor(session('profissional', 'prof-2'), 'po-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dada conta de Profissional sem profissional vinculado, Quando ler, Então 404', async () => {
      repos.commissionPayouts.findById.mockResolvedValue(payout);

      await expect(
        getPayoutReceiptFor(session('profissional'), 'po-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado papel sem acesso aos repasses da clínica, Quando ler, Então recusa antes de abrir o banco', async () => {
      await expect(
        getPayoutReceiptFor(session('atendente'), 'po-1'),
      ).rejects.toThrow('Seu papel não tem acesso a este recurso');
      await expect(
        getPayoutReceiptFor(session('atendente'), 'po-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repos.commissionPayouts.findById).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: relatório de evolução', () => {
    it('Dada condição inexistente, Quando ler, Então nula e sem auditoria', async () => {
      repos.conditions.findById.mockResolvedValue(null);

      expect(await getConditionDocumentData(admin, 'cond-x')).toBeNull();
      expect(mocks.assertClinicalResourceAccessible).toHaveBeenCalledWith(
        admin,
        'condition',
        'cond-x',
        repos,
      );
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    });

    it('Dada condição existente, Quando ler, Então devolve e audita a leitura do prontuário', async () => {
      repos.conditions.findById.mockResolvedValue({
        id: 'cond-1',
        patientId: 'pac-1',
      });

      expect(await getConditionDocumentData(admin, 'cond-1')).toEqual({
        id: 'cond-1',
      });
      expect(mocks.recordAudit).toHaveBeenCalledWith(
        repos.auditEvents,
        admin,
        expect.objectContaining({
          action: 'read',
          resourceType: 'condition',
          resourceId: 'cond-1',
          patientId: 'pac-1',
        }),
      );
    });

    it('Dado Profissional sem vínculo (R4), Quando ler a condição, Então o erro sobe antes de qualquer leitura', async () => {
      mocks.assertClinicalResourceAccessible.mockRejectedValue(
        new NotFoundError('Condição', 'cond-1'),
      );

      await expect(
        getConditionDocumentData(session('profissional'), 'cond-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repos.conditions.findById).not.toHaveBeenCalled();
    });

    it('Dada condição com avaliações, Quando listar, Então devolve e audita com o paciente', async () => {
      repos.assessments.findByConditionId.mockResolvedValue([{ id: 'a-1' }]);
      repos.conditions.findById.mockResolvedValue({ patientId: 'pac-1' });

      expect(await listConditionAssessmentsFor(admin, 'cond-1')).toEqual([
        { id: 'a-1' },
      ]);
      expect(mocks.recordAudit).toHaveBeenCalledWith(
        repos.auditEvents,
        admin,
        expect.objectContaining({
          resourceType: 'assessments',
          patientId: 'pac-1',
        }),
      );
    });

    it('Dada condição que sumiu entre as leituras, Quando listar, Então a auditoria segue sem paciente', async () => {
      repos.assessments.findByConditionId.mockResolvedValue([]);
      repos.conditions.findById.mockResolvedValue(null);

      await listConditionAssessmentsFor(admin, 'cond-1');

      expect(mocks.recordAudit).toHaveBeenCalledWith(
        repos.auditEvents,
        admin,
        expect.objectContaining({ patientId: null }),
      );
    });
  });

  describe('Cenário: assinatura do plano de cuidados (DOC-11)', () => {
    it('Dado profissional da empresa, Quando ler, Então devolve o cadastro dele', async () => {
      repos.professionals.findById.mockResolvedValue({ id: 'prof-1' });

      expect(await getPrescribingProfessionalFor(admin, 'prof-1')).toEqual({
        id: 'prof-1',
      });
    });

    it('Dado profissional que não é da empresa, Quando ler, Então nulo (volta a assinatura da clínica)', async () => {
      repos.professionals.findById.mockResolvedValue(null);

      expect(await getPrescribingProfessionalFor(admin, 'prof-x')).toBeNull();
    });
  });
});
