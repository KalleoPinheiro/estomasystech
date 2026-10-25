import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { Procedure } from '@/domain/catalog/procedure';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryProcedureRepository,
  InMemoryScheduleConfigRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { portalPatientId } from '../support/portal-identity';

const ORIGINAL_TZ = process.env.TZ;

describe.each(['UTC', 'America/Sao_Paulo', 'Asia/Tokyo'])(
  'Feature: autoagendamento no fuso da clínica, processo em %s (#563)',
  (processTz) => {
    beforeEach(() => {
      process.env.TZ = processTz;
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.env.TZ = ORIGINAL_TZ;
    });

    it('Dado quarta-feira, Quando lista, Então a grade 08–18 é a de São Paulo', async () => {
      const patients = new InMemoryPatientRepository();
      const procedures = new InMemoryProcedureRepository();
      await new CreatePatient(patients).execute({
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
      });
      const patientId = await portalPatientId(patients, 'maria@example.com');
      const procedure = Procedure.create({
        name: 'Curativo',
        priceCents: 15000,
        durationMinutes: 60,
      });
      await procedures.save(procedure);
      const slots = await new ListAvailableSlots(
        patients,
        new InMemoryAppointmentRepository(),
        procedures,
        new InMemoryScheduleConfigRepository(),
      ).execute({
        patientId,
        procedureId: procedure.id,
        date: '2026-10-28',
        now: new Date('2026-10-01T12:00:00Z'),
      });
      expect(slots[0].startsAt.toISOString()).toBe('2026-10-28T11:00:00.000Z');
      expect(slots.at(-1)?.endsAt.toISOString()).toBe(
        '2026-10-28T21:00:00.000Z',
      );
      expect(slots).toHaveLength(10);
    });
  },
);
