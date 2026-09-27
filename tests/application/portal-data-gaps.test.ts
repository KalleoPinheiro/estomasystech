import { beforeEach, describe, expect, it } from 'vitest';
import { AddConditionPhoto } from '@/application/clinical/add-condition-photo';
import { CreateCondition } from '@/application/clinical/create-condition';
import { CreatePartner } from '@/application/partners/create-partner';
import { UpdatePartner } from '@/application/partners/update-partner';
import { CreatePatient } from '@/application/patients/create-patient';
import { SetPatientActive } from '@/application/patients/set-patient-active';
import { GetPartnerPortalData } from '@/application/portal/get-partner-portal-data';
import { GetPatientPortalData } from '@/application/portal/get-patient-portal-data';
import type { Patient } from '@/domain/patient/patient';
import { NotFoundError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionAssessmentRepository,
  InMemoryConditionPhotoRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPartnerId, portalPatientId } from '../support/portal-identity';

const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
]);

describe('Feature: Lacunas de cobertura — dados dos portais (paciente e parceiro)', () => {
  let patientRepo: InMemoryPatientRepository;
  let partnerRepo: InMemoryPartnerRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let conditionRepo: InMemoryClinicalConditionRepository;
  let assessmentRepo: InMemoryConditionAssessmentRepository;
  let photoRepo: InMemoryConditionPhotoRepository;
  let followUpRepo: InMemoryFollowUpRepository;
  let maria: Patient;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    partnerRepo = new InMemoryPartnerRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    conditionRepo = new InMemoryClinicalConditionRepository();
    assessmentRepo = new InMemoryConditionAssessmentRepository();
    photoRepo = new InMemoryConditionPhotoRepository();
    followUpRepo = new InMemoryFollowUpRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
  });

  const patientPortal = (photos?: InMemoryConditionPhotoRepository) =>
    new GetPatientPortalData(
      patientRepo,
      appointmentRepo,
      conditionRepo,
      assessmentRepo,
      invoiceRepo,
      followUpRepo,
      photos,
    );

  describe('Cenário: portal do paciente — paciente inativo', () => {
    it('Dado paciente desativado, Quando carregar portal, Então lança NotFoundError', async () => {
      await new SetPatientActive(patientRepo).execute({
        id: maria.id,
        active: false,
      });

      await expect(
        patientPortal().execute({
          patientId: await portalPatientId(patientRepo, 'maria@example.com'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Cenário: portal do paciente — fotos de condições', () => {
    it('Dado repositório de fotos informado e condição com fotos, Quando carregar portal, Então agrupa fotos por condição', async () => {
      const condition = await new CreateCondition(
        conditionRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        kind: 'wound',
        title: 'Úlcera venosa',
      });
      await new AddConditionPhoto(photoRepo, conditionRepo, {
        write: async () => undefined,
        read: async () => null,
        remove: async () => undefined,
      }).execute({ conditionId: condition.id, data: JPEG_BYTES });

      const data = await patientPortal(photoRepo).execute({
        patientId: maria.id,
      });

      expect(data.conditions).toHaveLength(1);
      expect(data.conditions[0].photos).toHaveLength(1);
    });

    it('Dado repositório de fotos NÃO informado, Quando carregar portal, Então lista de fotos vem vazia sem erro', async () => {
      await new CreateCondition(conditionRepo, patientRepo).execute({
        patientId: maria.id,
        kind: 'wound',
        title: 'Úlcera venosa',
      });

      const data = await patientPortal().execute({
        patientId: maria.id,
      });

      expect(data.conditions).toHaveLength(1);
      expect(data.conditions[0].photos).toEqual([]);
    });
  });

  describe('Cenário: portal do parceiro — parceiro inativo', () => {
    it('Dado parceiro desativado, Quando carregar portal, Então lança NotFoundError', async () => {
      const partner = await new CreatePartner(partnerRepo).execute({
        fullName: 'Dr. Carlos Andrade',
        email: 'dr.carlos@x.com',
        phone: '11955550000',
      });
      await new UpdatePartner(partnerRepo).execute({
        id: partner.id,
        active: false,
      });

      await expect(
        new GetPartnerPortalData(
          partnerRepo,
          patientRepo,
          appointmentRepo,
          conditionRepo,
          assessmentRepo,
        ).execute({
          partnerId: await portalPartnerId(partnerRepo, 'dr.carlos@x.com'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Cenário: portal do parceiro — indicação sem consultas/condições', () => {
    it('Dado paciente indicado sem consultas nem condições, Quando carregar portal, Então listas vêm vazias', async () => {
      const partner = await new CreatePartner(partnerRepo).execute({
        fullName: 'Dr. Carlos Andrade',
        email: 'dr.carlos@x.com',
        phone: '11955550000',
      });
      await new CreatePatient(patientRepo, partnerRepo).execute({
        fullName: 'Paciente Indicado',
        email: 'indicado@x.com',
        phone: '11977770000',
        referredByPartnerId: partner.id,
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

      expect(data.referredPatients).toHaveLength(1);
      expect(data.referredPatients[0].appointments).toEqual([]);
      expect(data.referredPatients[0].conditions).toEqual([]);
    });
  });
});
