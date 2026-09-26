import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ADMIN_STORAGE_STATE_PATH,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_BOOTSTRAP_TOKEN,
  E2E_CLINIC_ID,
  E2E_ROLE_PASSWORD,
  E2E_STAFF_ROLES,
  MAIN_BASE_URL,
  MAIN_SERVER_LOG_PATH,
  ROLE_ACCOUNTS,
  SEED_DATA_PATH,
  SESSION_COOKIE_NAME,
} from "./support/constants";
import { findInviteUrl } from "./support/invite-log";
import { slotFromSeed } from "./support/slots";

/**
 * Roda uma vez antes de toda a suíte (depois que o(s) `webServer` já respondem —
 * Playwright só chama `globalSetup` após a checagem de `url` do webServer passar).
 *
 * 1. Faz o bootstrap do primeiro Super Admin (`POST /api/auth/bootstrap`, guardado
 *    por `VITTA_BOOTSTRAP_TOKEN`), consome o convite para definir a senha e loga —
 *    o mesmo caminho que uma instalação nova percorre, agora que não existe mais
 *    senha mestre (issue #21 / ADR-004). O cookie vira `storageState`, reaproveitado
 *    por padrão em todos os specs (ver `use.storageState` em `playwright.config.ts`).
 * 2. Semeia dados base via REST (profissional, procedimentos com kit, insumos
 *    com lote) e grava os IDs em `e2e/support/seed-data.json` para os specs.
 * 3. Cria uma conta por papel de equipe (`company_admin`, `atendente`,
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

async function put<T>(cookie: string, url: string, data: unknown): Promise<T> {
  const response = await fetch(`${MAIN_BASE_URL}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || !body.success || body.data === null) {
    throw new Error(`Seed PUT ${url} falhou (${response.status}): ${body.error ?? "?"}`);
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
    body: JSON.stringify({ email: E2E_ADMIN_EMAIL }),
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

async function login(email: string, password: string, who: string, clientIp?: string): Promise<string> {
  const response = await fetch(`${MAIN_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
    },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as Envelope<{ ok: boolean }>;
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

const INVITE_WAIT_MS = 15_000;
const INVITE_POLL_MS = 250;

async function waitForInviteUrl(email: string): Promise<string> {
  const deadline = Date.now() + INVITE_WAIT_MS;
  while (Date.now() < deadline) {
    const log = await readFile(MAIN_SERVER_LOG_PATH, "utf-8").catch(() => "");
    const url = findInviteUrl(log, email);
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, INVITE_POLL_MS));
  }
  throw new Error(
    `Convite de ${email} não apareceu em ${MAIN_SERVER_LOG_PATH} em ${INVITE_WAIT_MS}ms. ` +
      "O servidor principal precisa ser o do playwright.config.ts (grava o log via tee) " +
      "e rodar sem RESEND_API_KEY/EMAIL_FROM.",
  );
}

/** Conta real por papel: cadastro pela API da tela de Contas → convite → senha → login. */
async function provisionRoleAccount(
  adminCookie: string,
  role: (typeof E2E_STAFF_ROLES)[number],
  professionalId: string,
): Promise<void> {
  const { email, storageState } = ROLE_ACCOUNTS[role];
  await post(adminCookie, "/api/accounts", {
    email,
    role,
    clinicId: E2E_CLINIC_ID,
    professionalId: role === "profissional" ? professionalId : null,
  });
  await consumeInvite(await waitForInviteUrl(email), E2E_ROLE_PASSWORD, role);
  await writeStorageState(storageState, await login(email, E2E_ROLE_PASSWORD, role, ROLE_LOGIN_IP));
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
async function seedClinicInfo(cookie: string): Promise<void> {
  await put(cookie, "/api/settings/clinic-info", {
    cnpj: "12.345.678/0001-90",
    address: "Rua Semente E2E, 100",
    city: "São Paulo",
    professionalName: "Enf. Semente E2E",
    professionalRegistry: "COREN-SP 000001",
  });
}

export interface GlobalSetupOptions {
  /**
   * Contas reais por papel (#204). O convite delas só aparece no log do
   * `NullEmailGateway`; a suíte contra o build de produção (#203) sobe com canal
   * de e-mail e não usa essas contas, então desliga o passo.
   */
  roleAccounts: boolean;
}

export async function runGlobalSetup({ roleAccounts }: GlobalSetupOptions): Promise<void> {
  await consumeInvite(await bootstrapSuperAdmin(), E2E_ADMIN_PASSWORD, "Super Admin");
  const cookie = await login(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "Super Admin");
  await writeStorageState(ADMIN_STORAGE_STATE_PATH, cookie);
  await seedClinicInfo(cookie);
  const seed = await seedBaseData(cookie);
  const roleSeed = await seedLinkedPatient(cookie, seed.professionalId);
  await mkdir(path.dirname(SEED_DATA_PATH), { recursive: true });
  await writeFile(SEED_DATA_PATH, JSON.stringify({ ...seed, ...roleSeed }, null, 2));
  // Catálogo de taxonomias (NANDA-I/NOC/NIC) — subset curado de estomaterapia.
  await post(cookie, "/api/admin/taxonomy/import", {});
  if (!roleAccounts) return;
  for (const role of E2E_STAFF_ROLES) {
    await provisionRoleAccount(cookie, role, seed.professionalId);
  }
}

export default function globalSetup(): Promise<void> {
  return runGlobalSetup({ roleAccounts: true });
}
