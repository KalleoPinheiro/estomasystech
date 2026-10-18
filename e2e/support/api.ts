import { randomBytes } from "node:crypto";
import { type APIRequestContext, request as playwrightRequest } from "@playwright/test";
import { MAIN_BASE_URL } from "./constants";
import { sessionCookie } from "./session-token";
import { toApiDatetime } from "./iso-datetime";

/**
 * Atalhos para preparar estado via API (mais rápido e estável que passar pela UI
 * inteira em todo teste). Usa `page.request`/`context.request`, que compartilha os
 * cookies da sessão do browser context — nenhuma credencial extra é necessária
 * aqui além do `storageState`/cookie já configurado no teste.
 */

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function unwrap<T>(request: APIRequestContext, promise: ReturnType<APIRequestContext["post"]>): Promise<T> {
  const response = await promise;
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok() || !body.success || body.data === null) {
    throw new Error(
      `Requisição falhou (${response.status()} ${response.url()}): ${body.error ?? "sem detalhe"}`,
    );
  }
  return body.data;
}

export async function apiPost<T>(
  request: APIRequestContext,
  url: string,
  data: unknown,
): Promise<T> {
  return unwrap<T>(request, request.post(url, { data }));
}

export async function apiPut<T>(
  request: APIRequestContext,
  url: string,
  data: unknown,
): Promise<T> {
  return unwrap<T>(request, request.put(url, { data }));
}

export async function apiPatch<T>(
  request: APIRequestContext,
  url: string,
  data: unknown,
): Promise<T> {
  return unwrap<T>(request, request.patch(url, { data }));
}

export async function apiGet<T>(request: APIRequestContext, url: string): Promise<T> {
  return unwrap<T>(request, request.get(url));
}

/**
 * Sufixo curto e único — evita colisão de nome/email/telefone entre specs.
 * Usa `randomBytes` em vez do PRNG não criptográfico do JS: 4 bytes hex dão as mesmas
 * 8 posições de antes (Semgrep node_insecure_random_generator).
 */
export const unique = (): string => randomBytes(4).toString("hex");

export interface PatientDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  active: boolean;
  birthDate: string | null;
  notes: string | null;
  referredByPartnerId: string | null;
}

export async function createPatient(
  request: APIRequestContext,
  overrides: Partial<{
    fullName: string;
    email: string;
    phone: string;
    cpf: string;
    referredByPartnerId: string | null;
    guardianId: string | null;
  }> = {},
): Promise<PatientDto> {
  const id = unique();
  return apiPost<PatientDto>(request, "/api/patients", {
    fullName: overrides.fullName ?? `Paciente E2E ${id}`,
    email: overrides.email ?? `paciente.${id}@e2e.estomasystech.test`,
    phone: overrides.phone ?? "11999990000",
    ...(overrides.cpf ? { cpf: overrides.cpf } : {}),
    referredByPartnerId: overrides.referredByPartnerId ?? null,
    ...(overrides.guardianId ? { guardianId: overrides.guardianId } : {}),
  });
}

export interface PartnerDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  crm: string | null;
  specialty: string | null;
  active: boolean;
}

export async function createPartner(
  request: APIRequestContext,
  overrides: Partial<{ fullName: string; email: string; phone: string }> = {},
): Promise<PartnerDto> {
  const id = unique();
  return apiPost<PartnerDto>(request, "/api/partners", {
    fullName: overrides.fullName ?? `Dr. Parceiro E2E ${id}`,
    email: overrides.email ?? `parceiro.${id}@e2e.estomasystech.test`,
    phone: overrides.phone ?? "11988880000",
    crm: "CRM-SP 000000",
    specialty: "Cirurgia vascular",
  });
}

export interface ProfessionalDto {
  id: string;
  fullName: string;
  registry: string | null;
  active: boolean;
}

export async function createProfessional(
  request: APIRequestContext,
  overrides: Partial<{ fullName: string; registry: string }> = {},
): Promise<ProfessionalDto> {
  const id = unique();
  return apiPost<ProfessionalDto>(request, "/api/professionals", {
    fullName: overrides.fullName ?? `Enf. E2E ${id}`,
    registry: overrides.registry ?? "COREN-SP 000000",
  });
}

export interface ProcedureDto {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
}

export async function createProcedure(
  request: APIRequestContext,
  overrides: Partial<{ name: string; priceCents: number; durationMinutes: number }> = {},
): Promise<ProcedureDto> {
  const id = unique();
  return apiPost<ProcedureDto>(request, "/api/procedures", {
    name: overrides.name ?? `Procedimento E2E ${id}`,
    priceCents: overrides.priceCents ?? 15000,
    durationMinutes: overrides.durationMinutes ?? 60,
  });
}

export interface SupplyDto {
  id: string;
  name: string;
  unit: string;
  minQty: number;
  stockQty: number;
  priceCents: number;
  active: boolean;
  isLowStock: boolean;
}

