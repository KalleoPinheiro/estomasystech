import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreateCondition } from '@/application/clinical/create-condition';
import { CreatePatient } from '@/application/patients/create-patient';
import { AddOwnConditionPhoto } from '@/application/portal/add-own-condition-photo';
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
import {
  noTransaction,
  RowLockingTransactionManager,
} from '../support/transaction-scope';

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
    locking = undefined;
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
      procedures,
      new InMemoryFollowUpRepository(),
      noTransaction({ patients, appointments }),
    ).execute({
      patientId: maria.id,
      procedureId: curativo.id,
      startsAt,
      now,
    });

  // Uma instância só: o lock de linha vive no gerenciador, como no Postgres.
  let locking: RowLockingTransactionManager | undefined;
  const lockingTransactions = () => {
    locking ??= new RowLockingTransactionManager({ patients, appointments });
    return locking;
  };

  const scheduleOwnConcurrently = (startsAt: Date) =>
    new ScheduleOwnAppointment(
      patients,
      procedures,
      new InMemoryFollowUpRepository(),
      lockingTransactions(),
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

  describe('Atomicidade do teto (#363)', () => {
    it('Dado o paciente sem consultas, Quando 5 agendamentos chegam ao mesmo tempo, Então só o teto é criado e os demais são rejeitados', async () => {
      const results = await Promise.allSettled(
        [1, 2, 3, 4, 5].map((day) => scheduleOwnConcurrently(at(day))),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
        PORTAL_MAX_FUTURE_APPOINTMENTS,
      );
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(5 - PORTAL_MAX_FUTURE_APPOINTMENTS);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(ValidationError);
        expect(r.reason.message).toMatch(/já tem 2 consultas futuras/);
      }
      expect(await appointments.findByPatientId(maria.id)).toHaveLength(
        PORTAL_MAX_FUTURE_APPOINTMENTS,
      );
    });

    it('Dado uma consulta futura, Quando 3 agendamentos chegam juntos, Então só mais uma é criada', async () => {
      await scheduleOwn(at(1));

      const results = await Promise.allSettled(
        [2, 3, 4].map((day) => scheduleOwnConcurrently(at(day))),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await appointments.findByPatientId(maria.id)).toHaveLength(2);
    });

    it('Dado agendamento rejeitado por conflito de horário, Quando outro chega depois, Então o lock foi liberado e ele é atendido', async () => {
      await scheduleOwnConcurrently(at(1));
      await expect(scheduleOwnConcurrently(at(1))).rejects.toThrow();

      await expect(scheduleOwnConcurrently(at(2))).resolves.toBeDefined();
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

  describe('Atomicidade da cota (#363)', () => {
    const PNG_BYTES = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    // O relógio do envio é o real (as fotos novas nascem com `new Date()`),
    // então as já enviadas são semeadas relativas a ele.
    let stored: Set<string>;
    let upload: (condition: ClinicalCondition) => Promise<ConditionPhoto>;

    beforeEach(() => {
      stored = new Set();
      const storage = {
        write: async (id: string) => {
          stored.add(id);
        },
        read: async () => null,
        remove: async (id: string) => {
          stored.delete(id);
        },
      };
      const transactions = new RowLockingTransactionManager({
        patients,
        conditions,
        conditionPhotos: photos,
      });
      upload = (condition) =>
        new AddOwnConditionPhoto(storage, transactions).execute({
          patientId: maria.id,
          conditionId: condition.id,
          data: PNG_BYTES,
        });
    });

    it(`Dado ${PATIENT_MAX_PHOTOS_PER_DAY - 2} fotos nas últimas 24 h, Quando 6 envios chegam ao mesmo tempo, Então só 2 passam, ficam gravadas e no storage`, async () => {
      await sendPhotos(ferida.id, PATIENT_MAX_PHOTOS_PER_DAY - 2, {
        createdAt: new Date(Date.now() - 3_600_000),
      });
      const before = stored.size;

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          upload(i % 2 === 0 ? ferida : estomia),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(4);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(ValidationError);
        expect(r.reason.message).toMatch(/já enviou 10 fotos/);
      }
      expect(stored.size - before).toBe(2);
      await expect(
        assertPatientPhotoQuota(conditions, photos, maria.id),
      ).rejects.toThrow(/já enviou 10 fotos/);
    });

    it('Dado a cota cheia, Quando o envio é rejeitado, Então nada vai ao storage', async () => {
      await sendPhotos(ferida.id, PATIENT_MAX_PHOTOS_PER_DAY, {
        createdAt: new Date(Date.now() - 3_600_000),
      });

      await expect(upload(ferida)).rejects.toThrow(ValidationError);
      expect(stored.size).toBe(0);
    });
  });
});
