---
title: "ADR 091 — npm fixado e lockfile protegido contra perda de opcionais no corte"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-01
related:
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/adr/088-prova-unica-do-corte-e-pre-voo-do-release-cut.md
  - docs/engineering/homologacao.md
---

# ADR 091 — npm fixado e lockfile protegido contra perda de opcionais no corte

- **Data:** 2026-11-01
- **Status:** aceito (decisão do coordenador no plano da v0.5.0, issue #666). Emenda o [ADR-071](071-corte-de-release-em-comando-unico.md) e o [ADR-088](088-prova-unica-do-corte-e-pre-voo-do-release-cut.md); nenhum limiar nem teste muda (regra 8).
- **Domínios afetados:** engenharia (release, CI)

## Contexto

O `release:prepare` regenera o `package-lock.json` com `npm install --package-lock-only` na máquina do corte. O npm que
vem com o Node muda sem aviso (o `setup-node` e a imagem `node:24` não fixam o npm), e um npm diferente do que gerou o
lockfile, ou o bug de resolução do npm com `node_modules` de outra plataforma, grava um lockfile **sem as dependências
opcionais** das demais plataformas (`@img/sharp-*`, `@next/swc-*`). O commit de versão passa no gate da release, que roda
em Linux x64, e o `npm ci` do Docker (Alpine/musl) ou da Vercel quebra depois, já fora do corte.

## Decisão

1. **npm fixado em um só lugar.** `package.json` declara `"packageManager": "npm@11.21.1"` e `"engines": { "npm": "11.21.1" }`.
   A versão é a 11.x mais recente com mais de duas semanas de publicada na data da decisão. O `package-lock.json` acompanha o `engines` novo (`packages[""].engines.npm`, 3 linhas); com isso, `npm install --package-lock-only` no npm 11.21.1 deixa o diff vazio (verificado). Trocar de versão é um PR próprio, que
   altera os dois campos juntos e confere o lockfile.
2. **O corte usa o npm fixado.** O `release-cut.yml` roda `npm i -g npm@<packageManager>` (lido do `package.json`, sem
   repetir o número) antes do `npm ci`. Os demais workflows seguem com o npm do Node: só o corte regenera o lockfile.
3. **Check no `release:prepare`.** Antes de tocar no lockfile, confere que o `npm --version` é o fixado. Depois do
   `npm install --package-lock-only`, compara as entradas `optional` do lockfile anterior com o novo; se alguma sumiu,
   desfaz o commit de versão em preparação (`git reset --hard HEAD`) e falha com a lista. Regras em
   `scripts/release/lockfile-lib.ts`, testadas em `tests/scripts/release-lockfile.test.ts`.
4. **Pré-voo.** O `release:preflight` (e, portanto, o `dry_run` do Release cut) também reprova npm divergente, em
   ~1 min, antes do gate de ~42 min.

## Consequências

- Corte em WSL ou outra máquina exige `npm i -g npm@11.21.1`; a mensagem de erro diz o comando.
- `npm ci` em máquina com outro npm mostra o aviso `EBADENGINE` (não é erro; não usamos `engine-strict`).
- Perda de opcional vira falha clara no `prepare`, e não um Docker quebrado depois.

## Alternativas descartadas

- `engine-strict=true`: quebraria o `npm ci` de quem tem outro npm sem necessidade; só o corte regenera o lockfile.
- Corepack: não vem habilitado no `setup-node` nem na imagem; o `npm i -g` é explícito e verificável.