export async function createSupply(
  request: APIRequestContext,
  overrides: Partial<{ name: string; unit: string; minQty: number; priceCents: number }> = {},
): Promise<SupplyDto> {
  const id = unique();
  return apiPost<SupplyDto>(request, "/api/supplies", {
    name: overrides.name ?? `Insumo E2E ${id}`,
    unit: overrides.unit ?? "un",
    minQty: overrides.minQty ?? 5,
    priceCents: overrides.priceCents ?? 1200,
  });
}

export async function moveStock(
  request: APIRequestContext,
  supplyId: string,
  data: {
    type: "in" | "out";
    quantity: number;
    reason: string;
    appointmentId?: string | null;
    batchLabel?: string | null;
    expiresAt?: string | null;
  },
): Promise<SupplyDto> {
  return apiPost<SupplyDto>(request, `/api/supplies/${supplyId}/movements`, data);
}

export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName: string | null;
  startsAt: string;
  endsAt: string;
  procedure: string;
  priceCents: number;
  status: string;
  notes: string | null;
  professionalId: string | null;
  procedureId: string | null;
}

export async function createAppointment(
  request: APIRequestContext,
  data: {
    patientId: string;
    startsAt: string;
    endsAt: string;
    procedure: string;
    priceCents: number;
    professionalId?: string | null;
    procedureId?: string | null;
    notes?: string | null;
  },
): Promise<AppointmentDto> {
  return apiPost<AppointmentDto>(request, "/api/appointments", {
    patientId: data.patientId,
    // z.iso.datetime() da rota só aceita UTC "Z" — dates.ts gera offset -03:00
    // (útil pra preencher inputs de UI), então convertemos aqui na fronteira da API.
    startsAt: toApiDatetime(data.startsAt),
    endsAt: toApiDatetime(data.endsAt),
    procedure: data.procedure,
    priceCents: data.priceCents,
    professionalId: data.professionalId ?? null,
    procedureId: data.procedureId ?? null,
    notes: data.notes ?? null,
  });
}

export async function changeAppointmentStatus(
  request: APIRequestContext,
  id: string,
  action: "confirm" | "cancel" | "no_show",
): Promise<AppointmentDto> {
  return apiPatch<AppointmentDto>(request, `/api/appointments/${id}`, { action });
}

export async function completeAppointment(
  request: APIRequestContext,
  id: string,
  followUpInDays: number | null = null,
): Promise<AppointmentDto> {
  return apiPatch<AppointmentDto>(request, `/api/appointments/${id}`, {
    action: "complete",
    followUpInDays,
  });
}

export interface ConditionDto {
  id: string;
  patientId: string;
  kind: "stoma" | "wound";
  title: string;
  status: "active" | "resolved";
  stomaType: string | null;
}

export async function createCondition(
  request: APIRequestContext,
  patientId: string,
  overrides: Partial<{
    kind: "stoma" | "wound";
    title: string;
    stomaType: string | null;
  }> = {},
): Promise<ConditionDto> {
  const kind = overrides.kind ?? "wound";
  return apiPost<ConditionDto>(request, `/api/patients/${patientId}/conditions`, {
    kind,
    title: overrides.title ?? `Condição E2E ${unique()}`,
    stomaType: kind === "stoma" ? (overrides.stomaType ?? "colostomia") : null,
    startedAt: null,
    notes: null,
  });
}

export async function resolveCondition(
  request: APIRequestContext,
  conditionId: string,
): Promise<ConditionDto> {
  return apiPatch<ConditionDto>(request, `/api/conditions/${conditionId}`, { action: "resolve" });
}

export async function addAssessment(
  request: APIRequestContext,
  conditionId: string,
  data: Record<string, unknown> = {},
): Promise<{ id: string }> {
  return apiPost(request, `/api/conditions/${conditionId}/assessments`, {
    lengthMm: null,
    widthMm: null,
    depthMm: null,
    tissueType: null,
    exudate: null,
    painScale: null,
    skinCondition: null,
    complications: null,
    complicationCodes: null,
    detDiscolorationArea: null,
    detDiscolorationSeverity: null,
    detErosionArea: null,
    detErosionSeverity: null,
    detOvergrowthArea: null,
    detOvergrowthSeverity: null,
    notes: "Avaliação criada via API para E2E",
    ...data,
  });
}

export interface InvoiceDto {
  id: string;
  patientId: string;
  patientName: string | null;
  description: string;
  amountCents: number;
  status: "pending" | "paid" | "cancelled";
  paymentMethod: string | null;
  payments: Array<{ id: string }>;
}

export async function createInvoice(
  request: APIRequestContext,
  data: { patientId: string; description: string; amountCents: number },
): Promise<InvoiceDto> {
  return apiPost<InvoiceDto>(request, "/api/invoices", {
    patientId: data.patientId,
    description: data.description,
    amountCents: data.amountCents,
    dueDate: null,
  });
}

