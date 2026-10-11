import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  type DataRequestKind,
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { logError } from '@/lib/log-error';

/** Defesa em profundidade das rotas da fila (ADR-002), além da família `administrative`. */
export const ADMIN_ONLY_MESSAGE =
  'Somente o Admin de Empresa analisa pedidos do titular';

export interface OpenDataSubjectRequestInput {
  patientId: string;
  kind: DataRequestKind;
  details?: string | null;
}

/**
 * Titular abre um pedido de correção ou de eliminação pelo portal (#293).
 * Um pedido pendente por tipo: um segundo igual, antes da análise, é `409`
 * (a fila do Admin não acumula duplicatas; o paciente complementa depois).
 */
export class OpenDataSubjectRequest {
  constructor(private readonly requests: DataSubjectRequestRepository) {}

  async execute(
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
    await this.requests.save(request);
    return request;
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
 * paciente é avisado por e-mail no endereço do cadastro (o mesmo dos
 * lembretes). Aceitar não altera o cadastro nem o prontuário: a correção é
 * feita na ficha, e a anonimização segue a política de retenção (#294).
 */
export class ResolveDataSubjectRequest {
  constructor(
    private readonly requests: DataSubjectRequestRepository,
    private readonly patients: PatientRepository,
    private readonly email: EmailGateway,
  ) {}

  async execute(
    input: ResolveDataSubjectRequestInput,
  ): Promise<ResolveDataSubjectRequestResult> {
    const current = await this.requests.findById(input.requestId);
    if (!current) {
      throw new NotFoundError('Pedido', input.requestId);
    }
    const request =
      input.decision === 'accept'
        ? current.accept(input.justification)
        : current.reject(input.justification);
    await this.requests.save(request);
    return { request, notified: await this.notify(request) };
  }

  private async notify(request: DataSubjectRequest): Promise<boolean> {
    try {
      const patient = await this.patients.findById(request.patientId);
      if (!patient) {
        return false;
      }
      // Canal desativado: o gateway nulo só registra o envio (dry-run), como
      // nos lembretes; a resposta segue visível no portal.
      const enabled = await this.email.isEnabled();
      await this.email.send({
        to: patient.email,
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
