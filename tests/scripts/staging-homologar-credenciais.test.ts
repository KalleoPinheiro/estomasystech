import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(__dirname, '../..');
const workflowPath = join(root, '.github/workflows/staging.yml');
const REPO = 'KalleoPinheiro/estomasystech';
const RELEASE = 'release/v0.7.0';
const MARCA = 'refs/heads/homologacao/v0.7.0';
const LEITURA = 'token-leitura-hermetico';
const ESCRITA = 'token-escrita-hermetico';
const RECUSADO = 'token-recusado-hermetico';

const gitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

type Passo = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type Job = {
  env?: Record<string, string>;
  steps?: Passo[];
};

type Workflow = { jobs: Record<string, Job> };

type Cenario = {
  fetchStatus: number;
  fetchObjetos: string;
  fetchLog: string;
  configLimpo: string;
  npmStatus: number;
  playwrightStatus: number;
  validacaoStatus: number;
  fakeLog: string;
  pushStatus: number;
  pushRef: string;
  pushConfig: string;
  pushLog: string;
  authStatus: number;
  authRef: string;
  authLog: string;
  movedStatus: number;
  movedOut: string;
  movedRef: string;
  treeStatus: number;
  treeOut: string;
  treeRef: string;
  refsAntes: string;
  refsDepois: string;
  serverLog: string;
};

const mapaExpressoes: Record<string, string> = {
  '${{ inputs.release_branch }}': RELEASE,
  '${{ github.token }}': LEITURA,
  '${{ secrets.RELEASE_CUT_TOKEN }}': ESCRITA,
  '${{ secrets.STAGING_SEED_PASSWORD }}': 'senha-ficticia',
  '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}': 'bypass-ficticio',
  '${{ steps.deploy.outputs.url }}': 'https://staging.example.test',
};

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function lerWorkflow(): Workflow {
  const doc: unknown = parse(readFileSync(workflowPath, 'utf8'));
  if (!ehObjeto(doc) || !ehObjeto(doc.jobs)) {
    throw new Error('staging.yml sem jobs');
  }
  return { jobs: doc.jobs as Record<string, Job> };
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnv,
  }).trim();
}

function passo(job: Job, nome: string): Passo {
  const achado = (job.steps ?? []).find((item) => item.name === nome);
  if (!achado) throw new Error(`passo ausente: ${nome}`);
  return achado;
}

function ambiente(job: Job, step: Passo): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(job.env ?? {})) {
    env[chave] = String(valor);
  }
  for (const [chave, valor] of Object.entries(step.env ?? {})) {
    env[chave] = String(valor);
  }
  return env;
}

function vezes(texto: string, agulha: string): number {
  return texto.split(agulha).length - 1;
}

function secao(log: string, nome: string): string {
  const marca = `MARK ${nome}\n`;
  const inicio = log.indexOf(marca);
  if (inicio < 0) return '';
  const resto = log.slice(inicio + marca.length);
  const fim = resto.indexOf('\nMARK ');
  return fim < 0 ? resto : resto.slice(0, fim);
}

function checkouts(jobs: Record<string, Job>) {
  const lista: { job: string; persist: unknown }[] = [];
  for (const [nome, job] of Object.entries(jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses?.startsWith('actions/checkout@')) {
        lista.push({
          job: nome,
          persist: step.with?.['persist-credentials'],
        });
      }
    }
  }
  return lista;
}

const workflow = lerWorkflow();
const homologar = workflow.jobs.homologar;
if (!homologar) throw new Error('job homologar ausente');
const arvore = passo(homologar, 'A staging publicada tem a árvore da release');
const deploy = passo(
  homologar,
  'Esperar o deploy de Production do SHA da staging',
);
const marca = passo(homologar, 'Gravar a marca de homologação');
const LIMPA_HEADER = 'git -c http.https://github.com/.extraheader=';

