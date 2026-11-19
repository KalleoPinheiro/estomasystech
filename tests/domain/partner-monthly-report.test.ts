import { describe, expect, it } from 'vitest';
import {
  monthLabelOf,
  partnerMonthlyReportContent,
} from '@/domain/partner/monthly-report';

describe('Feature: Texto do relatório mensal ao parceiro (RM-15)', () => {
  it('Dado dois pacientes fora de ordem, Quando montar o texto, Então saem em ordem e só com nome e atendimento', () => {
    const content = partnerMonthlyReportContent({
      firstName: 'Beatriz',
      clinicName: 'Clínica Norte',
      monthLabel: 'novembro de 2026',
      patients: [
        { fullName: 'Zeca Andrade', attended: true },
        { fullName: 'Ana Lima', attended: false },
      ],
    });

    expect(content.subject).toBe(
      'Relatório mensal de indicações — Clínica Norte',
    );
    const ana = content.text.indexOf('- Ana Lima: sem consulta realizada');
    const zeca = content.text.indexOf(
      '- Zeca Andrade: consulta realizada nos últimos 24 meses',
    );
    expect(ana).toBeGreaterThan(-1);
    expect(zeca).toBeGreaterThan(ana);
    expect(content.text).toContain('Olá, Beatriz!');
    expect(content.text).toContain('novembro de 2026');
    expect(content.text).not.toContain('Zeca Andrade: sem consulta');
  });

  it('Dado 15 de novembro no fuso da aplicação, Quando rotular o mês, Então é novembro de 2026', () => {
    expect(monthLabelOf(new Date('2026-11-15T15:00:00Z'))).toMatch(
      /novembro de 2026/i,
    );
  });
});
