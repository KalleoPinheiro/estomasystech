import { beforeEach, describe, expect, it } from 'vitest';
import { CreatePartner } from '@/application/partners/create-partner';
import { ListPartners } from '@/application/partners/list-partners';
import { UpdatePartner } from '@/application/partners/update-partner';
import type { Partner } from '@/domain/partner/partner';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';

/** Duplicado na empresa: `ConflictError` (409 na API) com a mensagem literal (#211). */
async function expectDuplicateEmailConflict(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConflictError);
  expect((error as Error).message).toBe('Já existe parceiro com este e-mail');
}

describe('Feature: Gestão de parceiros (médicos indicadores)', () => {
  let repo: InMemoryPartnerRepository;

  beforeEach(() => {
    repo = new InMemoryPartnerRepository();
  });

  const createCarlos = () =>
    new CreatePartner(repo).execute({
      fullName: 'Dr. Carlos Andrade',
      email: 'dr.carlos@x.com',
      phone: '11955550000',
      crm: 'CRM-SP 123456',
      specialty: 'Cirurgia vascular',
    });

  describe('Cenário: cadastrar novo parceiro', () => {
    it('Dado dados válidos, Quando cadastrar, Então parceiro é persistido ativo', async () => {
      const partner = await createCarlos();

      const stored = await repo.findById(partner.id);
      expect(stored?.fullName).toBe('Dr. Carlos Andrade');
      expect(stored?.isActive).toBe(true);
    });

    it('Dado email já cadastrado, Quando cadastrar, Então lança ConflictError com a mensagem da empresa', async () => {
      await createCarlos();

      await expectDuplicateEmailConflict(
        new CreatePartner(repo).execute({
          fullName: 'Dr. Outro',
          email: 'DR.CARLOS@x.com',
          phone: '11944440000',
        }),
      );
    });
  });

  describe('Cenário: atualizar parceiro', () => {
    it('Dado parceiro existente, Quando atualizar especialidade, Então dado é persistido', async () => {
      const partner = await createCarlos();

      await new UpdatePartner(repo).execute({
        id: partner.id,
        specialty: 'Angiologia',
      });

      const stored = await repo.findById(partner.id);
      expect(stored?.specialty).toBe('Angiologia');
    });

    it('Dado id inexistente, Quando atualizar, Então lança NotFoundError', async () => {
      await expect(
        new UpdatePartner(repo).execute({ id: 'ghost', specialty: 'x' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('Dado email alterado para um já usado por outro parceiro, Quando atualizar, Então lança ConflictError', async () => {
      const carlos = await createCarlos();
      await new CreatePartner(repo).execute({
        fullName: 'Dra. Ana Paula',
        email: 'ana@x.com',
        phone: '11933330000',
      });

      await expectDuplicateEmailConflict(
        new UpdatePartner(repo).execute({ id: carlos.id, email: 'ana@x.com' }),
      );
    });

    it('Dado email alterado para o mesmo já usado pelo próprio parceiro, Quando atualizar, Então aceita', async () => {
      const carlos = await createCarlos();

      await expect(
        new UpdatePartner(repo).execute({
          id: carlos.id,
          email: 'dr.carlos@x.com',
        }),
      ).resolves.toBeTruthy();
    });

    it('Dado parceiro ativo, Quando desativar (active: false), Então persiste inativo', async () => {
      const partner = await createCarlos();

      await new UpdatePartner(repo).execute({ id: partner.id, active: false });

      const stored = await repo.findById(partner.id);
      expect(stored?.isActive).toBe(false);
    });

    it('Dado parceiro inativo, Quando reativar (active: true), Então persiste ativo', async () => {
      const partner = await createCarlos();
      await new UpdatePartner(repo).execute({ id: partner.id, active: false });

      await new UpdatePartner(repo).execute({ id: partner.id, active: true });

      const stored = await repo.findById(partner.id);
      expect(stored?.isActive).toBe(true);
    });
  });

  describe('Cenário: listar parceiros', () => {
    it('Dado nenhum parceiro cadastrado, Quando listar, Então retorna lista vazia', async () => {
      const list = await new ListPartners(repo).execute();

      expect(list).toEqual([]);
    });

    it('Dado parceiros cadastrados, Quando listar, Então retorna todos ordenados por nome', async () => {
      await createCarlos();
      await new CreatePartner(repo).execute({
        fullName: 'Dra. Ana Paula',
        email: 'ana@x.com',
        phone: '11933330000',
      });

      const list = await new ListPartners(repo).execute();

      expect(list).toHaveLength(2);
      expect(list[0].fullName).toBe('Dr. Carlos Andrade');
      expect(list[1].fullName).toBe('Dra. Ana Paula');
    });
  });

  describe('Cenário: corrida entre duas gravações do mesmo e-mail (#211)', () => {
    /** Repositório em que a checagem prévia passa e a gravação falha com `error`. */
    class RacingRepo extends InMemoryPartnerRepository {
      constructor(private readonly error: unknown) {
        super();
      }
      armed = false;
      override async findByEmail(): Promise<Partner | null> {
        return null;
      }
      override async save(partner: Partner): Promise<void> {
        if (this.armed) throw this.error;
        await super.save(partner);
      }
    }

    const indexViolation = () =>
      new Error('Failed query', {
        cause: { code: '23505', constraint: 'uq_partners_clinic_email' },
      });

    it('Dada corrida na criação, Quando o índice recusa, Então lança ConflictError com a mensagem da empresa', async () => {
      const racing = new RacingRepo(indexViolation());
      racing.armed = true;

      await expectDuplicateEmailConflict(
        new CreatePartner(racing).execute({
          fullName: 'Dr. Concorrente',
          email: 'corrida@x.com',
          phone: '11900000000',
        }),
      );
    });

    it('Dada corrida na edição, Quando o índice recusa, Então lança ConflictError com a mensagem da empresa', async () => {
      const racing = new RacingRepo(indexViolation());
      const partner = await new CreatePartner(racing).execute({
        fullName: 'Dr. Concorrente',
        email: 'antes@x.com',
        phone: '11900000000',
      });
      racing.armed = true;

      await expectDuplicateEmailConflict(
        new UpdatePartner(racing).execute({
          id: partner.id,
          email: 'corrida@x.com',
        }),
      );
    });

    it.each([
      [
        'outra violação de unicidade',
        { code: '23505', constraint: 'partners_pkey' },
      ],
      ['outra violação: erro genérico', new Error('conexão perdida')],
    ])(
      'Dada %s na gravação, Quando cadastrar, Então relança o erro original',
      async (_label, error) => {
        const racing = new RacingRepo(error);
        racing.armed = true;

        const caught = await new CreatePartner(racing)
          .execute({
            fullName: 'Dr. Concorrente',
            email: 'corrida@x.com',
            phone: '11900000000',
          })
          .catch((e: unknown) => e);

        expect(caught).toBe(error);
        expect(caught).not.toBeInstanceOf(ConflictError);
      },
    );
  });
});