describe('Feature: o job homologar autentica sem persistir o token (#767)', () => {
  it('Dado o workflow, Quando o YAML é lido, Então só o checkout do homologar desliga persist-credentials', () => {
    expect(checkouts(workflow.jobs).filter((c) => c.persist === false)).toEqual(
      [{ job: 'homologar', persist: false }],
    );
  });

  it('Dado o job, Então o GH_TOKEN não está no ambiente do job e só os passos de leitura o declaram', () => {
    expect(homologar.env?.GH_TOKEN).toBeUndefined();
    expect(JSON.stringify(homologar.env ?? {})).not.toContain(
      'RELEASE_CUT_TOKEN',
    );
    for (const step of [arvore, deploy, marca]) {
      expect(step.env?.GH_TOKEN).toBe('${{ github.token }}');
    }
    for (const step of homologar.steps ?? []) {
      if (step === arvore || step === deploy || step === marca) continue;
      const env = ambiente(homologar, step);
      expect(env.GH_TOKEN, step.name ?? step.run ?? step.uses).toBeUndefined();
      expect(env.CUT_TOKEN).toBeUndefined();
    }
  });

  it('Dado o fetch e o ls-remote, Então usam helper transitório e não gravam git config', () => {
    expect(vezes(arvore.run ?? '', LIMPA_HEADER)).toBe(1);
    expect(arvore.run).toContain('credential.helper=');
    expect(arvore.run).toContain('password=${GH_TOKEN}');
    expect(arvore.run).toContain(
      'fetch --quiet origin "${RELEASE_SHA}" "${STAGING_SHA}"',
    );
    expect(vezes(marca.run ?? '', LIMPA_HEADER)).toBe(2);
    expect(marca.run).toContain(
      'ls-remote origin "refs/heads/${RELEASE_BRANCH}"',
    );
    expect(marca.run).not.toContain('git config');
    expect(arvore.run).not.toContain('git config');
    expect(marca.run).not.toContain('gh auth setup-git');
  });

  it('Dado o push da marca, Então o extraheader é zerado e o refspec é só homologacao/vX.Y.Z no RELEASE_SHA', () => {
    const push = (marca.run ?? '')
      .split('\n')
      .map((linha) => linha.trim())
      .find((linha) => linha.includes(' push '));
    expect(push).toBe(
      'git -c http.https://github.com/.extraheader= push --force "https://x-access-token:${CUT_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "${RELEASE_SHA}:refs/heads/homologacao/${version}"',
    );
    expect(marca.env?.CUT_TOKEN).toBe('${{ secrets.RELEASE_CUT_TOKEN }}');
    expect(marca.if).toBeUndefined();
    expect(marca.run).not.toContain('always()');
    expect(JSON.stringify(homologar)).not.toContain('continue-on-error');
    expect(marca.run).toContain('A release andou');
    expect(marca.run).toContain('^{tree}');
  });
});

const SERVIDOR = String.raw`
import base64, os, ssl, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.environ["GIT_HTTP_ROOT"]
LOG = os.environ["AUTH_LOG"]
LEITURA = os.environ["TOKEN_LEITURA"]
ESCRITA = os.environ["TOKEN_ESCRITA"]

def note(msg):
    with open(LOG, "a", encoding="utf8") as handle:
        handle.write(msg + "\n")

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def _handle(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        path, _, query = self.path.partition("?")
        service = "receive" if "git-receive-pack" in path or "service=git-receive-pack" in query else "upload"
        raw = self.headers.get("Authorization", "")
        decoded = "empty"
        if raw.lower().startswith("basic "):
            decoded = base64.b64decode(raw.split()[1]).decode()
        esperado = ESCRITA if service == "receive" else LEITURA
        if decoded != "x-access-token:" + esperado:
            note(service + " DENY " + decoded)
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="git"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        note(service + " OK " + decoded)
        env = os.environ.copy()
        env.update({
            "GIT_PROJECT_ROOT": ROOT,
            "GIT_HTTP_EXPORT_ALL": "1",
            "REQUEST_METHOD": self.command,
            "PATH_INFO": path,
            "QUERY_STRING": query,
            "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            "CONTENT_LENGTH": str(len(body)),
            "REMOTE_USER": "tester",
            "REMOTE_ADDR": "127.0.0.1",
            "AUTH_TYPE": "Basic",
        })
        proto = self.headers.get("Git-Protocol")
        if proto:
            env["GIT_PROTOCOL"] = proto
        proc = subprocess.run(["git", "http-backend"], input=body, capture_output=True, env=env)
        data = proc.stdout
        sep = data.find(b"\r\n\r\n")
        hlen = 4
        if sep < 0:
            sep = data.find(b"\n\n")
            hlen = 2
        header = data[:sep] if sep >= 0 else data
        rest = data[sep + hlen :] if sep >= 0 else b""
        status = 200
        headers = []
        for line in header.splitlines():
            if line.lower().startswith(b"status:"):
                status = int(line.split()[1])
            elif b":" in line:
                key, value = line.split(b":", 1)
                headers.append((key.decode(), value.decode().strip()))
        self.send_response(status)
        for key, value in headers:
            if key.lower() != "content-length":
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(rest)))
        self.end_headers()
        self.wfile.write(rest)

import threading
server = ThreadingHTTPServer(("127.0.0.1", 443), Handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(os.environ["CERT"], os.environ["KEY"])
server.socket = context.wrap_socket(server.socket, server_side=True)
threading.Thread(target=server.serve_forever, daemon=True).start()
note("SERVER_UP")
threading.Event().wait()
`;

