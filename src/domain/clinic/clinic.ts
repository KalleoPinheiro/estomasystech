import { formatCpf, normalizeCpf } from '../shared/cpf';
import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import { type ClinicTheme, themeFromStored } from './clinic-identity';
import { normalizeCnpj } from './cnpj';

/**
 * Tipo de cliente (#977): `company` é a clínica (pessoa jurídica, CNPJ);
 * `individual` é a profissional autônoma (pessoa física, só CPF). Escolhido na
 * criação e fixo depois: trocar de tipo é cadastrar outro cliente.
 */
export const CLINIC_KINDS = ['company', 'individual'] as const;
export type ClinicKind = (typeof CLINIC_KINDS)[number];

export const isClinicKind = (value: unknown): value is ClinicKind =>
  CLINIC_KINDS.includes(value as ClinicKind);

export const MISSING_CNPJ_MESSAGE = 'CNPJ é obrigatório';
export const ALREADY_COMPANY_MESSAGE = 'O cadastro já é de clínica, com CNPJ';
export const MISSING_CPF_MESSAGE =
  'CPF é obrigatório para a profissional autônoma';
export const CNPJ_ON_INDIVIDUAL_MESSAGE =
  'Profissional autônoma não tem CNPJ: informe só o CPF';
export const CPF_ON_COMPANY_MESSAGE =
  'Clínica (pessoa jurídica) usa CNPJ, não CPF';

/** Documento de quem emite (cabeçalho, recibo, termos): CNPJ da clínica ou CPF da autônoma. */
export interface ProviderDocument {
  label: 'CNPJ' | 'CPF';
  value: string;
}

/**
 * Dados cadastrais (issue #61) — usados em documentos clínicos emitidos (issue
 * #62). O contato (B4, #214) é por onde a plataforma fala com a clínica.
 */
