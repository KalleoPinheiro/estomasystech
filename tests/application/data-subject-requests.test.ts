import { describe, expect, it, vi } from 'vitest';
import {
  DECISION_EMAIL_SUBJECT,
  ResolveDataSubjectRequest,
} from '@/application/patients/data-subject-requests';
import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';

function fakes(options: { patient?: Patient | null; email: EmailGateway }) {
  const stored = new Map<string, DataSubjectRequest>();
  const requests = {
    save: vi.fn(async (request: DataSubjectRequest) => {
      stored.set(request.id, request);
    }),
    findById: vi.fn(async (id: string) => stored.get(id) ?? null),
    findByPatient: vi.fn(async () => [...stored.values()]),
    listByStatus: vi.fn(async () => [...stored.values()]),
  } satisfies DataSubjectRequestRepository;
  const patients = {
    findById: vi.fn(async () => options.patient ?? null),
  } as unknown as PatientRepository;
  return {
    stored,
    useCase: new ResolveDataSubjectRequest(requests, patients, options.email),
  };
}

const patient = Patient.create({
  fullName: 'Maria da Silva',
  email: 'maria@x.com',
  phone: '11999990000',
});

const pending = () =>
  DataSubjectRequest.create({ patientId: patient.id, kind: 'erasure' });

describe('ResolveDataSubjectRequest (#293)', () => {
  it('canal ativo: avisa o paciente e devolve notified = true', async () => {
    const send = vi.fn(async () => undefined);
    const { stored, useCase } = fakes({
      patient,
      email: { isEnabled: async () => true, send },
    });
    const request = pending();
    stored.set(request.id, request);

    const result = await useCase.execute({
      requestId: request.id,
      decision: 'reject',
      justification: 'Guarda legal',
    });

    expect(result.notified).toBe(true);
    expect(result.request.status).toBe('rejected');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'maria@x.com',
        subject: DECISION_EMAIL_SUBJECT,
      }),
    );
  });

  it('falha no envio não desfaz a decisão', async () => {
    const { stored, useCase } = fakes({
      patient,
      email: {
        isEnabled: async () => true,
        send: async () => {
          throw new Error('provedor fora');
        },
      },
    });
    const request = pending();
    stored.set(request.id, request);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await useCase.execute({
      requestId: request.id,
      decision: 'accept',
      justification: 'Anonimização agendada',
    });

    expect(result.notified).toBe(false);
    expect(stored.get(request.id)?.status).toBe('accepted');
  });

  it('cadastro não encontrado: decide sem aviso', async () => {
    const send = vi.fn(async () => undefined);
    const { stored, useCase } = fakes({
      patient: null,
      email: { isEnabled: async () => true, send },
    });
    const request = pending();
    stored.set(request.id, request);

    const result = await useCase.execute({
      requestId: request.id,
      decision: 'accept',
      justification: 'ok',
    });

    expect(result.notified).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('pedido inexistente: NotFoundError', async () => {
    const { useCase } = fakes({
      patient,
      email: { isEnabled: async () => true, send: async () => undefined },
    });

    await expect(
      useCase.execute({
        requestId: 'x',
        decision: 'accept',
        justification: 'ok',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
