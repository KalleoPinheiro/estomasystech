import { describe, expect, it } from 'vitest';
import {
  alvosDeConfigNova,
  impactedSpecs,
  mutationTargetsCloud,
  novosPadroesMutate,
  routeOf,
} from '../../scripts/gate-cloud/impacto';

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

  it.each([
    'vitest.config.mts',
    'tsconfig.json',
    'postcss.config.mjs',
    'biome.json',
    'scripts/seed/faker.ts',
    'public/logo.svg',
    'e2e/helpers.ts',
    'e2e/fixtures/dados.json',
    'src/lib/format.ts',
  ])('arquivo não mapeado %s cai no gate completo, nunca em NONE', (file) => {
    expect(impactedSpecs([file], specs)).toMatchObject({ all: true });
  });

  it('só documentação não seleciona E2E', () => {
    expect(
      impactedSpecs(
        ['docs/README.md', '.changeset/a.md', 'tests/lib/x.test.ts'],
        specs,
      ),
    ).toEqual({
      all: false,
      specs: [],
      reason: '0 grupo(s) de rota, 0 spec(s) alterado(s)',
    });
  });

  it('a rota vem do primeiro segmento estático, sem grupo nem pasta privada', () => {
    expect(routeOf('src/app/(staff)/_hoje/x.tsx')).toBe('hoje');
    expect(routeOf('src/app/(staff)/pacientes/[id]/a.tsx')).toBe('pacientes');
    expect(routeOf('src/app/api/pacientes/route.ts')).toBeUndefined();
  });

  it('a mutação da nuvem cobre domain, application e lib/server, sem index nem .d.ts', () => {
    expect(
      mutationTargetsCloud([
        'src/domain/billing/a.ts',
        'src/application/billing/b.ts',
        'src/lib/server/session.ts',
        'src/lib/server/data/patients.ts',
        'src/lib/server/index.ts',
        'src/lib/server/x.d.ts',
        'src/lib/format.ts',
        'src/app/(staff)/agenda/page.tsx',
      ]),
    ).toEqual([
      'src/domain/billing/a.ts',
      'src/application/billing/b.ts',
      'src/lib/server/session.ts',
      'src/lib/server/data/patients.ts',
    ]);
  });

  it('a mutação da nuvem inclui o envelope das ações e rotas (action-result e api-response)', () => {
    expect(
      mutationTargetsCloud([
        'src/lib/action-result.ts',
        'src/lib/api-response.ts',
        'src/lib/format.ts',
      ]),
    ).toEqual(['src/lib/action-result.ts', 'src/lib/api-response.ts']);
  });

  describe('Scenario: a config de mutação mudou (roda a mutação no conjunto novo)', () => {
    const antes = JSON.stringify({
      mutate: ['src/domain/**/*.ts', '!src/**/*.d.ts'],
    });
    const depois = JSON.stringify({
      mutate: [
        'src/domain/**/*.ts',
        'src/lib/action-result.ts',
        'src/lib/api-response.ts',
        '!src/**/*.d.ts',
      ],
    });

    it('Dado padrões acrescentados no mutate, Quando compara, Então devolve só os novos', () => {
      expect(novosPadroesMutate(antes, depois)).toEqual([
        'src/lib/action-result.ts',
        'src/lib/api-response.ts',
      ]);
    });

    it('Dado config igual ou sem mutate, Quando compara, Então não há padrão novo', () => {
      expect(novosPadroesMutate(antes, antes)).toEqual([]);
      expect(novosPadroesMutate(antes, '{}')).toEqual([]);
      expect(novosPadroesMutate(antes, 'não é json')).toEqual([]);
    });

    it('Dada config nova sem base (arquivo criado no diff), Quando compara, Então todos os padrões valem', () => {
      expect(novosPadroesMutate(null, antes)).toEqual([
        'src/domain/**/*.ts',
        '!src/**/*.d.ts',
      ]);
    });

    const arquivos = [
      'src/lib/action-result.ts',
      'src/lib/api-response.ts',
      'src/lib/format.ts',
      'src/lib/server/session.ts',
      'src/lib/server/data/patients.ts',
      'src/lib/server/index.ts',
      'src/lib/server/x.d.ts',
      'src/lib/server/leia.md',
    ];

    it('Dados padrões novos, Quando expande, Então devolve os arquivos que casam, sem index nem .d.ts nem exclusão', () => {
      expect(
        alvosDeConfigNova(
          [
            'src/lib/action-result.ts',
            'src/lib/api-response.ts',
            '!src/**/*.d.ts',
          ],
          arquivos,
        ),
      ).toEqual(['src/lib/action-result.ts', 'src/lib/api-response.ts']);
      expect(alvosDeConfigNova(['src/lib/server/**/*.ts'], arquivos)).toEqual([
        'src/lib/server/data/patients.ts',
        'src/lib/server/session.ts',
      ]);
      expect(alvosDeConfigNova(['src/lib/*.ts'], arquivos)).toEqual([
        'src/lib/action-result.ts',
        'src/lib/api-response.ts',
        'src/lib/format.ts',
      ]);
    });

    it('Dado nenhum padrão novo, Quando expande, Então não há alvo', () => {
      expect(alvosDeConfigNova([], arquivos)).toEqual([]);
      expect(alvosDeConfigNova(['!src/**/*.d.ts'], arquivos)).toEqual([]);
    });
  });
});
