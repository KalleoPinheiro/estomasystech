---
title: "Backlog — Adoção do `@still-void/ui`"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Backlog — Adoção do `@still-void/ui`

- **Status:** Parcialmente fechado — itens 1, 2 e 3 resolvidos em 2026-08-22 pela
  migração para a `@still-void/ui@2.0.1`
  (`.specs/features/still-void-v2-migration/`). Itens 4, 5 e 6 seguem abertos.
  As lacunas do catálogo levantadas durante essa migração estão em
  [still-void-gaps.md](still-void-gaps.md).
- **Data:** 2026-07-30
- **Contexto:** PR #2 (`claude/still-void-design-system-3h4su8`) — adoção do
  `@still-void/ui` 1.1.0 como design system do VittaFlow.

Achados de escopo durante a adoção do design system que **não** foram corrigidos
nessa PR — ou porque exigiam decisão do time, ou porque tocavam código muito além
do pedido original ("aplicar o design system, tema claro, accent violeta"). Cada
item abaixo é candidato a issue própria.

## 1. Resto do app ainda pinta pela ponte `teal-*`/`slate-*`, não pelos tokens `sv-*` diretamente

> **RESOLVIDO (2026-08-22).** As ~40 telas foram convertidas para os utilitários
> semânticos (`text-ink-*`, `border-border`, `bg-accent-soft`, `text-success`…), e as
> sobrescritas `--color-slate-*`/`--color-teal-*` foram removidas do `@theme`. O gate
> `npm run check:sv` falha se um degrau cru voltar.


_Registro histórico da PR #2 — descreve o estado de 2026-07-30, antes da resolução acima. Mantido como contexto; não é pedido de trabalho._

**O quê:** a PR retokenizou o shell (sidebar, header do portal, login), os
primitivos compartilhados (`StatusBadge`, `ErrorAlert`, `LoadingIndicator`,
`EmptyState`, `Modal`, `LoadMoreButton`, `LogoutButton`, `HealingChart`) e os
títulos de página. As ~40 páginas e formulários do staff/portal (tabelas, botões,
inputs, cards de listagem) continuam usando classes Tailwind `teal-*`/`slate-*`
(149 + 263 ocorrências na base antes desta PR), que a ponte semântica em
`globals.css` recolore para os tokens `--sv-accent`/`--sv-accent-ink`/`--sv-text-*`.

**Por que não foi feito aqui:** são ~40 arquivos com lógica de negócio própria
(agenda, faturamento, inventário, prontuário) — trocar cada tabela e formulário
para `sv-*` diretamente é um refactor amplo e arriscado de revisar numa única PR
de design system, e a ponte já garante a cor certa em todo o app hoje.

**Proposta de correção futura:** converter incrementalmente, página por página,
para as classes do pacote (`sv-pill`, `sv-header__link`, etc.) ou para um
`<Button>` compartilhado (ver item 2), removendo a dependência da ponte
`teal-*`/`slate-*` ao final.

## 2. Botão primário duplicado em ~15 arquivos, sem componente compartilhado

> **RESOLVIDO (2026-08-22).** Os botões passaram a usar o `<Button>` do próprio
> pacote. Como o catálogo não tem variante primária preenchida com o accent, a
> diferença ficou na receita `accentButton` de `src/lib/ui.ts` — um lugar só — e virou
> a entrada `button-accent-variant` em [still-void-gaps.md](still-void-gaps.md).


_Registro histórico da PR #2 — descreve o estado de 2026-07-30, antes da resolução acima. Mantido como contexto; não é pedido de trabalho._

**O quê:** o padrão `"rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium
text-white hover:bg-teal-800"` (e variações próximas) se repete em botões de
submit por toda a base — nunca foi extraído para um componente.

**Por que não foi feito aqui:** criar e migrar um `<Button>` para ~15 usos é
mudança de estrutura de componente, não de tema — fora do pedido original.

**Proposta de correção futura:** um `src/components/button.tsx` com variantes
(`primary`/`secondary`/`ghost`) construído sobre a receita `categoryPill()` ou
sobre os tokens `--sv-radius-md`/`--sv-duration-fast`/`--sv-ease-hover`
diretamente, substituindo os botões inline.

