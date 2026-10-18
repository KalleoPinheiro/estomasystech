import { createHmac } from "node:crypto";
import {
  clinicIdFor,
  LOAD_ADMIN_EMAIL,
  PORTAL_ACCOUNTS,
  portalEmail,
  resolveProfile,
  type LoadProfile,
} from "./profiles";

/**
 * Baseline de carga (#222): usuários virtuais simultâneos disparam as rotas de
 * leitura mais usadas contra um servidor já em pé e o script imprime p50/p95/p99
 * por rota em Markdown (cole em docs/engineering/performance-baseline.md).
 *
 * Uso: `AUTH_SECRET=... npx tsx scripts/load/run.ts [tipica|issue]
 *   [--duration 60] [--warmup 10] [--users 30] [--think-ms 2000]
 *   [--base-url http://localhost:3000]`.
 * `--think-ms 0` mede saturação (sem pausa entre requisições de cada usuário).
 * Só lê: não grava nada. O banco precisa estar semeado por `scripts/load/seed.ts`.
 */
const SESSION_COOKIE = "estomasystech_session";
const MS_PER_DAY = 86_400_000;

interface Sample {
  route: string;
  ms: number;
  status: number;
}

interface Route {
  name: string;
  weight: number;
  portal?: boolean;
  path: () => string;
}

