import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ADMIN_STORAGE_STATE_PATH,
  SUPER_ADMIN_STORAGE_STATE_PATH,
  E2E_BOOTSTRAP_TOKEN,
  E2E_CLINIC_ADMIN_EMAIL,
  E2E_CLINIC_ADMIN_PASSWORD,
  E2E_CLINIC_ID,
  E2E_ROLE_PASSWORD,
  E2E_STAFF_ROLES,
  MAIN_BASE_URL,
  ROLE_ACCOUNTS,
  SEED_DATA_PATH,
  E2E_SUPER_ADMIN_EMAIL,
  E2E_SUPER_ADMIN_PASSWORD,
  SESSION_COOKIE_NAME,
} from "./support/constants";
import { readServerLog, waitForInviteUrl } from "./support/server-log";
import { mintSessionToken } from "./support/session-token";
import { slotFromSeed } from "./support/slots";
import { saveTotpState, SUPER_ADMIN_TOTP_PATH, totpCode, totpStatePath, totpStep } from "./support/totp";

/**
 * Roda uma vez antes de toda a suíte (depois que o(s) `webServer` já respondem —
 * Playwright só chama `globalSetup` após a checagem de `url` do webServer passar).
 *
 * 1. Faz o bootstrap do primeiro Super Admin (`POST /api/auth/bootstrap`, guardado
 *    por `VITTA_BOOTSTRAP_TOKEN`), consome o convite para definir a senha e loga —
 *    o mesmo caminho que uma instalação nova percorre, agora que não existe mais
 *    senha mestre (issue #21 / ADR-004), cadastrando o segundo fator no primeiro
 *    login (ADR-008). O Super Admin é o operador da plataforma
 *    (ADR-007): importa o catálogo de taxonomias e convida o Admin de Empresa da
 *    `legacy-clinic` (`POST /api/platform/clinics/legacy-clinic/admins`).
 * 2. O Admin de Empresa define a senha pelo convite e loga cadastrando o segundo
 *    fator, obrigatório para o papel (#291). O cookie dele vira o
 *    `storageState` reaproveitado por padrão em todos os specs (ver
 *    `use.storageState` em `playwright.config.ts`).
 * 3. Semeia dados base via REST (profissional, procedimentos com kit, insumos
 *    com lote) e grava os IDs em `e2e/support/seed-data.json` para os specs.
 * 4. Cria uma conta por papel de equipe (`company_admin`, `atendente`,
 *    `profissional`) pelo mesmo caminho da tela de Contas (`POST /api/accounts`),
 *    define a senha pelo link do convite e loga — um `storageState` por papel
 *    (#204). O Profissional fica vinculado (R4) a um paciente semeado por uma
 *    consulta atribuída a ele, como a recepção faria.
 */

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function post<T>(cookie: string | null, url: string, data: unknown): Promise<T> {
  const response = await fetch(`${MAIN_BASE_URL}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || !body.success || body.data === null) {
    throw new Error(`Seed POST ${url} falhou (${response.status}): ${body.error ?? "?"}`);
  }
  return body.data;
}

async function put<T>(cookie: string, url: string, data: unknown, method = "PUT"): Promise<T> {
  const response = await fetch(`${MAIN_BASE_URL}${url}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || !body.success || body.data === null) {
    throw new Error(`Seed ${method} ${url} falhou (${response.status}): ${body.error ?? "?"}`);
  }
  return body.data;
}

/**
 * Cria o primeiro Super Admin e devolve o link do convite. Sem canal de e-mail
 * configurado (o servidor da suíte não tem), a rota devolve o link na resposta —
 * é o único jeito de alcançá-lo fora de produção.
 */