export async function payInvoice(
  request: APIRequestContext,
  id: string,
  method: string,
): Promise<InvoiceDto> {
  return apiPatch<InvoiceDto>(request, `/api/invoices/${id}`, { action: "pay", method });
}

export interface PackageDto {
  id: string;
  patientId: string;
  procedureId: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  priceCents: number;
  active: boolean;
}

export async function createPackage(
  request: APIRequestContext,
  data: { patientId: string; procedureId: string; totalSessions: number; priceCents: number },
): Promise<PackageDto> {
  return apiPost<PackageDto>(request, "/api/packages", data);
}

export async function getPackagesByPatient(
  request: APIRequestContext,
  patientId: string,
): Promise<PackageDto[]> {
  return apiGet<PackageDto[]>(request, `/api/packages?patientId=${encodeURIComponent(patientId)}`);
}

export interface CarePlanDto {
  id: string;
  patientId: string;
  conditionId: string | null;
  professionalId: string | null;
  status: string;
  createdAt: string;
}

export async function createCarePlan(
  request: APIRequestContext,
  patientId: string,
  overrides: Partial<{ conditionId: string | null; professionalId: string | null }> = {},
): Promise<CarePlanDto> {
  return apiPost<CarePlanDto>(request, `/api/patients/${patientId}/care-plans`, {
    conditionId: overrides.conditionId ?? null,
    professionalId: overrides.professionalId ?? null,
  });
}

export interface CarePlanDiagnosisDto {
  id: string;
  carePlanId: string;
  diagnosisCode: string;
  diagnosisLabel: string;
  type: string;
  relatedFactors: string | null;
  definingCharacteristics: string | null;
  createdAt: string;
}

export async function addCarePlanDiagnosis(
  request: APIRequestContext,
  carePlanId: string,
  data: {
    diagnosisCode: string;
    type: "real" | "risco" | "promocao-saude";
    relatedFactors?: string | null;
    definingCharacteristics?: string | null;
  },
): Promise<CarePlanDiagnosisDto> {
  return apiPost<CarePlanDiagnosisDto>(request, `/api/care-plans/${carePlanId}/diagnoses`, {
    diagnosisCode: data.diagnosisCode,
    type: data.type,
    relatedFactors: data.relatedFactors ?? null,
    definingCharacteristics: data.definingCharacteristics ?? null,
  });
}

export async function createFollowUp(
  request: APIRequestContext,
  data: { patientId: string; dueDate: string; reason: string },
): Promise<{ id: string; status: string }> {
  return apiPost(request, "/api/follow-ups", {
    patientId: data.patientId,
    dueDate: data.dueDate,
    reason: data.reason,
    appointmentId: null,
  });
}

/**
 * Conta de portal vinculada ao cadastro (#196), criada pela API da tela de
 * Contas com a sessão de admin. O portal resolve o titular pela conta — um
 * cookie forjado para o e-mail do cadastro, sem ela, recebe 404. Sem convite
 * consumido: a suíte forja a sessão (`sessionCookie`), não faz login.
 */
export async function linkPortalAccount(
  request: APIRequestContext,
  role: "patient" | "partner",
  record: { id: string; email: string },
): Promise<void> {
  await apiPost(request, "/api/accounts", {
    email: record.email,
    role,
    ...(role === "patient" ? { patientId: record.id } : { partnerId: record.id }),
  });
}

/** Responsável cadastrado pela recepção (#329); devolve o id para ligar pacientes. */
export async function createGuardian(
  request: APIRequestContext,
  fullName: string,
  email: string,
): Promise<{ id: string; fullName: string; email: string }> {
  const guardian = await apiPost<{ id: string }>(request, "/api/guardians", {
    fullName,
    relationship: "filho",
    phone: "11999990000",
    email,
  });
  return { id: guardian.id, fullName, email };
}

/** Conta de portal do responsável (#351): a equipe atesta a autorização do paciente. */
export async function linkGuardianAccount(
  request: APIRequestContext,
  guardian: { id: string; email: string },
): Promise<void> {
  await apiPost(request, "/api/accounts", {
    email: guardian.email,
    role: "guardian",
    guardianId: guardian.id,
    guardianAuthorization: true,
  });
}

/**
 * O paciente autoriza o parceiro que o indicou a ver a evolução clínica
 * (#292), pela rota do portal com a sessão dele — a equipe não autoriza.
 * Exige a conta de portal do paciente já vinculada (`linkPortalAccount`).
 */
export async function grantPartnerConsent(record: { email: string }): Promise<void> {
  const context = await playwrightRequest.newContext({
    baseURL: MAIN_BASE_URL,
    storageState: { cookies: [sessionCookie(record.email, "patient")], origins: [] },
  });
  try {
    await unwrap(context, context.post("/api/portal/patient/partner-consent"));
  } finally {
    await context.dispose();
  }
}
