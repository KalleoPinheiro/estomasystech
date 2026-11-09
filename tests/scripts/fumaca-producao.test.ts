import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * ADR-095, ticket 3 (#748): `scripts/release/fumaca-producao.sh` só lê. Os testes rodam o script
 * de verdade com um curl falso (injetado por FUMACA_CURL) que responde a partir de arquivos.
 */
const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/release/fumaca-producao.sh');
const URL_BASE = 'https://prod.example.test';

let dir: string;

const CSP =
  "content-security-policy: default-src 'self'; script-src 'nonce-abc'";
const SEGURANCA = [
  'strict-transport-security: max-age=63072000',
  CSP,
  'x-frame-options: DENY',
  'x-content-type-options: nosniff',
  'referrer-policy: same-origin',
  'cross-origin-opener-policy: same-origin',
  'cross-origin-resource-policy: same-origin',
];

function resposta(
  chave: string,
  codigo: number,
  cab: string[] = [],
  corpo = '',
) {
  writeFileSync(path.join(dir, `${chave}.code`), String(codigo));
  writeFileSync(path.join(dir, `${chave}.h`), `${cab.join('\r\n')}\r\n`);
  writeFileSync(path.join(dir, `${chave}.b`), corpo);
}

/** Cenário saudável; cada teste sobrescreve só o que quer quebrar. */
function saudavel() {
  resposta('GET__api_health', 200);
  resposta(
    'GET__api_health_ready',
    200,
    [],
    '{"success":true,"data":{"database":"ok","migrations":"ok"},"error":null}',
  );
  resposta('GET__login', 200, SEGURANCA);
  resposta('HTTP_GET__login', 308, [
    'Location: https://prod.example.test/login',
  ]);
  for (const r of ['alerts', 'reminders', 'retention']) {
    resposta(`POST__api_${r}_run`, 401);
  }
  resposta(
    'GET__api_health_version',
    200,
    [],
    '{"success":true,"data":{"version":"0.8.0"},"error":null}',
  );
}

function rodar(extra: Record<string, string> = {}) {
  const r = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FUMACA_CURL: path.join(dir, 'curl'),
      FUMACA_URL: URL_BASE,
      FUMACA_VERSAO: '0.8.0',
      FUMACA_PAUSA: '0',
      FIX: dir,
      ...extra,
    },
  });
  return { saida: r.stdout, erro: r.stderr, codigo: r.status };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'fumaca-'));
  mkdirSync(path.join(dir, 'x'));
  writeFileSync(
    path.join(dir, 'curl'),
    `#!/usr/bin/env bash
metodo=GET; hfile=""; ofile=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -X) metodo="$2"; shift 2;;
    -D) hfile="$2"; shift 2;;
    -o) ofile="$2"; shift 2;;
    -m|-w|-H) shift 2;;
    -*) shift;;
    *) url="$1"; shift;;
  esac
done
echo "$metodo $url" >> "$FIX/chamadas"
pref=""; case "$url" in http://*) pref="HTTP_";; esac
caminho="\${url#*://*/}"; [ "$caminho" = "$url" ] && caminho=""
chave="$pref\${metodo}_$(printf '%s' "/$caminho" | tr '/.' '__')"
if [ "$metodo" = POST ] && [ "$caminho" = "api/auth/login" ]; then
  codigo="$(head -n1 "$FIX/login.seq")"; sed -i 1d "$FIX/login.seq"; echo "$codigo"; exit 0
fi
if [ -z "$hfile" ] && [ "$ofile" = /dev/null ]; then cat "$FIX/rate.code"; exit 0; fi
if [ ! -f "$FIX/$chave.code" ]; then echo 404; : > "$hfile"; exit 0; fi
cp "$FIX/$chave.h" "$hfile"; [ -n "$ofile" ] && cp "$FIX/$chave.b" "$ofile"
cat "$FIX/$chave.code"
`,
  );
  chmodSync(path.join(dir, 'curl'), 0o755);
  saudavel();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Feature: fumaça de produção somente leitura (ADR-095, #748)', () => {
  it('Dado produção saudável, Quando a fumaça roda, Então todos os itens passam e só há leituras e POST sem corpo nas rotas de job', () => {
    const r = rodar();
    expect(r.saida).toContain('OK liveness');
    expect(r.saida).toContain('OK readiness');
    expect(r.saida).toContain('OK hsts');
    expect(r.saida).toContain('OK csp-com-nonce');
    expect(r.saida).toContain('OK versao 0.8.0');
    expect(r.saida.trimEnd().endsWith('FUMACA_OK')).toBe(true);
    expect(r.codigo).toBe(0);
    const chamadas = readFileSync(path.join(dir, 'chamadas'), 'utf8');
    expect(chamadas).not.toContain('/api/auth/login');
  });

  it('Dado readiness com migrações pendentes, Quando a fumaça roda, Então falha em readiness', () => {
    resposta(
      'GET__api_health_ready',
      503,
      [],
      '{"success":false,"data":{"database":"ok","migrations":"pending"},"error":"x"}',
    );
    const r = rodar();
    expect(r.saida).toContain('FALHOU readiness');
    expect(r.codigo).toBe(1);
  });

  it('Dado CSP duplicada, Quando a fumaça roda, Então falha em csp-com-nonce', () => {
    resposta('GET__login', 200, [...SEGURANCA, CSP]);
    expect(rodar().saida).toContain('FALHOU csp-com-nonce: 2 cabeçalho(s)');
  });

  it('Dado CSP sem nonce, Quando a fumaça roda, Então falha em csp-com-nonce', () => {
    resposta('GET__login', 200, [
      ...SEGURANCA.filter((h) => !h.startsWith('content-security-policy')),
      "content-security-policy: default-src 'self'",
    ]);
    expect(rodar().saida).toContain('FALHOU csp-com-nonce');
  });

  it('Dado login sem HSTS e sem x-frame-options, Quando a fumaça roda, Então aponta os dois', () => {
    resposta(
      'GET__login',
      200,
      SEGURANCA.filter(
        (h) => !h.startsWith('strict-transport') && !h.startsWith('x-frame'),
      ),
    );
    const r = rodar();
    expect(r.saida).toContain('FALHOU hsts');
    expect(r.saida).toContain('FALHOU cabecalhos: ausentes: x-frame-options');
  });

  it('Dado HTTP puro sem redirecionar, Quando a fumaça roda, Então falha em redirecionamento-https', () => {
    resposta('HTTP_GET__login', 200);
    expect(rodar().saida).toContain('FALHOU redirecionamento-https');
  });

  it('Dado rota de job aberta (200), Quando a fumaça roda, Então falha apontando a rota', () => {
    resposta('POST__api_alerts_run', 200);
    const r = rodar();
    expect(r.saida).toContain('FALHOU job-fechado /api/alerts/run: HTTP 200');
    expect(r.saida).toContain('OK job-fechado /api/retention/run');
  });

  it('Dado versão diferente da esperada, Quando a fumaça roda, Então falha em versao', () => {
    expect(rodar({ FUMACA_VERSAO: '0.9.0' }).saida).toContain('FALHOU versao');
  });

  it('Dado endpoint de versão que expõe SHA, Quando a fumaça roda, Então falha em versao-publica', () => {
    resposta(
      'GET__api_health_version',
      200,
      [],
      '{"data":{"version":"0.8.0","sha":"abc1234"}}',
    );
    expect(rodar().saida).toContain('FALHOU versao-publica');
  });

  it('Dado SHA do deployment igual ao da tag (prefixo), Quando a fumaça roda, Então sha-implantado ok', () => {
    const r = rodar({
      FUMACA_SHA_ESPERADO: 'abcdef1234567890',
      FUMACA_SHA_IMPLANTADO: 'abcdef1',
    });
    expect(r.saida).toContain('OK sha-implantado');
  });

  it('Dado SHA do deployment diferente do da tag, Quando a fumaça roda, Então falha', () => {
    const r = rodar({
      FUMACA_SHA_ESPERADO: 'abcdef1234567890',
      FUMACA_SHA_IMPLANTADO: '1234567',
    });
    expect(r.saida).toContain('FALHOU sha-implantado');
    expect(r.codigo).toBe(1);
  });

  it('Dado URL que não é https puro, Quando a fumaça roda, Então sai 2 sem chamar a rede', () => {
    const r = rodar({ FUMACA_URL: 'http://prod.example.test' });
    expect(r.codigo).toBe(2);
    expect(() => readFileSync(path.join(dir, 'chamadas'))).toThrow();
  });

  it('Dado versão esperada inválida, Quando a fumaça roda, Então sai 2', () => {
    expect(rodar({ FUMACA_VERSAO: 'v1' }).codigo).toBe(2);
  });

  it('Dado conexão que falha (000), Quando a fumaça roda, Então reprova sem vazar nada', () => {
    rmSync(path.join(dir, 'GET__api_health.code'));
    const r = rodar();
    expect(r.saida).toContain('FALHOU liveness: HTTP 404');
    expect(r.codigo).toBe(1);
  });
});

