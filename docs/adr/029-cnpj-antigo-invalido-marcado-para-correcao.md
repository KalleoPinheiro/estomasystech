---
title: "ADR 029 — CNPJ antigo com dígito verificador inválido é marcado para correção, não apagado"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/domains/acesso/README.md, docs/adr/014-observabilidade-sem-pii.md]
---

# ADR 029 — CNPJ antigo com dígito verificador inválido é marcado para correção, não apagado

- **Data:** 2026-10-18
- **Status:** aceito. Implementa a [#355](https://github.com/KalleoPinheiro/vitta-flow/issues/355), follow-up da #248. Desenho delegado pelo dono ao coordenador (PO e arquiteto).
- **Domínios afetados:** acesso

## Contexto

A #248 passou a recusar CNPJ com dígito verificador inválido ao salvar (ACE-RN-23), mas as empresas gravadas antes continuam com o número errado, sem ninguém saber. O CNPJ é obrigatório no cadastro (ACE-RN-22) e aparece em recibos e documentos; é dado da empresa, não do paciente.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — anular o campo | cadastro limpo | perde o número que a clínica digitou; a empresa vira "cadastro incompleto" e a plataforma deixa de convidar admin; o CNPJ é obrigatório |
| B — corrigir sozinho (trocar o DV) | zero trabalho | inventa dado: o erro pode estar em qualquer dígito |
| C — marcar, listar e auditar (escolhida) | não destrói nem inventa; a clínica corrige com o cartão CNPJ na mão | depende de a clínica agir |

## Decisão

**Opção C.**

- Coluna `clinics.cnpj_review_since` (migração `0063`); nula = sem pendência. O número não é alterado.
- Script manual `npm run clinics:cnpj-review -- [--confirmar]`: sem a flag só lista; com ela marca e grava `update/clinic-cnpj-review` na auditoria da empresa, com ator `system`/`cnpj-review-job` e **sem o CNPJ** no `detail`. Idempotente.
- A marca aparece como aviso em Configurações > Dados da clínica (Admin de Empresa) e no cadastro da clínica na plataforma.
- Salvar um CNPJ **válido** (a validação da #248 continua valendo) limpa a marca; editar outro campo não a limpa.
- Documentos clínicos não mudam: a marca é aviso. O recibo é bloqueado (ver Consequências).

## Consequências

- O CNPJ errado segue em documentos clínicos até a clínica corrigir. **Atualização (#358, decisão do coordenador como PO):** o **recibo** passa a ser bloqueado enquanto houver marca, pois com CNPJ errado não vale como documento fiscal; a mensagem manda corrigir em Configurações, e recibos já emitidos não mudam.
- Sem job automático: a marca só aparece depois de rodar o script uma vez após o deploy (producao.md §7.3). Clínicas novas não precisam dele (a validação barra na entrada).
- CNPJ repetido continua tratado por `uq_clinics_cnpj`; este ADR não toca nisso.

## Relacionado

- Issue #355, ACE-RN-23, ACE-RN-57, AD-048.
