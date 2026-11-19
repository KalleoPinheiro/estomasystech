import { describe, expect, it } from 'vitest';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import {
  OFFER_WINDOW_MS,
  offerDeadline,
  waitlistOfferContent,
} from '@/domain/scheduling/waitlist-offer';
import {
  InvalidStatusTransitionError,
  ValidationError,
} from '@/domain/shared/errors';

const at = (iso: string) => new Date(iso);
const START = at('2026-07-20T12:00:00Z');

const waiting = (createdAt = '2026-07-01T00:00:00Z') =>
  WaitlistEntry.create(
    {
      patientId: 'pac-1',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      source: 'staff',
    },
    at(createdAt),
  );

describe('Feature: Prazo da oferta de vaga (ADR-114)', () => {
  it('Dado consulta daqui a mais de 2 horas, Quando calcula o prazo, Então vale 2 horas', () => {
    const now = at('2026-07-20T06:00:00Z');
    expect(offerDeadline(now, START)?.toISOString()).toBe(
      '2026-07-20T08:00:00.000Z',
    );
    expect(OFFER_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('Dado exatamente 2 horas, Quando calcula o prazo, Então expira no horário da consulta', () => {
    const now = at('2026-07-20T10:00:00Z');
    expect(offerDeadline(now, START)?.toISOString()).toBe(START.toISOString());
  });

  it('Dado menos de 2 horas, Quando calcula o prazo, Então expira no horário da consulta', () => {
    const now = at('2026-07-20T11:00:00Z');
    expect(offerDeadline(now, START)?.toISOString()).toBe(START.toISOString());
  });

  it('Dado consulta que já começou, Quando calcula o prazo, Então não há oferta', () => {
    expect(offerDeadline(START, START)).toBeNull();
    expect(offerDeadline(at('2026-07-20T12:00:01Z'), START)).toBeNull();
  });
});

describe('Feature: Texto da oferta de vaga', () => {
  const data = {
    firstName: 'Ana',
    clinicName: 'Clínica Sol',
    startsAt: START,
    expiresAt: at('2026-07-20T08:00:00Z'),
  };

  it('Dado o paciente, Quando monta o e-mail, Então leva dia, hora e prazo, sem procedimento', () => {
    const content = waitlistOfferContent(data);
    expect(content.subject).toBe('Horário disponível — Clínica Sol');
    expect(content.text).toContain('Olá, Ana!');
    expect(content.text).toContain('para você');
    expect(content.text).toContain('20/07/2026 às 12:00');
    expect(content.text).toContain('20/07/2026 às 08:00');
    expect(content.text).not.toContain('Curativo');
  });

  it('Dado o responsável, Quando monta o e-mail, Então fala do paciente em nome dele', () => {
    const content = waitlistOfferContent({ ...data, onBehalfOf: 'Davi' });
    expect(content.text).toContain('para Davi');
    expect(content.text).not.toContain('para você');
  });
});

describe('Feature: Oferta na entrada da lista de espera', () => {
  const deadline = at('2026-07-20T08:00:00Z');

  it('Dado entrada na fila, Quando segura a vaga, Então registra a oferta sem mudar a entrada anterior', () => {
    const entry = waiting();
    const held = entry.holdOffer('consulta-1', deadline);

    expect(entry.openOffer).toBeNull();
    expect(entry.offerExpiresAfter(deadline)).toBe(false);
    expect(entry.offerEmailWasSent()).toBe(false);
    expect(() => entry.offerExpiresAt()).toThrow(ValidationError);
    expect(held.openOffer).toMatchObject({
      appointmentId: 'consulta-1',
      emailSentAt: null,
    });
    expect(held.openOffer?.expiresAt.toISOString()).toBe(
      deadline.toISOString(),
    );
    expect(held.wasOffered('consulta-1')).toBe(true);
    expect(held.offerExpiresAfter(at('2026-07-20T07:59:00Z'))).toBe(true);
    expect(held.offerExpiresAfter(deadline)).toBe(false);
    expect(held.offerExpiresAt().toISOString()).toBe(deadline.toISOString());
    expect(held.status).toBe('waiting');
  });

  it('Dado a oferta, Quando lê o prazo, Então a cópia não altera a entrada', () => {
    const held = waiting().holdOffer('consulta-1', deadline);
    const view = held.openOffer;
    view?.expiresAt.setTime(0);
    expect(held.offerExpiresAt().toISOString()).toBe(deadline.toISOString());
  });

  it('Dado entrada resolvida, oferta em aberto ou vaga já oferecida, Quando segura de novo, Então recusa', () => {
    const held = waiting().holdOffer('consulta-1', deadline);
    expect(() => held.holdOffer('consulta-2', deadline)).toThrow(
      ValidationError,
    );
    expect(() =>
      held.expireOffer(deadline).holdOffer('consulta-1', deadline),
    ).toThrow(ValidationError);
    expect(() =>
      waiting().markScheduled().holdOffer('consulta-1', deadline),
    ).toThrow(InvalidStatusTransitionError);
  });

  it('Dado oferta sem e-mail, Quando marca o envio duas vezes, Então fica o horário do primeiro', () => {
    const held = waiting().holdOffer('consulta-1', deadline);
    expect(() => waiting().markOfferEmailSent(deadline)).toThrow(
      ValidationError,
    );
    const sentAt = at('2026-07-20T06:05:00Z');
    const sent = held.markOfferEmailSent(sentAt);
    const again = sent.markOfferEmailSent(at('2026-07-20T07:00:00Z'));

    expect(sent.offerEmailWasSent()).toBe(true);
    expect(sent.openOffer?.emailSentAt?.toISOString()).toBe(
      sentAt.toISOString(),
    );
    expect(again.offerEmailWasSent()).toBe(true);
    expect(again.openOffer?.emailSentAt?.toISOString()).toBe(
      sentAt.toISOString(),
    );
    const copy = sent.openOffer?.emailSentAt;
    copy?.setTime(0);
    expect(sent.openOffer?.emailSentAt?.toISOString()).toBe(
      sentAt.toISOString(),
    );
  });

  it('Dado oferta que ainda vale, Quando tenta expirar, Então recusa; no prazo, solta e lembra que já ofereceu', () => {
    const held = waiting().holdOffer('consulta-1', deadline);
    expect(() => waiting().expireOffer(deadline)).toThrow(ValidationError);
    expect(() => held.expireOffer(at('2026-07-20T07:59:00Z'))).toThrow(
      ValidationError,
    );

    const expired = held.expireOffer(deadline);
    expect(expired.openOffer).toBeNull();
    expect(expired.wasOffered('consulta-1')).toBe(true);
    expect(expired.offeredAppointmentIds).toEqual(['consulta-1']);
  });

  it('Dado oferta em aberto, Quando retira porque o horário fechou, Então solta; sem oferta, recusa', () => {
    expect(() => waiting().withdrawOffer()).toThrow(ValidationError);
    const withdrawn = waiting()
      .holdOffer('consulta-1', deadline)
      .withdrawOffer();
    expect(withdrawn.openOffer).toBeNull();
    expect(withdrawn.wasOffered('consulta-1')).toBe(true);
  });
});
