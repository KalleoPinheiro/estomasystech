// Núcleo puro da validação logada (ADR-099): decide o que conta como achado, sem navegador.

/**
 * @param {Array<{role:string,status:number|null,overflow:number,final:string,route:string,problems:string[],apiFail:string[]}>} results
 * @param {string[]} roles papéis esperados
 * @returns {{ bad: object[], erros: string[] }}
 */
export function avaliar(results, roles) {
  const bad = results.filter(
    (r) => r.problems.length || r.apiFail.length || r.overflow > 0 || (r.status && r.status >= 400) || r.final !== r.route,
  );
  const erros = [];
  if (results.length === 0) erros.push("nenhuma página foi percorrida");
  for (const role of roles) {
    if (!results.some((r) => r.role === role)) erros.push(`o papel ${role} não percorreu nenhuma rota`);
  }
  return { bad, erros };
}
