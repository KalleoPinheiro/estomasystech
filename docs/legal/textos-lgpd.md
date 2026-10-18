---
title: "Textos LGPD em vigor — aviso de privacidade e termos de consentimento"
status: living
audience: [po, dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md, docs/adr/018-transferencia-internacional-ue.md, docs/adr/013-retencao-por-anonimizacao.md]
---

# Textos LGPD em vigor

> **PENDENTE DE REVISÃO JURÍDICA.** Os textos abaixo foram redigidos por IA a pedido de
> @KalleoPinheiro (2026-10-17 e 2026-10-18), estão **em vigor no sistema** e **não foram revistos
> por profissional da área** (`LEGAL_REVIEW_PENDING`, [ADR-030](../adr/030-textos-lgpd-ligados-sem-revisao-juridica.md)).
> Não são parecer jurídico. A tela de Configurações avisa a equipe enquanto isso valer. Antes de
> atender pacientes reais, um(a) advogado(a) de proteção de dados revisa os cinco arquivos da § 1.

Os textos moram **no código**, porque o aceite grava o hash deles. Este arquivo diz onde estão, o
que decidimos e como trocá-los depois da revisão; não os repete (um fato em um só lugar).

## 1. Onde estão os textos

| Texto | Arquivo | Versão | Quem aceita | Hash e invalidação |
| --- | --- | --- | --- | --- |
| TCLE de tratamento | [`src/lib/consent-text.ts`](../../src/lib/consent-text.ts) | `v2` | paciente, no portal (ou em papel impresso) | hash do texto-base; trocar o texto pede novo aceite |
| Autorização de imagem (fotos clínicas) | [`src/lib/image-consent-text.ts`](../../src/lib/image-consent-text.ts) | `v1` | paciente, no portal; libera o envio de foto | idem, **aceite e revogação à parte** do tratamento |
| Consentimento para o parceiro indicador | [`src/lib/partner-share-consent-text.ts`](../../src/lib/partner-share-consent-text.ts) | `v1` | paciente (portal) ou equipe, em papel (#310) | idem; texto fixo, sem dados da clínica |
| Aviso de privacidade | [`src/lib/privacy-notice-text.ts`](../../src/lib/privacy-notice-text.ts) | `v1` | ninguém aceita (informativo) | sem hash |
| Aviso dos direitos do titular ("Meus dados") | [`src/lib/data-rights-text.ts`](../../src/lib/data-rights-text.ts) | n/a | informativo | resume o item 7 do aviso |

Os marcadores `{{CLINICA_NOME}}`, `{{CLINICA_CNPJ}}`, `{{CLINICA_ENDERECO}}`,
`{{RESPONSAVEL_TECNICO}}`, `{{ENCARREGADO_NOME}}` e `{{ENCARREGADO_CONTATO}}` são trocados pelo
cadastro da clínica (`src/lib/legal-text.ts`). **O hash é do texto-base, com os marcadores**: mudar
o encarregado ou o endereço não derruba o aceite de ninguém. O que o paciente leu fica no aceite
(`controller_snapshot`: clínica, CNPJ, encarregado e canal).

## 2. Onde o paciente os encontra

| Onde | O quê |
| --- | --- |
| `/login` e rodapé do portal | link para [`/privacidade`](../../src/app/privacidade/page.tsx), o aviso **genérico** (sem login não se sabe a clínica) |
| Portal do paciente | aviso **da clínica** (com CNPJ e encarregado), os dois termos para aceitar, "Meus dados" |
| Documento impresso do consentimento | os dois termos com a clínica e o encarregado, para assinatura em duas vias |
| Todo e-mail pelo Resend | rodapé "Aviso de privacidade: `<APP_URL>/privacidade`" (sem `APP_URL` absoluta, sem rodapé) |

## 3. Pontos que ficaram em aberto na prévia e como foram decididos

Decididos em 2026-10-18 pelo coordenador, com a opção mais segura e coerente com as decisões do
dono ([ADR-030](../adr/030-textos-lgpd-ligados-sem-revisao-juridica.md) tem o porquê de cada um).
O jurídico pode reabrir qualquer um.

| # | Ponto | Decisão |
| --- | --- | --- |
| 1 | Controlador × operador | A **clínica** é controladora; o VittaFlow é **operador** |
| 2 | Encarregado | Nome e canal por clínica, em Configurações (Admin de Empresa). Sem eles vale o e-mail ou telefone de contato da clínica. Sem CNPJ **ou** sem nenhum canal, o aceite e o termo impresso respondem `409` |
| 3 | Base legal do prontuário | Tutela da saúde (LGPD, art. 11, II, "f") e obrigação legal (Lei 13.787/2018); o TCLE é o consentimento informado do tratamento, não a base da LGPD |
| 4 | Uso de foto fora do tratamento | **Não há**. O termo de imagem exclui aula, congresso e divulgação; qualquer uso futuro pede termo novo |
| 5 | Art. 33 para Resend e Google Agenda | O aviso diz que só se usam prestadores com mecanismo do art. 33. **Condição de go-live:** o jurídico confirma o mecanismo de cada um (runbook § 1) |
| 6 | Número do ato da ANPD sobre a adequação UE | O aviso cita o art. 33, I sem número; o jurídico confere no Diário Oficial (ADR-018) |
| 7 | Menores de 18 anos | O responsável legal assina o termo (item 6 de cada termo). O **portal** não aceita termos em nome do paciente (ADR-027); a assinatura é em papel, e a equipe **não tem como registrar o aceite em papel** do TCLE/imagem (só o do parceiro). Limite aceito, ver § 5 |
| 8 | O que o parceiro vê | O texto lista consultas, condições e avaliações dos últimos 24 meses, igual ao `GetPartnerPortalData`; não promete nada além disso |
| 9 | Texto longo no celular | Texto completo; resumo em camadas fica para depois da revisão |

## 4. Como trocar um texto depois da revisão jurídica

1. Troque o **texto e a versão juntos** no arquivo da § 1 (`v2` → `v3` etc.). O hash muda e **todo
   aceite anterior desse termo deixa de valer**: o paciente aceita de novo no portal, e a equipe
   refaz o de papel do parceiro (#310).
2. Se o texto mudou também o aviso de privacidade, suba `PRIVACY_NOTICE_VERSION` (não tem hash).
3. Atualize os testes de texto (`tests/lib/*consent-text.test.ts`) e esta tabela.
4. Quando o jurídico aprovar o conjunto, ponha `LEGAL_REVIEW_PENDING = false` em
   `src/lib/legal-text.ts`: o aviso de Configurações some. Registre a data e quem revisou em
   `.specs/STATE.md`.

## 5. Limites conhecidos desta versão

- **Sem revisão jurídica** (o motivo deste arquivo existir).
- **Menores:** sem registro de aceite em papel do TCLE e da imagem. Abrir ticket se a clínica
  atender menores com foto pelo portal.
- **Prazos do aviso** espelham a retenção (ADR-013, ADR-017); se mudarem lá, mudam em
  `privacy-notice-text.ts`.
- **Conta anonimizada ou paciente com e-mail de terceiro:** o aviso por e-mail só chega a quem
  tem conta de portal (PRO-RN-20).
- **Texto longo** em tela pequena: rolagem dentro do cartão.
