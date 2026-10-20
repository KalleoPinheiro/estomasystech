import { describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { createScheduleClosure } from '@/domain/scheduling/schedule-availability';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import {
  InMemoryScheduleAvailabilityRepository,
  InMemoryUserAccountRepository,
  InMemoryWaitlistRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';

const conta = (
  email: string,
  role: 'company_admin' | 'atendente' = 'atendente',
) =>
  UserAccount.create({
    email,
    passwordHash: 'scrypt$1$s$h',
    role,
    clinicId: 'c-1',
  });

describe('Feature: Contas em memória espelham o banco (sessões e consultas)', () => {
  it('Dado e-mails repetidos entre contas, Quando buscar todas por e-mail, Então normaliza caixa e espaços', async () => {
    const repo = new InMemoryUserAccountRepository();
    const a = conta('ana@clinica.com');
    await repo.save(a);

    expect(await repo.findAllByEmail('  ANA@clinica.com ')).toHaveLength(1);
    expect(await repo.findAllByEmail('outra@clinica.com')).toEqual([]);
  });

  it('Dado id inexistente, Quando buscar, revogar sessão ou trocar a senha, Então nada acontece', async () => {
    const repo = new InMemoryUserAccountRepository();

    expect(await repo.findById('nao-existe')).toBeNull();
    await repo.revokeSessions('nao-existe');
    await repo.updatePasswordHash('nao-existe', 'scrypt$1$s$h2');
    expect(await repo.hasAnyAccount()).toBe(false);
  });

  it('Dado contas ativas, Quando revogar sessões de uma ou de todas, Então a versão de sessão sobe só nas afetadas', async () => {
    const repo = new InMemoryUserAccountRepository();
    const a = conta('ana@clinica.com');
    const b = conta('bia@clinica.com');
    await repo.save(a);
    await repo.save(b);
    expect(await repo.hasAnyAccount()).toBe(true);

    await repo.revokeSessions(a.id);
    expect((await repo.findById(a.id))?.sessionVersion).toBe(1);
    expect((await repo.findById(b.id))?.sessionVersion).toBe(0);

    await repo.revokeAllSessions();
    expect((await repo.findById(a.id))?.sessionVersion).toBe(2);
    expect((await repo.findById(b.id))?.sessionVersion).toBe(1);
  });

  it('Dado conta já gravada com sessões revogadas, Quando salvar de novo a versão antiga, Então a versão gravada é preservada (#194)', async () => {
    const repo = new InMemoryUserAccountRepository();
    const a = conta('ana@clinica.com');
    await repo.save(a);
    await repo.revokeSessions(a.id);

    await repo.save(a);

    expect((await repo.findById(a.id))?.sessionVersion).toBe(1);
  });

  it('Dado contas de papéis distintos, Quando buscar por papel para atualização, Então devolve só as do papel', async () => {
    const repo = new InMemoryUserAccountRepository();
    await repo.save(conta('admin@clinica.com', 'company_admin'));
    await repo.save(conta('ana@clinica.com'));

    const admins = await repo.findByRoleForUpdate('company_admin');

    expect(admins.map((a) => a.email)).toEqual(['admin@clinica.com']);
  });
});

describe('Feature: Bloqueios de agenda e fila de espera em memória ordenam como o banco', () => {
  it('Dado dois bloqueios no período, Quando listar, Então vêm por data de início', async () => {
    const repo = new InMemoryScheduleAvailabilityRepository();
    const tarde = createScheduleClosure({
      startsOn: '2026-07-25',
      reason: 'Recesso',
    });
    const cedo = createScheduleClosure({
      startsOn: '2026-07-21',
      reason: 'Feriado',
    });
    await repo.saveClosure(tarde);
    await repo.saveClosure(cedo);

    const lista = await repo.listClosures({
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(lista.map((c) => c.id)).toEqual([cedo.id, tarde.id]);
  });

  it('Dado duas entradas do mesmo paciente, Quando listar as do paciente, Então a mais recente vem primeiro', async () => {
    const repo = new InMemoryWaitlistRepository();
    const make = (at: string) =>
      WaitlistEntry.create(
        {
          patientId: 'pac-1',
          fromDate: '2026-11-01',
          toDate: '2026-11-10',
          source: 'staff',
        },
        new Date(at),
      );
    const velha = make('2026-10-01T10:00:00Z');
    const nova = make('2026-10-02T10:00:00Z');
    await repo.save(velha);
    await repo.save(nova);

    const lista = await repo.findByPatient('pac-1');

    expect(lista.map((e) => e.id)).toEqual([nova.id, velha.id]);
  });
});