function escreverEnv(caminho: string, env: Record<string, string>): void {
  const linhas = Object.entries(env).map(([chave, valor]) => {
    if (valor.includes("'")) throw new Error(`valor inseguro em ${chave}`);
    return `${chave}='${valor}'`;
  });
  writeFileSync(caminho, `${linhas.join('\n')}\n`);
}

function resolver(
  job: Job,
  step: Passo,
  shas: { rel: string; stg: string },
  extra: Record<string, string>,
): Record<string, string> {
  const mapa: Record<string, string> = {
    ...mapaExpressoes,
    '${{ needs.rebuild.outputs.release_sha }}': shas.rel,
    '${{ needs.rebuild.outputs.staging_sha }}': shas.stg,
  };
  const env: Record<string, string> = {
    GITHUB_REPOSITORY: REPO,
    GITHUB_STEP_SUMMARY: extra.summary ?? '',
    GIT_TERMINAL_PROMPT: '0',
  };
  for (const [chave, valor] of Object.entries(ambiente(job, step))) {
    env[chave] = mapa[valor] ?? valor;
  }
  for (const [chave, valor] of Object.entries(extra)) {
    if (chave !== 'summary') env[chave] = valor;
  }
  return env;
}

function prepararBare(dir: string): {
  bare: string;
  rel: string;
  stg: string;
  other: string;
} {
  const bare = join(dir, 'srv/KalleoPinheiro/estomasystech.git');
  const seed = join(dir, 'seed');
  mkdirSync(join(dir, 'srv/KalleoPinheiro'), { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], {
    env: gitEnv,
  });
  git(bare, ['config', 'http.receivepack', 'true']);
  git(bare, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  git(bare, ['config', 'uploadpack.allowReachableSHA1InWant', 'true']);
  execFileSync('git', ['init', '-q', '-b', 'main', seed], { env: gitEnv });
  writeFileSync(join(seed, 'a.txt'), 'base');
  git(seed, ['add', 'a.txt']);
  git(seed, ['commit', '-q', '-m', 'base']);
  const rel = git(seed, ['rev-parse', 'HEAD']);
  git(seed, ['branch', RELEASE]);
  git(seed, ['commit', '-q', '--allow-empty', '-m', 'staging']);
  const stg = git(seed, ['rev-parse', 'HEAD']);
  writeFileSync(join(seed, 'other.txt'), 'other');
  git(seed, ['add', 'other.txt']);
  git(seed, ['commit', '-q', '-m', 'other']);
  const other = git(seed, ['rev-parse', 'HEAD']);
  git(seed, ['remote', 'add', 'origin', bare]);
  git(seed, ['push', '-q', 'origin', 'main', RELEASE]);
  git(seed, [
    'push',
    '-q',
    'origin',
    `${stg}:refs/tmp/staging`,
    `${other}:refs/tmp/other`,
  ]);
  return { bare, rel, stg, other };
}

function workVazio(dir: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: gitEnv });
  writeFileSync(join(dir, 'local.txt'), 'local');
  git(dir, ['add', 'local.txt']);
  git(dir, ['commit', '-q', '-m', 'local']);
  git(dir, ['remote', 'add', 'origin', `https://github.com/${REPO}.git`]);
}