async function bootstrapSuperAdmin(): Promise<string> {
  const response = await fetch(`${MAIN_BASE_URL}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bootstrap-token": E2E_BOOTSTRAP_TOKEN },
    body: JSON.stringify({ email: E2E_SUPER_ADMIN_EMAIL }),
  });
  const body = (await response.json()) as Envelope<{ inviteUrl: string | null }>;
  if (!response.ok || !body.success || !body.data?.inviteUrl) {
    throw new Error(
      `Bootstrap do Super Admin falhou no global-setup (${response.status}): ${body.error ?? "?"}. ` +
        "Verifique se AUTH_SECRET/VITTA_BOOTSTRAP_TOKEN do webServer principal batem com e2e/support/constants.ts.",
    );
  }
  return body.data.inviteUrl;
}

async function consumeInvite(inviteUrl: string, password: string, who: string): Promise<void> {
  const token = new URL(inviteUrl).searchParams.get("token");
  if (!token) {
    throw new Error(`Link de convite sem token: ${inviteUrl}`);
  }
  const response = await fetch(`${MAIN_BASE_URL}/api/auth/set-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const body = (await response.json()) as Envelope<{ ok: boolean }>;
  if (!response.ok || !body.success) {
    throw new Error(
      `Definição da senha de ${who} falhou (${response.status}): ${body.error ?? "?"}`,
    );
  }
}

/**
 * O login tem limite de 5 tentativas/min por IP, e tudo aqui sai do loopback —
 * o mesmo IP do `auth.spec.ts`, que loga logo depois. Os logins das contas por
 * papel usam um IP de documentação (RFC 5737) próprio em `x-forwarded-for` (o
 * Next só preenche o cabeçalho quando ausente), sem consumir aquele balde.
 */
const ROLE_LOGIN_IP = "198.51.100.204";
const CLINIC_ADMIN_LOGIN_IP = "198.51.100.205";

async function login(email: string, password: string, who: string, clientIp?: string): Promise<string> {
  return sessionCookieFrom("/api/auth/login", { email, password }, who, clientIp);
}

/** POST que termina numa sessão: devolve o par `vitta_session=…` do Set-Cookie. */
async function sessionCookieFrom(
  url: string,
  data: unknown,
  who: string,
  clientIp?: string,
): Promise<string> {
  const response = await fetch(`${MAIN_BASE_URL}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
    },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as Envelope<unknown>;
  if (!response.ok || !body.success) {
    throw new Error(
      `Login de ${who} falhou no global-setup (${response.status}): ${body.error ?? "?"}`,
    );
  }
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Login de ${who} não retornou Set-Cookie`);
  }
  // Formato: "vitta_session=xxx; Path=/; HttpOnly; SameSite=Lax" — só o par nome=valor interessa.
  const pair = setCookie.split(";")[0];
  if (!pair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error(`Cookie de sessão inesperado: ${pair}`);
  }
  return pair;
}