export interface ClinicInfoFields {
  cnpj?: string | null;
  /** CPF da profissional autônoma (#977): 11 dígitos; cifrado e com índice cego no banco. */
  cpf?: string | null;
  address?: string | null;
  city?: string | null;
  professionalName?: string | null;
  professionalRegistry?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

/**
 * Cadastro de uma clínica nova pela plataforma (B4): nome, CNPJ, telefone e
 * e-mail de contato obrigatórios; responsável técnico opcional.
 */
export interface ClinicProps {
  name: string;
  /** Ausente vale `company` (o cadastro anterior à #977). */
  kind?: ClinicKind;
  cnpj?: string | null;
  cpf?: string | null;
  contactPhone: string;
  contactEmail: string;
  professionalName?: string | null;
  professionalRegistry?: string | null;
  createdBy: string;
}

/**
 * Estado da clínica (B5, #214): `suspended` nega o login de toda conta dela e
 * pausa os lembretes, sem apagar nenhum dado.
 */
export type ClinicStatus = 'active' | 'suspended';

/**
 * Motivo da suspensão (#251): lista fechada, escolhida pelo operador da
 * plataforma. Só a plataforma o vê; nunca a clínica nem a mensagem de login.
 */
export const CLINIC_SUSPENSION_REASONS = [
  'non_payment',
  'clinic_request',
  'security_incident',
  'other',
] as const;
export type ClinicSuspensionReason = (typeof CLINIC_SUSPENSION_REASONS)[number];

export const isClinicSuspensionReason = (
  value: unknown,
): value is ClinicSuspensionReason =>
  CLINIC_SUSPENSION_REASONS.includes(value as ClinicSuspensionReason);

export const CLINIC_SUSPENSION_NOTE_MAX = 500;

export interface ClinicSuspension {
  reason: ClinicSuspensionReason;
  /** Texto livre opcional; fica só na clínica, nunca na auditoria. */
  note?: string | null;
}

export interface ClinicState extends ClinicInfoFields {
  id: string;
  name: string;
  /** Ausente vale `company`. */
  kind?: ClinicKind;
  createdBy: string;
  createdAt: Date;
  status?: ClinicStatus;
  statusChangedAt?: Date | null;
  statusChangedBy?: string | null;
  /** Motivo da suspensão vigente; `null` ativa, e nas suspensas antes da #251. */
  statusReason?: ClinicSuspensionReason | null;
  statusReasonNote?: string | null;
  /** Desde quando o CNPJ gravado está marcado para correção (#355); `null` = sem pendência. */
  cnpjReviewSince?: Date | null;
  /**
   * Encarregado pelos dados (LGPD, art. 41; #216, ADR-030): nome e canal que
   * o titular vê nos termos e no aviso de privacidade. Opcionais: sem eles
   * vale o contato da clínica.
   */
  dpoName?: string | null;
  dpoContact?: string | null;
  /** Chave da logo no armazenamento (#427); `null` = sem logo, valem as iniciais. */
  logoKey?: string | null;
  /** Tema da clínica (#426) como gravado; fora da lista vale o padrão (`theme`). */
  themeMode?: string | null;
  themeAccent?: string | null;
}

/** Limites do cadastro do encarregado. */
export const DPO_NAME_MAX = 200;
export const DPO_CONTACT_MAX = 200;

/** O que os documentos leem do cadastro; `kind` ausente vale `company`. */
export type DocumentIssuerInfo = Pick<
  ClinicInfoFields,
  'cnpj' | 'professionalName' | 'professionalRegistry'
> & { kind?: ClinicKind | null; cpf?: string | null };

/** Qual documento identifica quem emite: CPF para a autônoma, CNPJ para a clínica. */
export const providerDocumentLabel = (
  kind: ClinicKind | null | undefined,
): ProviderDocument['label'] => (kind === 'individual' ? 'CPF' : 'CNPJ');

/**
 * Documento de quem emite (#977), na forma impressa: CNPJ como gravado, CPF
 * com máscara `000.000.000-00`. `null` quando o do tipo não está preenchido; o
 * do outro tipo nunca vale.
 */
export function providerDocument(
  info: Pick<DocumentIssuerInfo, 'kind' | 'cnpj' | 'cpf'> | null,
): ProviderDocument | null {
  if (info?.kind === 'individual') {
    const cpf = info.cpf?.trim();
    return cpf
      ? { label: 'CPF', value: /^\d{11}$/.test(cpf) ? formatCpf(cpf) : cpf }
      : null;
  }
  const cnpj = info?.cnpj?.trim();
  return cnpj ? { label: 'CNPJ', value: cnpj } : null;
}

/**
 * `true` só quando os 3 campos com relevância jurídica direta na assinatura de
 * um documento estão presentes — `address`/`city` continuam opcionais (#62).
 * O documento é o CNPJ da clínica ou o CPF da autônoma (#977).
 */
export function isClinicInfoComplete(info: DocumentIssuerInfo | null): boolean {
  return Boolean(
    providerDocument(info) &&
      info?.professionalName?.trim() &&
      info?.professionalRegistry?.trim(),
  );
}

/** Quais dados cadastrais faltam para emitir documento (a ordem é a da tela de Configurações). */
export function missingClinicInfoFields(
  info: DocumentIssuerInfo | null,
): string[] {
  const missing: string[] = [];
  if (!providerDocument(info)) {
    missing.push(providerDocumentLabel(info?.kind));
  }
  if (!info?.professionalName?.trim()) missing.push('responsável técnico');
  if (!info?.professionalRegistry?.trim()) {
    missing.push('registro profissional');
  }
  return missing;
}

const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trimToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeContactEmail = (value: string): string => {
  const email = value.toLowerCase();
  if (!CONTACT_EMAIL_PATTERN.test(email)) {
    throw new ValidationError('E-mail de contato inválido');
  }
  return email;
};

/** Forma canônica por campo; vazio vira `null` em todos. */
const FIELD_NORMALIZERS: Partial<
  Record<keyof ClinicInfoFields, (value: string) => string>
> = {
  cnpj: normalizeCnpj,
  cpf: normalizeCpf,
  contactEmail: normalizeContactEmail,
};

const INFO_KEYS = [
  'cnpj',
  'cpf',
  'address',
  'city',
  'professionalName',
  'professionalRegistry',
  'contactPhone',
  'contactEmail',
] as const;

function normalizeField(
  key: keyof ClinicInfoFields,
  value: string | null | undefined,
): string | null {
  const trimmed = trimToNull(value);
  const normalize = FIELD_NORMALIZERS[key];
  return trimmed && normalize ? normalize(trimmed) : trimmed;
}

/** Aplica só os campos presentes em `fields` (chave `in` do objeto) — os demais preservam o valor atual. */
function resolveInfoFields(
  state: ClinicInfoFields,
  fields: ClinicInfoFields,
): Required<ClinicInfoFields> {
  const resolved = {} as Required<ClinicInfoFields>;
  for (const key of INFO_KEYS) {
    resolved[key] =
      key in fields ? normalizeField(key, fields[key]) : (state[key] ?? null);
  }
  return resolved;
}

const REQUIRED_ON_CREATE: readonly [
  'name' | 'contactPhone' | 'contactEmail' | 'createdBy',
  string,
][] = [
  ['name', 'Nome da clínica é obrigatório'],
  ['contactPhone', 'Telefone de contato é obrigatório'],
  ['contactEmail', 'E-mail de contato é obrigatório'],
  ['createdBy', 'Criador da clínica é obrigatório'],
];

const EMPTY_STATUS = {
  status: 'active' as ClinicStatus,
  statusChangedAt: null,
  statusChangedBy: null,
  statusReason: null,
  statusReasonNote: null,
};

const EMPTY_INFO: Required<ClinicInfoFields> = {
  cnpj: null,
  cpf: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
  contactPhone: null,
  contactEmail: null,
};

/**
 * O documento do tipo é obrigatório na criação; o do outro tipo é recusado
 * em qualquer gravação, para a autônoma nunca sair com CNPJ nem a clínica com
 * CPF (#977).
 */
function assertDocumentMatchesKind(
  kind: ClinicKind,
  info: Pick<ClinicInfoFields, 'cnpj' | 'cpf'>,
  requireOwn: boolean,
): void {
  const [own, other, missing, mismatch] =
    kind === 'individual'
      ? [info.cpf, info.cnpj, MISSING_CPF_MESSAGE, CNPJ_ON_INDIVIDUAL_MESSAGE]
      : [info.cnpj, info.cpf, MISSING_CNPJ_MESSAGE, CPF_ON_COMPANY_MESSAGE];
  if (other) throw new ValidationError(mismatch);
  if (requireOwn && !own) throw new ValidationError(missing);
}

/**
 * Na autônoma a responsável técnica é ela mesma (#977): o nome do cadastro
 * vale como responsável técnico, sem preencher duas vezes.
 */
function withOwnTechnicalLead<T extends ClinicInfoFields>(
  kind: ClinicKind,
  name: string,
  info: T,
): T {
  return kind === 'individual' ? { ...info, professionalName: name } : info;
}

/** Empresa/clínica — unidade de isolamento de dados (multi-tenancy). */
export class Clinic {
  private constructor(
    private readonly state: ClinicState & { status: ClinicStatus },
  ) {}