function workComObjetos(dir: string, bare: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: gitEnv });
  git(dir, ['remote', 'add', 'origin', bare]);
  git(dir, ['fetch', '-q', 'origin']);
  git(dir, ['checkout', '-q', '--detach', 'origin/main']);
  git(dir, ['remote', 'set-url', 'origin', `https://github.com/${REPO}.git`]);
}

function gravarHeader(dirWork: string): void {
  const b64 = Buffer.from(`x-access-token:${LEITURA}`).toString('base64');
  git(dirWork, [
    'config',
    'http.https://github.com/.extraheader',
    `AUTHORIZATION: basic ${b64}`,
  ]);
}

function lerNumero(dir: string, nome: string): number {
  return Number(readFileSync(join(dir, nome), 'utf8').trim());
}

function lerTexto(dir: string, nome: string): string {
  return readFileSync(join(dir, nome), 'utf8');
}

function existe(caminho: string): string {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return '';
  }
}

function rodarPrivado(job: Job): Cenario {
  const dir = mkdtempSync(join(tmpdir(), 'homologar-cred-'));
  try {
    const { bare, rel, stg, other } = prepararBare(dir);
    const limpo = join(dir, 'limpo');
    const pushWork = join(dir, 'push');
    const authWork = join(dir, 'auth');
    const movedWork = join(dir, 'moved');
    const treeWork = join(dir, 'tree');
    workVazio(limpo);
    for (const pasta of [pushWork, authWork, movedWork, treeWork]) {
      workComObjetos(pasta, bare);
    }
    gravarHeader(pushWork);
    writeFileSync(join(treeWork, 'diferente.txt'), 'outra-arvore');
    git(treeWork, ['add', 'diferente.txt']);
    git(treeWork, ['commit', '-q', '-m', 'arvore diferente']);
    const stgDiferente = git(treeWork, ['rev-parse', 'HEAD']);
    const summary = join(dir, 'summary.md');
    writeFileSync(summary, '');
    const shas = { rel, stg };
    escreverEnv(
      join(dir, 'env-fetch'),
      resolver(job, arvore, shas, { summary }),
    );
    escreverEnv(
      join(dir, 'env-npm'),
      resolver(job, passoPorRun(job, 'npm ci'), shas, { summary }),
    );
    escreverEnv(
      join(dir, 'env-playwright'),
      resolver(job, passoPorRun(job, 'npx playwright'), shas, { summary }),
    );
    escreverEnv(
      join(dir, 'env-validacao'),
      resolver(
        job,
        passo(job, 'Validação logada (3 papéis, 4 larguras)'),
        shas,
        { summary },
      ),
    );
    escreverEnv(join(dir, 'env-push'), resolver(job, marca, shas, { summary }));
    escreverEnv(
      join(dir, 'env-auth'),
      resolver(job, marca, shas, { summary, GH_TOKEN: RECUSADO }),
    );
    escreverEnv(
      join(dir, 'env-moved'),
      resolver(job, marca, shas, { summary }),
    );
    escreverEnv(
      join(dir, 'env-tree'),
      resolver(job, marca, { rel, stg: stgDiferente }, { summary }),
    );
    writeFileSync(join(dir, 'fetch.sh'), arvore.run ?? '');
    writeFileSync(join(dir, 'npm.sh'), passoPorRun(job, 'npm ci').run ?? '');
    writeFileSync(
      join(dir, 'playwright.sh'),
      passoPorRun(job, 'npx playwright').run ?? '',
    );
    writeFileSync(
      join(dir, 'validacao.sh'),
      passo(job, 'Validação logada (3 papéis, 4 larguras)').run ?? '',
    );
    writeFileSync(join(dir, 'marca.sh'), marca.run ?? '');
    writeFileSync(join(dir, 'server.py'), SERVIDOR);
    const fake = join(dir, 'fake-bin');
    mkdirSync(fake);
    writeFileSync(
      join(fake, 'comando'),
      '#!/bin/sh\necho "$0 $*" >> "$FAKE_LOG"\nif [ -n "${GH_TOKEN:-}${CUT_TOKEN:-}${RELEASE_CUT_TOKEN:-}" ]; then exit 86; fi\nif env | grep -F \'' +
        LEITURA +
        "' >/dev/null; then exit 86; fi\nif env | grep -F '" +
        ESCRITA +
        "' >/dev/null; then exit 86; fi\nexit 0\n",
    );
    execFileSync('chmod', ['+x', join(fake, 'comando')]);
    for (const nome of ['npm', 'npx', 'node']) {
      symlinkSync(join(fake, 'comando'), join(fake, nome));
    }
    const cert = join(dir, 'cert.pem');
    const key = join(dir, 'key.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-nodes',
        '-subj',
        '/CN=github.com',
        '-addext',
        'subjectAltName=DNS:github.com',
      ],
      { stdio: 'ignore' },
    );
    writeFileSync(join(dir, 'hosts'), '127.0.0.1 github.com\n');
    writeFileSync(join(dir, 'roteiro.sh'), roteiro(dir, { rel, stg, other }));
    const execucao = spawnSync(
      'unshare',
      ['--net', '--mount', '--map-root-user', 'bash', join(dir, 'roteiro.sh')],
      { encoding: 'utf8', timeout: 50_000 },
    );
    if (execucao.status !== 0) {
      const detalhe = [
        execucao.stdout,
        execucao.stderr,
        existe(join(dir, 'server.err')),
        existe(join(dir, 'server.log')),
        existe(join(dir, 'fetch.out')),
      ].join('\n');
      throw new Error(
        `harness privado falhou (${execucao.status}): ${detalhe}`,
      );
    }
    return {
      fetchStatus: lerNumero(dir, 'fetch.status'),
      fetchObjetos: lerTexto(dir, 'fetch.objects').trim(),
      fetchLog: lerTexto(dir, 'fetch.out'),
      configLimpo: lerTexto(limpo, '.git/config'),
      npmStatus: lerNumero(dir, 'npm.status'),
      playwrightStatus: lerNumero(dir, 'playwright.status'),
      validacaoStatus: lerNumero(dir, 'validacao.status'),
      fakeLog: lerTexto(dir, 'fake.log'),
      pushStatus: lerNumero(dir, 'push.status'),
      pushRef: lerTexto(dir, 'push.ref').trim(),
      pushConfig: lerTexto(pushWork, '.git/config'),
      pushLog: lerTexto(dir, 'server.log'),
      authStatus: lerNumero(dir, 'auth.status'),
      authRef: lerTexto(dir, 'auth.ref').trim(),
      authLog: lerTexto(dir, 'server.log'),
      movedStatus: lerNumero(dir, 'moved.status'),
      movedOut: lerTexto(dir, 'moved.out'),
      movedRef: lerTexto(dir, 'moved.ref').trim(),
      treeStatus: lerNumero(dir, 'tree.status'),
      treeOut: lerTexto(dir, 'tree.out'),
      treeRef: lerTexto(dir, 'tree.ref').trim(),
      refsAntes: lerTexto(dir, 'refs.before'),
      refsDepois: lerTexto(dir, 'refs.after'),
      serverLog: lerTexto(dir, 'server.log'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function passoPorRun(job: Job, prefixo: string): Passo {
  const achado = (job.steps ?? []).find((item) =>
    item.run?.startsWith(prefixo),
  );
  if (!achado) throw new Error(`passo ausente: ${prefixo}`);
  return achado;
}

function roteiro(
  dir: string,
  shas: { rel: string; stg: string; other: string },
): string {
  return String.raw`
set -euo pipefail
if [ -x /usr/sbin/ip ]; then /usr/sbin/ip link set lo up
elif [ -x /sbin/ip ]; then /sbin/ip link set lo up
elif command -v ip >/dev/null 2>&1; then ip link set lo up
else /usr/sbin/ifconfig lo up
fi
mount --bind '${dir}/hosts' /etc/hosts
resolvido=$(getent hosts github.com | awk '{print $1; exit}')
if [ "$resolvido" != "127.0.0.1" ]; then
  echo "github.com nao isolado: $resolvido" >&2
  exit 1
fi
export CERT='${dir}/cert.pem' KEY='${dir}/key.pem'
export GIT_HTTP_ROOT='${dir}/srv' AUTH_LOG='${dir}/server.log'
export TOKEN_LEITURA='${LEITURA}' TOKEN_ESCRITA='${ESCRITA}'
: > "$AUTH_LOG"
: > '${dir}/fake.log'
python3 '${dir}/server.py' > '${dir}/server.err' 2>&1 &
pid=$!
trap 'ec=$?; kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; exit "$ec"' EXIT
for _ in $(seq 1 50); do
  grep -q SERVER_UP "$AUTH_LOG" && break
  sleep 0.05
done
grep -q SERVER_UP "$AUTH_LOG"
git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' show-ref > '${dir}/refs.before'
set +e
rodar() {
  (
    cd "$2" || exit 97
    env -i \
      PATH="$1" HOME="$HOME" \
      GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 \
      GIT_CONFIG_COUNT=2 \
      GIT_CONFIG_KEY_0=http.sslCAInfo GIT_CONFIG_VALUE_0="$CERT" \
      GIT_CONFIG_KEY_1=http.version GIT_CONFIG_VALUE_1=HTTP/1.1 \
      FAKE_LOG='${dir}/fake.log' \
      bash -c 'set -a; source "$1"; set +a; bash "$2"' _ "$3" "$4" >"$5" 2>&1
    echo $? > "$6"
  )
}
PATH_GIT="$PATH"
PATH_FAKE='${dir}/fake-bin':"$PATH"
echo 'MARK fetch' >> "$AUTH_LOG"
rodar "$PATH_GIT" '${dir}/limpo' '${dir}/env-fetch' '${dir}/fetch.sh' '${dir}/fetch.out' '${dir}/fetch.status'
if git -C '${dir}/limpo' cat-file -e '${shas.rel}^{commit}' && git -C '${dir}/limpo' cat-file -e '${shas.stg}^{commit}'; then
  echo ok > '${dir}/fetch.objects'
else
  echo no > '${dir}/fetch.objects'
fi
echo 'MARK install' >> "$AUTH_LOG"
rodar "$PATH_FAKE" '${dir}/limpo' '${dir}/env-npm' '${dir}/npm.sh' '${dir}/npm.out' '${dir}/npm.status'
rodar "$PATH_FAKE" '${dir}/limpo' '${dir}/env-playwright' '${dir}/playwright.sh' '${dir}/playwright.out' '${dir}/playwright.status'
rodar "$PATH_FAKE" '${dir}/limpo' '${dir}/env-validacao' '${dir}/validacao.sh' '${dir}/validacao.out' '${dir}/validacao.status'
echo 'MARK auth' >> "$AUTH_LOG"
rodar "$PATH_GIT" '${dir}/auth' '${dir}/env-auth' '${dir}/marca.sh' '${dir}/auth.out' '${dir}/auth.status'
if git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' rev-parse --verify -q '${MARCA}' >/dev/null; then
  echo yes > '${dir}/auth.ref'
else
  echo no > '${dir}/auth.ref'
fi
git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' update-ref 'refs/heads/${RELEASE}' '${shas.other}'
echo 'MARK moved' >> "$AUTH_LOG"
rodar "$PATH_GIT" '${dir}/moved' '${dir}/env-moved' '${dir}/marca.sh' '${dir}/moved.out' '${dir}/moved.status'
if git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' rev-parse --verify -q '${MARCA}' >/dev/null; then
  echo yes > '${dir}/moved.ref'
else
  echo no > '${dir}/moved.ref'
fi
git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' update-ref 'refs/heads/${RELEASE}' '${shas.rel}'
echo 'MARK tree' >> "$AUTH_LOG"
rodar "$PATH_GIT" '${dir}/tree' '${dir}/env-tree' '${dir}/marca.sh' '${dir}/tree.out' '${dir}/tree.status'
if git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' rev-parse --verify -q '${MARCA}' >/dev/null; then
  echo yes > '${dir}/tree.ref'
else
  echo no > '${dir}/tree.ref'
fi
echo 'MARK push' >> "$AUTH_LOG"
rodar "$PATH_GIT" '${dir}/push' '${dir}/env-push' '${dir}/marca.sh' '${dir}/push.out' '${dir}/push.status'
git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' rev-parse '${MARCA}' > '${dir}/push.ref' 2>'${dir}/push.ref.err' || echo MISSING > '${dir}/push.ref'
git -C '${dir}/srv/KalleoPinheiro/estomasystech.git' show-ref > '${dir}/refs.after'
`;
}

describe('Feature: repositório privado simulado, sem credencial no .git/config (#767)', () => {
  let cenario: Cenario;

  beforeAll(() => {
    cenario = rodarPrivado(homologar);
  }, 60_000);

  it('Dado o checkout sem header persistido, Quando busca os dois SHAs, Então a leitura autentica e o token não fica no .git/config', () => {
    expect(cenario.fetchStatus, cenario.fetchLog).toBe(0);
    expect(cenario.fetchObjetos).toBe('ok');
    expect(secao(cenario.serverLog, 'fetch')).toContain(
      `upload OK x-access-token:${LEITURA}`,
    );
    expect(cenario.configLimpo).not.toContain(LEITURA);
    expect(cenario.configLimpo).not.toContain(ESCRITA);
    expect(cenario.configLimpo).not.toContain('extraheader');
  });

  it('Dado npm ci, Playwright e a validação, Então o token não entra no ambiente nem no .git/config', () => {
    expect(cenario.npmStatus).toBe(0);
    expect(cenario.playwrightStatus).toBe(0);
    expect(cenario.validacaoStatus).toBe(0);
    expect(cenario.fakeLog).toContain('/npm ');
    expect(cenario.fakeLog).toContain('/npx ');
    expect(cenario.fakeLog).toContain('/node ');
    expect(cenario.configLimpo).not.toContain('AUTHORIZATION');
  });

  it('Dado o header antigo do checkout, Quando grava a marca, Então o PAT vence e o push vai só para homologacao/vX.Y.Z', () => {
    expect(cenario.pushStatus, cenario.serverLog).toBe(0);
    expect(cenario.pushRef).toBe(
      cenario.refsAntes.match(
        new RegExp(`^(\\w+) refs/heads/${RELEASE}$`, 'm'),
      )?.[1] ?? '',
    );
    const antes = cenario.refsAntes.split('\n').filter(Boolean).sort();
    const depois = cenario.refsDepois.split('\n').filter(Boolean).sort();
    const novos = depois.filter((linha) => !antes.includes(linha));
    expect(novos).toEqual([`${cenario.pushRef} ${MARCA}`]);
    expect(antes.filter((linha) => !depois.includes(linha))).toEqual([]);
    const trecho = secao(cenario.serverLog, 'push');
    const recebidos = trecho
      .split('\n')
      .filter((linha) => linha.startsWith('receive'));
    expect(
      recebidos.some((linha) => linha.includes(`OK x-access-token:${ESCRITA}`)),
    ).toBe(true);
    expect(recebidos.some((linha) => linha.includes(LEITURA))).toBe(false);
    expect(trecho).toContain(`upload OK x-access-token:${LEITURA}`);
    expect(trecho).not.toContain(`upload OK x-access-token:${ESCRITA}`);
    const b64 = Buffer.from(`x-access-token:${ESCRITA}`).toString('base64');
    expect(cenario.pushConfig).not.toContain(ESCRITA);
    expect(cenario.pushConfig).not.toContain(b64);
  });

  it('Dado autenticação recusada, Quando a leitura da release falha, Então não há marca', () => {
    expect(cenario.authStatus).not.toBe(0);
    expect(cenario.authRef).toBe('no');
    expect(secao(cenario.authLog, 'auth')).not.toContain('receive OK');
  });

  it('Dado a release andou depois da validação, Então a marca não é gravada', () => {
    expect(cenario.movedStatus).not.toBe(0);
    expect(cenario.movedOut).toContain('A release andou');
    expect(cenario.movedRef).toBe('no');
  });

  it('Dado árvores diferentes, Então a marca não é gravada', () => {
    expect(cenario.treeStatus).not.toBe(0);
    expect(cenario.treeOut).toContain('árvore da staging difere');
    expect(cenario.treeRef).toBe('no');
  });
});
