import { describe, expect, it } from 'vitest';
import { ListAppointments } from '@/application/appointments/list-appointments';
import { CancelInvoice } from '@/application/billing/cancel-invoice';
import { ListInvoices } from '@/application/billing/list-invoices';
import { CreatePatient } from '@/application/patients/create-patient';
import { SetPatientActive } from '@/application/patients/set-patient-active';
import { UpdatePatient } from '@/application/patients/update-patient';
import { Invoice } from '@/domain/billing/invoice';
import { Appointment } from '@/domain/scheduling/appointment';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const slot = () =>
  TimeSlot.create(
    new Date('2026-07-20T09:00:00Z'),
    new Date('2026-07-20T10:00:00Z'),
  );

const appointmentProps = {
  patientId: 'patient-1',
  slot: slot(),
  procedure: 'Troca de bolsa',
  price: Money.fromCents(25000),
};

describe('Feature: Regras de borda do domínio e aplicação', () => {
  describe('Cenário: validações de criação', () => {
    it('Dado patientId vazio, Quando criar consulta, Então lança ValidationError', () => {
      expect(() =>
        Appointment.create({ ...appointmentProps, patientId: ' ' }),
      ).toThrow(ValidationError);
    });

    it('Dado patientId vazio, Quando criar fatura, Então lança ValidationError', () => {
      expect(() =>
        Invoice.create({
          patientId: ' ',
          description: 'X',
          amount: Money.fromCents(100),
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('Cenário: atualizar detalhes da consulta', () => {
    it('Dado consulta agendada, Quando atualizar procedimento e preço, Então retorna cópia atualizada', () => {
      const appointment = Appointment.create(appointmentProps);

      const updated = appointment.updateDetails({
        procedure: 'Avaliação de ferida',
        price: Money.fromCents(30000),
        notes: 'Retorno',
      });

      expect(updated.procedure).toBe('Avaliação de ferida');
      expect(updated.price.cents).toBe(30000);
      expect(updated.notes).toBe('Retorno');
      expect(appointment.procedure).toBe('Troca de bolsa');
    });

    it('Dado procedimento vazio, Quando atualizar, Então lança ValidationError', () => {
      const appointment = Appointment.create(appointmentProps);

      expect(() => appointment.updateDetails({ procedure: ' ' })).toThrow(
        ValidationError,
      );
    });

    it('Dado nenhuma mudança, Quando atualizar, Então mantém valores atuais', () => {
      const appointment = Appointment.create(appointmentProps);

      const updated = appointment.updateDetails({});

      expect(updated.procedure).toBe('Troca de bolsa');
      expect(updated.price.cents).toBe(25000);
    });
  });

  describe('Cenário: e-mail na atualização de paciente (repetível, #325)', () => {
    it('Dado email de outro paciente, Quando atualizar, Então permite (e-mail de contato é repetível)', async () => {
      const repo = new InMemoryPatientRepository();
      const maria = await new CreatePatient(repo).execute({
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
      });
      await new CreatePatient(repo).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11988880000',
      });

      await expect(
        new UpdatePatient(repo).execute({
          id: maria.id,
          email: 'joao@example.com',
        }),
      ).resolves.toBeTruthy();
    });

    it('Dado o próprio email, Quando atualizar, Então permite', async () => {
      const repo = new InMemoryPatientRepository();
      const maria = await new CreatePatient(repo).execute({
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
      });

      await expect(
        new UpdatePatient(repo).execute({
          id: maria.id,
          email: 'maria@example.com',
        }),
      ).resolves.toBeTruthy();
    });
  });

  describe('Cenário: reativar paciente e erros de não-encontrado', () => {
    it('Dado paciente inativo, Quando reativar via use case, Então isActive true', async () => {
      const repo = new InMemoryPatientRepository();
      const maria = await new CreatePatient(repo).execute({
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
      });
      await new SetPatientActive(repo).execute({ id: maria.id, active: false });

      await new SetPatientActive(repo).execute({ id: maria.id, active: true });

      expect((await repo.findById(maria.id))?.isActive).toBe(true);
    });

    it('Dado id inexistente, Quando desativar paciente, Então lança NotFoundError', async () => {
      const repo = new InMemoryPatientRepository();

      await expect(
        new SetPatientActive(repo).execute({ id: 'ghost', active: false }),
      ).rejects.toThrow(NotFoundError);
    });

    it('Dado id inexistente, Quando cancelar fatura, Então lança NotFoundError', async () => {
      const repo = new InMemoryInvoiceRepository();

      await expect(
        new CancelInvoice(repo).execute({ id: 'ghost' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Cenário: listagens com paciente desconhecido', () => {
    it('Dado fatura de paciente removido, Quando listar, Então usa rótulo Paciente desconhecido', async () => {
      const invoiceRepo = new InMemoryInvoiceRepository();
      const patientRepo = new InMemoryPatientRepository();
      await invoiceRepo.save(
        Invoice.create({
          patientId: 'ghost',
          description: 'X',
          amount: Money.fromCents(100),
        }),
      );

      const result = await new ListInvoices(invoiceRepo, patientRepo).execute(
        {},
      );

      expect(result[0].patientName).toBe('Paciente desconhecido');
    });

    it('Dado consulta de paciente removido, Quando listar agenda, Então usa rótulo Paciente desconhecido', async () => {
      const appointmentRepo = new InMemoryAppointmentRepository();
      const patientRepo = new InMemoryPatientRepository();
      await appointmentRepo.save(
        Appointment.create({ ...appointmentProps, patientId: 'ghost' }),
      );

      const result = await new ListAppointments(
        appointmentRepo,
        patientRepo,
      ).execute({
        from: new Date('2026-07-01T00:00:00Z'),
        to: new Date('2026-08-01T00:00:00Z'),
      });

      expect(result[0].patientName).toBe('Paciente desconhecido');
    });
  });

  describe('Cenário: busca de pacientes por email e telefone', () => {
    it('Dado termo que casa com email ou telefone, Quando buscar, Então encontra', async () => {
      const repo = new InMemoryPatientRepository();
      await new CreatePatient(repo).execute({
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
      });

      expect(await repo.findAll('maria@')).toHaveLength(1);
      expect(await repo.findAll('11999')).toHaveLength(1);
      expect(await repo.findAll('nao-existe@example.com')).toHaveLength(0);
      expect(await repo.findById('ghost')).toBeNull();
    });
  });
});
