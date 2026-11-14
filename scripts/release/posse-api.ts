/** Leituras da API do GitHub do `check:posse` (ADR-104). `fetch` injetável para provar a falha fechada. */

export type Buscador = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const cabecalhos = (token: string): Record<string, string> => ({
  ...(token === '' ? {} : { authorization: `Bearer ${token}` }),
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
});

async function obter<T>(buscar: Buscador, caminho: string, token: string): Promise<T> {
  const r = await buscar(`https://api.github.com${caminho}`, { headers: cabecalhos(token) });
  if (!r.ok) throw new Error(`GET ${caminho}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Labels da issue. Qualquer resposta que não seja 2xx lança (o `main` converte em exit 1: falha fechada). */
export async function labelsDaIssue(buscar: Buscador, repo: string, numero: number, token: string): Promise<string[]> {
  const { labels } = await obter<{ labels: ({ name: string } | string)[] }>(buscar, `/repos/${repo}/issues/${numero}`, token);
  return labels.map((l) => (typeof l === 'string' ? l : l.name));
}

/** Corpo e título atuais do PR, lidos ao vivo: editar o corpo e rodar de novo enxerga a edição. */
export async function dadosDoPr(buscar: Buscador, repo: string, numero: number, token: string): Promise<{ corpo: string; titulo: string }> {
  const { body, title } = await obter<{ body: string | null; title: string }>(buscar, `/repos/${repo}/pulls/${numero}`, token);
  return { corpo: body ?? '', titulo: title };
}
