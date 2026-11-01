import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';
import {
  createProfessionalRecord,
  updateProfessionalRecord,
} from '@/lib/server/professional-writes';

describe('Feature: regra de gravação de profissionais (#550)', () => {
  describe('Cenário: cadastrar', () => {
    it('Dado só o nome, Quando cadastra, Então salva ativo, sem registro e com repasse percentual vazio', async () => {
      const professionals = new InMemoryProfessionalRepository();

      const created = await createProfessionalRecord(professionals, {
        fullName: 'Dra. Ana',
      });

      expect(created).toMatchObject({
        fullName: 'Dra. Ana',
        registry: null,
        commissionType: 'percentage',
        commissionPct: null,
        commissionFixedCents: null,
        isActive: true,
      });
      expect(await professionals.findById(created.id)).not.toBeNull();
    });

    it('Dado repasse fixo, Quando cadastra, Então guarda o tipo e o valor em centavos', async () => {
      const professionals = new InMemoryProfessionalRepository();

      const created = await createProfessionalRecord(professionals, {
        fullName: 'Dr. Caio',
        registry: 'COREN-SP 1',
        commissionType: 'fixed',
        commissionFixedCents: 5000,
      });

      expect(created).toMatchObject({
        registry: 'COREN-SP 1',
        commissionType: 'fixed',
        commissionFixedCents: 5000,
      });
    });

    it('Dado nome vazio, Quando cadastra, Então recusa e não salva', async () => {
      const professionals = new InMemoryProfessionalRepository();

      const attempt = createProfessionalRecord(professionals, {
        fullName: '  ',
      });

      await expect(attempt).rejects.toBeInstanceOf(ValidationError);
      expect(await professionals.findAll()).toHaveLength(0);
    });
  });

  describe('Cenário: editar, desativar e reativar', () => {
    const seeded = async () => {
      const professionals = new InMemoryProfessionalRepository();
      const created = await createProfessionalRecord(professionals, {
        fullName: 'Dra. Ana',
        registry: 'COREN-SP 123',
        commissionPct: 20,
      });
      return { professionals, id: created.id };
    };

    it('Dado profissional, Quando muda só o registro, Então o resto fica como estava', async () => {
      const { professionals, id } = await seeded();

      const updated = await updateProfessionalRecord(professionals, id, {
        registry: 'COREN-SP 456',
      });

      expect(updated).toMatchObject({
        fullName: 'Dra. Ana',
        registry: 'COREN-SP 456',
        commissionPct: 20,
        isActive: true,
      });
    });

    it('Dado profissional, Quando limpa o registro com null, Então o registro fica vazio', async () => {
      const { professionals, id } = await seeded();

      const updated = await updateProfessionalRecord(professionals, id, {
        registry: null,
      });

      expect(updated.registry).toBeNull();
    });

    it('Dado profissional ativo, Quando desativa e reativa, Então a situação acompanha e persiste', async () => {
      const { professionals, id } = await seeded();

      const off = await updateProfessionalRecord(professionals, id, {
        active: false,
      });
      expect(off.isActive).toBe(false);
      expect((await professionals.findById(id))?.isActive).toBe(false);

      const on = await updateProfessionalRecord(professionals, id, {
        active: true,
      });
      expect(on.isActive).toBe(true);
    });

    it('Dado id inexistente, Quando edita, Então responde não encontrado com o nome do recurso', async () => {
      const { professionals } = await seeded();

      const attempt = updateProfessionalRecord(professionals, 'nao-existe', {
        fullName: 'X',
      });

      await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
      await expect(attempt).rejects.toThrow('Profissional');
    });
  });
});
