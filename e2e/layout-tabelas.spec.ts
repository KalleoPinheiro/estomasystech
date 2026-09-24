import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import {
  addAssessment,
  apiPost,
  completeAppointment,
  createAppointment,
  createCondition,
  createInvoice,
  createPartner,
  createPatient,
  createProcedure,
  createProfessional,
  createSupply,
  payInvoice,
  unique,
} from "./support/api";
import { businessDay, slotForAttempt, ymdToDateInput } from "./support/dates";

/**
 * Layout mobile-first, S3 (checks C16–C18): as 13 tabelas do table set empilham
 * abaixo de 40rem (`Table stack` + `TableCell label`) e continuam tabela no
 * desktop. Cada membro semeia o dado que faz a sua tabela ter linha.
 */

const PHONE = { width: 375, height: 667 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

interface Seeded {
  url: string;
  /** Um cabeçalho que só esta tabela tem, para achá-la na página. */
  header: string;
  /** Passos na página antes de medir (abrir um painel, trocar o mês). */
  prepare?: (page: Page) => Promise<void>;
  /** Desfaz o dado que outro spec não espera encontrar. */
  cleanup?: () => Promise<unknown>;
}

interface Member {
  name: string;
  seed: (request: APIRequestContext) => Promise<Seeded>;
}

/** Leva um seletor de mês (‹ ›) até o mês do slot semeado. */
async function goToMonth(page: Page, isoDate: string): Promise<void> {
  const target = new Date(isoDate);
  const now = new Date();
  const delta =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  const name = delta >= 0 ? "Próximo mês" : "Mês anterior";
  for (let i = 0; i < Math.abs(delta); i += 1) {
    const done = page.waitForResponse((r) => r.url().includes("month="), { timeout: 20_000 });
    await page.getByRole("button", { name }).first().click();
    await done;
  }
}

/** Consulta concluída com profissional comissionado: alimenta relatórios e repasses. */
async function seedProduction(request: APIRequestContext, seed: string) {
  const professional = await apiPost<{ id: string }>(request, "/api/professionals", {
    fullName: `Enf. Comissão ${unique()}`,
    registry: "COREN-SP 1",
    commissionType: "percentage",
    commissionPct: 30,
  });
  const patient = await createPatient(request, { fullName: `Paciente Tabela ${unique()}` });
  const slot = slotForAttempt(seed, 30);
  const appointment = await createAppointment(request, {
    patientId: patient.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    procedure: `Curativo tabela ${unique()}`,
    priceCents: 20000,
    professionalId: professional.id,
  });
  await completeAppointment(request, appointment.id);
  return { professional, patient, slot };
}

const TABLE_SET: Member[] = [
  {
    name: "pacientes",
    seed: async (request) => {
      await createPatient(request, { fullName: `Paciente Tabela ${unique()}` });
      return { url: "/pacientes", header: "Nascimento" };
    },
  },
  {
    name: "parceiros",
    seed: async (request) => {
      await createPartner(request);
      return { url: "/parceiros", header: "Especialidade" };
    },
  },
  {
    name: "profissionais",
    seed: async (request) => {
      await createProfessional(request);
      return { url: "/profissionais", header: "Registro" };
    },
  },
  {
    name: "procedimentos",
    seed: async (request) => {
      await createProcedure(request, { name: `Procedimento tabela ${unique()}` });
      return { url: "/procedimentos", header: "Preço padrão" };
    },
  },
  {
    name: "materiais",
    seed: async (request) => {
      await createSupply(request, { name: `Insumo tabela ${unique()}` });
      return { url: "/materiais", header: "Previsão" };
    },
  },
  {
    name: "faturamento",
    seed: async (request) => {
      const patient = await createPatient(request);
      await createInvoice(request, {
        patientId: patient.id,
        description: `Fatura tabela ${unique()}`,
        amountCents: 9000,
      });
      return { url: "/faturamento", header: "Pagamento" };
    },
  },
  {
    name: "auditoria",
    seed: async (request) => {
      const patient = await createPatient(request);
      await request.get(`/api/patients/${patient.id}`);
      return { url: "/auditoria", header: "Recurso" };
    },
  },
  {
    name: "relatórios receita",
    seed: async (request) => {
      const { slot } = await seedProduction(request, "layout-tabelas-receita");
      return {
        url: "/relatorios",
        header: "Insumos",
        prepare: (page) => goToMonth(page, slot.startsAt),
      };
    },
  },
  {
    name: "relatórios produção",
    seed: async (request) => {
      const { slot } = await seedProduction(request, "layout-tabelas-producao");
      return {
        url: "/relatorios",
        header: "Repasse apurado",
        prepare: (page) => goToMonth(page, slot.startsAt),
      };
    },
  },
  {
    name: "repasses",
    seed: async (request) => {
      const { slot, patient } = await seedProduction(request, "layout-tabelas-repasses");
      const invoice = await createInvoice(request, {
        patientId: patient.id,
        description: `Fatura repasse ${unique()}`,
        amountCents: 20000,
      });
      await payInvoice(request, invoice.id, "pix");
      return {
        url: "/repasses",
        header: "Regra",
        prepare: (page) => goToMonth(page, slot.startsAt),
      };
    },
  },
  {
    name: "configurações contas",
    seed: async () => ({ url: "/configuracoes", header: "Profissional vinculado" }),
  },
  {
    name: "configurações feriados",
    seed: async (request) => {
      const day = ymdToDateInput(businessDay(40));
      const created = await apiPost<{ closure: { id: string } }>(
        request,
        "/api/settings/schedule/closures",
        { professionalId: null, startsOn: day, endsOn: null, reason: `Recesso tabela ${unique()}` },
      );
      return {
        url: "/configuracoes",
        header: "Período",
        // Feriado de teste não pode vazar para outros specs (responsive-tables
        // espera uma tabela só em Configurações).
        cleanup: () => request.delete(`/api/settings/schedule/closures/${created.closure.id}`),
      };
    },
  },
  {
    name: "prontuário estomias e feridas",
    seed: async (request) => {
      const patient = await createPatient(request);
      const condition = await createCondition(request, patient.id, {
        kind: "wound",
        title: `Ferida tabela ${unique()}`,
      });
      await addAssessment(request, condition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });
      return {
        url: `/pacientes/${patient.id}?tab=condicoes`,
        header: "Exsudato",
        prepare: async (page) => {
          await page.getByRole("tab", { name: /Estomias e feridas/ }).click();
          await page.getByRole("button", { name: "Ver avaliações" }).first().click();
        },
      };
    },
  },
];

