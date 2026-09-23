---
title: "Governança de documentação e consumo por IA"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: YYYY-MM-DD
---

<!-- Destino: docs/governance.md -->

# Governança de documentação e consumo por IA

> **Três regras que resumem o arquivo:** (1) cada fato vive em **um** arquivo, os outros linkam;
> (2) doc muda **no mesmo PR** que o comportamento; (3) o arquivo que toda LLM carrega
> (`AGENTS.md`) só tem regra e ponteiro — explicação desce um nível.

## 1. Progressive Disclosure na prática

### Os quatro níveis

| Nível | Arquivo | Orçamento | Quem carrega | Contém |
| --- | --- | --- | --- | --- |
| **L0** | `AGENTS.md` | ≤ 150 linhas | **toda** sessão de toda ferramenta | produto em 1 parágrafo, comandos, regras invioláveis, mapa |
| **L1** | `CONTEXT.md`, `docs/README.md`, `docs/domains/<d>/README.md` | ≤ 80 linhas cada (glossário à parte) | o agente, quando a tarefa toca o domínio | resumo, regras transversais, índice |
| **L2** | `docs/domains/<d>/features/*.md`, `docs/engineering/**`, `docs/adr/*` | sem limite rígido; seções independentes | sob demanda, por link | regra, caso de uso, Gherkin, contrato |
| **L3** | `.specs/features/*`, `docs/audits/*`, `.specs/archive/*` | congelado | só quando a tarefa pede histórico | execução, evidência, snapshot |

### Regras de escrita

1. **Topo = resposta.** Todo arquivo abre com frontmatter + um parágrafo ou `> TL;DR` que responde "preciso ler o resto?".
2. **Seções autocontidas.** Cada H2 deve fazer sentido sozinho — agentes leem por `grep`/âncora, não do início.
3. **Tabela > prosa** para regras, variáveis, status e mapeamentos. Prosa para *porquê*.
4. **Valores literais.** `409`, `15 min`, `TZ=America/Sao_Paulo` — nunca "rápido", "adequado", "em breve".
5. **Link, não cópia.** Se você vai colar um parágrafo de outro doc, troque por um link com uma frase de contexto.
6. **Glossário único.** Termo de domínio = o do `CONTEXT.md`. Sinônimo novo é bug.
7. **Snapshot tem data no nome** (`auditoria-ux-2026-08.md`) e `status: frozen` — nunca é editado depois.

### Frontmatter (obrigatório em `docs/**`)

```yaml
---
title: "Agenda — lista de espera"
status: living          # living | frozen | draft | superseded
audience: [dev, po, agent]
owner: "@github-user"
last_reviewed: 2026-09-23
domain: agenda          # opcional
related: [docs/adr/001-multi-tenancy.md]   # opcional
superseded_by: docs/…   # obrigatório se status = superseded
---
```

`status` é o que permite à LLM distinguir "como o sistema é" (`living`) de "como era quando
alguém analisou" (`frozen`). Sem ele, uma auditoria antiga vale tanto quanto a spec atual.

## 2. Docs-as-Code

| Prática | Mecanismo no Vitta Flow |
| --- | --- |
| Doc vive no repo, revisado em PR | `docs/`, `CONTEXT.md`, `AGENTS.md` — nada de wiki paralela como fonte |
| Gate automático | `npm run check:docs` no CI: links relativos resolvem, frontmatter válido, aviso para doc `living` com `last_reviewed` > 90 dias |
| Doc no mesmo PR | checklist do PR: "mudou comportamento? atualizou `docs/domains/<d>/`?" — o revisor (humano ou CodeRabbit) cobra |
| Decisão durável | ADR em `docs/adr/` (template em `docs/templates/adr.md`); decisão de execução em `.specs/STATE.md` — ver [`agents/planning.md`](agents/planning.md) |
| Sem duplicação | uma tabela de env vars (onboarding § 4); um glossário (`CONTEXT.md`); um roadmap (`plano-evolucao-faseado.md`) |
| Higiene de contexto | handoffs `CONCLUÍDA` saem de `.specs/STATE.md` para `.specs/archive/` ao fim de cada feature |
| Revisão periódica | o aviso de 90 dias do `check:docs` gera a lista; o owner revisa ou marca `frozen`/`superseded` |
| Mudou um caminho? | `check:docs` aponta todos os links vivos quebrados; atualize-os no mesmo PR (não deixe stub de redirecionamento) |

