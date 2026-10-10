import { test, expect } from "@playwright/test";

test.describe("sidebar responsivo", () => {
  test("mobile (390x844): sidebar não visível por padrão, trigger abre drawer e navegação funciona", async ({
    page,
  }) => {
    // Define viewport mobile
    await page.setViewportSize({ width: 390, height: 844 });

    // Navega para /
    await page.goto("/");

    // SidebarTrigger deve estar visível (só visível em mobile com lg:hidden)
    const sidebarTrigger = page.locator("button[aria-expanded]").first();
    await expect(sidebarTrigger).toBeVisible();

    // Verifica estado inicial (aria-expanded deve ser false)
    const initialState = await sidebarTrigger.getAttribute("aria-expanded");
    expect(initialState).toBe("false");

    // Clica no trigger para abrir o drawer
    await sidebarTrigger.click();

    // aria-expanded deve mudar para true após clicar
    await expect(sidebarTrigger).toHaveAttribute("aria-expanded", "true");

    // Verifica que os links de navegação estão agora acessíveis
    const navLinks = page.locator("nav a");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);

    // Copia o href do primeiro link de navegação diferente de / (ex: "/agenda")
    let firstLink = null;
    let href = null;
    for (let i = 0; i < count; i++) {
      const link = navLinks.nth(i);
      const linkHref = await link.getAttribute("href");
      if (linkHref && linkHref !== "/") {
        firstLink = link;
        href = linkHref;
        break;
      }
    }

    expect(href).not.toBeNull();

    // Clica no link
    await firstLink!.click();

    // Aguarda navegação
    await page.waitForURL(`**${href}`);

    // URL mudou
    expect(page.url()).toContain(href);

    // O drawer fecha sozinho ao navegar (SidebarAutoClose) — sem isso, o
    // overlay ficaria preso aberto sobre a nova página.
    await expect(sidebarTrigger).toHaveAttribute("aria-expanded", "false");
  });

  test("mobile (390x844): sem amputação de conteúdo (sem scroll horizontal)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Verifica que o scrollWidth não é maior que a viewport width
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = page.viewportSize()?.width || 390;

    // Permite uma margem pequena para arredondamento/border, mas não amputação
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 2);
  });

  test("desktop (1280x800): sidebar visível como rail fixo, sem trigger relevante", async ({
    page,
  }) => {
    // Define viewport desktop (lg: 1024px é o breakpoint padrão)
    await page.setViewportSize({ width: 1280, height: 800 });

    // Navega para /
    await page.goto("/");

    // O sidebar é renderizado como aside estático (com navegação dentro)
    const sidebarAside = page.locator("aside").filter({ has: page.locator("nav") });
    await expect(sidebarAside).toBeVisible();

    // SidebarTrigger não deve estar visível em desktop (lg:hidden = escondido acima de 1024px)
    // Pelo rótulo: `button[aria-expanded]` também pega os "Cancelar" (gatilhos
    // de diálogo) dos retornos do dashboard — quando carregavam antes da
    // asserção, o modo estrito falhava com 4 elementos.
    const sidebarTrigger = page.getByRole("button", { name: "Toggle sidebar" });
    await expect(sidebarTrigger).not.toBeVisible();

    // Os links de navegação devem estar visíveis no sidebar
    const navLinks = sidebarAside.locator("nav a");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("mobile a desktop: cruzar breakpoint com drawer aberto libera scroll-lock (P1-5)", async ({
    page,
  }) => {
    // Viewport mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Abre o drawer
    const sidebarTrigger = page.locator("button[aria-expanded]").first();
    await sidebarTrigger.click();
    await expect(sidebarTrigger).toHaveAttribute("aria-expanded", "true");

    // Confirma que body tem data-scroll-locked
    const hasScrollLockBefore = await page.evaluate(() =>
      document.body.hasAttribute("data-scroll-locked"),
    );
    expect(hasScrollLockBefore).toBe(true);

    // Redimensiona para desktop SEM navegar de novo
    await page.setViewportSize({ width: 1280, height: 800 });

    // Aguarda um pouco para o sistema processar o resize
    await page.waitForTimeout(100);

    // O drawer deve estar fechado automaticamente após cruzar o breakpoint
    // (drawer só fica aberto em mobile)
    await expect(sidebarTrigger).not.toBeVisible();

    // Confirma que data-scroll-locked foi removido
    const hasScrollLockAfter = await page.evaluate(() =>
      document.body.hasAttribute("data-scroll-locked"),
    );
    expect(hasScrollLockAfter).toBe(false);
  });
});
