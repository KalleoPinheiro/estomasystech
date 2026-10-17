import { beforeEach, describe, expect, it } from 'vitest';
import { CreateFollowUp } from '@/application/followups/create-follow-up';
import { ListFollowUps } from '@/application/followups/list-follow-ups';
import { SetFollowUpStatus } from '@/application/followups/set-follow-up-status';
import { CreatePatient } from '@/application/patients/create-patient';
import { FollowUp } from '@/domain/followup/follow-up';
import type { Patient } from '@/domain/patient/patient';
import {
  InvalidStatusTransitionError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

describe('Feature: Retornos (follow-ups) de pacientes', () => {
  let patientRepo: InMemoryPatientRepository;
  let followUpRepo: InMemoryFollowUpRepository;
  let maria: Patient;
  let joao: Patient;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    followUpRepo = new InMemoryFollowUpRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    joao = await new CreatePatient(patientRepo).execute({
      fullName: 'João Souza',
      email: 'joao@example.com',
      phone: '11988880000',
    });
  });

  describe('Cenário: criar retorno', () => {
    it('Dado paciente existente e motivo válido, Quando criar, Então retorno persiste pendente', async () => {
      const followUp = await new CreateFollowUp(
        followUpRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Reavaliação de ferida',
      });

      const stored = await followUpRepo.findById(followUp.id);
      expect(stored?.status).toBe('pending');
      expect(stored?.reason).toBe('Reavaliação de ferida');
    });

    it('Dado paciente inexistente, Quando criar, Então lança NotFoundError', async () => {
      await expect(
        new CreateFollowUp(followUpRepo, patientRepo).execute({
          patientId: 'ghost',
          dueDate: new Date('2026-08-01T12:00:00Z'),
          reason: 'Reavaliação',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('Dado motivo em branco, Quando criar, Então lança ValidationError', async () => {
      await expect(
        new CreateFollowUp(followUpRepo, patientRepo).execute({
          patientId: maria.id,
          dueDate: new Date('2026-08-01T12:00:00Z'),
          reason: '   ',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('Dado appointmentId informado, Quando criar, Então vincula o retorno à consulta', async () => {
      const followUp = await new CreateFollowUp(
        followUpRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        appointmentId: 'appt-1',
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Reavaliação',
      });

      expect(followUp.appointmentId).toBe('appt-1');
    });
  });

  describe('Cenário: listar retornos com filtros', () => {
    it('Dado retornos de pacientes diferentes, Quando filtrar por patientId, Então retorna só os dele', async () => {
      await new CreateFollowUp(followUpRepo, patientRepo).execute({
        patientId: maria.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Retorno Maria',
      });
      await new CreateFollowUp(followUpRepo, patientRepo).execute({
        patientId: joao.id,
        dueDate: new Date('2026-08-05T12:00:00Z'),
        reason: 'Retorno João',
      });

      const list = await new ListFollowUps(followUpRepo, patientRepo).execute({
        patientId: maria.id,
      });

      expect(list).toHaveLength(1);
      expect(list[0].patientName).toBe('Maria da Silva');
    });

    it('Dado retornos com status diferentes, Quando filtrar por status, Então retorna só os que casam', async () => {
      const followUp = await new CreateFollowUp(
        followUpRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Retorno a concluir',
      });
      await new SetFollowUpStatus(followUpRepo).execute({
        id: followUp.id,
        status: 'done',
      });
      await new CreateFollowUp(followUpRepo, patientRepo).execute({
        patientId: joao.id,
        dueDate: new Date('2026-08-05T12:00:00Z'),
        reason: 'Retorno pendente',
      });

      const pending = await new ListFollowUps(
        followUpRepo,
        patientRepo,
      ).execute({
        status: 'pending',
      });
      const done = await new ListFollowUps(followUpRepo, patientRepo).execute({
        status: 'done',
      });

      expect(pending).toHaveLength(1);
      expect(pending[0].patientName).toBe('João Souza');
      expect(done).toHaveLength(1);
      expect(done[0].patientName).toBe('Maria da Silva');
    });

    it('Dado retorno vencido, Quando listar com now informado, Então marca isOverdue true', async () => {
      await new CreateFollowUp(followUpRepo, patientRepo).execute({
        patientId: maria.id,
        dueDate: new Date('2026-07-01T12:00:00Z'),
        reason: 'Vencido',
      });

      const list = await new ListFollowUps(followUpRepo, patientRepo).execute({
        now: new Date('2026-07-16T00:00:00Z'),
      });

      expect(list[0].isOverdue).toBe(true);
    });

    it("Dado retorno de paciente sem correspondência no repositório, Quando listar, Então usa nome padrão 'Paciente desconhecido'", async () => {
      const orphan = FollowUp.create({
        patientId: 'paciente-removido',
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Retorno órfão',
      });
      await followUpRepo.save(orphan);

      const list = await new ListFollowUps(followUpRepo, patientRepo).execute({
        patientId: 'paciente-removido',
      });

      expect(list).toHaveLength(1);
      expect(list[0].followUp.id).toBe(orphan.id);
      expect(list[0].patientName).toBe('Paciente desconhecido');
    });

    it('Dado nenhum filtro, Quando listar, Então usa now padrão e retorna todos ordenados por vencimento', async () => {
      await new CreateFollowUp(followUpRepo, patientRepo).execute({
        patientId: maria.id,
        dueDate: new Date('2026-09-01T12:00:00Z'),
        reason: 'Mais tarde',
      });
      await new CreateFollowUp(followUpRepo, patientRepo).execute({
        patientId: joao.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Mais cedo',
      });

      const list = await new ListFollowUps(followUpRepo, patientRepo).execute();

      expect(list).toHaveLength(2);
      expect(list[0].followUp.reason).toBe('Mais cedo');
    });
  });

  describe('Cenário: transições de status', () => {
    it('Dado retorno pendente, Quando marcar done, Então persiste concluído', async () => {
      const followUp = await new CreateFollowUp(
        followUpRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Retorno',
      });

      const updated = await new SetFollowUpStatus(followUpRepo).execute({
        id: followUp.id,
        status: 'done',
      });

      expect(updated.status).toBe('done');
    });

    it('Dado retorno pendente, Quando cancelar, Então persiste cancelado', async () => {
      const followUp = await new CreateFollowUp(
        followUpRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Retorno',
      });

      const updated = await new SetFollowUpStatus(followUpRepo).execute({
        id: followUp.id,
        status: 'cancelled',
      });

      expect(updated.status).toBe('cancelled');
    });

    it('Dado retorno já concluído, Quando tentar cancelar, Então lança InvalidStatusTransitionError (bloqueada)', async () => {
      const followUp = await new CreateFollowUp(
        followUpRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Retorno',
      });
      await new SetFollowUpStatus(followUpRepo).execute({
        id: followUp.id,
        status: 'done',
      });

      await expect(
        new SetFollowUpStatus(followUpRepo).execute({
          id: followUp.id,
          status: 'cancelled',
        }),
      ).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('Dado id inexistente, Quando mudar status, Então lança NotFoundError', async () => {
      await expect(
        new SetFollowUpStatus(followUpRepo).execute({
          id: 'ghost',
          status: 'done',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
