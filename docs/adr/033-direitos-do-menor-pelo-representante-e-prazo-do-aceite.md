---
title: "ADR 033 — Representante do menor exerce os direitos do titular no portal e o aceite dele vence 90 dias depois dos 18"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/032-paciente-menor-no-portal-pelo-representante-legal.md, docs/adr/027-responsavel-acessa-portal-em-nome-do-paciente.md, docs/legal/textos-lgpd.md, docs/domains/portal/README.md]
---

# ADR 033 — Representante do menor exerce os direitos do titular no portal e o aceite dele vence 90 dias depois dos 18

- **Data:** 2026-10-18
- **Status:** aceito. Implementa a [#375](https://github.com/KalleoPinheiro/vitta-flow/issues/375). @KalleoPinheiro aprovou em 2026-10-18 ("Ok") as propostas do coordenador para as duas perguntas abertas do [ADR-032](032-paciente-menor-no-portal-pelo-representante-legal.md). Complementa o ADR-032 (que segue valendo no resto) e muda dois pontos dele: o que fica com o titular e a validade do aceite do representante depois dos 18.
- **Domínios afetados:** portal, acesso, pacientes-prontuario, equipe-parceiros

## Contexto

O ADR-032 deixou o representante legal do menor assinar o TCLE e o termo de imagem no portal, mas manteve fechados a ele (`403`) a cópia dos dados, os pedidos de correção e eliminação e a autorização do parceiro indicador. Para o menor, isso obrigava o representante a pedir tudo à clínica, embora seja ele quem exerce os direitos do menor (LGPD, art. 14; Código Civil, art. 1.634). O ADR-032 também deixou o aceite do representante valendo para sempre depois dos 18, e perguntou se ele devia vencer.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Tudo segue pela clínica | nada muda | o representante não exerce sozinho direitos que são dele; trabalho manual da clínica |
| B — Representante exerce todos os direitos, inclusive eliminação | simétrico ao titular adulto | eliminação de dado de saúde de menor é irreversível e merece a análise presencial da clínica |
| C — Cópia, correção e parceiro no portal; eliminação na clínica (escolhida) | cobre o dia a dia sem ato irreversível pelo portal | assimetria: o representante não pede eliminação no portal |

Para o prazo: cortar o aceite no aniversário de 18 anos bloquearia fotos no meio do tratamento; nunca vencer deixa o adulto preso a um aceite que não deu. **90 dias** dão tempo de o paciente entrar no portal e aceitar em nome próprio.

## Decisão

**Opção C, com prazo de 90 dias.**

- **O representante legal do menor** (mesma regra do ADR-032: menor de 18 hoje, parentesco mãe, pai ou `representante_legal`) agora, no portal e em nome do menor:
  - baixa a **cópia dos dados** (`GET /api/portal/patient/export`);
  - abre e acompanha **pedidos de correção** (`/api/portal/patient/data-requests`, `kind: correction`);
  - **autoriza e revoga o compartilhamento com o parceiro indicador** (`/api/portal/patient/partner-consent` e `/revoke`). O registro grava quem assinou, como no termo: `partner_share_consents.signer_guardian_id` e `signer_relationship` (migração `0066`, sem FK).
- **A eliminação do menor é pedida à clínica**: `kind: erasure` pelo representante responde `403` ("pedida diretamente à clínica"); a tela dele não oferece essa opção.
- **Responsável de adulto continua sem nada disso** (`403`, ADR-027). Quem assina em nome do menor é resolvido por `resolveConsentSigner`, a mesma porta do termo.
- **Toda trilha** desses atos diz "pelo representante legal".
- **O aceite do representante vence 90 dias depois dos 18 anos** (`REPRESENTATIVE_CONSENT_GRACE_DAYS`, `src/domain/patient/majority.ts`). Vale até a véspera do dia `aniversário de 18 + 90 dias` no `APP_TIMEZONE`; 29/2 conta a partir de 1º/3. Vale para os três aceites: TCLE, imagem e parceiro.
  - Vencido, o aceite **deixa de valer sem apagar nada** (o registro é evidência, append-only): o termo aparece pendente, o envio de foto fica bloqueado e o parceiro volta a ver só que o paciente foi atendido.
  - **Paciente sem data de nascimento**: o aceite do representante não vale (falha fechada). Ele só assina por menor com data informada; se a data for apagada depois, não há como provar o prazo.
  - O paciente adulto vê o motivo e aceita em nome próprio (novo registro sem `signer`), o que encerra a pendência. Também pode confirmar antes do prazo ("Aceitar em meu nome", "Autorizar em meu nome").
- **Aviso à clínica**: o mesmo cartão do painel do ADR-032 lista também o paciente maior cujo aceite vigente foi dado pelo representante, com a data em que vence ou que venceu. "Manter com o responsável" segue só para quem ainda aguarda a transferência; sai da lista quando o paciente aceita em nome próprio.
- **Aviso de privacidade** sobe para `v3` explicando os dois pontos. Os textos dos termos não mudam (nenhum hash cai).

## Consequências

**Positivas**

- O representante cuida do menor sem depender da clínica para cópia, correção e parceiro.
- Nenhum adulto fica preso, além de 90 dias, a um aceite que não deu; a clínica vê quem precisa reaceitar.

**Negativas / custos aceitos**

- Ao vencer o prazo, a clínica perde o aceite de imagem até o paciente reaceitar: fotos novas pelo portal param. A equipe pode registrar o termo em papel (fluxo já existente).
- **Curatela de adulto** fica de fora: o portal só deixa o representante assinar por menor. O curador segue pela clínica e o "Manter com o responsável" só mantém o acesso, não a assinatura.
- O prazo é fixo no código; mudar exige novo ADR e nova versão do aviso de privacidade.

## Relacionado

[#375](https://github.com/KalleoPinheiro/vitta-flow/issues/375), [ADR-027](027-responsavel-acessa-portal-em-nome-do-paciente.md), [ADR-032](032-paciente-menor-no-portal-pelo-representante-legal.md), POR-RN-23, POR-RN-26, POR-RN-27, POR-RN-28.
