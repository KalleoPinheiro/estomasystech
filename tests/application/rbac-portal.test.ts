import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreateInvoice } from '@/application/billing/create-invoice';
import { AddConditionAssessment } from '@/application/clinical/add-condition-assessment';
import { CreateCondition } from '@/application/clinical/create-condition';
import { CreatePartner } from '@/application/partners/create-partner';
import { ListPartners } from '@/application/partners/list-partners';
import { UpdatePartner } from '@/application/partners/update-partner';
import { CreatePatient } from '@/application/patients/create-patient';
import { UpdatePatient } from '@/application/patients/update-patient';
import { GetPartnerPortalData } from '@/application/portal/get-partner-portal-data';
import { GetPatientPortalData } from '@/application/portal/get-patient-portal-data';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionAssessmentRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPartnerId, portalPatientId } from '../support/portal-identity';

describe('Feature: RBAC — parceria, indicação e portais', () => {
  let patientRepo: InMemoryPatientRepository;
  let partnerRepo: InMemoryPartnerRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let conditionRepo: InMemoryClinicalConditionRepository;
  let assessmentRepo: InMemoryConditionAssessmentRepository;
  let followUpRepo: InMemoryFollowUpRepository;

  beforeEach(() => {
    patientRepo = new InMemoryPatientRepository();
    partnerRepo = new InMemoryPartnerRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    conditionRepo = new InMemoryClinicalConditionRepository();
    assessmentRepo = new InMemoryConditionAssessmentRepository();
    followUpRepo = new InMemoryFollowUpRepository();
  });

  const createPartner = (email = 'dr.carlos@x.com') =>
    new CreatePartner(partnerRepo).execute({
      fullName: 'Dr. Carlos Andrade',
      email,
      phone: '11955550000',
      crm: 'CRM-SP 123456',
      specialty: 'Cirurgia vascular',
    });

  const createPatient = (email: string, referredByPartnerId?: string | null) =>
    new CreatePatient(patientRepo).execute({
      fullName: `Paciente ${email}`,
      email,
      phone: '11999990000',
      referredByPartnerId: referredByPartnerId ?? null,
    });

  describe('Cenário: indicação exige parceiro válido e ativo', () => {
    it('Dado parceiro inexistente, Quando criar paciente indicado, Então lança ValidationError', async () => {
      await expect(
        new CreatePatient(patientRepo, partnerRepo).execute({
          fullName: 'Maria da Silva',
          email: 'maria@x.com',
          phone: '11999990000',
          referredByPartnerId: 'ghost',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado parceiro desativado, Quando indicar, Então lança ValidationError', async () => {
      const partner = await createPartner();
      await new UpdatePartner(partnerRepo).execute({
        id: partner.id,
        active: false,
      });

      await expect(
        new CreatePatient(patientRepo, partnerRepo).execute({
          fullName: 'Maria da Silva',
          email: 'maria@x.com',
          phone: '11999990000',
          referredByPartnerId: partner.id,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado parceiro ativo, Quando indicar na criação e na atualização, Então aceita', async () => {
      const partner = await createPartner();
      const patient = await new CreatePatient(patientRepo, partnerRepo).execute(
        {
          fullName: 'Maria da Silva',
          email: 'maria@x.com',
          phone: '11999990000',
          referredByPartnerId: partner.id,
        },
      );

      expect(patient.referredByPartnerId).toBe(partner.id);

      await expect(
        new UpdatePatient(patientRepo, partnerRepo).execute({
          id: patient.id,
          referredByPartnerId: 'ghost',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Cenário: CRUD de parceiro', () => {
    it('Dado email duplicado, Quando criar parceiro, Então lança ConflictError (#211)', async () => {
      await createPartner();

      await expect(createPartner()).rejects.toThrow(ConflictError);
    });

    it('Dado parceiro, Quando atualizar e desativar, Então persiste; listar retorna todos', async () => {
      const partner = await createPartner();

      await new UpdatePartner(partnerRepo).execute({
        id: partner.id,
        specialty: 'Angiologia',
        active: false,
      });

      const list = await new ListPartners(partnerRepo).execute();
      expect(list).toHaveLength(1);
      expect(list[0].specialty).toBe('Angiologia');
      expect(list[0].isActive).toBe(false);
    });
  });

  describe('Cenário: portal do paciente vê apenas os próprios dados', () => {
    it('Dado dois pacientes com consultas e faturas, Quando carregar portal de um, Então só os dados dele', async () => {
      const maria = await createPatient('maria@x.com');
      const joao = await createPatient('joao@x.com');

      const schedule = new ScheduleAppointment(appointmentRepo, patientRepo);
      await schedule.execute({
        patientId: maria.id,
        startsAt: new Date('2026-07-20T09:00:00Z'),
        endsAt: new Date('2026-07-20T10:00:00Z'),
        procedure: 'Troca de bolsa',
        priceCents: 25000,
      });
      await schedule.execute({
        patientId: joao.id,
        startsAt: new Date('2026-07-21T09:00:00Z'),
        endsAt: new Date('2026-07-21T10:00:00Z'),
        procedure: 'Curativo',
        priceCents: 15000,
      });
      await new CreateInvoice(invoiceRepo, patientRepo).execute({
        patientId: maria.id,
        description: 'Consulta',
        amountCents: 25000,
      });
      const condition = await new CreateCondition(
        conditionRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        kind: 'wound',
        title: 'Úlcera venosa',
      });
      await new AddConditionAssessment(assessmentRepo, conditionRepo).execute({
        conditionId: condition.id,
        lengthMm: 40,
        widthMm: 20,
        painScale: 3,
      });

      const portal = new GetPatientPortalData(
        patientRepo,
        appointmentRepo,
        conditionRepo,
        assessmentRepo,
        invoiceRepo,
        followUpRepo,
      );
      const data = await portal.execute({
        patientId: await portalPatientId(patientRepo, 'maria@x.com'),
      });

      expect(data.patient.id).toBe(maria.id);
      expect(data.appointments).toHaveLength(1);
      expect(data.appointments[0].procedure).toBe('Troca de bolsa');
      expect(data.invoices).toHaveLength(1);
      expect(data.conditions).toHaveLength(1);
      expect(data.conditions[0].assessments[0].areaMm2).toBe(800);
    });

    it('Dado email sem paciente, Quando carregar portal, Então NotFoundError', async () => {
      const portal = new GetPatientPortalData(
        patientRepo,
        appointmentRepo,
        conditionRepo,
        assessmentRepo,
        invoiceRepo,
        followUpRepo,
      );

      await expect(
        portal.execute({
          patientId: await portalPatientId(patientRepo, 'ghost@x.com'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Cenário: portal do parceiro vê apenas pacientes que indicou', () => {
    it('Dado pacientes de vários parceiros, Quando carregar portal, Então só as indicações dele com evolução', async () => {
      const carlos = await createPartner('dr.carlos@x.com');
      const outra = await createPartner('dra.outra@x.com');
      const indicada = await createPatient('indicada@x.com', carlos.id);
      await createPatient('de-outra@x.com', outra.id);
      await createPatient('sem-indicacao@x.com');

      await new ScheduleAppointment(appointmentRepo, patientRepo).execute({
        patientId: indicada.id,
        startsAt: new Date('2026-07-20T09:00:00Z'),
        endsAt: new Date('2026-07-20T10:00:00Z'),
        procedure: 'Avaliação de estomia',
        priceCents: 20000,
      });
      const condition = await new CreateCondition(
        conditionRepo,
        patientRepo,
      ).execute({
        patientId: indicada.id,
        kind: 'stoma',
        title: 'Colostomia terminal',
        stomaType: 'colostomia',
      });
      await new AddConditionAssessment(assessmentRepo, conditionRepo).execute({
        conditionId: condition.id,
        skinCondition: 'Íntegra',
      });

      const data = await new GetPartnerPortalData(
        partnerRepo,
        patientRepo,
        appointmentRepo,
        conditionRepo,
        assessmentRepo,
      ).execute({
        partnerId: await portalPartnerId(partnerRepo, 'dr.carlos@x.com'),
      });

      expect(data.partner.id).toBe(carlos.id);
      expect(data.referredPatients).toHaveLength(1);
      expect(data.referredPatients[0].patient.email).toBe('indicada@x.com');
      expect(data.referredPatients[0].appointments).toHaveLength(1);
      expect(data.referredPatients[0].conditions[0].assessments).toHaveLength(
        1,
      );
    });

    it('Dado email sem parceiro ativo, Quando carregar portal, Então NotFoundError', async () => {
      await expect(
        new GetPartnerPortalData(
          partnerRepo,
          patientRepo,
          appointmentRepo,
          conditionRepo,
          assessmentRepo,
        ).execute({
          partnerId: await portalPartnerId(partnerRepo, 'ghost@x.com'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
