import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/log-error', () => ({ logError }));

import {
  ADMIN_ONLY_MESSAGE,
  companyAdminEmails,
  DECISION_EMAIL_SUBJECT,
  DECISION_EMAIL_TEXT,
  NEW_REQUEST_EMAIL_SUBJECT,
  newRequestEmailText,
  OpenDataSubjectRequest,
  queueLinkLine,
  ResolveDataSubjectRequest,
} from '@/application/patients/data-subject-requests';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import {
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { buildUserAccount } from '../../support/builders';

function repo() {
  const stored = new Map<string, DataSubjectRequest>();
  const requests = {
    save: async (r: DataSubjectRequest) => {
      stored.set(r.id, r);
    },
    findById: async (id: string) => stored.get(id) ?? null,
    findByPatient: async (patientId: string) =>
      [...stored.values()].filter((r) => r.patientId === patientId),
    listByStatus: async () => [...stored.values()],
  } satisfies DataSubjectRequestRepository;
  return { stored, requests };
}

class Mail implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  constructor(
    private readonly enabled = true,
    private readonly failFor: string[] = [],
  ) {}
  async isEnabled() {
    return this.enabled;
  }
  async send(message: EmailMessage) {
    if (this.failFor.includes(message.to))
      throw new Error('provedor fora do ar');
    this.sent.push(message);
  }
}

