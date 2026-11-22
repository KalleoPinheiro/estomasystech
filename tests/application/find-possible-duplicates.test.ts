import { beforeEach, describe, expect, it } from 'vitest';
import { FindPossibleDuplicates } from '@/application/patients/find-possible-duplicates';
import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import { Patient } from '@/domain/patient/patient';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const links = (ids: string[]) =>
  ({
    findLinkedPatientIds: async () => ids,
  }) as unknown as ProfessionalPatientLinkRepository;

describe('Feature: possíveis repetidos antes do cadastro (#992)', () => {
  let repo: InMemoryPatientRepository;
  let ana: Patient;
  let irma: Patient;

  beforeEach(async () => {
    repo = new InMemoryPatientRepository();
    ana = Patient.create({
      fullName: 'Ana Lima',
      phone: '11988887777',
      birthDate: civil('1960-04-12'),
    });
    // Familiar que divide o celular: outra pessoa, mesmo número.
    irma = Patient.create({
      fullName: 'Bia Lima',
      phone: '(11) 98888-7777',
      birthDate: civil('1965-01-01'),
    });
    await repo.save(ana);
    await repo.save(irma);
    await repo.save(
      Patient.create({
        fullName: 'Carla Souza',
        phone: '11911112222',
        birthDate: civil('1960-04-12'),
      }),
    );
  });

  const find = (
    input: Partial<Parameters<FindPossibleDuplicates['execute']>[0]>,
    ids: string[] = [],
  ) =>
    new FindPossibleDuplicates(repo, links(ids)).execute({
      fullName: 'Nome Novo',
      phone: '11900000000',
      birthDate: null,
      ...input,
    });

  it('Dado o mesmo celular em outro formato, Então lista todos que o usam, em ordem de nome', async () => {
    const found = await find({ phone: '+55 11 98888-7777' });
    expect(found.map((p) => p.fullName)).toEqual(['Ana Lima', 'Bia Lima']);
  });

  it('Dado o mesmo nome (sem acento ou caixa) e nascimento, Então lista o paciente', async () => {
    const found = await find({
      fullName: 'ANA  LIMA',
      birthDate: civil('1960-04-12'),
    });
    expect(found.map((p) => p.id)).toEqual([ana.id]);
  });

  it('Dado o mesmo nome sem nascimento, Então não lista (só o celular compara)', async () => {
    expect(await find({ fullName: 'Ana Lima' })).toEqual([]);
  });

  it('Dado celular inválido e nome diferente, Então não lista ninguém', async () => {
    expect(await find({ phone: 'abc' })).toEqual([]);
  });

  it('Dado mais de 5 achados, Então devolve só os 5 primeiros', async () => {
    for (const n of [1, 2, 3, 4]) {
      await repo.save(
        Patient.create({ fullName: `Dani ${n}`, phone: '11988887777' }),
      );
    }
    expect(await find({ phone: '11988887777' })).toHaveLength(5);
  });

  it('Dado Profissional, Então só lista os pacientes com vínculo', async () => {
    const found = await find(
      { phone: '11988887777', professionalId: 'prof-1' },
      [irma.id],
    );
    expect(found.map((p) => p.id)).toEqual([irma.id]);
  });

  it('Dado Profissional sem cadastro de profissional, Então não lista ninguém', async () => {
    expect(
      await find({ phone: '11988887777', professionalId: null }, [ana.id]),
    ).toEqual([]);
  });
});
