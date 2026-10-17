import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreateCondition } from '@/application/clinical/create-condition';
import { CreatePatient } from '@/application/patients/create-patient';
import { assertPatientPhotoQuota } from '@/application/portal/assert-photo-quota';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { RescheduleOwnAppointment } from '@/application/portal/reschedule-own-appointment';
import { ScheduleOwnAppointment } from '@/application/portal/schedule-own-appointment';
import { Procedure } from '@/domain/catalog/procedure';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import {
  ConditionPhoto,
  PATIENT_MAX_PHOTOS_PER_DAY,
} from '@/domain/clinical/condition-photo';
import type { Patient } from '@/domain/patient/patient';
import {
  PORTAL_BOOKING_HORIZON_DAYS,
  PORTAL_MAX_FUTURE_APPOINTMENTS,
} from '@/domain/scheduling/patient-self-service';
import { ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionPhotoRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryProcedureRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

// Limites anti-abuso do portal (#213). Testes rodam com TZ=UTC; o relógio é
// injetado, então as datas não envelhecem.
const now = new Date('2026-10-19T12:00:00Z'); // segunda-feira
const DAY_MS = 86_400_000;
const at = (daysAhead: number, hour = 9) =>
  new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysAhead,
      hour,
    ),
  );

describe('Feature: Limites anti-abuso do autoagendamento (#213)', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let procedures: InMemoryProcedureRepository;
  let maria: Patient;
  let curativo: Procedure;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    procedures = new InMemoryProcedureRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    curativo = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 60,
    });
    await procedures.save(curativo);
  });

  const scheduleByStaff = (startsAt: Date) =>
    new ScheduleAppointment(appointments, patients).execute({
      patientId: maria.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      procedure: 'Curativo',
      priceCents: 15000,
    });

  const scheduleOwn = (startsAt: Date) =>
    new ScheduleOwnAppointment(
      patients,
      appointments,
      procedures,
      new InMemoryFollowUpRepository(),
    ).execute({
      patientId: maria.id,
      procedureId: curativo.id,
      startsAt,
      now,
    });

  describe('Teto de consultas futuras', () => {
    it(`Dado ${PORTAL_MAX_FUTURE_APPOINTMENTS} consultas futuras pelo portal, Quando agendar a terceira, Então rejeita com mensagem clara e nada é criado`, async () => {
      await scheduleOwn(at(1));
      await scheduleOwn(at(2));

      await expect(scheduleOwn(at(3))).rejects.toThrow(
        /já tem 2 consultas futuras/,
      );
      expect(await appointments.findByPatientId(maria.id)).toHaveLength(2);
    });

    it('Dado uma consulta futura, Quando agendar a segunda, Então aceita', async () => {
      await scheduleOwn(at(1));

      await expect(scheduleOwn(at(2))).resolves.toBeDefined();
    });

    it('Dado consultas marcadas pela equipe, Quando agendar pelo portal, Então elas contam no teto (a agenda é a mesma)', async () => {
      await scheduleByStaff(at(1));
      await scheduleByStaff(at(2));

      await expect(scheduleOwn(at(3))).rejects.toThrow(ValidationError);
    });

    it('Dado consulta cancelada ou já passada, Quando agendar, Então não contam no teto', async () => {
      const cancelled = await scheduleOwn(at(1));
      await appointments.save(cancelled.cancel());
      await appointments.save(
        (await scheduleByStaff(at(-7))).cancel({ reason: 'x' }),
      );
      await scheduleByStaff(at(-6)); // realizada/passada, ainda ativa no banco
      await scheduleOwn(at(2));

      await expect(scheduleOwn(at(3))).resolves.toBeDefined();
    });
  });

  describe('Horizonte', () => {
    it(`Dado horário a ${PORTAL_BOOKING_HORIZON_DAYS} dias, Quando agendar, Então aceita`, async () => {
      await expect(
        scheduleOwn(
          new Date(now.getTime() + PORTAL_BOOKING_HORIZON_DAYS * DAY_MS),
        ),
      ).resolves.toBeDefined();
    });

    it(`Dado horário além de ${PORTAL_BOOKING_HORIZON_DAYS} dias, Quando agendar, Então rejeita com mensagem clara e nada é criado`, async () => {
      await expect(
        scheduleOwn(
          new Date(now.getTime() + PORTAL_BOOKING_HORIZON_DAYS * DAY_MS + 1),
        ),
      ).rejects.toThrow(/em até 60 dias/);
      expect(await appointments.findByPatientId(maria.id)).toHaveLength(0);
    });

    it('Dado remarcação para além do horizonte, Quando remarcar, Então rejeita e a consulta fica onde estava', async () => {
      const own = await scheduleOwn(at(4));
      const reschedule = (startsAt: Date) =>
        new RescheduleOwnAppointment(patients, appointments).execute({
          patientId: maria.id,
          appointmentId: own.id,
          startsAt,
          now,
        });

      await expect(reschedule(at(61))).rejects.toThrow(/em até 60 dias/);
      await expect(reschedule(at(30))).resolves.toBeDefined();
    });

    it('Dado dia além do horizonte, Quando listar horários, Então rejeita com mensagem clara; dia dentro continua ofertando', async () => {
      const list = (date: string) =>
        new ListAvailableSlots(patients, appointments, procedures).execute({
          patientId: maria.id,
          procedureId: curativo.id,
          date,
          now,
        });

      // 2026-12-18 = 60 dias após a segunda-feira 2026-10-19 (sexta).
      expect((await list('2026-12-18')).length).toBeGreaterThan(0);
      // O dia do horizonte só oferta o que cabe até o instante-limite (12:00).
      const boundary = await list('2026-12-18');
      expect(
        boundary.every(
          (slot) =>
            slot.startsAt.getTime() <=
            now.getTime() + PORTAL_BOOKING_HORIZON_DAYS * DAY_MS,
        ),
      ).toBe(true);
      await expect(list('2026-12-21')).rejects.toThrow(/em até 60 dias/);
    });
  });
});

