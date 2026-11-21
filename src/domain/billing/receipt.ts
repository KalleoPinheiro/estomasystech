import { formatCpf } from '../shared/cpf';
import { ValidationError } from '../shared/errors';

export interface ReceiptParty {
  name: string;
  /** CPF formatado (`000.000.000-00`) ou CNPJ da empresa. */
  document: string;
}

/**
 * Prestador do recibo. Na profissional autônoma (#977) o recibo segue o
 * modelo do Receita Saúde: o documento é o CPF dela e o registro no conselho
 * (COREN) vai junto. Na clínica, só nome e CNPJ (campos ausentes).
 */
export interface ReceiptProvider extends ReceiptParty {
  documentLabel?: 'CPF';
  registry?: string;
}

export interface ReceiptParties {
  /** Quem pagou: o pagador informado no recebimento ou, sem ele, o paciente. */
  payer: ReceiptParty;
  /** Prestador: a empresa, pelo CNPJ da configuração, ou a autônoma, pelo CPF (#977). */
  provider: ReceiptProvider;
  /** O pagador é outra pessoa que não o paciente (recibo no nome do pagador). */
  payerIsPatient: boolean;
  /**
   * Autônoma com pagador que não é o paciente (#977): o Receita Saúde pede o
   * CPF do beneficiário do serviço. Ausente nos demais casos.
   */
  beneficiary?: ReceiptParty;
}

export interface ReceiptSources {
  clinic: {
    name: string;
    /** Ausente vale `company`. */
    kind?: 'company' | 'individual';
    cnpj?: string | null;
    /** CPF da autônoma, 11 dígitos (#977). */
    cpf?: string | null;
    /** Registro no conselho (COREN) da autônoma. */
    professionalRegistry?: string | null;
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
export const MISSING_PROVIDER_CPF_MESSAGE =
  'A profissional não tem CPF cadastrado. Cadastre em Configurações antes de emitir o recibo.';
export const MISSING_PROVIDER_REGISTRY_MESSAGE =
  'A profissional não tem registro no conselho (COREN) cadastrado. Cadastre em Configurações antes de emitir o recibo.';
export const MISSING_BENEFICIARY_CPF_MESSAGE =
  'O paciente não tem CPF cadastrado. No recibo da profissional autônoma (modelo do Receita Saúde) o CPF do paciente atendido é obrigatório quando outra pessoa paga: informe-o na ficha do paciente (Pacientes › Editar).';
export const MISSING_PATIENT_CPF_MESSAGE =
  'O paciente não tem CPF cadastrado. Informe o CPF na ficha do paciente (Pacientes › Editar) antes de emitir o recibo; se quem pagou for outra pessoa, o CPF dela entra ao registrar o pagamento.';

/**
 * Recibo de saúde válido para o IRPF (#326, FIN-RN-15): traz o CPF de quem
 * pagou e o CNPJ do prestador — ou, na profissional autônoma (#977), o CPF e
 * o COREN dela e, se outra pessoa pagou, o CPF do paciente (Receita Saúde). Falta de qualquer um bloqueia a emissão com
 * orientação, em vez de gerar um documento sem valor fiscal. O mesmo vale
 * para a empresa com CNPJ marcado para correção (#358, ACE-RN-57).
 */
function companyProvider(clinic: ReceiptSources['clinic']): ReceiptProvider {
  const cnpj = clinic.cnpj?.trim();
  if (!cnpj) {
    throw new ValidationError(MISSING_PROVIDER_DOCUMENT_MESSAGE);
  }
  if (clinic.cnpjReviewSince) {
    throw new ValidationError(CNPJ_UNDER_REVIEW_MESSAGE);
  }
  return { name: clinic.name, document: cnpj };
}

/** Autônoma (#977): CPF e COREN dela, sem CNPJ e sem a conferência do CNPJ. */
function individualProvider(clinic: ReceiptSources['clinic']): ReceiptProvider {
  const cpf = clinic.cpf?.trim();
  if (!cpf) throw new ValidationError(MISSING_PROVIDER_CPF_MESSAGE);
  const registry = clinic.professionalRegistry?.trim();
  if (!registry) throw new ValidationError(MISSING_PROVIDER_REGISTRY_MESSAGE);
  return {
    name: clinic.name,
    document: formatCpf(cpf),
    documentLabel: 'CPF',
    registry,
  };
}

/** Beneficiário do Receita Saúde: o paciente, quando outra pessoa paga a autônoma. */
function individualBeneficiary(
  patient: ReceiptSources['patient'],
): ReceiptParty {
  if (!patient.cpf) {
    throw new ValidationError(MISSING_BENEFICIARY_CPF_MESSAGE);
  }
  return { name: patient.fullName, document: formatCpf(patient.cpf) };
}

export function resolveReceiptParties(sources: ReceiptSources): ReceiptParties {
  const individual = sources.clinic.kind === 'individual';
  const provider = individual
    ? individualProvider(sources.clinic)
    : companyProvider(sources.clinic);
  if (sources.payer) {
    return {
      provider,
      payer: {
        name: sources.payer.name,
        document: formatCpf(sources.payer.cpf),
      },
      payerIsPatient: false,
      ...(individual
        ? { beneficiary: individualBeneficiary(sources.patient) }
        : {}),
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