async function openTable(page: Page, seeded: Seeded) {
  await page.goto(seeded.url);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (seeded.prepare) await seeded.prepare(page);
  const table = page.locator("table", {
    has: page.locator("th", { hasText: new RegExp(`^\\s*${seeded.header}\\s*$`) }),
  });
  await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  return table;
}

for (const member of TABLE_SET) {
  test(`empilhada no celular: ${member.name}`, async ({ page, request }) => {
    const seeded = await member.seed(request);
    await page.setViewportSize(PHONE);
    const table = await openTable(page, seeded);
    await expect(table).toHaveClass(/sv-table--stack/);
    const report = await table.evaluate((el, width) => {
      const heads = Array.from(el.querySelectorAll("thead th")).map((th) =>
        (th.textContent ?? "").replace(/\s+/g, " ").trim(),
      );
      const theadHeight = el.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const cells = Array.from(el.querySelectorAll("tbody td")).filter(
        (td) => (td.textContent ?? "").trim() !== "" || td.querySelector("button, a, svg"),
      );
      const badLabels = cells
        .map((td) => td.getAttribute("data-label") ?? "")
        .filter((label) => label === "" || !heads.includes(label));
      const offscreen = Array.from(el.querySelectorAll("tbody button, tbody a[href]"))
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.right > width + 1).length;
      return { theadHeight, badLabels, offscreen, cells: cells.length };
    }, PHONE.width);
    expect(report.cells).toBeGreaterThan(0);
    expect(report.theadHeight).toBeLessThanOrEqual(1);
    expect(report.badLabels).toEqual([]);
    expect(report.offscreen).toBe(0);
    await seeded.cleanup?.();
  });

  test(`tabela no desktop: ${member.name}`, async ({ page, request }) => {
    const seeded = await member.seed(request);
    await page.setViewportSize(DESKTOP);
    const table = await openTable(page, seeded);
    const report = await table.evaluate((el) => ({
      theadHeight: el.querySelector("thead")?.getBoundingClientRect().height ?? 0,
      tallRows: Array.from(el.querySelectorAll("tbody tr"))
        .map((tr) => tr.getBoundingClientRect().height)
        .filter((h) => h >= 80).length,
    }));
    expect(report.theadHeight).toBeGreaterThan(0);
    expect(report.tallRows).toBe(0);
    await seeded.cleanup?.();
  });
}

test("vazio preservado: pacientes", async ({ page }) => {
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await page.goto("/pacientes");
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(`nada-${unique()}`);
    await expect(page.getByText("Nenhum paciente encontrado")).toBeVisible();
    await expect(page.locator("main table")).toHaveCount(0);
  }
});
