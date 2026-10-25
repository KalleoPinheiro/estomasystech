import { describe, expect, it, vi } from 'vitest';
import {
  agendaHref,
  anchorForView,
  parseAgendaQuery,
  parseDayKey,
  resolveAgendaWindow,
  shiftAnchor,
} from '@/app/(staff)/agenda/agenda-range';

// Quinta-feira 15/10/2026, fuso da clínica.
const NOW = new Date('2026-10-15T15:00:00.000Z');

describe('Feature: período da agenda lido da URL (#551)', () => {
  describe('Cenário: parseDayKey', () => {
    it('Dada uma data válida, Então vira a célula do dia', () => {
      expect(parseDayKey('2026-10-22')).toEqual(new Date(2026, 9, 22));
    });

    it.each([
      null,
      undefined,
      '',
      '2026-10',
      '22/10/2026',
      '2026-02-31',
      '2026-13-01',
    ])('Dado %s, Então é inválida', (value) => {
      expect(parseDayKey(value)).toBeNull();
    });
  });

  describe('Cenário: janela de cada visão', () => {
    it('Dado o mês, Então a janela é o mês e os feriados cobrem os dias vizinhos da grade', () => {
      const window = resolveAgendaWindow('month', new Date(2026, 9, 22));

      expect(window.from).toEqual(new Date(2026, 9, 1));
      expect(window.to).toEqual(new Date(2026, 10, 1));
      expect(window.closuresFrom).toBe('2026-09-24');
      expect(window.closuresTo).toBe('2026-11-07');
      expect(window.label).toBe('Outubro de 2026');
    });

    it('Dada a semana, Então começa no domingo e dura 7 dias', () => {
      const window = resolveAgendaWindow('week', new Date(2026, 9, 22));

      expect(window.from).toEqual(new Date(2026, 9, 18));
      expect(window.to).toEqual(new Date(2026, 9, 25));
      expect(window.closuresFrom).toBe('2026-10-18');
      expect(window.closuresTo).toBe('2026-10-24');
      expect(window.label).toBe('18 a 24 de outubro de 2026');
    });

    it('Dada a semana que vira o mês, Então o rótulo traz os dois meses', () => {
      const window = resolveAgendaWindow('week', new Date(2026, 8, 30));

      expect(window.label).toBe('27 de setembro a 3 de outubro de 2026');
    });

    it('Dado o dia, Então a janela é só ele', () => {
      const window = resolveAgendaWindow('day', new Date(2026, 9, 22));

      expect(window.from).toEqual(new Date(2026, 9, 22));
      expect(window.to).toEqual(new Date(2026, 9, 23));
      expect(window.label).toBe('Quinta-feira, 22 de outubro de 2026');
    });
  });

  describe('Cenário: leitura dos parâmetros', () => {
    it('Dada a URL sem parâmetros, Então é o mês de hoje com o filtro padrão', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      try {
        const { query, entry } = parseAgendaQuery({});

        expect(query).toEqual({
          view: 'month',
          anchor: '2026-10-15',
          statuses: ['scheduled', 'confirmed', 'completed', 'no_show'],
          professionalId: '',
        });
        expect(entry).toEqual({ recall: null, consultation: null });
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dados visão, dia, status e profissional válidos, Então vêm do recorte da URL', () => {
      const { query } = parseAgendaQuery({
        visao: 'semana',
        dia: '2026-10-22',
        status: 'cancelled',
        profissional: 'prof-1',
      });

      expect(query).toEqual({
        view: 'week',
        anchor: '2026-10-22',
        statuses: ['cancelled'],
        professionalId: 'prof-1',
      });
      expect(parseAgendaQuery({ visao: 'dia' }).query.view).toBe('day');
    });

    it('Dados valores inválidos, Então cai no padrão sem erro', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      try {
        const { query } = parseAgendaQuery({
          visao: 'ano',
          dia: '31/02',
          status: 'xyz',
        });

        expect(query.view).toBe('month');
        expect(query.anchor).toBe('2026-10-15');
        expect(query.statuses).toEqual([
          'scheduled',
          'confirmed',
          'completed',
          'no_show',
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dado parâmetro repetido na URL, Então vale o primeiro', () => {
      expect(
        parseAgendaQuery({ profissional: ['prof-1', 'prof-2'] }).query
          .professionalId,
      ).toBe('prof-1');
    });

    it('Dado o link do Google Agenda, Então abre o mês da consulta; sem «em» válido, ignora', () => {
      const { query, entry } = parseAgendaQuery({
        consulta: 'appt-1',
        em: '2026-12-03T13:00:00.000Z',
      });

      expect(query.anchor).toBe('2026-12-03');
      expect(entry.consultation).toEqual({
        id: 'appt-1',
        startsAt: '2026-12-03T13:00:00.000Z',
      });
      expect(
        parseAgendaQuery({ consulta: 'appt-1', em: 'ontem' }).entry
          .consultation,
      ).toBeNull();
      expect(
        parseAgendaQuery({ em: '2026-12-03T13:00:00.000Z' }).entry,
      ).toEqual({
        recall: null,
        consultation: null,
      });
    });

    it('Dado o recall de 1 clique, Então leva retorno, paciente e procedimento', () => {
      expect(
        parseAgendaQuery({
          followUpId: 'fu-1',
          patientId: 'pat-1',
          procedure: 'Troca de curativo',
        }).entry.recall,
      ).toEqual({
        followUpId: 'fu-1',
        patientId: 'pat-1',
        procedure: 'Troca de curativo',
      });
      expect(parseAgendaQuery({ followUpId: 'fu-1' }).entry.recall).toEqual({
        followUpId: 'fu-1',
        patientId: '',
        procedure: '',
      });
    });
  });

  describe('Cenário: links', () => {
    it('Dado o padrão de hoje, Então a URL fica limpa', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      try {
        const statuses = parseAgendaQuery({}).query.statuses;
        const base = { statuses, professionalId: '' };

        expect(
          agendaHref({ ...base, view: 'month', anchor: '2026-10-15' }),
        ).toBe('/agenda');
        // Outro dia do mesmo mês é o mesmo mês de hoje: também limpa.
        expect(
          agendaHref({ ...base, view: 'month', anchor: '2026-10-01' }),
        ).toBe('/agenda');
        expect(agendaHref({ ...base, view: 'day', anchor: '2026-10-15' })).toBe(
          '/agenda?visao=dia',
        );
        expect(
          agendaHref({ ...base, view: 'week', anchor: '2026-10-18' }),
        ).toBe('/agenda?visao=semana&dia=2026-10-18');
        expect(
          agendaHref({ ...base, view: 'week', anchor: '2026-10-15' }),
        ).toBe('/agenda?visao=semana');
      } finally {
        vi.useRealTimers();
      }
    });

    it('Dados recorte e profissional, Então entram na URL', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      try {
        expect(
          agendaHref({
            view: 'month',
            anchor: '2026-11-01',
            statuses: ['confirmed', 'no_show'],
            professionalId: 'prof-1',
          }),
        ).toBe(
          '/agenda?dia=2026-11-01&status=confirmed%2Cno_show&profissional=prof-1',
        );
        // Âncora inválida não derruba o link.
        expect(
          agendaHref({
            view: 'month',
            anchor: 'lixo',
            statuses: parseAgendaQuery({}).query.statuses,
            professionalId: '',
          }),
        ).toBe('/agenda');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Cenário: deslocar e trocar de visão', () => {
    it('Dado cada visão, Quando deslocar, Então anda um mês, uma semana ou um dia', () => {
      const anchor = new Date(2026, 9, 22);

      expect(shiftAnchor('month', anchor, 1)).toEqual(new Date(2026, 10, 1));
      expect(shiftAnchor('month', anchor, -1)).toEqual(new Date(2026, 8, 1));
      expect(shiftAnchor('week', anchor, 1)).toEqual(new Date(2026, 9, 29));
      expect(shiftAnchor('day', anchor, -1)).toEqual(new Date(2026, 9, 21));
    });

    it('Dadas as trocas de visão, Então a âncora segue a regra de cada uma', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      try {
        const month = resolveAgendaWindow('month', new Date(2026, 9, 1));
        const farMonth = resolveAgendaWindow('month', new Date(2030, 2, 1));
        const week = resolveAgendaWindow('week', new Date(2026, 9, 22));
        const otherWeek = resolveAgendaWindow('week', new Date(2030, 2, 14));
        const day = resolveAgendaWindow('day', new Date(2026, 9, 22));

        // Mês → semana/dia: o dia escolhido; sem escolha, hoje no mês, ou o dia 1.
        const picked = new Date(2026, 9, 7);
        expect(anchorForView('month', 'day', month, picked)).toEqual(picked);
        expect(anchorForView('month', 'week', month, null)).toEqual(
          new Date(2026, 9, 15),
        );
        expect(anchorForView('month', 'day', farMonth, null)).toEqual(
          new Date(2030, 2, 1),
        );
        // Semana → dia: hoje, se está na semana; senão o domingo.
        expect(anchorForView('week', 'day', otherWeek, null)).toEqual(
          new Date(2030, 2, 10),
        );
        expect(
          anchorForView(
            'week',
            'day',
            resolveAgendaWindow('week', new Date(2026, 9, 15)),
            null,
          ),
        ).toEqual(new Date(2026, 9, 15));
        // Dia → semana: o mesmo dia. Qualquer → mês: o mês da âncora.
        expect(anchorForView('day', 'week', day, null)).toEqual(
          new Date(2026, 9, 22),
        );
        expect(anchorForView('week', 'month', week, null)).toEqual(
          new Date(2026, 9, 1),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
