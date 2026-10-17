import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptPartnerShareConsent,
  findPatientOrThrow,
  getPartnerShareConsent,
  registerPaperPartnerShareConsent,
  revokePartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { GetPartnerPortalData } from '@/application/portal/get-partner-portal-data';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionAssessmentRepository,
  InMemoryPartnerShareConsentRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const TEXT = 'texto vigente';
const CONSENT = { text: TEXT, version: 'v-test' };
const NOW = new Date('2026-10-11T12:00:00Z');
/** Dentro da janela de 24 meses de NOW. */
const RECENT = new Date('2026-06-01T12:00:00Z');
/** Fora da janela (antes de 2024-10-11). */
const OLD = new Date('2024-05-01T12:00:00Z');

describe('Feature: Consentimento para o parceiro e janela de 24 meses (#292)', () => {
  let partners: InMemoryPartnerRepository;
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let conditions: InMemoryClinicalConditionRepository;
  let assessments: InMemoryConditionAssessmentRepository;
  let consents: InMemoryPartnerShareConsentRepository;
  let partner: Partner;
  let patient: Patient;

  const deps = () => ({ partners, partnerShareConsents: consents });

  const portal = () =>
    new GetPartnerPortalData(
      partners,
      patients,
      appointments,
      conditions,
      assessments,
      { repository: consents, consentText: TEXT },
      () => NOW,
    ).execute({ partnerId: partner.id });

  const addAppointment = async (start: Date, complete: boolean) => {
    const created = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(start, new Date(start.getTime() + 3_600_000)),
      procedure: `Curativo ${start.toISOString()}`,
      price: Money.fromCents(10000),
    });
    const appointment = complete ? created.complete() : created;
    await appointments.save(appointment);
    return appointment;
  };

  const addCondition = async (createdAt: Date, title: string) => {
    const condition = ClinicalCondition.restore({
      id: `cond-${title}`,
      patientId: patient.id,
      kind: 'wound',
      title,
      status: 'active',
      createdAt,
    });
    await conditions.save(condition);
    return condition;
  };

  const addAssessment = async (conditionId: string, createdAt: Date) => {
    await assessments.save(
      ConditionAssessment.restore({
        conditionId,
        lengthMm: 10,
        id: `${conditionId}-${createdAt.toISOString()}`,
        createdAt,
      }),
    );
  };

  const grant = () =>
    acceptPartnerShareConsent(deps(), patient, CONSENT, '10.0.0.1');

  beforeEach(async () => {
    partners = new InMemoryPartnerRepository();
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    conditions = new InMemoryClinicalConditionRepository();
    assessments = new InMemoryConditionAssessmentRepository();
    consents = new InMemoryPartnerShareConsentRepository();
    partner = Partner.create({
      fullName: 'Dra. Parceira',
      email: 'parceira@x.com',
      phone: '11955550000',
    });
    await partners.save(partner);
    patient = Patient.create({
      fullName: 'Paciente Indicado',
      email: 'indicado@x.com',
      phone: '11999990000',
      referredByPartnerId: partner.id,
    });
    await patients.save(patient);
  });

  describe('Cenário: GetPartnerPortalData filtra por consentimento e por 24 meses', () => {
    beforeEach(async () => {
      await addAppointment(RECENT, true);
      await addAppointment(OLD, true);
      const recent = await addCondition(RECENT, 'recente');
      await addAssessment(recent.id, RECENT);
      await addAssessment(recent.id, OLD);
      // Condição antiga com avaliação recente: entra pela avaliação.
      const oldWithRecent = await addCondition(OLD, 'antiga-com-recente');
      await addAssessment(oldWithRecent.id, RECENT);
      // Condição e avaliação antigas: fora da janela.
      const oldOnly = await addCondition(OLD, 'antiga');
      await addAssessment(oldOnly.id, OLD);
    });

    it('Dado consentimento ativo, Então vê só consultas, condições e avaliações da janela', async () => {
      await grant();

      const [entry] = (await portal()).referredPatients;

      expect(entry.sharing).toBe(true);
      expect(entry.attended).toBe(true);
      expect(entry.appointments.map((a) => a.slot.start)).toEqual([RECENT]);
      expect(entry.conditions.map((c) => c.condition.title).sort()).toEqual([
        'antiga-com-recente',
        'recente',
      ]);
      for (const { assessments: list } of entry.conditions) {
        expect(list.map((a) => a.createdAt)).toEqual([RECENT]);
      }
    });

    it('Dado sem consentimento, Então só sabe que foi atendido: sem consultas nem condições', async () => {
      const [entry] = (await portal()).referredPatients;

      expect(entry).toMatchObject({
        sharing: false,
        attended: true,
        appointments: [],
        conditions: [],
      });
    });

    it('Dado consentimento revogado, Então volta a ver só o status', async () => {
      await grant();
      await revokePartnerShareConsent(deps(), patient, 'patient', null);

      const [entry] = (await portal()).referredPatients;

      expect(entry).toMatchObject({ sharing: false, conditions: [] });
    });

    it('Dado consentimento de texto antigo, Então não vale', async () => {
      await consents.save(
        PartnerShareConsent.accept({
          patientId: patient.id,
          partnerId: partner.id,
          consentText: 'texto antigo',
          textVersion: 'v-antiga',
        }),
      );

      const [entry] = (await portal()).referredPatients;

      expect(entry.sharing).toBe(false);
    });

    it('Dado consentimento dado a outro parceiro, Então não vale para este', async () => {
      await consents.save(
        PartnerShareConsent.accept({
          patientId: patient.id,
          partnerId: 'outro-parceiro',
          consentText: TEXT,
          textVersion: 'v-test',
        }),
      );

      const [entry] = (await portal()).referredPatients;

      expect(entry.sharing).toBe(false);
    });
  });

  describe('Cenário: atendimento fora da janela ou não realizado', () => {
    it('Dado só consulta realizada fora da janela, Então attended é false', async () => {
      await addAppointment(OLD, true);

      const [entry] = (await portal()).referredPatients;

      expect(entry.attended).toBe(false);
    });

    it('Dado só consulta agendada (não realizada), Então attended é false', async () => {
      await addAppointment(RECENT, false);

      const [entry] = (await portal()).referredPatients;

      expect(entry.attended).toBe(false);
    });
  });

  describe('Cenário: casos de uso do consentimento', () => {
    it('Dado paciente indicado sem histórico, Quando consultar, Então inativo com o parceiro', async () => {
      const view = await getPartnerShareConsent(deps(), patient, CONSENT);

      expect(view?.partner.id).toBe(partner.id);
      expect(view?.status.active).toBe(false);
    });

    it('Dado aceite repetido, Então não grava um segundo registro', async () => {
      const first = await grant();
      const second = await grant();

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.record.id).toBe(first.record.id);
      expect(await consents.findByPatientId(patient.id)).toHaveLength(1);
    });

    it('Dado consentimento em papel, Então libera como o aceite do portal e guarda origem e autor', async () => {
      const { record, created } = await registerPaperPartnerShareConsent(
        deps(),
        patient,
        CONSENT,
        'recepcao@clinica.com',
        null,
      );

      expect(created).toBe(true);
      expect(record.source).toBe('paper');
      expect(record.recordedBy).toBe('recepcao@clinica.com');
      const view = await getPartnerShareConsent(deps(), patient, CONSENT);
      expect(view?.status.active).toBe(true);
    });

    it('Dado consentimento já ativo, Quando registrar em papel, Então não grava outro', async () => {
      const first = await grant();
      const again = await registerPaperPartnerShareConsent(
        deps(),
        patient,
        CONSENT,
        'recepcao@clinica.com',
        null,
      );

      expect(again.created).toBe(false);
      expect(again.record.id).toBe(first.record.id);
      expect(await consents.findByPatientId(patient.id)).toHaveLength(1);
    });

    it('Dado revogação pela equipe, Então o registro guarda o ator', async () => {
      await grant();
      const record = await revokePartnerShareConsent(
        deps(),
        patient,
        'staff',
        null,
      );

      expect(record.actor).toBe('staff');
      const view = await getPartnerShareConsent(deps(), patient, CONSENT);
      expect(view?.status.current?.kind).toBe('revoke');
    });

    it('Dado paciente sem indicação, Então consulta devolve null e aceite/revogação dão NotFound', async () => {
      const lone = Patient.create({
        fullName: 'Sem Indicação',
        email: 'lone@x.com',
        phone: '11999990001',
      });

      expect(await getPartnerShareConsent(deps(), lone, CONSENT)).toBeNull();
      await expect(
        acceptPartnerShareConsent(deps(), lone, CONSENT, null),
      ).rejects.toThrow(NotFoundError);
      await expect(
        revokePartnerShareConsent(deps(), lone, 'staff', null),
      ).rejects.toThrow(NotFoundError);
      await expect(
        registerPaperPartnerShareConsent(
          deps(),
          lone,
          CONSENT,
          'a@b.com',
          null,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('Dado parceiro indicador desativado, Então consulta devolve null', async () => {
      await partners.save(partner.deactivate());

      expect(await getPartnerShareConsent(deps(), patient, CONSENT)).toBeNull();
    });

    it('Dado id de paciente inexistente, Então findPatientOrThrow lança NotFound', async () => {
      await expect(findPatientOrThrow(patients, 'nao-existe')).rejects.toThrow(
        NotFoundError,
      );
      expect((await findPatientOrThrow(patients, patient.id)).id).toBe(
        patient.id,
      );
    });
  });
});