  /** Clínica nova pela plataforma (B4): nasce com o cadastro completo. */
  static create(props: ClinicProps): Clinic {
    for (const [key, message] of REQUIRED_ON_CREATE) {
      if (!trimToNull(props[key])) {
        throw new ValidationError(message);
      }
    }
    const { name, createdBy, kind = 'company', ...info } = props;
    if (!isClinicKind(kind)) {
      throw new ValidationError('Tipo de cliente inválido');
    }
    const resolved = resolveInfoFields(EMPTY_INFO, info);
    assertDocumentMatchesKind(kind, resolved, true);
    return new Clinic({
      id: newId(),
      name: name.trim(),
      kind,
      createdBy,
      createdAt: new Date(),
      ...EMPTY_STATUS,
      ...withOwnTechnicalLead(kind, name.trim(), resolved),
    });
  }

  static restore(state: ClinicState): Clinic {
    return new Clinic({
      ...EMPTY_INFO,
      ...state,
      kind: isClinicKind(state.kind) ? state.kind : 'company',
      status: state.status ?? EMPTY_STATUS.status,
      statusChangedAt: state.statusChangedAt ?? null,
      statusChangedBy: state.statusChangedBy ?? null,
      statusReason: state.statusReason ?? null,
      statusReasonNote: state.statusReasonNote ?? null,
      cnpjReviewSince: state.cnpjReviewSince ?? null,
      dpoName: state.dpoName ?? null,
      dpoContact: state.dpoContact ?? null,
      logoKey: state.logoKey ?? null,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get createdBy(): string {
    return this.state.createdBy;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get kind(): ClinicKind {
    return this.state.kind === 'individual' ? 'individual' : 'company';
  }

  get isIndividual(): boolean {
    return this.kind === 'individual';
  }

  get cnpj(): string | null {
    return this.state.cnpj ?? null;
  }

  /** CPF da autônoma (#977), 11 dígitos; `null` na clínica. */
  get cpf(): string | null {
    return this.state.cpf ?? null;
  }

  /** CNPJ ou CPF de quem emite, na forma impressa (#977). */
  get providerDocument(): ProviderDocument | null {
    return providerDocument(this.state);
  }

  get address(): string | null {
    return this.state.address ?? null;
  }

  get city(): string | null {
    return this.state.city ?? null;
  }

  get professionalName(): string | null {
    return this.state.professionalName ?? null;
  }

  get professionalRegistry(): string | null {
    return this.state.professionalRegistry ?? null;
  }

  get contactPhone(): string | null {
    return this.state.contactPhone ?? null;
  }

  get contactEmail(): string | null {
    return this.state.contactEmail ?? null;
  }

  get dpoName(): string | null {
    return this.state.dpoName ?? null;
  }

  get dpoContact(): string | null {
    return this.state.dpoContact ?? null;
  }

  get logoKey(): string | null {
    return this.state.logoKey ?? null;
  }

  /** Tema da clínica (#426); valor ausente ou fora da lista vale o padrão. */
  get theme(): ClinicTheme {
    return themeFromStored(this.state.themeMode, this.state.themeAccent);
  }

  /** Outra instância com o tema trocado. */
  withTheme(theme: ClinicTheme): Clinic {
    return new Clinic({
      ...this.state,
      themeMode: theme.mode,
      themeAccent: theme.accent,
    });
  }

  /** Outra instância com a logo trocada (ou removida, com `null`). */
  withLogoKey(logoKey: string | null): Clinic {
    return new Clinic({ ...this.state, logoKey });
  }

  get status(): ClinicStatus {
    return this.state.status;
  }

  get statusChangedAt(): Date | null {
    return this.state.statusChangedAt ?? null;
  }

  get statusChangedBy(): string | null {
    return this.state.statusChangedBy ?? null;
  }

  get statusReason(): ClinicSuspensionReason | null {
    return this.state.statusReason ?? null;
  }

  get statusReasonNote(): string | null {
    return this.state.statusReasonNote ?? null;
  }

  get cnpjReviewSince(): Date | null {
    return this.state.cnpjReviewSince ?? null;
  }

  get isSuspended(): boolean {
    return this.status === 'suspended';
  }

  /**
   * Suspende a clínica (Journey 7): nenhum dado muda além do estado. O motivo
   * é obrigatório e da lista fechada (#251, AD-039).
   */
  suspend(by: string, at: Date, suspension: ClinicSuspension): Clinic {
    if (!isClinicSuspensionReason(suspension.reason)) {
      throw new ValidationError('Motivo da suspensão é obrigatório');
    }
    const note = trimToNull(suspension.note);
    if (note && note.length > CLINIC_SUSPENSION_NOTE_MAX) {
      throw new ValidationError(
        `Observação da suspensão: no máximo ${CLINIC_SUSPENSION_NOTE_MAX} caracteres`,
      );
    }
    return this.withStatus('suspended', by, at, suspension.reason, note);
  }

  /** Reativa a clínica (Journey 8): o motivo vigente é limpo (a trilha guarda o histórico). */
  reactivate(by: string, at: Date): Clinic {
    return this.withStatus('active', by, at, null, null);
  }

  private withStatus(
    status: ClinicStatus,
    by: string,
    at: Date,
    reason: ClinicSuspensionReason | null,
    note: string | null,
  ): Clinic {
    return new Clinic({
      ...this.state,
      status,
      statusChangedAt: at,
      statusChangedBy: by,
      statusReason: reason,
      statusReasonNote: note,
    });
  }

  /**
   * Marca o CNPJ gravado como pendente de correção (#355, ACE-RN-57) sem
   * alterá-lo. Já marcado ou sem CNPJ: nada muda.
   */
  flagCnpjForReview(at: Date): Clinic {
    if (!this.state.cnpj || this.cnpjReviewSince) return this;
    return new Clinic({ ...this.state, cnpjReviewSince: at });
  }

  /**
   * Autônoma que abriu CNPJ (#986, decisão do Kalléo em 2026-11-23): o Admin
   * troca o cadastro para clínica e o timbre passa a sair com o CNPJ. O CPF sai
   * do cadastro (a clínica nunca guarda CPF, #977); nome, responsável técnica,
   * COREN e todos os dados da empresa ficam.
   */
  convertToCompany(fields: { cnpj: string; name?: string | null }): Clinic {
    if (this.kind !== 'individual') {
      throw new ValidationError(ALREADY_COMPANY_MESSAGE);
    }
    const resolved = resolveInfoFields(this.state, {
      cnpj: fields.cnpj,
      cpf: null,
    });
    assertDocumentMatchesKind('company', resolved, true);
    const name = fields.name?.trim() || this.state.name;
    return new Clinic({
      ...this.state,
      ...resolved,
      name,
      kind: 'company',
      cnpjReviewSince: null,
    });
  }

  /** Retorna uma nova instância com os campos cadastrais atualizados (imutável). */
  updateInfo(fields: ClinicInfoFields & { name?: string }): Clinic {
    if ('name' in fields && !fields.name?.trim()) {
      throw new ValidationError('Nome da clínica é obrigatório');
    }
    const name = fields.name?.trim() ? fields.name.trim() : this.state.name;
    const resolved = resolveInfoFields(this.state, fields);
    assertDocumentMatchesKind(this.kind, resolved, false);
    return new Clinic({
      ...this.state,
      name,
      ...withOwnTechnicalLead(this.kind, name, resolved),
      // Um CNPJ reenviado passou pela conferência do dígito: a pendência acaba.
      cnpjReviewSince:
        'cnpj' in fields ? null : (this.state.cnpjReviewSince ?? null),
    });
  }

  /**
   * Encarregado pelos dados (#216, ADR-030): nome e canal (e-mail ou telefone).
   * Vazio apaga e a clínica volta a valer como canal. Imutável: devolve outra
   * instância.
   */
  updatePrivacyContact(fields: {
    dpoName?: string | null;
    dpoContact?: string | null;
  }): Clinic {
    const dpoName = trimToNull(fields.dpoName);
    const dpoContact = trimToNull(fields.dpoContact);
    if (dpoName && dpoName.length > DPO_NAME_MAX) {
      throw new ValidationError(
        `Nome do encarregado: no máximo ${DPO_NAME_MAX} caracteres`,
      );
    }
    if (dpoContact && dpoContact.length > DPO_CONTACT_MAX) {
      throw new ValidationError(
        `Contato do encarregado: no máximo ${DPO_CONTACT_MAX} caracteres`,
      );
    }
    if (dpoName && !dpoContact) {
      throw new ValidationError(
        'Informe o e-mail ou telefone do encarregado junto com o nome',
      );
    }
    return new Clinic({ ...this.state, dpoName, dpoContact });
  }

  isCompleteForDocumentEmission(): boolean {
    return isClinicInfoComplete(this.state);
  }

  /**
   * Cadastro que a plataforma exige (B4): nome, CNPJ (ou o CPF da autônoma,
   * #977), telefone e e-mail de contato. Sem ele, o primeiro admin não é convidado — é o caso da
   * `legacy-clinic`, que nasceu só com nome.
   */
  isRegistrationComplete(): boolean {
    return Boolean(
      this.state.name.trim() &&
        this.providerDocument &&
        this.state.contactPhone &&
        this.state.contactEmail,
    );
  }
}
