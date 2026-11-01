import { vi } from 'vitest';

/**
 * `router.refresh()` dos testes de tela do portal (#553). Fica fora de
 * `portal-harness.tsx` de propósito: o `vi.mock('next/navigation')` importa
 * este módulo, e o harness importa as telas, que importam `next/navigation`;
 * no mesmo arquivo seria uma espera circular.
 */
export const portalRouter = { reload: (() => {}) as () => void };

/** Dublê de `next/navigation` para `vi.mock`: o `refresh` refaz a leitura do harness. */
export const navigationMock = () => ({
  useRouter: () => ({
    refresh: () => portalRouter.reload(),
    push: vi.fn(),
  }),
  usePathname: () => '/portal',
});