**Checklist de PR (adicionar em `.github/pull_request_template.md`):**

```markdown
## Documentação
- [ ] Comportamento mudou → `docs/domains/<d>/` atualizado (ou n/a)
- [ ] Termo de domínio novo → `CONTEXT.md`
- [ ] Decisão difícil de reverter → ADR
- [ ] Variável de ambiente nova → `docs/engineering/onboarding.md` § 4 **e** `.env.example`
- [ ] `npm run check:docs` verde
```

## 3. Otimização de contexto para LLMs

### Um arquivo de regras, várias pontes

`AGENTS.md` é o padrão aberto lido por Cursor, GitHub Copilot, Codex, Gemini CLI, Zed e outros;
o Claude Code o recebe via `@AGENTS.md` no `CLAUDE.md`. **Não mantenha regras em paralelo** em
`.cursorrules`, `.clinerules` ou instruções customizadas: elas divergem no primeiro PR que
esquecer de uma delas.

| Arquivo | Conteúdo permitido |
| --- | --- |
| `AGENTS.md` | tudo que vale para toda tarefa (L0) |
| `CLAUDE.md` | `@AGENTS.md` e nada mais |
| `.github/copilot-instructions.md` | 1 parágrafo: "siga `AGENTS.md`" + link |
| `.cursor/rules/00-vitta-flow.mdc` | `alwaysApply: true`, aponta para `AGENTS.md` |
| `.cursor/rules/<escopo>.mdc` | **só** ponteiros com `globs` — ex.: `src/components/**` → "leia `docs/still-void-gaps.md`"; nunca regra nova |
| `.clinerules` / `.windsurfrules` | não criar; se a ferramenta exigir, 1 linha apontando para `AGENTS.md` |

Exemplo de regra com escopo (ponte, não regra):

```markdown
---
description: UI components
globs: ["src/components/**", "src/app/**/*.tsx"]
alwaysApply: false
---
Antes de editar JSX, leia `AGENTS.md` § Regras invioláveis (item 3) e `docs/still-void-gaps.md`.
```

### Anti-poluição

| Faça | Não faça |
| --- | --- |
| Mapa "vai mexer em X → leia Y" | pedir para "ler toda a pasta docs/" |
| Regra com o **porquê** em uma oração | parágrafos de história no L0 |
| Número concreto no L0 (90%, 150 linhas, 4096) | explicar como o Biome funciona no L0 |
| Arquivar handoff concluído | deixar 600 linhas de histórico em arquivo de leitura obrigatória |
| Marcar snapshot como `frozen` | deixar auditoria antiga parecer requisito atual |
| Linkar o ADR | reexplicar o ADR em cada doc |
| Instrução em lista numerada ou tabela | instrução enterrada em prosa |

### Como pedir a uma LLM (prompt curto que funciona aqui)

```text
Tarefa: <o quê>. Domínio: <slug>.
Leia AGENTS.md, depois docs/domains/<slug>/README.md; desça para as specs que ele linkar só se precisar.
Use os termos do CONTEXT.md. Não invente regra de negócio: pergunte.
```

## 4. Donos e cadência

| Artefato | Dono | Quando revisar |
| --- | --- | --- |
| `AGENTS.md` | tech lead | a cada regra nova ou incidente causado por agente |
| `CONTEXT.md` | tech lead + PO | a cada termo novo |
| `docs/domains/*` | quem muda o comportamento | no PR |
| roadmap | PO | a cada mudança de status + revisão trimestral |
| `docs/engineering/*` | quem muda setup/integração | no PR |
| ADRs | autor | nunca editados; substituídos por outro ADR (`superseded`) |