describe('Feature: fumaca_pesada opcional (ADR-095)', () => {
  beforeEach(() => {
    writeFileSync(
      path.join(dir, 'login.seq'),
      '401\n401\n401\n401\n401\n429\n429\n429\n429\n',
    );
    writeFileSync(path.join(dir, 'rate.code'), '429\n');
  });

  it('Dado 5 × 401 e depois 429 e a rajada limitada, Quando FUMACA_PESADA=1, Então salto-do-proxy e rate-limit ok', () => {
    const r = rodar({ FUMACA_PESADA: '1' });
    expect(r.saida).toContain('OK salto-do-proxy');
    expect(r.saida).toContain('OK rate-limit (300 × 429)');
  });

  it('Dado só 401 nos 9 logins (salto errado), Quando FUMACA_PESADA=1, Então falha em salto-do-proxy', () => {
    writeFileSync(path.join(dir, 'login.seq'), '401\n'.repeat(9));
    expect(rodar({ FUMACA_PESADA: '1' }).saida).toContain(
      'FALHOU salto-do-proxy: 9 × 401 e 0 × 429',
    );
  });

  it('Dado rajada sem nenhum 429, Quando FUMACA_PESADA=1, Então falha em rate-limit', () => {
    writeFileSync(path.join(dir, 'rate.code'), '200\n');
    expect(rodar({ FUMACA_PESADA: '1' }).saida).toContain('FALHOU rate-limit');
  });

  it('Dado a execução padrão, Quando FUMACA_PESADA não está ligado, Então nenhum login é tentado', () => {
    rodar();
    expect(readFileSync(path.join(dir, 'chamadas'), 'utf8')).not.toContain(
      '/api/auth/login',
    );
  });
});
