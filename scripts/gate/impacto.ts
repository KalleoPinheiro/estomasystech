/**
 * Impacto de um diff sobre os specs E2E (ADR-084). A suíte unitária roda inteira em todo PR; E2E,
 * integração e mutação rodam só no que o diff altera ou alcança. Integração usa o grafo de imports do
 * próprio Vitest (`--changed`); mutação usa os arquivos alterados; aqui fica o mapa do E2E, que o
 * Playwright não calcula a partir de `src/`.
 *
 * Regra de fallback («na dúvida, inclui»): qualquer alteração em arquivo transversal, em domínio sem
 * mapa ou que não case com spec nenhum roda **todos** os specs.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { detectBase } from './base';

/** Arquivos que mexem em todas as telas: mudou um, roda tudo. */
export const TRANSVERSAL =
  /^(src\/proxy\.ts|src\/app\/(layout|providers|globals|manifest)|src\/app\/\(staff\)\/(layout|staff-|role-gate|loading|error|forbidden|not-found)|src\/lib\/(auth\/|server\/(session|define-action|test-faults)|client|runtime-|device-mode|theme|use-)|src\/infrastructure\/(container|persistence\/)|src\/components\/|e2e\/(support\/|global-setup)|playwright[^/]*\.ts|next\.config|package(-lock)?\.json|drizzle\/|Dockerfile|tests\/support\/|scripts\/gate\/impacto)/;

/** Pasta de `domain`/`application` → rotas (trecho de URL ou de nome de spec) que a exercitam. */
export const SLUG_ROTAS: Record<string, string[]> = {
  appointments: ['agenda', 'hoje'],
  scheduling: ['agenda', 'lista-espera', 'feriados'],
  followups: ['followup', 'agenda'],
  followup: ['followup', 'agenda'],
  reminders: ['followup', 'agenda'],
  patients: ['pacientes', 'portal', 'triagem', 'homonimos'],
  patient: ['pacientes', 'portal', 'triagem', 'homonimos'],
  clinical: ['clinico', 'triagem', 'pacientes', 'plano-cuidados', 'documentos'],
  consent: ['portal', 'pacientes', 'documentos'],
  guardians: ['portal', 'pacientes'],
  guardian: ['portal', 'pacientes'],
  billing: ['faturamento', 'repasses', 'relatorios'],
  inventory: ['inventario', 'materiais', 'procedimentos'],
  catalog: ['procedimentos', 'agenda'],
  partners: ['parceiros', 'portal-parceiro'],
  partner: ['parceiros', 'portal-parceiro'],
  professional: ['profissionais', 'equipe', 'feriados-ausencias'],
  portal: ['portal'],
  reports: ['relatorios'],
  release: ['versao-do-sistema'],
};

/** Rota estática de um arquivo de `src/app`: `(staff)/pacientes/[id]/x.tsx` → `pacientes`. */
export function routeOf(file: string): string | undefined {
  const m = /^src\/app\/(?:\([^/]+\)\/)?_?([a-z0-9-]+)\//.exec(file);
  return m && m[1] !== 'api' ? m[1] : undefined;
}

export interface Spec {
  file: string;
  text: string;
}

export type Impact = { all: true; reason: string } | { all: false; specs: string[]; reason: string };

const matches = (spec: Spec, key: string) => spec.file.includes(key) || spec.text.includes(`/${key}`);

/** Specs que o diff alcança, ou todos quando a regra de fallback manda. */
export function impactedSpecs(changed: string[], specs: Spec[]): Impact {
  const code = changed.filter((f) => !/^(docs\/|\.specs\/|\.changeset\/|.*\.md$)/.test(f));
  const groups: string[][] = [];
  const direct = new Set<string>();
  for (const f of code) {
    if (/^e2e\/[^/]+\.spec\.ts$/.test(f)) direct.add(f);
    else if (TRANSVERSAL.test(f)) return { all: true, reason: `arquivo transversal: ${f}` };
    else if (/^src\/app\/api\//.test(f)) {
      const seg = /^src\/app\/api\/([a-z0-9-]+)/.exec(f)?.[1];
      if (!seg) return { all: true, reason: `rota de API sem segmento: ${f}` };
      groups.push([seg]);
    } else if (/^src\/app\//.test(f)) {
      const route = routeOf(f);
      if (!route) return { all: true, reason: `rota sem segmento estático: ${f}` };
      groups.push([route]);
    } else if (/^src\/(domain|application)\//.test(f)) {
      const slug = f.split('/')[2];
      const rotas = SLUG_ROTAS[slug];
      if (!rotas) return { all: true, reason: `pasta sem mapa de rotas: ${slug}` };
      groups.push(rotas);
    } else if (/^src\//.test(f)) return { all: true, reason: `arquivo de src sem mapa: ${f}` };
  }
  const picked = new Set(direct);
  for (const group of groups) {
    const found = specs.filter((s) => group.some((key) => matches(s, key)));
    if (found.length === 0) return { all: true, reason: `nenhum spec cobre «${group.join(', ')}»` };
    for (const s of found) picked.add(s.file);
  }
  return { all: false, specs: [...picked].sort(), reason: `${groups.length} grupo(s) de rota, ${direct.size} spec(s) alterado(s)` };
}

function main(): void {
  const base = detectBase();
  const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], { encoding: 'utf8' });
  const changed = diff.stdout.split('\n').filter(Boolean);
  const specs = readdirSync('e2e')
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => ({ file: `e2e/${f}`, text: readFileSync(`e2e/${f}`, 'utf8') }));
  const impact = impactedSpecs(changed, specs);
  console.error(`impacto E2E (${base}): ${impact.all ? 'TODOS' : `${impact.specs.length} spec(s)`} · ${impact.reason}`);
  console.log(impact.all ? 'ALL' : impact.specs.join(' ') || 'NONE');
}

if (process.argv[1]?.endsWith('scripts/gate/impacto.ts')) main();
