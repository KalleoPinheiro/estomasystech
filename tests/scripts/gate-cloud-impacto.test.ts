import { describe, expect, it } from 'vitest';
import { impactedSpecs, routeOf } from '../../scripts/gate-cloud/impacto';

const specs = [
  { file: 'e2e/agenda.spec.ts', text: 'await page.goto("/agenda");' },
  { file: 'e2e/pacientes.spec.ts', text: 'await page.goto("/pacientes");' },
  { file: 'e2e/faturamento.spec.ts', text: 'await page.goto("/faturamento");' },
];

describe('Impacto do diff sobre os specs E2E (ADR-084)', () => {
  it('rota alterada roda só o spec dessa rota', () => {
    const r = impactedSpecs(['src/app/(staff)/agenda/page.tsx'], specs);
    expect(r).toMatchObject({ all: false, specs: ['e2e/agenda.spec.ts'] });
  });

  it('regra de domain/application alcança as rotas mapeadas da pasta', () => {
    const r = impactedSpecs(
      ['src/application/billing/create-invoice.ts'],
      specs,
    );
    expect(r).toMatchObject({ all: false, specs: ['e2e/faturamento.spec.ts'] });
  });

  it('spec alterado roda ele mesmo', () => {
    const r = impactedSpecs(['e2e/pacientes.spec.ts'], specs);
    expect(r).toMatchObject({ all: false, specs: ['e2e/pacientes.spec.ts'] });
  });

  it('arquivo transversal roda todos (na dúvida, inclui)', () => {
    expect(impactedSpecs(['src/proxy.ts'], specs)).toMatchObject({ all: true });
    expect(impactedSpecs(['src/components/modal.tsx'], specs)).toMatchObject({
      all: true,
    });
  });

  it('pasta de regra sem mapa roda todos', () => {
    expect(impactedSpecs(['src/domain/audit/x.ts'], specs)).toMatchObject({
      all: true,
    });
  });

  it('rota sem nenhum spec que a cubra roda todos', () => {
    expect(
      impactedSpecs(['src/app/(staff)/triagem/page.tsx'], specs),
    ).toMatchObject({ all: true });
  });

  it('só documentação não seleciona E2E', () => {
    expect(impactedSpecs(['docs/README.md', '.changeset/a.md'], specs)).toEqual(
      {
        all: false,
        specs: [],
        reason: '0 grupo(s) de rota, 0 spec(s) alterado(s)',
      },
    );
  });

  it('a rota vem do primeiro segmento estático, sem grupo nem pasta privada', () => {
    expect(routeOf('src/app/(staff)/_hoje/x.tsx')).toBe('hoje');
    expect(routeOf('src/app/(staff)/pacientes/[id]/a.tsx')).toBe('pacientes');
    expect(routeOf('src/app/api/pacientes/route.ts')).toBeUndefined();
  });
});
