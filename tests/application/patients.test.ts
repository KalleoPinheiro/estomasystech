import { beforeEach, describe, expect, it } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import { GetPatient } from '@/application/patients/get-patient';
import { ListPatients } from '@/application/patients/list-patients';
import { SetPatientActive } from '@/application/patients/set-patient-active';
import { UpdatePatient } from '@/application/patients/update-patient';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

describe('Feature: Gestão de pacientes', () => {
  let repo: InMemoryPatientRepository;

  beforeEach(() => {
    repo = new InMemoryPatientRepository();
  });

  const createMaria = () =>
    new CreatePatient(repo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });

  describe('Cenário: cadastrar novo paciente', () => {
    it('Dado dados válidos, Quando cadastrar, Então paciente é persistido', async () => {
      const patient = await createMaria();

      const stored = await repo.findById(patient.id);
      expect(stored?.fullName).toBe('Maria da Silva');
    });

    it('Dado mesmo e-mail de um familiar, Quando cadastrar, Então aceita os dois (#325)', async () => {
      const first = await createMaria();

      const second = await new CreatePatient(repo).execute({
        fullName: 'Filho da Maria',
        email: 'MARIA@example.com',
        phone: '11988880000',
      });

      expect(second.id).not.toBe(first.id);
      expect(second.email).toBe('maria@example.com');
    });

    it('Dado cadastro sem e-mail ou com e-mail em branco, Quando cadastrar, Então guarda null (#325)', async () => {
      const without = await new CreatePatient(repo).execute({
        fullName: 'Sem Email',
        phone: '11988880000',
      });
      const blank = await new CreatePatient(repo).execute({
        fullName: 'Email Branco',
        email: '   ',
        phone: '11988880001',
      });

      expect(without.email).toBeNull();
      expect(blank.email).toBeNull();
    });
  });

  describe('Cenário: atualizar paciente', () => {
    it('Dado paciente existente, Quando atualizar telefone, Então dado é persistido', async () => {
      const patient = await createMaria();

      await new UpdatePatient(repo).execute({
        id: patient.id,
        phone: '11977770000',
      });

      const stored = await repo.findById(patient.id);
      expect(stored?.phone).toBe('+5511977770000');
    });

    it('Dado e-mail removido ou omitido, Quando atualizar, Então null limpa e omitir mantém (#325)', async () => {
      const patient = await createMaria();

      await new UpdatePatient(repo).execute({
        id: patient.id,
        phone: '11977770000',
      });
      expect((await repo.findById(patient.id))?.email).toBe(
        'maria@example.com',
      );

      await new UpdatePatient(repo).execute({ id: patient.id, email: null });
      expect((await repo.findById(patient.id))?.email).toBeNull();
    });

    it('Dado e-mail já usado por outro paciente, Quando atualizar, Então aceita (#325)', async () => {
      await createMaria();
      const other = await new CreatePatient(repo).execute({
        fullName: 'João Souza',
        phone: '11966660000',
      });

      const updated = await new UpdatePatient(repo).execute({
        id: other.id,
        email: 'maria@example.com',
      });

      expect(updated.email).toBe('maria@example.com');
    });

    it('Dado id inexistente, Quando atualizar, Então lança NotFoundError', async () => {
      await expect(
        new UpdatePatient(repo).execute({ id: 'ghost', phone: '1' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Cenário: buscar e listar pacientes', () => {
    it('Dado pacientes cadastrados, Quando listar com busca, Então filtra por nome', async () => {
      await createMaria();
      await new CreatePatient(repo).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11966660000',
      });

      const result = await new ListPatients(repo).execute({ search: 'joão' });

      expect(result).toHaveLength(1);
      expect(result[0].fullName).toBe('João Souza');
    });

    it('Dado telefone digitado com máscara, Quando buscar, Então acha o E.164 guardado', async () => {
      await createMaria();

      const result = await new ListPatients(repo).execute({
        search: '(11) 99999',
      });

      expect(result).toHaveLength(1);
    });

    it('Dado id existente, Quando buscar, Então retorna paciente', async () => {
      const patient = await createMaria();

      const found = await new GetPatient(repo).execute({ id: patient.id });

      expect(found.id).toBe(patient.id);
    });

    it('Dado id inexistente, Quando buscar, Então lança NotFoundError', async () => {
      await expect(
        new GetPatient(repo).execute({ id: 'ghost' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Cenário: desativar paciente', () => {
    it('Dado paciente ativo, Quando desativar, Então persiste como inativo', async () => {
      const patient = await createMaria();

      await new SetPatientActive(repo).execute({
        id: patient.id,
        active: false,
      });

      const stored = await repo.findById(patient.id);
      expect(stored?.isActive).toBe(false);
    });
  });
});
