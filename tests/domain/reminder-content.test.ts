import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  daysSinceDue,
  dueRecallAttempt,
  MAX_RECALL_ATTEMPTS,
} from '@/domain/messaging/recall-cadence';
import {
  firstNameOf,
  reminderContent,
} from '@/domain/messaging/reminder-content';
import {
  normalizeBrazilianPhone,
  whatsappLink,
} from '@/domain/messaging/whatsapp-link';

const startsAt = new Date('2026-07-17T09:30:00Z');
const dueDate = new Date('2026-06-08T12:00:00Z');

describe('Feature: Texto único do lembrete (reminderContent)', () => {
  it('Dado confirmação com portal, Quando montar, Então traz nome, data, hora, clínica e link', () => {
    const { subject, text } = reminderContent('confirmation', {
      firstName: 'Maria',
      clinicName: 'Clínica Alfa',
      portalUrl: 'https://vitta.example.com/portal',
      startsAt,
    });

    expect(subject).toContain('Clínica Alfa');
    expect(text).toContain('Olá, Maria!');
    expect(text).toContain('17/07/2026');
    expect(text).toContain('09:30');
    expect(text).toContain('Clínica Alfa');
    expect(text).toContain('https://vitta.example.com/portal');
  });

  it('Dado procedimento e motivo informados (wa.me), Quando montar, Então os inclui', () => {
    expect(
      reminderContent('confirmation', {
        firstName: 'Maria',
        clinicName: 'Clínica Alfa',
        portalUrl: null,
        startsAt,
        procedure: 'Troca de bolsa',
      }).text,
    ).toContain('consulta de Troca de bolsa');
    expect(
      reminderContent('recall', {
        firstName: 'Maria',
        clinicName: 'Clínica Alfa',
        portalUrl: null,
        dueDate,
        reason: 'Retorno: Curativo',
      }).text,
    ).toContain('(Retorno: Curativo)');
  });

  it('C29 horário do lembrete no fuso da aplicação', () => {
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    try {
      const { text } = reminderContent('confirmation', {
        firstName: 'Maria',
        clinicName: 'Clínica Alfa',
        portalUrl: null,
        startsAt: new Date('2026-07-17T12:00:00Z'),
      });

      expect(text).toContain('17/07/2026 às 09:00');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('C4 sem portal a confirmação e o recall usam a orientação de contato', () => {
    const confirmation = reminderContent('confirmation', {
      firstName: 'Maria',
      clinicName: 'Clínica Alfa',
      portalUrl: null,
      startsAt,
    }).text;
    const recall = reminderContent('recall', {
      firstName: 'Maria',
      clinicName: 'Clínica Alfa',
      portalUrl: null,
      dueDate,
    }).text;

    expect(confirmation).toContain(
      'Entre em contato com a clínica em caso de dúvida.',
    );
    expect(recall).toContain('Entre em contato com a clínica para agendar.');
    expect(confirmation).not.toMatch(/https?:|\/portal/);
    expect(recall).not.toMatch(/https?:|\/portal/);
  });

  it('Dado nome composto com espaços extras, Quando extrair primeiro nome, Então usa a primeira palavra', () => {
    expect(firstNameOf('  Maria   da Silva ')).toBe('Maria');
  });
});

describe('Feature: Link wa.me', () => {
  it('Dado telefone nacional formatado, Quando montar link, Então prefixa 55 e codifica o texto', () => {
    expect(whatsappLink('(11) 99999-0000', 'Olá, Maria! 17/07 às 09:30')).toBe(
      'https://wa.me/5511999990000?text=Ol%C3%A1%2C%20Maria!%2017%2F07%20%C3%A0s%2009%3A30',
    );
  });

  it('Dado telefone inválido, Quando montar link, Então lança com o motivo e nunca gera link', () => {
    expect(() => whatsappLink('99999-0000', 'Olá')).toThrow(
      /Informe o DDD.*Corrija o telefone no cadastro do paciente/,
    );
    expect(() => whatsappLink('+1 415 555 2671', 'Olá')).toThrow(/Brasil/);
  });

  it('Dado número já internacional, Quando normalizar, Então mantém', () => {
    expect(normalizeBrazilianPhone('+55 11 99999-0000')).toBe('5511999990000');
    expect(normalizeBrazilianPhone('5511999990000')).toBe('5511999990000');
  });

  it('Dado número nacional ou curto, Quando normalizar, Então prefixa 55', () => {
    expect(normalizeBrazilianPhone('11999990000')).toBe('5511999990000');
    expect(normalizeBrazilianPhone('5599')).toBe('555599');
    expect(normalizeBrazilianPhone('(11) 99999-0000')).toBe('5511999990000');
  });
});

describe('Feature: Cadência do recall (D+1, D+7, D+30)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const due = new Date('2026-06-01T15:00:00Z');
  const day = (offset: number) =>
    new Date(Date.UTC(2026, 5, 1 + offset, 15, 0, 0));

  it('Dado dias após o vencimento, Quando calcular tentativa sem envio anterior, Então segue as marcas', () => {
    expect(dueRecallAttempt(due, day(0), 0)).toBeNull();
    expect(dueRecallAttempt(due, day(1), 0)).toBe(1);
    expect(dueRecallAttempt(due, day(6), 1)).toBeNull();
    expect(dueRecallAttempt(due, day(7), 1)).toBe(2);
    expect(dueRecallAttempt(due, day(29), 2)).toBeNull();
    expect(dueRecallAttempt(due, day(30), 2)).toBe(3);
    expect(dueRecallAttempt(due, day(365), MAX_RECALL_ATTEMPTS)).toBeNull();
  });

  it('Dado várias marcas vencidas sem envio, Quando calcular, Então só a mais alta', () => {
    expect(dueRecallAttempt(due, day(60), 0)).toBe(3);
    expect(dueRecallAttempt(due, day(10), 0)).toBe(2);
  });

  it('Dado fuso de São Paulo, Quando contar dias, Então usa o calendário local', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo');
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    // Vence 01/06 22:00 local (02/06 01:00 UTC); 02/06 00:30 local é D+1.
    expect(
      daysSinceDue(
        new Date('2026-06-02T01:00:00Z'),
        new Date('2026-06-02T03:30:00Z'),
      ),
    ).toBe(1);
  });
});
