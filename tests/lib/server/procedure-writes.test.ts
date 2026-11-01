import { describe, expect, it } from 'vitest';
import { Procedure } from '@/domain/catalog/procedure';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryProcedureRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import {
  createProcedureRecord,
  updateProcedureRecord,
} from '@/lib/server/procedure-writes';

const input = {
  name: 'Curativo simples',
  priceCents: 8000,
  durationMinutes: 30,
};

describe('Feature: regra de gravação de procedimentos (#556)', () => {
  describe('Cenário: cadastrar', () => {
    it('Dado nome livre, Quando cadastra, Então salva ativo com os dados informados', async () => {
      const procedures = new InMemoryProcedureRepository();

      const created = await createProcedureRecord(procedures, input);

      expect(created).toMatchObject({ ...input, isActive: true });
      expect(await procedures.findById(created.id)).not.toBeNull();
    });

    it('Dado nome já usado, Quando cadastra, Então recusa citando o nome e não salva outro', async () => {
      const procedures = new InMemoryProcedureRepository();
      await createProcedureRecord(procedures, input);

      const attempt = createProcedureRecord(procedures, {
        ...input,
        priceCents: 1,
      });

      await expect(attempt).rejects.toThrow(
        'Já existe procedimento com o nome "Curativo simples"',
      );
      await expect(attempt).rejects.toBeInstanceOf(ValidationError);
      expect(await procedures.findAll()).toHaveLength(1);
    });
  });

  describe('Cenário: editar, desativar e reativar', () => {
    const seed = async () => {
      const procedures = new InMemoryProcedureRepository();
      const procedure = Procedure.create(input);
      await procedures.save(procedure);
      return { procedures, id: procedure.id };
    };

    it('Dado procedimento, Quando muda só o preço, Então preço muda e o resto fica', async () => {
      const { procedures, id } = await seed();

      const updated = await updateProcedureRecord(procedures, id, {
        priceCents: 9500,
      });

      expect(updated).toMatchObject({
        ...input,
        priceCents: 9500,
        isActive: true,
      });
      expect((await procedures.findById(id))?.priceCents).toBe(9500);
    });

    it('Dado procedimento ativo, Quando desativa, Então fica inativo; Quando reativa, Então volta ativo', async () => {
      const { procedures, id } = await seed();

      const off = await updateProcedureRecord(procedures, id, {
        active: false,
      });
      expect(off.isActive).toBe(false);
      expect((await procedures.findById(id))?.isActive).toBe(false);

      const on = await updateProcedureRecord(procedures, id, { active: true });
      expect(on.isActive).toBe(true);
    });

    it('Dado edição sem campo de situação, Quando salva, Então a situação não muda', async () => {
      const { procedures, id } = await seed();
      await updateProcedureRecord(procedures, id, { active: false });

      const updated = await updateProcedureRecord(procedures, id, {
        name: 'Outro nome',
      });

      expect(updated.isActive).toBe(false);
    });

    it('Dado id inexistente, Quando edita, Então responde não encontrado', async () => {
      const { procedures } = await seed();

      const attempt = updateProcedureRecord(procedures, 'nao-existe', {
        name: 'X',
      });

      await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado nome de outro procedimento, Quando renomeia, Então recusa e o nome fica', async () => {
      const { procedures, id } = await seed();
      const other = Procedure.create({ ...input, name: 'Debridamento' });
      await procedures.save(other);

      const attempt = updateProcedureRecord(procedures, other.id, {
        name: input.name,
      });

      await expect(attempt).rejects.toThrow(
        'Já existe procedimento com o nome "Curativo simples"',
      );
      expect((await procedures.findById(other.id))?.name).toBe('Debridamento');
      expect((await procedures.findById(id))?.name).toBe(input.name);
    });

    it('Dado o próprio nome, Quando salva a edição com o mesmo nome, Então aceita', async () => {
      const { procedures, id } = await seed();

      const updated = await updateProcedureRecord(procedures, id, {
        name: input.name,
        durationMinutes: 45,
      });

      expect(updated.durationMinutes).toBe(45);
    });
  });
});
