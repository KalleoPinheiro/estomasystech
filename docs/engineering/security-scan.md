---
title: "Varredura de segurança"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
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