/** POST sem sessão, de um IP próprio quando dado (balde do limite de login). */
async function postFrom<T>(url: string, data: unknown, clientIp?: string): Promise<T> {
  const response = await fetch(`${MAIN_BASE_URL}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
    },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || !body.success || body.data === null) {
    throw new Error(`POST ${url} falhou no global-setup (${response.status}): ${body.error ?? "?"}`);
  }
  return body.data;
}

/**
 * Primeiro login de quem precisa do segundo fator — Super Admin (ADR-008) e
 * Admin de Empresa (#291, ADR-012): a senha rende só um token pendente, o
 * cadastro do autenticador devolve a chave e o código TOTP dela, calculado
 * aqui, emite a sessão. A chave fica em `totpFile` para os specs entrarem pela
 * tela com o código.
 */
async function loginEnrollingFactor(
  email: string,
  password: string,
  who: string,
  totpFile: string,
  clientIp?: string,
): Promise<string> {
  const started = await postFrom<{ mfaEnrollmentRequired?: boolean; pendingToken: string }>(
    "/api/auth/login",
    { email, password },
    clientIp,
  );
  if (!started.mfaEnrollmentRequired) {
    throw new Error(`Primeiro login de ${who} deveria exigir o cadastro do segundo fator`);
  }
  const enrolled = await postFrom<{ secret: string; pendingToken: string }>(
    "/api/auth/mfa/enroll",
    { pendingToken: started.pendingToken },
    clientIp,
  );
  const step = totpStep();
  const cookie = await sessionCookieFrom(
    "/api/auth/mfa/verify",
    { pendingToken: enrolled.pendingToken, code: totpCode(enrolled.secret, step) },
    `${who} (segundo fator)`,
    clientIp,
  );
  await mkdir(path.dirname(totpFile), { recursive: true });
  await saveTotpState({ secret: enrolled.secret, lastUsedStep: step }, totpFile);
  return cookie;
}

const loginSuperAdmin = (): Promise<string> =>
  loginEnrollingFactor(E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD, "Super Admin", SUPER_ADMIN_TOTP_PATH);

async function writeStorageState(file: string, cookiePair: string): Promise<void> {
  const value = cookiePair.slice(`${SESSION_COOKIE_NAME}=`.length);
  const expires = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const storageState = {
    cookies: [
      {
        name: SESSION_COOKIE_NAME,
        value,
        domain: "localhost",
        path: "/",
        expires,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(storageState, null, 2));
}

interface SeedIds {
  professionalId: string;
  procedureWithKitId: string;
  procedureNoKitId: string;
  supplyIds: [string, string];
  batchLabel: string;
}

interface RoleSeed {
  linkedPatientId: string;
  linkedPatientName: string;
}

/** Conta real por papel: cadastro pela API da tela de Contas → convite → senha → login. */
async function provisionRoleAccount(
  adminCookie: string,
  role: (typeof E2E_STAFF_ROLES)[number],
  professionalId: string,
): Promise<void> {
  const { email, storageState } = ROLE_ACCOUNTS[role];
  const logStart = (await readServerLog()).length;
  await post(adminCookie, "/api/accounts", {
    email,
    role,
    professionalId: role === "profissional" ? professionalId : null,
  });
  await consumeInvite(await waitForInviteUrl(email, logStart), E2E_ROLE_PASSWORD, role);
  // Admin de Empresa cadastra o segundo fator no primeiro login (#291).
  const cookie =
    role === "company_admin"
      ? await loginEnrollingFactor(email, E2E_ROLE_PASSWORD, role, totpStatePath(email), ROLE_LOGIN_IP)
      : await login(email, E2E_ROLE_PASSWORD, role, ROLE_LOGIN_IP);
  await writeStorageState(storageState, cookie);
}

/**
 * Paciente com vínculo R4 ao profissional semeado: a recepção agenda uma
 * consulta atribuída a ele — é essa atribuição que concede o vínculo (#188).
 */
async function seedLinkedPatient(cookie: string, professionalId: string): Promise<RoleSeed> {
  const fullName = "Paciente Vinculado E2E";
  const patient = await post<{ id: string }>(cookie, "/api/patients", {
    fullName,
    email: "paciente-vinculado-e2e@vitta.test",
    phone: "11990000204",
  });
  const slot = slotFromSeed("papeis-vinculo-profissional");
  await post(cookie, "/api/appointments", {
    patientId: patient.id,
    startsAt: new Date(slot.startsAt).toISOString(),
    endsAt: new Date(slot.endsAt).toISOString(),
    procedure: "Avaliação de ferida (seed E2E)",
    priceCents: 15000,
    professionalId,
  });
  return { linkedPatientId: patient.id, linkedPatientName: fullName };
}

async function seedBaseData(cookie: string): Promise<SeedIds> {
  const professional = await post<{ id: string }>(cookie, "/api/professionals", {
    fullName: "Enf. Semente E2E",
    registry: "COREN-SP 000001",
  });

  const procedureWithKit = await post<{ id: string }>(cookie, "/api/procedures", {
    name: "Troca de bolsa de colostomia (seed E2E)",
    priceCents: 18000,
    durationMinutes: 45,
  });

  const procedureNoKit = await post<{ id: string }>(cookie, "/api/procedures", {
    name: "Curativo especializado (seed E2E)",
    priceCents: 12000,
    durationMinutes: 30,
  });

  const supplyOne = await post<{ id: string }>(cookie, "/api/supplies", {
    name: "Bolsa colostomia 1 peça 60mm (seed E2E)",
    unit: "un",
    minQty: 5,
    priceCents: 3500,
  });
  const supplyTwo = await post<{ id: string }>(cookie, "/api/supplies", {
    name: "Placa protetora (seed E2E)",
    unit: "un",
    minQty: 5,
    priceCents: 2200,
  });

  // Kit do procedimento: baixado automaticamente ao concluir uma consulta.
  await put(cookie, `/api/procedures/${procedureWithKit.id}/kit`, {
    items: [{ supplyId: supplyOne.id, quantity: 1 }],
  });

  // Lote de entrada com validade — alimenta o insight de vencimento em materiais.
  const batchLabel = "L-E2E-0001";
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
  await post(cookie, `/api/supplies/${supplyOne.id}/movements`, {
    type: "in",
    quantity: 50,
    reason: "Compra inicial — seed E2E",
    batchLabel,
    expiresAt,
  });
  await post(cookie, `/api/supplies/${supplyTwo.id}/movements`, {
    type: "in",
    quantity: 50,
    reason: "Compra inicial — seed E2E",
    batchLabel: "L-E2E-0002",
    expiresAt,
  });

  return {
    professionalId: professional.id,
    procedureWithKitId: procedureWithKit.id,
    procedureNoKitId: procedureNoKit.id,
    supplyIds: [supplyOne.id, supplyTwo.id],
    batchLabel,
  };
}

/**
 * Sem isso, todo documento clínico da suíte (atestado/relatório/plano de
 * cuidados) bateria no bloqueio fail-closed do #62 — a clínica nasce sem
 * CNPJ/responsável técnico cadastrados.
 */
const E2E_CLINIC_CNPJ = "12.345.678/0001-95";

async function seedClinicInfo(cookie: string): Promise<void> {
  await put(cookie, "/api/settings/clinic-info", {
    cnpj: E2E_CLINIC_CNPJ,
    address: "Rua Semente E2E, 100",
    city: "São Paulo",
    professionalName: "Enf. Semente E2E",
    professionalRegistry: "COREN-SP 000001",
  });
}

/**
 * A `legacy-clinic` nasce só com nome; o convite do primeiro admin exige nome,
 * CNPJ, telefone e e-mail de contato (B4). O super_admin completa o cadastro
 * pela plataforma, como fará no go-live — sem SQL.
 */
async function completeClinicRegistration(superAdminCookie: string): Promise<void> {
  await put(
    superAdminCookie,
    `/api/platform/clinics/${E2E_CLINIC_ID}`,
    {
      name: "Clínica E2E",
      cnpj: E2E_CLINIC_CNPJ,
      contactPhone: "11 3333-4444",
      contactEmail: "contato@clinica-e2e.test",
    },
    "PATCH",
  );
}

/**
 * Admin de Empresa da sessão padrão: o Super Admin convida pela rota da
 * plataforma e o link sai no log do `NullEmailGateway`, como o de qualquer
 * convite. A resposta da rota nunca traz o link (critério 14 do B1).
 */
async function provisionClinicAdmin(superAdminCookie: string): Promise<string> {
  const logStart = (await readServerLog()).length;
  await post(superAdminCookie, `/api/platform/clinics/${E2E_CLINIC_ID}/admins`, {
    email: E2E_CLINIC_ADMIN_EMAIL,
  });
  const inviteUrl = await waitForInviteUrl(E2E_CLINIC_ADMIN_EMAIL, logStart);
  await consumeInvite(inviteUrl, E2E_CLINIC_ADMIN_PASSWORD, "Admin de Empresa");
  return loginEnrollingFactor(
    E2E_CLINIC_ADMIN_EMAIL,
    E2E_CLINIC_ADMIN_PASSWORD,
    "Admin de Empresa",
    totpStatePath(E2E_CLINIC_ADMIN_EMAIL),
    CLINIC_ADMIN_LOGIN_IP,
  );
}

/**
 * Sem o link do convite (suíte contra o build de produção, que sobe com canal
 * de e-mail), a sessão padrão é um cookie assinado de Admin de Empresa. O sujeito
 * não tem conta, e sessão sem conta não é revogada (ADR-005).
 */
const mintedClinicAdminCookie = (): string =>
  `${SESSION_COOKIE_NAME}=${mintSessionToken(E2E_CLINIC_ADMIN_EMAIL, "company_admin")}`;

export interface GlobalSetupOptions {
  /**
   * Contas reais por papel (#204) e Admin de Empresa convidado. O convite delas
   * só aparece no log do `NullEmailGateway`; a suíte contra o build de produção
   * (#203) sobe com canal de e-mail, então usa cookie assinado para o Admin e
   * desliga as contas por papel.
   */
  roleAccounts: boolean;
}

export async function runGlobalSetup({ roleAccounts }: GlobalSetupOptions): Promise<void> {
  await consumeInvite(await bootstrapSuperAdmin(), E2E_SUPER_ADMIN_PASSWORD, "Super Admin");
  const superAdminCookie = await loginSuperAdmin();
  await writeStorageState(SUPER_ADMIN_STORAGE_STATE_PATH, superAdminCookie);
  // Catálogo de taxonomias (NANDA-I/NOC/NIC), subset curado de estomaterapia.
  // O catálogo é global: importar é ato de plataforma (ADR-007).
  await post(superAdminCookie, "/api/platform/taxonomy/import", {});
  await completeClinicRegistration(superAdminCookie);

  const cookie = roleAccounts ? await provisionClinicAdmin(superAdminCookie) : mintedClinicAdminCookie();
  await writeStorageState(ADMIN_STORAGE_STATE_PATH, cookie);
  await seedClinicInfo(cookie);
  const seed = await seedBaseData(cookie);
  const roleSeed = await seedLinkedPatient(cookie, seed.professionalId);
  await mkdir(path.dirname(SEED_DATA_PATH), { recursive: true });
  await writeFile(SEED_DATA_PATH, JSON.stringify({ ...seed, ...roleSeed }, null, 2));
  if (!roleAccounts) return;
  for (const role of E2E_STAFF_ROLES) {
    await provisionRoleAccount(cookie, role, seed.professionalId);
  }
}

export default function globalSetup(): Promise<void> {
  return runGlobalSetup({ roleAccounts: true });
}