describe('Feature: Cota diária de fotos do paciente (#213)', () => {
  let conditions: InMemoryClinicalConditionRepository;
  let photos: InMemoryConditionPhotoRepository;
  let patients: InMemoryPatientRepository;
  let maria: Patient;
  let ferida: ClinicalCondition;
  let estomia: ClinicalCondition;

  beforeEach(async () => {
    conditions = new InMemoryClinicalConditionRepository();
    photos = new InMemoryConditionPhotoRepository();
    patients = new InMemoryPatientRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    const create = (title: string) =>
      new CreateCondition(conditions, patients).execute({
        patientId: maria.id,
        kind: 'wound',
        title,
        stomaType: null,
        startedAt: null,
        notes: null,
      });
    ferida = await create('Úlcera venosa MID');
    estomia = await create('Lesão sacra');
  });

  const sendPhotos = async (
    conditionId: string,
    total: number,
    options: { origin?: 'patient' | 'staff'; createdAt?: Date } = {},
  ) => {
    for (let i = 0; i < total; i++) {
      const photo = ConditionPhoto.create({
        conditionId,
        contentType: 'image/png',
        sizeBytes: 100,
        origin: options.origin ?? 'patient',
      });
      await photos.save(
        options.createdAt
          ? ConditionPhoto.restore({
              id: photo.id,
              conditionId,
              contentType: 'image/png',
              sizeBytes: 100,
              origin: options.origin ?? 'patient',
              triageStatus: photo.triageStatus,
              createdAt: options.createdAt,
            })
          : photo,
      );
    }
  };

  const check = () =>
    assertPatientPhotoQuota(conditions, photos, maria.id, now);

  it(`Dado ${PATIENT_MAX_PHOTOS_PER_DAY - 1} fotos nas últimas 24 h, Quando enviar mais uma, Então aceita`, async () => {
    await sendPhotos(ferida.id, PATIENT_MAX_PHOTOS_PER_DAY - 1, {
      createdAt: new Date(now.getTime() - 3_600_000),
    });

    await expect(check()).resolves.toBeUndefined();
  });

  it(`Dado ${PATIENT_MAX_PHOTOS_PER_DAY} fotos somadas em várias condições, Quando enviar mais uma, Então rejeita com mensagem clara`, async () => {
    const recent = new Date(now.getTime() - 3_600_000);
    await sendPhotos(ferida.id, 6, { createdAt: recent });
    await sendPhotos(estomia.id, 4, { createdAt: recent });

    await expect(check()).rejects.toThrow(/já enviou 10 fotos nas últimas 24/);
  });

  it('Dado fotos com mais de 24 h, da equipe ou de outro paciente, Quando enviar, Então não contam na cota', async () => {
    await sendPhotos(ferida.id, 6, {
      createdAt: new Date(now.getTime() - 25 * 3_600_000),
    });
    await sendPhotos(ferida.id, 6, {
      origin: 'staff',
      createdAt: new Date(now.getTime() - 3_600_000),
    });
    await sendPhotos('condicao-de-outro-paciente', 6, {
      createdAt: new Date(now.getTime() - 3_600_000),
    });

    await expect(check()).resolves.toBeUndefined();
  });

  it('Dado paciente sem condições, Quando checar a cota, Então aceita', async () => {
    const other = await new CreatePatient(patients).execute({
      fullName: 'Joana',
      email: 'joana@example.com',
      phone: '11999991111',
    });

    await expect(
      assertPatientPhotoQuota(conditions, photos, other.id, now),
    ).resolves.toBeUndefined();
  });
});
