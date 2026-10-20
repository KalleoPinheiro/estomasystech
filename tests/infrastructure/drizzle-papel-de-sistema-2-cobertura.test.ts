import { describe, expect, it } from 'vitest';
import { Invoice } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { Appointment } from '@/domain/scheduling/appointment';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import { DrizzleInvoiceRepository } from '@/infrastructure/persistence/drizzle/drizzle-invoice-repository';
import { DrizzleSessionPackageRepository } from '@/infrastructure/persistence/drizzle/drizzle-package-repository';
import { DrizzlePartnerRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleProfessionalRepository } from '@/infrastructure/persistence/drizzle/drizzle-professional-repository';
import { DrizzleScheduleAvailabilityRepository } from '@/infrastructure/persistence/drizzle/drizzle-schedule-availability-repository';
import { DrizzleWaitlistRepository } from '@/infrastructure/persistence/drizzle/drizzle-waitlist-repository';
import { TEST_CIPHER } from '../support/cipher';

// Papel de sistema (clinicId nulo) lê entre empresas, mas nunca grava.
// A recusa acontece antes de qualquer acesso ao banco.
const semBanco = {} as AppDb;

describe('Feature: Papel de sistema não grava cadastro, agenda nem financeiro (ADR-001)', () => {
  it('Dado papel de sistema, Quando salvar paciente, parceiro ou profissional, Então recusa', async () => {
    await expect(
      new DrizzlePatientRepository(semBanco, null, TEST_CIPHER).save(
        Patient.create({ fullName: 'Maria da Silva', phone: '11999990000' }),
      ),
    ).rejects.toThrow('Papel de sistema');
    await expect(
      new DrizzlePartnerRepository(semBanco, null).save(
        Partner.create({
          fullName: 'Dr. Parceiro',
          email: 'parceiro@x.com',
          phone: '11999990000',
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar parceiro');
    await expect(
      new DrizzleProfessionalRepository(semBanco, null).save(
        Professional.create({ fullName: 'Ana Enfermeira' }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar profissional');
  });

  it('Dado papel de sistema, Quando salvar consulta, marcar evento minimizado, salvar fatura ou entrar na fila, Então recusa', async () => {
    const appointment = Appointment.create({
      patientId: 'p1',
      slot: TimeSlot.create(
        new Date('2026-10-20T09:00:00Z'),
        new Date('2026-10-20T10:00:00Z'),
      ),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    });
    const appointments = new DrizzleAppointmentRepository(
      semBanco,
      null,
      TEST_CIPHER,
    );

    await expect(appointments.save(appointment)).rejects.toThrow(
      'Papel de sistema não pode salvar consulta',
    );
    await expect(
      appointments.markCalendarEventMinimized(appointment.id, new Date()),
    ).rejects.toThrow('Papel de sistema não pode alterar consulta');
    await expect(
      new DrizzleInvoiceRepository(semBanco, null, TEST_CIPHER).save(
        Invoice.create({
          patientId: 'p1',
          description: 'Curativo',
          amount: Money.fromCents(15000),
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar fatura');
    await expect(
      new DrizzleWaitlistRepository(semBanco, null, TEST_CIPHER).save(
        WaitlistEntry.create({
          patientId: 'p1',
          fromDate: '2026-11-01',
          toDate: '2026-11-10',
          source: 'staff',
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode alterar a lista de espera');
  });

  it('Dado papel de sistema, Quando vender pacote, registrar consumo ou alterar bloqueios da agenda, Então recusa', async () => {
    const packages = new DrizzleSessionPackageRepository(semBanco, null);
    await expect(
      packages.save(
        SessionPackage.create({
          patientId: 'p1',
          procedureId: 'proc1',
          totalSessions: 5,
          priceCents: 100000,
        }),
      ),
    ).rejects.toThrow('Papel de sistema');
    await expect(packages.recordConsumption('pkg1', 'ap1')).rejects.toThrow(
      'Papel de sistema não pode registrar consumo de pacote',
    );

    const availability = new DrizzleScheduleAvailabilityRepository(
      semBanco,
      null,
    );
    await expect(availability.deleteClosure('bloqueio-1')).rejects.toThrow(
      'Papel de sistema não pode alterar a agenda',
    );
  });
});
