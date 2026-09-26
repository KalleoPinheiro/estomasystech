import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyRoute } from '@/lib/auth/route-family';

/**
 * Rede de proteção do R4 (#186): toda rota da família `clinical` FORA de
 * `/api/patients/:id/*` é endereçada pelo id de um recurso (condição, foto,
 * plano...) — e cada handler dela precisa passar pela checagem de vínculo do
 * Profissional antes de ler ou escrever. Rotas em `/api/patients/:id/*` já
 * checam direto com o `patientId` do path.
 *
 * Varre `src/app/api` (em vez de lista fixa) para que uma rota clínica criada
 * amanhã sem a checagem quebre o build aqui.
 */

const API_ROOT = path.join(process.cwd(), 'src/app/api');
const R4_CALLS = ['assertClinicalResourceAccessible(', 'linkedPatientFilter('];
const HANDLER = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;

interface ClinicalRouteFile {
  relative: string;
  pathname: string;
  source: string;
}

function collect(dir: string, acc: ClinicalRouteFile[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (entry.name !== 'route.ts') continue;
    const relative = path
      .relative(path.join(process.cwd(), 'src/app'), full)
      .split(path.sep)
      .join('/');
    const pathname = `/${relative.replace(/\/route\.ts$/, '')}`.replace(
      /\[[^\]]+\]/g,
      'x',
    );
    acc.push({ relative, pathname, source: readFileSync(full, 'utf8') });
  }
  return acc;
}

/** Handlers exportados cujo corpo não chama nenhuma checagem R4. */
function handlersWithoutR4Check(source: string): string[] {
  const matches = [...source.matchAll(HANDLER)];
  return matches
    .filter((match, index) => {
      const end = matches[index + 1]?.index ?? source.length;
      const body = source.slice(match.index, end);
      return !R4_CALLS.some((call) => body.includes(call));
    })
    .map((match) => match[1]);
}

const resourceAddressedClinicalRoutes = collect(API_ROOT)
  .filter((file) => classifyRoute(file.pathname) === 'clinical')
  .filter((file) => !file.pathname.startsWith('/api/patients/'))
  .sort((a, b) => a.relative.localeCompare(b.relative));

describe('Feature: Conformidade R4 nas rotas clínicas por id de recurso (#186)', () => {
  it('Dado a varredura, Quando filtrar a família clinical fora de /api/patients, Então cobre as rotas da issue', () => {
    expect(resourceAddressedClinicalRoutes.map((f) => f.relative)).toEqual(
      expect.arrayContaining([
        'api/care-plan-interventions/[id]/records/route.ts',
        'api/care-plan-outcomes/[id]/evaluations/route.ts',
        'api/care-plans/[id]/diagnoses/route.ts',
        'api/care-plans/[id]/interventions/route.ts',
        'api/care-plans/[id]/outcomes/route.ts',
        'api/care-plans/[id]/route.ts',
        'api/conditions/[id]/assessments/route.ts',
        'api/conditions/[id]/photos/route.ts',
        'api/conditions/[id]/route.ts',
        'api/photos/[id]/route.ts',
        'api/photos/triage/route.ts',
      ]),
    );
  });

  it('Dado um handler sem a checagem, Quando inspecionar, Então o detector o aponta', () => {
    const source = [
      'export async function GET() { await assertClinicalResourceAccessible(s, "condition", id, r); }',
      'export async function PATCH() { return conditions.findById(id); }',
    ].join('\n');

    expect(handlersWithoutR4Check(source)).toEqual(['PATCH']);
  });

  it.each(resourceAddressedClinicalRoutes.map((f) => [f.relative, f] as const))(
    'Dado %s, Quando inspecionar cada handler, Então todos aplicam a checagem R4',
    (_relative, file) => {
      expect(
        handlersWithoutR4Check(file.source),
        `${file.relative}: handler(s) sem assertClinicalResourceAccessible/linkedPatientFilter — Profissional sem vínculo leria/escreveria dado clínico (R4)`,
      ).toEqual([]);
    },
  );
});