const OLD_APP_URL = process.env.APP_URL;
beforeEach(() => {
  logError.mockClear();
  process.env.APP_URL = 'https://app.estomasystech.test/';
});
afterEach(() => {
  if (OLD_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = OLD_APP_URL;
});

describe('Feature: Pedidos do titular (mutação, #406)', () => {
  describe('Cenário: textos e links', () => {
    it('Dado APP_URL válida, Então o aviso aponta para a fila; sem ela, orienta o menu', () => {
      expect(queueLinkLine()).toBe(
        'Acesse a fila: https://app.estomasystech.test/pedidos-titular',
      );
      delete process.env.APP_URL;
      expect(queueLinkLine()).toBe(
        'Acesse o menu "Pedidos do titular" no sistema.',
      );
    });

    it('Dado os textos de aviso, Então são os que o usuário lê, sem conteúdo do pedido', () => {
      expect(ADMIN_ONLY_MESSAGE).toBe(
        'Somente o Admin de Empresa analisa pedidos do titular',
      );
      expect(NEW_REQUEST_EMAIL_SUBJECT).toBe(
        'Há um pedido novo de titular de dados',
      );
      expect(newRequestEmailText()).toBe(
        [
          'Olá,',
          '',
          'Um paciente abriu um pedido sobre os próprios dados pessoais no portal.',
          'A clínica tem 15 dias corridos para responder (LGPD, art. 19).',
          'Acesse a fila: https://app.estomasystech.test/pedidos-titular',
        ].join('\n'),
      );
      expect(DECISION_EMAIL_SUBJECT).toBe(
        'Seu pedido sobre dados pessoais foi analisado',
      );
      expect(DECISION_EMAIL_TEXT).toBe(
        [
          'Olá,',
          '',
          'A clínica analisou o seu pedido sobre os seus dados pessoais.',
          'Entre no portal do paciente para ver a resposta e a justificativa.',
        ].join('\n'),
      );
    });
  });

  describe('Cenário: e-mails dos admins', () => {
    it('Dado admins ativos, inativos, duplicados e outros papéis, Então só os e-mails dos admins ativos, sem repetir', async () => {
      const accounts = new InMemoryUserAccountRepository();
      await accounts.save(
        buildUserAccount({ email: 'a@x.com', role: 'company_admin' }),
      );
      await accounts.save(
        buildUserAccount({
          email: 'b@x.com',
          role: 'company_admin',
        }).deactivate(),
      );
      await accounts.save(
        buildUserAccount({ email: 'c@x.com', role: 'profissional' }),
      );
      expect(await companyAdminEmails(accounts)).toEqual(['a@x.com']);
    });
  });

  describe('Cenário: abrir pedido', () => {
    const open = async (
      mail: Mail,
      admins: string[] = ['a@x.com', 'b@x.com'],
    ) => {
      const { requests, stored } = repo();
      const accounts = new InMemoryUserAccountRepository();
      for (const email of admins)
        await accounts.save(buildUserAccount({ email, role: 'company_admin' }));
      return {
        stored,
        useCase: new OpenDataSubjectRequest(requests, accounts, mail),
        requests,
      };
    };

    it('Dado pedido pendente do mesmo tipo, Quando abrir outro, Então 409 com a mensagem', async () => {
      const mail = new Mail();
      const { useCase } = await open(mail);
      await useCase.commit(
        await useCase.prepare({ patientId: 'p1', kind: 'erasure' }),
      );
      const error = await useCase
        .prepare({ patientId: 'p1', kind: 'erasure' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe(
        'Você já tem um pedido deste tipo em análise pela clínica',
      );
    });

    it('Dado pendente de outro tipo ou de outro paciente, Então permite', async () => {
      const mail = new Mail();
      const { useCase } = await open(mail);
      await useCase.commit(
        await useCase.prepare({ patientId: 'p1', kind: 'erasure' }),
      );
      await expect(
        useCase.prepare({
          patientId: 'p1',
          kind: 'correction',
          details: 'telefone errado',
        }),
      ).resolves.toBeTruthy();
      await expect(
        useCase.prepare({ patientId: 'p2', kind: 'erasure' }),
      ).resolves.toBeTruthy();
    });

    it('Dado pedido do mesmo tipo já decidido, Então permite abrir novo', async () => {
      const mail = new Mail();
      const { useCase, requests } = await open(mail);
      const done = DataSubjectRequest.create({
        patientId: 'p1',
        kind: 'erasure',
      }).reject('Guarda legal');
      await requests.save(done);
      await expect(
        useCase.prepare({ patientId: 'p1', kind: 'erasure' }),
      ).resolves.toBeTruthy();
    });

    it('Dado validação do pedido, Quando prepara, Então não grava nada', async () => {
      const mail = new Mail();
      const { useCase, stored } = await open(mail);
      await useCase.prepare({ patientId: 'p1', kind: 'erasure' });
      expect(stored.size).toBe(0);
    });

    it('Dado dois admins, Quando grava o pedido, Então avisa cada um com o texto sem conteúdo do pedido', async () => {
      const mail = new Mail();
      const { useCase, stored } = await open(mail);
      const request = await useCase.prepare({
        patientId: 'p1',
        kind: 'erasure',
        details: 'dado sensível do pedido',
      });
      await useCase.commit(request);
      expect(stored.has(request.id)).toBe(true);
      expect(mail.sent.map((m) => m.to).sort()).toEqual(['a@x.com', 'b@x.com']);
      for (const m of mail.sent) {
        expect(m.subject).toBe(NEW_REQUEST_EMAIL_SUBJECT);
        expect(m.text).toBe(newRequestEmailText());
        expect(m.text).not.toContain('dado sensível do pedido');
      }
    });

    it('Dado falha de envio para um admin, Então os outros ainda recebem e o pedido fica gravado', async () => {
      const mail = new Mail(true, ['a@x.com']);
      const { useCase, stored } = await open(mail);
      const request = await useCase.prepare({
        patientId: 'p1',
        kind: 'erasure',
      });
      await useCase.commit(request);
      expect(stored.has(request.id)).toBe(true);
      expect(mail.sent.map((m) => m.to)).toEqual(['b@x.com']);
      expect(logError).toHaveBeenCalledWith(
        `Pedido do titular ${request.id}: falha no aviso`,
        expect.any(Error),
      );
    });

    it('Dado falha ao buscar os admins, Então o pedido fica gravado e a falha é registrada', async () => {
      const { requests, stored } = repo();
      const accounts = {
        findByRole: async () => {
          throw new Error('banco fora');
        },
      } as unknown as UserAccountRepository;
      const useCase = new OpenDataSubjectRequest(
        requests,
        accounts,
        new Mail(),
      );
      const request = await useCase.prepare({
        patientId: 'p1',
        kind: 'erasure',
      });
      await expect(useCase.commit(request)).resolves.toBeUndefined();
      expect(stored.has(request.id)).toBe(true);
      expect(logError).toHaveBeenCalledWith(
        `Pedido do titular ${request.id}: falha no aviso`,
        expect.any(Error),
      );
    });
  });

  describe('Cenário: decidir pedido', () => {
    const portalAccount = UserAccount.create({
      email: 'login@x.com',
      passwordHash: 'scrypt$1$s$h',
      role: 'patient',
      clinicId: 'c1',
      patientId: 'p1',
    });

    const resolver = (mail: Mail, account: UserAccount | null) => {
      const { requests, stored } = repo();
      const findByPortalLink = async (link: unknown) => {
        expect(link).toEqual({ patientId: 'p1' });
        return account;
      };
      const accounts = { findByPortalLink } as unknown as UserAccountRepository;
      return {
        stored,
        useCase: new ResolveDataSubjectRequest(requests, accounts, mail),
      };
    };

    it('Dado pedido inexistente, Quando decidir, Então 404 com o id do pedido', async () => {
      const { useCase } = resolver(new Mail(), portalAccount);
      const error = await useCase
        .prepare({
          requestId: 'nao-existe',
          decision: 'accept',
          justification: 'ok',
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).entityId).toBe('nao-existe');
    });

    it('Dado aceite e recusa, Então o status e a justificativa seguem a decisão', async () => {
      const { useCase, stored } = resolver(new Mail(), portalAccount);
      const a = DataSubjectRequest.create({ patientId: 'p1', kind: 'erasure' });
      const b = DataSubjectRequest.create({ patientId: 'p1', kind: 'erasure' });
      stored.set(a.id, a);
      stored.set(b.id, b);
      const accepted = await useCase.prepare({
        requestId: a.id,
        decision: 'accept',
        justification: 'Cabível',
      });
      const rejected = await useCase.prepare({
        requestId: b.id,
        decision: 'reject',
        justification: 'Guarda legal',
      });
      expect(accepted.status).toBe('accepted');
      expect(rejected.status).toBe('rejected');
      expect(rejected.resolution).toBe('Guarda legal');
    });

    it('Dado conta do portal ativa e canal ligado, Quando grava, Então avisa no e-mail de login e notified = true', async () => {
      const mail = new Mail(true);
      const { useCase, stored } = resolver(mail, portalAccount);
      const req = DataSubjectRequest.create({
        patientId: 'p1',
        kind: 'erasure',
      });
      stored.set(req.id, req);
      const out = await useCase.commit(
        await useCase.prepare({
          requestId: req.id,
          decision: 'accept',
          justification: 'ok',
        }),
      );
      expect(out.notified).toBe(true);
      expect(mail.sent).toEqual([
        {
          to: 'login@x.com',
          subject: DECISION_EMAIL_SUBJECT,
          text: DECISION_EMAIL_TEXT,
        },
      ]);
    });

    it('Dado canal desligado, Então o envio é registrado (dry-run) mas notified = false', async () => {
      const mail = new Mail(false);
      const { useCase, stored } = resolver(mail, portalAccount);
      const req = DataSubjectRequest.create({
        patientId: 'p1',
        kind: 'erasure',
      });
      stored.set(req.id, req);
      const out = await useCase.commit(
        await useCase.prepare({
          requestId: req.id,
          decision: 'reject',
          justification: 'ok',
        }),
      );
      expect(out.notified).toBe(false);
      expect(mail.sent).toHaveLength(1);
    });

    it('Dado conta do portal inativa ou ausente, Então não envia e notified = false', async () => {
      for (const account of [portalAccount.deactivate(), null]) {
        const mail = new Mail(true);
        const { useCase, stored } = resolver(mail, account);
        const req = DataSubjectRequest.create({
          patientId: 'p1',
          kind: 'erasure',
        });
        stored.set(req.id, req);
        const out = await useCase.commit(
          await useCase.prepare({
            requestId: req.id,
            decision: 'accept',
            justification: 'ok',
          }),
        );
        expect(out.notified).toBe(false);
        expect(mail.sent).toHaveLength(0);
      }
    });

    it('Dado falha no envio, Então a decisão fica gravada, notified = false e a falha é registrada', async () => {
      const mail = new Mail(true, ['login@x.com']);
      const { useCase, stored } = resolver(mail, portalAccount);
      const req = DataSubjectRequest.create({
        patientId: 'p1',
        kind: 'erasure',
      });
      stored.set(req.id, req);
      const decided = await useCase.prepare({
        requestId: req.id,
        decision: 'accept',
        justification: 'ok',
      });
      const out = await useCase.commit(decided);
      expect(out.notified).toBe(false);
      expect(stored.get(req.id)?.status).toBe('accepted');
      expect(logError).toHaveBeenCalledWith(
        `Pedido do titular ${req.id}: falha no aviso`,
        expect.any(Error),
      );
    });
  });
});
