import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import { canRoleAccess } from '@/lib/staff-access';
import { bottomNavFor, moreGroupsFor } from '@/lib/staff-shortcuts';

const labels = (role: UserRole | null) =>
  bottomNavFor(role).map((item) => item.label);
const moreFor = (role: UserRole) =>
  moreGroupsFor(role, (api) => canRoleAccess(api, role)).map((group) => ({
    title: group.title,
    pages: group.pages.map((p) => p.label),
  }));

describe('Feature: atalhos da barra inferior por papel (#428)', () => {
  it('Dado o Admin da clínica, Então vê Hoje, Agenda, Pacientes, Faturas e Mais', () => {
    expect(labels('company_admin')).toEqual([
      'Hoje',
      'Agenda',
      'Pacientes',
      'Faturas',
      'Mais',
    ]);
  });

  it('Dado o Atendente, Então vê Hoje, Agenda, Pacientes e Mais', () => {
    expect(labels('atendente')).toEqual([
      'Hoje',
      'Agenda',
      'Pacientes',
      'Mais',
    ]);
  });

  it('Dado o Profissional, Então vê Triagem com contador entre Agenda e Pacientes', () => {
    expect(labels('profissional')).toEqual([
      'Hoje',
      'Agenda',
      'Triagem',
      'Pacientes',
      'Mais',
    ]);
    expect(
      bottomNavFor('profissional').find((i) => i.label === 'Triagem')
        ?.triageCount,
    ).toBe(true);
  });

  it('Dado papel ainda desconhecido, Então usa o conjunto mínimo', () => {
    expect(labels(null)).toEqual(['Hoje', 'Agenda', 'Pacientes', 'Mais']);
    expect(labels('patient')).toEqual(['Hoje', 'Agenda', 'Pacientes', 'Mais']);
  });

  it('Dado qualquer papel, Então a barra nunca passa de 5 atalhos', () => {
    for (const role of [
      null,
      'company_admin',
      'atendente',
      'profissional',
    ] as const) {
      expect(bottomNavFor(role).length).toBeLessThanOrEqual(5);
    }
  });
});

describe('Feature: tela Mais por papel (#428)', () => {
  it('Dado o Admin, Então Mais lista o resto, sem repetir o que está na barra', () => {
    expect(moreFor('company_admin')).toEqual([
      {
        title: 'Atendimento',
        pages: [
          'Triagem',
          'Parceiros',
          'Profissionais',
          'Procedimentos',
          'Materiais',
        ],
      },
      {
        title: 'Gestão',
        pages: ['Relatórios', 'Repasses', 'Auditoria', 'Pedidos do titular'],
      },
      { title: 'Conta', pages: ['Configurações', 'Minha conta'] },
    ]);
  });

  it('Dado o Atendente, Então Mais só traz Parceiros e a conta', () => {
    expect(moreFor('atendente')).toEqual([
      { title: 'Atendimento', pages: ['Parceiros'] },
      { title: 'Conta', pages: ['Configurações', 'Minha conta'] },
    ]);
  });

  it('Dado o Profissional, Então Mais tem Parceiros, Repasses e a conta, sem Triagem (já na barra)', () => {
    expect(moreFor('profissional')).toEqual([
      { title: 'Atendimento', pages: ['Parceiros'] },
      { title: 'Gestão', pages: ['Repasses'] },
      { title: 'Conta', pages: ['Configurações', 'Minha conta'] },
    ]);
  });

  it('Dado papel sem permissão em nada do grupo, Então o grupo some', () => {
    expect(moreGroupsFor('atendente', () => false)).toEqual([]);
  });
});
