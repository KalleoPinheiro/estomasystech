import type { Clinic } from '@/domain/clinic/clinic';
import { ConflictError } from '@/domain/shared/errors';

/**
 * Revisão jurídica dos textos LGPD (#216, ADR-030): enquanto for `true`, a
 * tela de Configurações avisa a equipe que os textos em vigor foram redigidos
 * sem revisão de profissional da área. Vira `false` junto com a troca dos
 * textos pelo texto revisado (versão nova, aceites refeitos).
 */
export const LEGAL_REVIEW_PENDING = true;

/** Quem responde pelos dados do paciente: dados da clínica interpolados nos textos. */
export interface LegalController {
  name: string;
  /** CNPJ da clínica ou, com `documentLabel: 'CPF'`, o CPF da autônoma (#977). */
  cnpj: string;
  /** Só na profissional autônoma (#977); ausente é CNPJ. */
  documentLabel?: 'CPF';
  address: string;
  technicalLead: string;
  dpoName: string;
  dpoContact: string;
}

export const FALLBACKS = {
  address: 'endereço constante do cadastro da clínica',
  technicalLead: 'responsável técnico da clínica',
  dpoName: 'Responsável pela privacidade da clínica',
} as const;

const trimmed = (value: string | null | undefined): string =>
  value?.trim() ?? '';

/**
 * Controlador a partir do cadastro da clínica. Sem nome, CNPJ ou algum canal
 * do encarregado (e-mail ou telefone dele, ou o contato da clínica) não há
 * como identificar a quem o titular recorre (LGPD, arts. 9º e 41): falha
 * fechado, e a equipe corrige em Configurações.
 */
export function controllerFromClinic(clinic: Clinic): LegalController {
  const name = trimmed(clinic.name);
  // CNPJ da clínica ou CPF da autônoma (#977), na forma impressa.
  const document = clinic.providerDocument;
  const cnpj = document?.value ?? '';
  const dpoContact =
    trimmed(clinic.dpoContact) ||
    trimmed(clinic.contactEmail) ||
    trimmed(clinic.contactPhone);
  if (!name || !cnpj || !dpoContact) {
    throw new ConflictError(
      'A clínica ainda não informou CNPJ e o canal do encarregado pelos dados. Procure a recepção da clínica.',
    );
  }
  return {
    name,
    cnpj,
    ...(document?.label === 'CPF' ? { documentLabel: 'CPF' as const } : {}),
    address:
      [trimmed(clinic.address), trimmed(clinic.city)]
        .filter(Boolean)
        .join(', ') || FALLBACKS.address,
    technicalLead: trimmed(clinic.professionalName) || FALLBACKS.technicalLead,
    dpoName: trimmed(clinic.dpoName) || FALLBACKS.dpoName,
    dpoContact,
  };
}

/** Controlador genérico das páginas públicas, onde ainda não se sabe a clínica. */
export const GENERIC_CONTROLLER: LegalController = {
  name: 'a clínica onde você se atende',
  cnpj: 'informado no seu Termo de Consentimento',
  address: 'informado no seu Termo de Consentimento',
  technicalLead: 'responsável técnico da clínica',
  dpoName: 'encarregado indicado pela sua clínica',
  dpoContact: 'informado no seu Termo de Consentimento e no portal',
};

/**
 * Cadastro sem responsável técnico ou sem nome do encarregado traz um texto de
 * preenchimento (`FALLBACKS`): ele nunca vai impresso num documento legal. O
 * rótulo do responsável técnico some; o encarregado fica só com o canal.
 */
function withoutPlaceholderLabels(
  template: string,
  controller: LegalController,
): string {
  let text = template;
  if (controller.documentLabel === 'CPF') {
    // Autônoma (#977): troca só o rótulo impresso; o texto-base do aceite (e
    // o hash dele) continua o mesmo.
    text = text
      .replaceAll('CNPJ {{CLINICA_CNPJ}}', 'CPF {{CLINICA_CNPJ}}')
      .replaceAll(
        'Clínica: {{CLINICA_NOME}}',
        'Profissional: {{CLINICA_NOME}}',
      );
  }
  if (controller.technicalLead === FALLBACKS.technicalLead) {
    text = text
      .split('\n')
      .filter((line) => !line.includes('{{RESPONSAVEL_TECNICO}}'))
      .join('\n');
  }
  if (controller.dpoName === FALLBACKS.dpoName) {
    text = text.replaceAll('{{ENCARREGADO_NOME}}, ', '');
  }
  return text;
}

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

/**
 * Troca os marcadores `{{CLINICA_NOME}}` etc. pelos dados do controlador. O
 * aceite grava o hash do **texto-base** (com os marcadores), então mudar o
 * encarregado de uma clínica não derruba o aceite de ninguém; o que o paciente
 * leu fica registrado em `controllerSnapshot`. Marcador desconhecido é erro
 * de programação, não texto: falha em vez de exibir `{{...}}` ao paciente.
 */
export function renderLegalText(
  template: string,
  controller: LegalController,
): string {
  const values: Record<string, string> = {
    CLINICA_NOME: controller.name,
    CLINICA_CNPJ: controller.cnpj,
    CLINICA_ENDERECO: controller.address,
    RESPONSAVEL_TECNICO: controller.technicalLead,
    ENCARREGADO_NOME: controller.dpoName,
    ENCARREGADO_CONTATO: controller.dpoContact,
  };
  return withoutPlaceholderLabels(template, controller).replace(
    PLACEHOLDER,
    (_match, key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Marcador desconhecido no texto legal: ${key}`);
      }
      return value;
    },
  );
}

/** Evidência do aceite: quem era o controlador e o canal do encarregado quando o paciente leu. */
export const controllerSnapshot = (controller: LegalController): string =>
  `${controller.name} · ${controller.documentLabel ?? 'CNPJ'} ${controller.cnpj} · Encarregado: ${controller.dpoName} (${controller.dpoContact})`;
