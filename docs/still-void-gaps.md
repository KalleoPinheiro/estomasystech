---
title: "Lacunas do `@still-void/ui` — backlog para a lib"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Lacunas do `@still-void/ui` — backlog para a lib

- **Status:** Fechado — nenhuma seção aberta
- **Data:** 2026-08-26
- **Versão verificada:** `@still-void/ui@3.2.0`
- **Origem:** migração 2.0 → 3.1 do VittaFlow (`.specs/features/still-void-v3-migration/`); as
  6 lacunas levantadas ali foram fechadas pela migração 3.1 → 3.2
  (`.specs/features/still-void-v3.2-migration/`) — ver histórico no fim deste documento.

Componentes que o VittaFlow precisa e a `3.1.0` **não** exporta, mais os defeitos
encontrados no que ela exporta. Cada entrada é candidata a issue no repositório
[still-void](https://github.com/KalleoPinheiro/still-void).

## Como ler

Cada lacuna tem um `slug`. O mesmo `slug` aparece no código do VittaFlow como
comentário `sv-gap: <slug>`, na linha acima do workaround. `npm run check:sv`
mantém os dois lados em sincronia nos dois sentidos: marcação sem seção aqui, ou
seção aqui sem marcação no código, falham o gate. A exceção é uma seção anotada
com `<!-- sv-gap-doc-only -->`, para a lacuna que não tem workaround local — é
relato sobre a lib, não dívida no VittaFlow.

**Prova de ausência:** cada nome abaixo foi conferido contra a *export line* de
`dist/react/index.d.ts` e `dist/react/client/index.d.ts` da `3.1.0` — o artefato
publicado, não a documentação.

**Contagem de call sites** é de ocorrências no código, não de arquivos.

---

## Histórico — lacunas fechadas pela 3.2.0

A `3.2.0` (2026-08-26) fechou, num único release, as 6 lacunas abaixo — as 4
com workaround local marcado (`sv-gap: <slug>`) foram portadas para o artefato
equivalente da lib; as 2 `doc-only` (`progress`, `dialog-close-label`) fecham
por nota, sem call site próprio de código a migrar. Ver
[.specs/features/still-void-v3.2-migration/](../.specs/features/still-void-v3.2-migration/)
para spec, design, tasks e o veredito do Verifier independente.

#### pagination

A `3.2.0` passa a exportar `Pagination`/`PaginationContent`/`PaginationItem`/
`PaginationNext`. [src/components/load-more-button.tsx](../src/components/load-more-button.tsx)
foi migrado do `Button variant="outline"` avulso para
`Pagination > PaginationContent > PaginationItem > PaginationNext label="Carregar mais"` —
mesmo comportamento de cursor (`onClick`), agora com `<nav aria-label="pagination">`
semântico. Commit `3a61988`.

#### progress

A `3.2.0` continua sem exportar um `Progress` genérico (só `ReadingProgress`,
inalterado desde a `3.1.0`). A lacuna fecha porque a necessidade real —
visualizar os scores PUSH/DET e a escala de dor — já é servida pelo
`HealingChart` migrado (ver `data-chart` abaixo); nunca houve um segundo call
site próprio marcado `sv-gap: progress` no código para portar. Junto do
commit `03e5004`.

#### separator

A `3.2.0` passa a exportar `Separator`.
[src/app/login/page.tsx](../src/app/login/page.tsx) foi migrado dos dois
`<span className="h-px flex-1 bg-surface-2" />` para
`<Separator decorative={false} className="flex-1" />`, expondo
`role="separator"` — o texto "ou" continua como nó de texto solto ao lado.
Commit `faaa974`.

#### data-chart

A `3.2.0` passa a exportar primitivos de gráfico (`ChartContainer`,
`ChartAxis`, `ChartLine`).
[src/components/healing-chart.tsx](../src/components/healing-chart.tsx) foi
migrado: `ChartContainer` substitui o `<svg role="img">` manual, `ChartAxis`
substitui a `<line>` de base, e `ChartLine` substitui as 3 `<polyline>` de
série; círculos de dado e textos de série continuam manuais — a lib não expõe
marcador de ponto nem legenda livre. Commit `03e5004`.

#### icon-set-gaps

A `3.2.0` adiciona `camera`, `blocked` e `pending` a `IconName`.
[(staff)/page.tsx](../src/app/(staff)/page.tsx) e
[(staff)/materiais/page.tsx](../src/app/(staff)/materiais/page.tsx) foram
migrados dos glifos `📷`/`⛔`/`⏳` para
`<Icon name="camera"|"blocked"|"pending" />`, decorativos — o texto adjacente
já anuncia o significado. Commit `746939c`.

#### dialog-close-label

A `3.2.0` mantém `DialogContentProps.showCloseButton?: boolean` mas adiciona
`closeLabel?: string`, que controla o texto do `<span className="sv-sr-only">`
interno do botão nativo de fechar (antes hardcoded em inglês, `"Close dialog"`).
[src/components/modal.tsx](../src/components/modal.tsx) foi migrado:
`showCloseButton={false}` e o `DialogClose`/`Icon` manuais saem;
`DialogContent` ganha `closeLabel="Fechar"`. AD-015 foi superseded por AD-016
em `.specs/STATE.md`. Commit `252df2e`.

---

## Relacionado

- [.specs/features/still-void-v3.2-migration/](../.specs/features/still-void-v3.2-migration/) —
  spec, design e tasks da migração `3.1` → `3.2` que fechou as 6 lacunas
  restantes (histórico acima).
- [backlog-design-system.md](backlog-design-system.md) — backlog da adoção da 1.x;
  os itens 1, 2 e 3 são fechados pela migração para a `2.0.1`.
- [.specs/features/still-void-v3-migration/](../.specs/features/still-void-v3-migration/) —
  spec, design e tasks da migração `2.0` → `3.1` que fechou 14 das 19 lacunas
  anteriores e levantou `dialog-close-label` e `icon-set-gaps`.
- [.specs/features/still-void-v2-migration/](../.specs/features/still-void-v2-migration/) —
  spec, design e tasks da migração `1.x` → `2.0` que levantou as lacunas
  originais.
