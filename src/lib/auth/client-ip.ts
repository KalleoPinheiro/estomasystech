import type { NextRequest } from 'next/server';

const DEFAULT_TRUSTED_HOPS = 1;

/**
 * Deriva o IP do cliente da cadeia `x-forwarded-for` respeitando a topologia de
 * proxies confiáveis: o cliente controla o INÍCIO da cadeia (forjável); cada
 * proxy confiável appenda ao FINAL. Com N hops confiáveis, o IP real é o
 * N-ésimo a partir do fim. Fora da cadeia → "unknown" (bucket compartilhado,
 * nunca uma chave forjável).
 */
export function clientIpFromHeader(
  header: string | null,
  trustedHops: number = DEFAULT_TRUSTED_HOPS,
): string {
  const hops =
    Number.isFinite(trustedHops) && trustedHops >= 1
      ? Math.floor(trustedHops)
      : DEFAULT_TRUSTED_HOPS;
  const chain = (header ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
  const candidate = chain[chain.length - hops];
  return candidate ?? 'unknown';
}

let missingHeaderWarned = false;

/** Só para testes: permite reemitir o aviso de configuração. */
export function resetClientIpWarning(): void {
  missingHeaderWarned = false;
}

/**
 * Em produção, com proxy confiável esperado (`TRUSTED_PROXY_HOPS ≥ 1`), a
 * ausência de `x-forwarded-for` indica app exposto direto ou proxy que não
 * repassa o cabeçalho: todos os anônimos caem no balde `unknown` (#201).
 * Avisa uma vez por processo em vez de colapsar em silêncio.
 */
function warnMissingForwardedFor(header: string | null, hops: number): void {
  if (
    header !== null ||
    hops < 1 ||
    missingHeaderWarned ||
    process.env.NODE_ENV !== 'production'
  ) {
    return;
  }
  missingHeaderWarned = true;
  console.warn(
    `[config] Requisição sem x-forwarded-for com TRUSTED_PROXY_HOPS=${hops}: ` +
      'o IP do cliente fica "unknown" e anônimos dividem um único balde de rate ' +
      'limit. Configure o proxy reverso para repassar x-forwarded-for ou ajuste ' +
      'TRUSTED_PROXY_HOPS (ver docs/engineering/onboarding.md).',
  );
}

/** IP do cliente da requisição usando `TRUSTED_PROXY_HOPS` (default 1). */
export function clientIp(request: NextRequest): string {
  const header = request.headers.get('x-forwarded-for');
  const hops = Number(process.env.TRUSTED_PROXY_HOPS) || DEFAULT_TRUSTED_HOPS;
  warnMissingForwardedFor(header, hops);
  return clientIpFromHeader(header, hops);
}
