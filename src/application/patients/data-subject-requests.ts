import type { EmailGateway } from '@/application/ports/email-gateway';
import { appUrlFromEnv } from '@/application/reminders/portal-url';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import {
  type DataRequestKind,
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { logError } from '@/lib/log-error';

/** Defesa em profundidade das rotas da fila (ADR-002), além da família `administrative`. */
export const ADMIN_ONLY_MESSAGE =
  'Somente o Admin de Empresa analisa pedidos do titular';

/** E-mails de login dos Admins de Empresa ativos (a empresa é a do escopo). */
export async function companyAdminEmails(
  accounts: UserAccountRepository,
): Promise<string[]> {
  const admins = await accounts.findByRole('company_admin');
  return [
    ...new Set(
      admins.filter((account) => account.isActive).map((a) => a.email),
    ),
  ];
}

/** Link da fila do Admin; sem `APP_URL` válida, o texto só orienta o caminho. */
export function queueLinkLine(): string {
  const base = appUrlFromEnv();
  return base
    ? `Acesse a fila: ${base}/pedidos-titular`
    : 'Acesse o menu "Pedidos do titular" no sistema.';
}

/** Aviso ao Admin de pedido novo: sem o conteúdo do pedido (#312). */
export const NEW_REQUEST_EMAIL_SUBJECT =
  'Há um pedido novo de titular de dados';
export const newRequestEmailText = (): string =>
  [
    'Olá,',
    '',
    'Um paciente abriu um pedido sobre os próprios dados pessoais no portal.',
    'A clínica tem 15 dias corridos para responder (LGPD, art. 19).',
    queueLinkLine(),
  ].join('\n');

export interface OpenDataSubjectRequestInput {
  patientId: string;
  kind: DataRequestKind;
  details?: string | null;
}

/**
 * Titular abre um pedido de correção ou de eliminação pelo portal (#293).
 * Um pedido pendente por tipo: um segundo igual, antes da análise, é `409`
 * (a fila do Admin não acumula duplicatas; o índice único parcial fecha a
 * corrida). Em dois passos para a rota auditar entre eles (write-ahead):
 * `prepare` valida sem gravar, `commit` grava.
 */
export class OpenDataSubjectRequest {
  constructor(
    private readonly requests: DataSubjectRequestRepository,
    private readonly accounts: UserAccountRepository,
    private readonly email: EmailGateway,
  ) {}

  async prepare(
    input: OpenDataSubjectRequestInput,
  ): Promise<DataSubjectRequest> {
    const request = DataSubjectRequest.create(input);
    const existing = await this.requests.findByPatient(input.patientId);
    if (
      existing.some(
        (other) => other.kind === input.kind && other.status === 'pending',
      )
    ) {
      throw new ConflictError(
        'Você já tem um pedido deste tipo em análise pela clínica',
      );
    }
    return request;
  }

  /**
   * Grava o pedido e avisa os Admins de Empresa. O aviso não leva o texto do
   * pedido e uma falha nele nunca desfaz a criação (#312).
   */
  async commit(request: DataSubjectRequest): Promise<void> {
    await this.requests.save(request);
    await this.notifyAdmins(request);
  }

  /** Avisa os Admins de Empresa; falha no aviso só é logada (#312). */
  async notifyAdmins(request: DataSubjectRequest): Promise<void> {
    try {
      const recipients = await companyAdminEmails(this.accounts);
      const message = {
        subject: NEW_REQUEST_EMAIL_SUBJECT,
        text: newRequestEmailText(),
      };
      for (const to of recipients) {
        try {
          await this.email.send({ to, ...message });
        } catch (error) {
          logError(`Pedido do titular ${request.id}: falha no aviso`, error);
        }
      }
    } catch (error) {
      logError(`Pedido do titular ${request.id}: falha no aviso`, error);
    }
  }
}

export type DataRequestDecision = 'accept' | 'reject';

export interface ResolveDataSubjectRequestInput {
  requestId: string;
  decision: DataRequestDecision;
  justification: string;
}

export interface ResolveDataSubjectRequestResult {
  request: DataSubjectRequest;
  /** O aviso por e-mail saiu? Falha de envio não desfaz a decisão. */
  notified: boolean;
}

/** Texto do aviso: sem o conteúdo do pedido nem da justificativa (fica no portal). */
export const DECISION_EMAIL_SUBJECT =
  'Seu pedido sobre dados pessoais foi analisado';
export const DECISION_EMAIL_TEXT = [
  'Olá,',
  '',
  'A clínica analisou o seu pedido sobre os seus dados pessoais.',
  'Entre no portal do paciente para ver a resposta e a justificativa.',
].join('\n');

/**
 * Admin aceita ou recusa um pedido do titular, sempre com justificativa, e o
 * paciente é avisado por e-mail no endereço de login da conta do portal
 * (#312), não no do cadastro, que pode ser de outra pessoa. Aceitar não altera o cadastro nem o prontuário: a correção é
 * feita na ficha, e a anonimização segue a política de retenção (#294).
 */
export class ResolveDataSubjectRequest {
  constructor(
    private readonly requests: DataSubjectRequestRepository,
    private readonly accounts: UserAccountRepository,
    private readonly email: EmailGateway,
  ) {}

  /** Carrega e decide, sem gravar: a rota audita antes do `commit`. */
  async prepare(
    input: ResolveDataSubjectRequestInput,
  ): Promise<DataSubjectRequest> {
    const current = await this.requests.findById(input.requestId);
    if (!current) {
      throw new NotFoundError('Pedido', input.requestId);
    }
    return input.decision === 'accept'
      ? current.accept(input.justification)
      : current.reject(input.justification);
  }

  /** Grava a decisão (só se o pedido ainda está pendente) e avisa o paciente. */
  async commit(
    request: DataSubjectRequest,
  ): Promise<ResolveDataSubjectRequestResult> {
    await this.requests.save(request);
    return { request, notified: await this.notifyDecision(request) };
  }

  /**
   * Avisa o paciente da decisão já gravada. Separado do `commit` para a Server
   * Action gravar e auditar na transação e só então enviar o e-mail (#555): o
   * aviso nunca desfaz a decisão e falha vira `false`.
   */
  async notifyDecision(request: DataSubjectRequest): Promise<boolean> {
    try {
      const account = await this.accounts.findByPortalLink({
        patientId: request.patientId,
      });
      // Sem conta ativa não há para onde mandar: a resposta fica no portal.
      if (!account?.isActive) {
        return false;
      }
      // Canal desativado: o gateway nulo só registra o envio (dry-run), como
      // nos lembretes; a resposta segue visível no portal.
      const enabled = await this.email.isEnabled();
      await this.email.send({
        to: account.email,
        subject: DECISION_EMAIL_SUBJECT,
        text: DECISION_EMAIL_TEXT,
      });
      return enabled;
    } catch (error) {
      logError(`Pedido do titular ${request.id}: falha no aviso`, error);
      return false;
    }
  }
}
