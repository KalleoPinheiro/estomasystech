---
title: "Varredura de segurança"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
related:
  - .specs/features/auditoria-seguranca-dependencias/spec.md
  - .specs/features/ruido-scanners-seguranca/spec.md
---

# Varredura de segurança

> **Regra:** reproduza localmente antes de agir sobre qualquer relatório de scanner hospedado
> (AD-013) — o GitGuard já apontou versões que não existiam mais na árvore. `npm audit` é a
> fonte da verdade para dependências. Baseline esperado: `.specs/STATE.md` § "Baseline de segurança".

## Dependências

```bash
npm audit
```

## Segredos e SAST (sob demanda)

gitleaks e semgrep não estão no `package.json`; instale nas versões que produziram o baseline
(troque o asset `linux_x64` pelo da sua plataforma):

```bash
mkdir -p /tmp/gl && gh release download v8.30.1 --repo gitleaks/gitleaks --pattern 'gitleaks_8.30.1_linux_x64.tar.gz' --dir /tmp/gl --clobber && tar -xzf /tmp/gl/gitleaks_8.30.1_linux_x64.tar.gz -C /tmp/gl gitleaks
uv tool install 'semgrep==1.174.0'
```

Escaneie a árvore de um commit (deixa `node_modules` e build de fora). O `mkdir -p` não é opcional:

```bash
rm -rf /tmp/scan && mkdir -p /tmp/scan && git archive <commit> | tar -x -C /tmp/scan
```

O gitleaks roda **de dentro da árvore, com alvo `.`** — os `paths` do `.gitleaks.toml` são regex
relativas à raiz da varredura:

```bash
cd /tmp/scan && /tmp/gl/gitleaks dir . --no-banner
cd /tmp/scan && semgrep scan --config=p/nodejsscan --config=r/javascript.lang.security.audit.detect-non-literal-regexp --metrics=off src e2e tests scripts
```

## Reproduzir o que o scanner hospedado vê

A precedência do gitleaks é `--config` > `GITLEAKS_CONFIG` > `(alvo)/.gitleaks.toml`: quem passa a
própria config ignora a do repo. Por isso falso positivo leva comentário inline
`gitleaks:allow` / `nosemgrep` na linha (AD-011). Para ver o que o serviço vê, apague a config da cópia:

```bash
rm -rf /tmp/scan-nocfg && mkdir -p /tmp/scan-nocfg && git archive <commit> | tar -x -C /tmp/scan-nocfg && rm -f /tmp/scan-nocfg/.gitleaks.toml && cd /tmp/scan-nocfg && /tmp/gl/gitleaks dir . --no-banner
```

Em `f725554` o resultado é `leaks found: 7`; depois dos comentários inline, `no leaks found`.

## Triagem do `npm audit` (#717, 2026-11-08)

Medido na `release/v0.7.0` com npm 11.21.1 (o `packageManager`; o npm 10 falha com
`Unable to resolve reference $msw` por causa do override do `@vitest/mocker`). Antes: 16 moderadas.
Depois: **7 moderadas, nenhuma alta ou crítica; `npm audit --omit=dev` = 0**.

| Pacote | Caminho | Entra na imagem? | Situação |
| --- | --- | --- | --- |
| `gaxios`, `googleapis-common`, `rimraf`, `glob` | `googleapis` (Google Agenda) | **sim** (runtime) | Corrigido: `googleapis-common@8.0.1` usa o `gaxios@7.3.1` e dispensa `rimraf`/`glob`/`minimatch` do runtime. Saltar para `googleapis@189` (gaxios 8, google-auth-library 11) foi descartado: major em dependência de produção, sem exploração aqui |
| `vitest`, `@vitest/coverage-v8`, `@vitest/mocker` | dev | não | Corrigido: `4.1.12` |
| `qs`, `typed-rest-client` | `@stryker-mutator/core` | não | Corrigido: `@stryker-mutator/*@10.1.1` |
| `minimatch` (>=6.4.2), `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` | mutação | não | **Sem correção publicada** (minimatch 7 a 11). DoS por amplificação de globparts, só com padrão de glob controlado por atacante; o Stryker roda localmente e no job mensal, com padrões do próprio repositório. Risco aceito. **Revisar em 2026-12-08** ou quando sair `minimatch` corrigido |
| `esbuild` (<=0.24.2), `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit` | `drizzle-kit migrate` | não (o estágio `runner` copia só o `standalone`) | **Sem correção sem rebaixar**: `npm audit fix --force` propõe `drizzle-kit@0.18.1`, **não rode**. A falha é do servidor de desenvolvimento do esbuild 0.18, que o `drizzle-kit` não sobe. Risco aceito. **Revisar em 2026-12-08** (ou quando o `drizzle-kit` abandonar o `@esbuild-kit`, já fundido no `tsx`) |

Trava no CI (`ci.yml`, job `estatico` e `fora-do-selo`): `npm audit --omit=dev --audit-level=high`.
Só dependência de produção e só alta/crítica, para um aviso novo em ferramenta de desenvolvimento ou
moderado sem correção não travar todos os PRs (regra 7). O corte (`release-cut.yml`) segue com
`npm ci --no-audit`; o `ci.yml` do PR `release → main` cobre. A lista completa continua sendo a
rotina mensal: `npm audit` e comparação com a tabela acima.