interface Options {
  profile: LoadProfile;
  durationMs: number;
  warmupMs: number;
  users: number;
  thinkMs: number;
  baseUrl: string;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseOptions(args: string[]): Options {
  const profile = resolveProfile(args[0]?.startsWith("--") ? undefined : args[0]);
  return {
    profile,
    durationMs: Number(readFlag(args, "--duration") ?? 60) * 1000,
    warmupMs: Number(readFlag(args, "--warmup") ?? 10) * 1000,
    users: Number(readFlag(args, "--users") ?? profile.users),
    thinkMs: Number(readFlag(args, "--think-ms") ?? profile.thinkMs),
    baseUrl: readFlag(args, "--base-url") ?? "http://localhost:3000",
  };
}

/** Réplica de `createSessionToken` (src/lib/auth/session.ts), como faz o E2E. */
function mintCookie(secret: string, subject: string, role: string, clinicId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + 12 * 3_600_000, sub: subject, role, clinicId, professionalId: null, sv: 0 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${SESSION_COOKIE}=${payload}.${signature}`;
}

const pick = (max: number): number => Math.floor(Math.random() * max);
const monthKey = (offset = 0): string => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function futureDay(): string {
  const d = new Date(Date.now() + (1 + pick(14)) * MS_PER_DAY);
  return d.toISOString().slice(0, 10);
}

function weekRange(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start.getTime() + 7 * MS_PER_DAY);
  return `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
}

function todayRange(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + MS_PER_DAY);
  return `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
}

function buildRoutes(profile: LoadProfile, clinicId: string): Route[] {
  const patientId = () => `${clinicId}-pat-${pick(profile.patients)}`;
  const surnames = ["Silva", "Souza", "Santos", "Lima"];
  return [
    { name: "GET /api/appointments (semana, agenda)", weight: 20, path: () => `/api/appointments?${weekRange()}` },
    { name: "GET /api/appointments (hoje, dashboard)", weight: 10, path: () => `/api/appointments?${todayRange()}` },
    { name: "GET /api/summary (dashboard)", weight: 8, path: () => `/api/summary?month=${monthKey()}` },
    { name: "GET /api/follow-ups?status=pending", weight: 8, path: () => "/api/follow-ups?status=pending" },
    { name: "GET /api/patients (lista)", weight: 10, path: () => "/api/patients?limit=50" },
    { name: "GET /api/patients?search=", weight: 10, path: () => `/api/patients?search=${surnames[pick(4)]}` },
    { name: "GET /api/patients/{id} (ficha)", weight: 10, path: () => `/api/patients/${patientId()}` },
    { name: "GET /api/invoices (lista)", weight: 6, path: () => "/api/invoices?limit=50" },
    { name: "GET /api/invoices/summary", weight: 4, path: () => "/api/invoices/summary" },
    { name: "GET /api/reports (mês)", weight: 3, path: () => `/api/reports?month=${monthKey(-1)}` },
    { name: "GET /api/audit (trilha)", weight: 3, path: () => "/api/audit?limit=50" },
    { name: "GET /api/options/professionals", weight: 4, path: () => "/api/options/professionals" },
    { name: "GET /api/schedule-config", weight: 4, path: () => "/api/schedule-config" },
    { name: "GET /api/portal/patient (portal)", weight: 6, portal: true, path: () => "/api/portal/patient" },
    {
      name: "GET /api/portal/patient/slots (autoagendamento)",
      weight: 4,
      portal: true,
      path: () => `/api/portal/patient/slots?procedureId=${clinicId}-proc-${pick(6)}&date=${futureDay()}`,
    },
  ];
}

function pickRoute(routes: Route[]): Route {
  const total = routes.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;
  for (const route of routes) {
    roll -= route.weight;
    if (roll <= 0) return route;
  }
  return routes[0];
}

async function timedGet(url: string, cookie: string): Promise<{ ms: number; status: number }> {
  const started = performance.now();
  try {
    const response = await fetch(url, { headers: { Cookie: cookie } });
    await response.arrayBuffer();
    return { ms: performance.now() - started, status: response.status };
  } catch {
    return { ms: performance.now() - started, status: 0 };
  }
}

async function virtualUser(
  index: number,
  options: Options,
  routes: Route[],
  cookies: { staff: string; portal: string[] },
  samples: Sample[],
  stopAt: number,
  warmupUntil: number,
): Promise<void> {
  while (Date.now() < stopAt) {
    const route = pickRoute(routes);
    const cookie = route.portal ? cookies.portal[index % cookies.portal.length] : cookies.staff;
    const result = await timedGet(options.baseUrl + route.path(), cookie);
    if (Date.now() >= warmupUntil) samples.push({ route: route.name, ...result });
    if (options.thinkMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.thinkMs * (0.5 + Math.random())));
    }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function report(samples: Sample[], options: Options): string {
  const byRoute = new Map<string, Sample[]>();
  for (const sample of samples) byRoute.set(sample.route, [...(byRoute.get(sample.route) ?? []), sample]);
  const lines = [
    `| Rota | req | erros | p50 (ms) | p95 (ms) | p99 (ms) |`,
    `| --- | ---: | ---: | ---: | ---: | ---: |`,
  ];
  for (const [route, list] of [...byRoute.entries()].sort()) {
    const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
    const errors = list.filter((s) => s.status < 200 || s.status >= 300).length;
    lines.push(
      `| \`${route}\` | ${list.length} | ${errors} | ${percentile(sorted, 50).toFixed(0)} | ${percentile(sorted, 95).toFixed(0)} | ${percentile(sorted, 99).toFixed(0)} |`,
    );
  }
  const all = samples.map((s) => s.ms).sort((a, b) => a - b);
  const errors = samples.filter((s) => s.status < 200 || s.status >= 300).length;
  const rps = samples.length / (options.durationMs / 1000);
  lines.push(
    `| **Total** | ${samples.length} | ${errors} | ${percentile(all, 50).toFixed(0)} | ${percentile(all, 95).toFixed(0)} | ${percentile(all, 99).toFixed(0)} |`,
    "",
    `Vazão: ${rps.toFixed(1)} req/s · ${options.users} usuários · pausa média ${options.thinkMs} ms · ${options.durationMs / 1000}s medidos.`,
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET deve ser o mesmo do servidor medido");
  const options = parseOptions(process.argv.slice(2));
  const clinicId = clinicIdFor(1);
  const cookies = {
    staff: mintCookie(secret, LOAD_ADMIN_EMAIL, "company_admin", clinicId),
    portal: Array.from({ length: PORTAL_ACCOUNTS }, (_, i) => mintCookie(secret, portalEmail(i), "patient", clinicId)),
  };
  const routes = buildRoutes(options.profile, clinicId);
  const samples: Sample[] = [];
  const now = Date.now();
  const warmupUntil = now + options.warmupMs;
  const stopAt = warmupUntil + options.durationMs;
  await Promise.all(
    Array.from({ length: options.users }, (_, i) =>
      virtualUser(i, options, routes, cookies, samples, stopAt, warmupUntil),
    ),
  );
  console.log(`Perfil ${options.profile.name}\n\n${report(samples, options)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
