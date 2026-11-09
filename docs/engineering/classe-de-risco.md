---
title: "Classe de risco da PR e veredito do the-judge"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
---

# Classe de risco da PR e veredito do the-judge

Fase 2c do fluxo enxuto (ADR-097, PR #758, issue #756).
Princípio: **humano onde o erro é irreversível; máquina onde é reversível e verificável.** A classe sai do
diff por script, sem LLM. O the-judge entra por cima desse piso, com saída estruturada.

## 1. Classe de risco (`npm run check:risco`)

```bash
npm run check:risco                          # texto, contra a base detectada (a mesma do check:changeset)
npm run check:risco -- --json                # relatório classificar-risco/v1
npm run check:risco -- --saida-github        # classe=N e aprovacao_humana=true|false ($GITHUB_OUTPUT)
npm run check:risco -- --base origin/release/v0.6.2
npm run check:risco -- --migracao rel.json   # usa um check-migracao/v1 já gerado
```

Sai com `0` sempre que consegue classificar: a classe é informação para o deploy e para a aprovação, não reprova
a PR. Sai com `1` só se o `git diff` falhar.

| Classe | Critério | Aprovação humana |
| --- | --- | --- |
| 0 | só documentação (`.md` fora de código) e testes (`tests/`, `e2e/`) | não |
| 1 | código sem migração e sem caminho sensível | não |
| 2 | mudança em `package-lock.json` sem dependência sensível de runtime | não |
| 2 | migração **aditiva** (passa no `check:migracao`), sem caminho sensível; ou só lockfile (acima) | não |
| 3 | qualquer caminho sensível, migração não aditiva ou com erro, relatório de migração ausente, dependência sensível | **sim** |

A classe da PR é a **maior** entre os arquivos. O relatório lista só os motivos da classe final.

### Caminhos sensíveis (classe 3)

Lista única em `CAMINHOS_SENSIVEIS` (`scripts/release/classificar-risco-lib.ts`):

| Regra | Caminhos |
| --- | --- |
| `escopo-de-empresa` | `**/tenant-scope*.ts`, `src/lib/auth/*-scope.ts`, `tests/lib/tenant-scope.test.ts` (allowlist do `systemScope()`) |
| `cifra` | `data-cipher`, `crypto`, `blind-index`, `reencrypt-clinical-data` |
| `auditoria` | `src/{domain,application}/audit/`, repositórios de auditoria em `src/infrastructure/` |
| `auth` | `src/domain/auth/`, `src/lib/auth/`, `src/proxy.ts` |
| `dados-de-producao` | `scripts/backup*.sh`, `scripts/restore*.sh` (backup e restauração) |
| `imagem-e-deploy` | `Dockerfile`, `deploy/` |
| `workflow` | `.github/workflows/`, `.github/CODEOWNERS` |
| `portao` | `scripts/gate/`, `scripts/gate-cloud*`, `scripts/release/`, `scripts/check-*` e `scripts/docker-smoke.sh` (executados pelo `ci.yml`), `.gate/`, `.husky/`, `.claude/hooks/`, `.claude/settings.json`, `vitest*.config.mts`, `stryker.config.json`, `playwright.config.ts`, `biome.json` |
| `portao` (comandos) | mudança em `package.json > scripts` de `check:*`, `test*`, `gate*`, `lint*`, `typecheck*`, `build*` |
| `dependencia-sensivel` | mudança em `package.json`, ou de runtime (`dev` fora) no `package-lock.json`, de `next`, `drizzle-orm`, `drizzle-kit`, `pg`, `@aws-sdk/client-s3`, `googleapis`, `sharp` ou de pacote com `argon`, `bcrypt`, `jose`, `jsonwebtoken`, `crypto`, `oauth`, `passport`, `auth`, `helmet` no nome |

Quando mais de uma regra casa, vale a primeira da lista (a mais específica): `src/lib/auth/tenant-scope.ts`
é `escopo-de-empresa`, não `auth`.

### Migração

`check:risco` roda `check:migracao --json` quando o diff toca `drizzle/` e lê o `check-migracao/v1`
([`migracoes-aditivas.md`](migracoes-aditivas.md)):

| `check-migracao/v1` | Classe |
| --- | --- |
| `nenhuma` (tocou `drizzle/` sem migração nova) | 1 |
| `aditiva` e `ok: true` | 2 |
| `nao_aditiva` | 3 |
| `ok: false` (erro estrutural) | 3 |
| ausente, schema diferente ou JSON ilegível | 3 (falha fechada) |

### Formato `classificar-risco/v1`

```json
{
  "schema": "classificar-risco/v1",
  "classe": 3,
  "aprovacaoHumana": true,
  "motivos": [{ "classe": 3, "regra": "escopo-de-empresa", "arquivo": "src/lib/auth/tenant-scope.ts", "detalhe": "..." }]
}
```

### O que o script não decide

- **Ligar uma flag para clínica real** (portão humano da proposta, seção 5): acontece fora do diff (painel ou
  variável de ambiente), então o classificador não vê. Fica como passo humano até existir `flags.registry.ts`.
- **Mudança só em `package-lock.json`** é classe 2; vira 3 se alterar dependência sensível de runtime
  (direta ou transitiva). Decisão do coordenador, 2026-11-08.
- **"Só comentários"** não é detectável por caminho; um `.ts` com só comentário é classe 1.

## 2. Veredito do the-judge (`npm run check:veredito`)

O the-judge é LLM e **não é determinístico**: fica acima do piso mecânico, nunca no lugar dele. O que é
determinístico é o contrato do veredito.

```bash
npm run check:veredito -- --autor <id> --arquivo veredito.json            # JSON puro ou texto de comentário
npm run check:veredito -- --autor <id> --comentarios comentarios.json     # lista de textos; vale o último com veredito
npm run check:veredito -- --autor <id> --sha <sha>                        # padrão: HEAD
```

O veredito vai num comentário da PR, no bloco abaixo (ou como JSON puro num arquivo):

````text
```json the-judge
{
  "schema": "the-judge/v1",
  "sha": "<40 hex do head da PR>",
  "autor": "<quem escreveu a PR>",
  "revisor": "<quem revisou, outra identidade>",
  "achados": [
    { "severidade": "bloqueante", "titulo": "...", "arquivo": "src/x.ts", "linha": 12, "detalhe": "..." }
  ],
  "resumo": "opcional"
}
```
````

Severidades: `bloqueante`, `importante`, `sugestao`. O check sai com `1` se:

1. não há veredito, ou o JSON está quebrado ou fora do schema (falha fechada);
2. o `sha` não é o do head da PR (push novo pede veredito novo);
3. o `revisor` é o `autor` (**o autor não aprova a si mesmo**) ou o `autor` declarado não é o da PR;
4. há ao menos um achado `bloqueante`.

No `pull_request`, `--sha` deve ser `github.event.pull_request.head.sha`: o `HEAD` do checkout é o commit de merge, e o veredito
vale para o head da PR.

`autor` e `revisor` são identificadores opacos, só comparados entre si. Como todas as PRs de agentes saem com o
mesmo login do GitHub, o workflow deve passar um identificador que distinga as sessões (por exemplo o id da thread do
bloco de atribuição do corpo da PR). **No CI o veredito não vem de comentário**: o job `Veredito do the-judge`
(`.github/workflows/veredito-judge.yml`) confere a review `the-judge/v1` (COMMENT, veredito `APPROVE` na primeira linha) que a thread revisora
publica no head SHA, sem chamar modelo; comentário, `autor` e `revisor` declarados por sessão não valem
([ADR-101](../adr/101-veredito-do-the-judge-por-status-da-revisora.md), que substitui a chamada à API do
[ADR-100](../adr/100-veredito-do-the-judge-montado-no-actions.md)). O uso manual acima segue valendo para
investigação, nunca como portão.

## 3. Como a classe 3 exige o dono (mecanismo proposto)

Todas as PRs dos agentes saem com o login do dono, então **CODEOWNERS não garante nada sozinho**: o GitHub não
deixa o autor aprovar a própria PR, e um agente poderia mexer em qualquer arquivo. O sinal que o agente não
consegue forjar é a **aprovação de um Environment protegido com o dono como revisor**, o mesmo mecanismo do
ADR-095 para o deploy. Proposta (o workflow é da #757; aqui só o desenho):

```yaml
jobs:
  risco:
    outputs: { classe: ${{ steps.r.outputs.classe }}, humana: ${{ steps.r.outputs.aprovacao_humana }} }
    steps:
      - id: r
        run: npm run check:risco -- --saida-github >> "$GITHUB_OUTPUT"
  aprovacao-classe-3:
    needs: risco
    if: needs.risco.outputs.humana == 'true'
    environment: aprovacao-classe-3   # Environment com o dono como Required reviewer
    runs-on: ubuntu-latest
    steps: [{ run: 'echo "dono aprovou a classe 3 para ${{ github.sha }}"' }]
  portao-risco:                        # único check exigido no ruleset da main
    needs: [risco, aprovacao-classe-3]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: test "${{ needs.risco.result }}" = success && test "${{ needs.aprovacao-classe-3.result }}" != failure && test "${{ needs.aprovacao-classe-3.result }}" != cancelled
```

- O job `aprovacao-classe-3` só roda na classe 3 e **fica parado até o dono aprovar** no Environment; o agente não
  tem como clicar, e o aprovador não pode ser quem disparou se "Prevent self-review" estiver ligado.
- A aprovação vale por execução (push novo reinicia). O ruleset da `main` exige o check `portao-risco`.
- O workflow que define isso e o próprio Environment ficam em caminhos de classe 3 (`.github/workflows/`), então
  mudá-los também exige o dono. Isto fecha o ciclo "quem escreve o portão não o abre sozinho".
- Passo do dono no painel: criar o Environment `aprovacao-classe-3` com ele como revisor. O repositório é público
  desde 2026-11-07, então o recurso existe no plano atual.

## 4. CODEOWNERS (só documentação)

`.github/CODEOWNERS` registra quem é dono de `scripts/gate/`, `scripts/gate-cloud*`, `scripts/release/`,
`.github/workflows/`, `.husky/`, `.claude/hooks/`, `.claude/settings.json` e do próprio arquivo. Serve de mapa para
humanos e para revisão por pessoa; **não é o mecanismo de segurança** (seção 3).
