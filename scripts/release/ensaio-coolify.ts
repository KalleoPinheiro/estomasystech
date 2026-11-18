/**
 * Simulador do Coolify e do site público para o ensaio do rollback automático (ADR-113, #925).
 *
 * Fala HTTPS e HTTP na MESMA porta (o primeiro byte decide: 0x16 é TLS), porque a fumaça confere o
 * redirecionamento de `http://host/login` para HTTPS na porta que a URL traz. Só roda no Actions ou na máquina do
 * dev, em 127.0.0.1, sem dado real e sem segredo: o token é um valor fixo de ensaio.
 *
 * Contrato do Coolify reproduzido (o que os scripts de `scripts/release/` usam, Coolify 4.x):
 *   GET   /api/v1/applications/:uuid        -> { git_commit_sha, is_auto_deploy_enabled }
 *   PATCH /api/v1/applications/:uuid        -> fixa git_commit_sha
 *   POST  /api/v1/deploy?uuid&force         -> { deployments: [{ deployment_uuid }] }; implanta o commit fixado
 *                                              (HEAD = o commit NOVO)
 *   GET   /api/v1/deployments/:id           -> in_progress na 1ª leitura, finished (ou failed) depois
 * O site público serve o que foi implantado por último: o commit NOVO é "quebrado de propósito" (readiness 503),
 * o ANTERIOR é saudável.
 *
 * Controle (só do ensaio): GET /__estado, POST /__modo/<normal|rollback-falha>.
 *
 * Variáveis: ENSAIO_CERT, ENSAIO_KEY, ENSAIO_PORTA_ARQUIVO, ENSAIO_UUID, ENSAIO_TOKEN,
 *   ENSAIO_SHA_ANTERIOR, ENSAIO_SHA_NOVO, ENSAIO_VERSAO_ANTERIOR, ENSAIO_VERSAO_NOVA.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

function env(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`defina ${nome}`);
    process.exit(2);
  }
  return valor;
}

const uuid = env('ENSAIO_UUID');
const token = env('ENSAIO_TOKEN');
const anterior = env('ENSAIO_SHA_ANTERIOR');
const novo = env('ENSAIO_SHA_NOVO');
const versoes: Record<string, string> = {
  [anterior]: env('ENSAIO_VERSAO_ANTERIOR'),
  [novo]: env('ENSAIO_VERSAO_NOVA'),
};

type Implantacao = { alvo: string; leituras: number };
const estado = {
  gitCommitSha: 'HEAD',
  implantado: anterior,
  modo: 'normal' as 'normal' | 'rollback-falha',
  patches: [] as string[],
  deploys: [] as string[],
};
const implantacoes = new Map<string, Implantacao>();

const CABECALHOS_SEGUROS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'content-security-policy': "default-src 'self'; script-src 'nonce-ensaio'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

function json(res: http.ServerResponse, codigo: number, corpo: unknown): void {
  res.writeHead(codigo, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let dados = '';
    req.on('data', (c) => {
      dados += c;
    });
    req.on('end', () => resolve(dados));
  });
}

function coolify(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  corpo: string,
): void {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, 401, { message: 'Unauthenticated.' });
    return;
  }
  const app = `/api/v1/applications/${uuid}`;
  if (url.pathname === app && req.method === 'GET') {
    json(res, 200, {
      uuid,
      git_commit_sha: estado.gitCommitSha,
      is_auto_deploy_enabled: false,
    });
    return;
  }
  if (url.pathname === app && req.method === 'PATCH') {
    const sha = (JSON.parse(corpo || '{}') as { git_commit_sha?: string })
      .git_commit_sha;
    if (!sha) {
      json(res, 422, { message: 'git_commit_sha ausente' });
      return;
    }
    estado.gitCommitSha = sha;
    estado.patches.push(sha);
    json(res, 200, { message: 'Application updated.' });
    return;
  }
  if (url.pathname === '/api/v1/deploy' && req.method === 'POST') {
    if (url.searchParams.get('uuid') !== uuid) {
      json(res, 404, { message: 'Resource not found.' });
      return;
    }
    const id = `dep${estado.deploys.length + 1}`;
    const alvo = estado.gitCommitSha === 'HEAD' ? novo : estado.gitCommitSha;
    estado.deploys.push(alvo);
    implantacoes.set(id, { alvo, leituras: 0 });
    json(res, 200, { deployments: [{ deployment_uuid: id }] });
    return;
  }
  const dep = /^\/api\/v1\/deployments\/([A-Za-z0-9]+)$/.exec(url.pathname);
  const implantacao = dep ? implantacoes.get(dep[1] as string) : undefined;
  if (implantacao && req.method === 'GET') {
    implantacao.leituras += 1;
    if (implantacao.leituras < 2) {
      json(res, 200, { status: 'in_progress', commit: implantacao.alvo });
      return;
    }
    if (estado.modo === 'rollback-falha' && implantacao.alvo === anterior) {
      json(res, 200, { status: 'failed', commit: implantacao.alvo });
      return;
    }
    estado.implantado = implantacao.alvo;
    json(res, 200, { status: 'finished', commit: implantacao.alvo });
    return;
  }
  json(res, 404, { message: 'Not found.' });
}

function publico(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  seguro: boolean,
): void {
  if (!seguro) {
    res.writeHead(301, { location: `https://${req.headers.host}${url.pathname}` });
    res.end();
    return;
  }
  const saudavel = estado.implantado === anterior;
  const pronto = saudavel
    ? { database: 'ok', migrations: 'ok' }
    : { database: 'ok', migrations: 'pendente' };
  if (url.pathname === '/api/health') {
    json(res, 200, { status: 'ok' });
  } else if (url.pathname === '/api/health/ready') {
    json(res, saudavel ? 200 : 503, pronto);
  } else if (url.pathname === '/api/health/version') {
    json(res, 200, {
      success: true,
      data: { version: versoes[estado.implantado] },
      error: null,
    });
  } else if (url.pathname === '/login') {
    res.writeHead(200, { 'content-type': 'text/html', ...CABECALHOS_SEGUROS });
    res.end('<html></html>');
  } else if (req.method === 'POST' && url.pathname.endsWith('/run')) {
    json(res, 401, { error: 'unauthorized' });
  } else {
    json(res, 404, { error: 'not found' });
  }
}

async function tratar(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  seguro: boolean,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'https://ensaio.invalid');
  const corpo = await lerCorpo(req);
  if (url.pathname === '/__estado') {
    json(res, 200, estado);
  } else if (url.pathname.startsWith('/__modo/') && req.method === 'POST') {
    estado.modo = url.pathname.endsWith('rollback-falha')
      ? 'rollback-falha'
      : 'normal';
    json(res, 200, { modo: estado.modo });
  } else if (url.pathname.startsWith('/api/v1/')) {
    coolify(req, res, url, corpo);
  } else {
    publico(req, res, url, seguro);
  }
}

const tls = https.createServer(
  {
    cert: readFileSync(env('ENSAIO_CERT')),
    key: readFileSync(env('ENSAIO_KEY')),
  },
  (req, res) => void tratar(req, res, true),
);
const claro = http.createServer((req, res) => void tratar(req, res, false));

// Portas internas (efêmeras) de cada protocolo; a porta pública só decide para qual delas encaminhar.
function escutar(servidor: net.Server): Promise<number> {
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      resolve((servidor.address() as net.AddressInfo).port);
    });
  });
}
Promise.all([escutar(tls), escutar(claro)]).then(([portaTls, portaClaro]) => {

const porta = net.createServer((entrada) => {
  entrada.once('data', (primeiro) => {
    // 0x16 é o início de um handshake TLS; qualquer outra coisa é HTTP puro.
    const saida = net.connect(primeiro[0] === 0x16 ? portaTls : portaClaro, '127.0.0.1');
    saida.write(primeiro);
    entrada.pipe(saida);
    saida.pipe(entrada);
    const encerrar = () => {
      entrada.destroy();
      saida.destroy();
    };
    entrada.on('error', encerrar);
    saida.on('error', encerrar);
    entrada.on('close', encerrar);
    saida.on('close', encerrar);
  });
});
porta.listen(0, '127.0.0.1', () => {
  const { port } = porta.address() as net.AddressInfo;
  writeFileSync(env('ENSAIO_PORTA_ARQUIVO'), String(port));
});
});