## 3. `DocumentFrame` (documentos imprimíveis) não foi retokenizado

> **RESOLVIDO (2026-08-22).** `DocumentFrame` e as páginas de `src/app/documentos/**`
> não dependem mais da ponte. A moldura usa `<Button>` do pacote na barra de ações, e o
> corpo impresso usa preto/branco literais — decisão explícita: o alvo é papel, e seguir
> o tema imprimiria texto claro no tema escuro.


_Registro histórico da PR #2 — descreve o estado de 2026-07-30, antes da resolução acima. Mantido como contexto; não é pedido de trabalho._

**O quê:** `src/components/document-frame.tsx` (moldura A4 de atestado, termo de
consentimento e relatório de evolução) continua com `text-slate-900`,
`border-slate-300`, `border-slate-800`, `text-teal-700`, `bg-teal-700` literais —
funciona hoje só porque a ponte no `globals.css` remapeia essas classes.

**Por que não foi feito aqui:** o plano desta PR marcou `src/app/documentos/**`
como fora do restyle visual (são páginas de impressão que devem continuar
neutras), mas isso não deveria ter incluído deixar de trocar as classes por
tokens equivalentes — é uma lacuna, não uma decisão deliberada.

**Proposta de correção futura:** trocar as classes por `var(--sv-text)`,
`var(--sv-border)`, `var(--sv-border-strong)` etc., mantendo a aparência
neutra/impressa mas removendo a dependência indireta da ponte Tailwind.

## 4. Sem suporte a tema escuro

**O quê:** o Still Void é dark-first (`:root` já é o tema escuro; `[data-theme='light']`
é o override) e traz `ThemeProvider`/`ThemeToggle`/`ThemeScript` prontos, mas o
app fixa `data-theme="light"` sem nenhum caminho para alternar.

**Por que não foi feito aqui:** o pedido foi explicitamente tema claro; alternância
de tema é uma feature de produto, não parte da adoção do design system.

**Proposta de correção futura:** se o produto quiser dark mode no futuro, o
pacote já suporta — falta só compor `ThemeProvider` no root layout, adicionar
`ThemeScript` no `<head>` (com nonce da CSP) e `ThemeToggle` na sidebar/header.

## 5. ~~Teste E2E falhando, pré-existente e não relacionado a esta PR~~ — RESOLVIDO

> **Fechado em 2026-08-22.** As 4 falhas foram diagnosticadas e corrigidas; a suíte
> E2E fecha **64/64**. Relatório completo em
> [.specs/features/e2e-consentimento-verdes/validation.md](../.specs/features/e2e-consentimento-verdes/validation.md).

Diagnóstico final das 4:

| Teste | Culpado | Correção |
| --- | --- | --- |
| `triagem.spec.ts` × 2 | teste | o helper `uploadPatientPhoto` enviava foto sem aceitar o termo; o gate COMP3-01 da rota está correto e não foi tocado |
| `portal-paciente.spec.ts` | **aplicação** | `ConsentCard` e `PatientPhotoUpload` tinham cada um a sua cópia do status do consentimento (`useApiQuery` não compartilha cache), então o aceite não liberava o envio de foto sem reload — status subiu para `PatientPortalView` |
| `faturamento.spec.ts` | teste | o locator casava também a fatura da **venda** do pacote (`Pacote: <procedimento> (N sessões)`); a conclusão coberta por pacote nunca gerou fatura — comportamento sempre esteve certo |

Ou seja: 3 dos 4 eram teste desatualizado; 1 escondia um bug real de UI que só
apareceu quando o teste foi investigado a fundo.

## 6. `CardSkeleton` do pacote assume 3 linhas fixas

**O quê:** `LoadingIndicator` (`src/components/feedback.tsx`) usa `<CardSkeleton />`
do `@still-void/ui/react`, que sempre renderiza 3 linhas de skeleton — adequado
para os estados de carregamento vistos na revisão (listas de pacientes, faturas
etc.), mas pode ficar desproporcional em áreas muito menores ou maiores da UI.

**Proposta de correção futura:** se aparecer um caso onde 3 linhas fixas
destoam visualmente, compor `Skeleton`/`Skeleton small` diretamente (ambos
exportados pelo pacote) em vez do atalho `CardSkeleton`.
