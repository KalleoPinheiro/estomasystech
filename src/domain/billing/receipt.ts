import { formatCpf } from '../shared/cpf';
import { ValidationError } from '../shared/errors';

export interface ReceiptParty {
  name: string;
  /** CPF formatado (`000.000.000-00`) ou CNPJ da empresa. */
  document: string;
}

export interface ReceiptParties {
  /** Quem pagou: o pagador informado no recebimento ou, sem ele, o paciente. */
  payer: ReceiptParty;
  /** Prestador: a empresa, pelo CNPJ da configuração. */
  provider: ReceiptParty;
  /** O pagador é outra pessoa que não o paciente (recibo no nome do pagador). */
  payerIsPatient: boolean;
}

export interface ReceiptSources {
  clinic: {
    name: string;
    cnpj?: string | null;
    /** CNPJ antigo marcado para correção (#355); bloqueia a emissão (#358). */
    cnpjReviewSince?: Date | null;
  };
  patient: { fullName: string; cpf: string | null };
  payer?: { name: string; cpf: string } | null;
}

export const MISSING_PROVIDER_DOCUMENT_MESSAGE =
  'A empresa não tem CNPJ cadastrado. Cadastre em Configurações antes de emitir o recibo.';
export const CNPJ_UNDER_REVIEW_MESSAGE =
  'O CNPJ cadastrado da empresa não passa na conferência do dígito verificador. Corrija o CNPJ em Configurações › Dados da clínica antes de emitir o recibo; recibos já emitidos não são alterados.';
export const MISSING_PATIENT_CPF_MESSAGE =
  'O paciente não tem CPF cadastrado. Informe o CPF na ficha do paciente (Pacientes › Editar) antes de emitir o recibo; se quem pagou for outra pessoa, o CPF dela entra ao registrar o pagamento.';

/**
 * Recibo de saúde válido para o IRPF (#326, FIN-RN-15): traz o CPF de quem
 * pagou e o CNPJ do prestador. Falta de qualquer um bloqueia a emissão com
 * orientação, em vez de gerar um documento sem valor fiscal. O mesmo vale
 * para a empresa com CNPJ marcado para correção (#358, ACE-RN-57).
 */
export function resolveReceiptParties(sources: ReceiptSources): ReceiptParties {
  const cnpj = sources.clinic.cnpj?.trim();
  if (!cnpj) {
    throw new ValidationError(MISSING_PROVIDER_DOCUMENT_MESSAGE);
  }
  if (sources.clinic.cnpjReviewSince) {
    throw new ValidationError(CNPJ_UNDER_REVIEW_MESSAGE);
  }
  const provider = { name: sources.clinic.name, document: cnpj };
  if (sources.payer) {
    return {
      provider,
      payer: {
        name: sources.payer.name,
        document: formatCpf(sources.payer.cpf),
      },
      payerIsPatient: false,
    };
  }
  if (!sources.patient.cpf) {
    throw new ValidationError(MISSING_PATIENT_CPF_MESSAGE);
  }
  return {
    provider,
    payer: {
      name: sources.patient.fullName,
      document: formatCpf(sources.patient.cpf),
    },
    payerIsPatient: true,
  };
}
