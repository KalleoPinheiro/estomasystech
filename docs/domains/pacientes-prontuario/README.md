---
title: "Domínio: Pacientes e prontuário"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
domain: pacientes-prontuario
---

# Pacientes e prontuário

## Resumo

Cadastro do paciente e o prontuário de estomaterapia: anamnese, evoluções SOAP, condições
clínicas (estomias e feridas) com avaliações seriadas e fotos, planos de cuidado e documentos
clínicos. É dado de saúde sob LGPD: consentimento, imutabilidade e isolamento por empresa são
requisitos, não detalhes.

> **Textos do consentimento:** `CONSENT_TEXT` `v2` (TCLE de tratamento) e `IMAGE_CONSENT_TEXT` `v1` (fotos) estão ligados ao sistema, com revisão jurídica ainda pendente (`LEGAL_REVIEW_PENDING`, [ADR-030](../../adr/030-textos-lgpd-ligados-sem-revisao-juridica.md)). Como trocá-los: [`docs/legal/textos-lgpd.md`](../../legal/textos-lgpd.md).

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Patient`, `Guardian`, `Anamnesis`, `Evolution Note`, `Clinical Condition`, `Condition Assessment`, `Condition Photo`, `Consent Record`, `Data Subject Request`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| PRO-RN-01 | Paciente: nome ≥ 3 caracteres, e-mail de contato **opcional** (PRO-RN-20), telefone obrigatório e válido (PRO-RN-18); inativo não recebe agendamento | `src/domain/patient/patient.ts` |
| PRO-RN-02 | Evolução SOAP é imutável após registrada (exigência COFEN) e exige ao menos um campo | `src/domain/clinical/evolution-note.ts` |
| PRO-RN-03 | Autoria da evolução **e do plano de cuidados (abertura, execução de intervenção, avaliação de resultado)** vem sempre da sessão — o corpo da requisição não escolhe o profissional; registrar "em nome de" outro profissional não existe (#200) | `src/lib/auth/session-professional.ts`, `.specs/features/fase-b-clinico-legal-critico/` |
| PRO-RN-04 | Estomia exige tipo (colostomia, ileostomia, urostomia); ferida registra C×L×P em mm e área C×L | `src/domain/clinical/clinical-condition.ts`, `condition-assessment.ts` |
| PRO-RN-05 | Condição resolvida não recebe novas avaliações | `src/application/clinical/add-condition-assessment.ts` |
| PRO-RN-06 | Foto e registro exigem consentimento ativo; texto do termo versionado por hash (a foto exige o termo de **imagem**, PRO-RN-23) | `src/domain/consent/consent-record.ts` |
| PRO-RN-07 | Metadados de imagem (EXIF/GPS) removidos antes de gravar | `src/domain/clinical/image-sanitizer.ts` (AD-002) |
| PRO-RN-08 | Profissional só vê pacientes com quem tem consulta ou evolução — também nas rotas endereçadas por id de condição, foto, plano, intervenção ou resultado (sem vínculo: `404`) e na fila de triagem, filtrada pelos vinculados (#186) | `src/domain/clinical/professional-patient-link.ts`, `src/lib/auth/clinical-resource-scope.ts`, `tests/api/clinical-resource-scope-conformance.test.ts` |
| PRO-RN-09 | Atestado, relatório e plano de cuidados bloqueiam sem CNPJ e responsável técnico da empresa; atestado exige consulta `completed` | `src/app/documentos/` |
| PRO-RN-10 | Alergias aparecem em destaque no topo do prontuário | UI do prontuário |
| PRO-RN-11 | Exportação LGPD do titular (JSON com o prontuário completo) só para Admins e Profissional com vínculo; o link "Exportar dados (LGPD)" some para quem não pode exportar. O próprio paciente baixa o mesmo conteúdo pelo portal (POR-RN-13) | `src/app/api/patients/[id]/export/`, `src/application/patients/load-patient-data-export.ts`, `.specs/STATE.md` AD-025 |
| PRO-RN-12 | Todo texto clínico livre fica cifrado em repouso com `DATA_ENCRYPTION_KEY` (chave própria, separada do `AUTH_SECRET`): SOAP, anamnese, notas do paciente, da consulta, da lista de espera, da condição, da avaliação (inclusive pele periestomal e observação de complicações), da foto enviada pelo portal, do diagnóstico, da avaliação de resultado e do registro de intervenção. Fotos no bucket vão com `ServerSideEncryption` | [ADR-006](../../adr/006-chave-de-dados-clinicos.md), `src/lib/data-cipher.ts` |
| PRO-RN-13 | O binário da foto (`GET /api/photos/[id]` da equipe e `GET /api/portal/patient/photos/[id]` do paciente) sai com `Cache-Control: no-store` — a imagem não fica no cache do navegador depois do logout — e cada download grava `read`/`photo` na auditoria, com o paciente. Leitura no escopo da sessão (`sessionScope`); exclusão e triagem seguem em `writeScope`. O Super Admin continua sem acesso (`403`, ACE-RN-10) (#209) | `src/app/api/photos/[id]/route.ts`, `src/app/api/portal/patient/photos/[id]/route.ts`, `tests/api/photo-binary-read.test.ts` |
| PRO-RN-14 | SOAP ou anamnese cujo salvamento falha por sessão expirada (`401`) voltam ao formulário depois do novo login, com o aviso "Recuperamos o texto que não foi salvo…". O texto fica só no `sessionStorage` da aba, com o e-mail da conta: outra conta não o vê, e ele é apagado na primeira leitura (#207) | `src/lib/use-session-draft.ts` |
| PRO-RN-15 | Retenção do prontuário (#294): 20 anos depois da **última atividade clínica** do paciente (a mais recente entre cadastro, fim de consulta de qualquer status, anamnese, evolução, condição, avaliação, foto e plano de cuidados), o job de retenção anonimiza o paciente e o prontuário numa transação: nome vira "Paciente anonimizado", e-mail, telefone e CPF saem, nascimento vira 1º de janeiro do ano; todo texto livre (anamnese, SOAP, título e notas da condição, notas da avaliação e da foto, plano de cuidados, observação da consulta, motivo do retorno, IP dos consentimentos, texto dos pedidos do titular) é apagado; medidas, códigos, escalas, status, datas e valores ficam. A conta de portal do paciente é anonimizada junto, o vínculo com o responsável é desfeito e o responsável é apagado se nenhum outro paciente o usa (PRO-RN-21). Depois, o **arquivo** de cada foto é apagado do armazenamento e só então a foto é marcada; o registro fica. Nada é excluído; faturas não são tocadas | [spec](../../../.specs/features/retencao-anonimizacao/spec.md), [ADR-013](../../adr/013-retencao-por-anonimizacao.md), `src/infrastructure/persistence/drizzle/drizzle-retention-repository.ts` |
| PRO-RN-16 | Pedidos do titular (correção cadastral e eliminação/anonimização, POR-RN-14) vão para a fila **Pedidos do titular**, só do Admin de Empresa (família `administrative`; Profissional e Atendente `403`; pedido de outra empresa `404`). Aceitar ou recusar exige justificativa, vale uma vez (`409` depois, também sob decisões simultâneas) e grava `update`/`data_request` na auditoria **antes** de gravar a decisão e avisar o paciente. Aceitar **não** altera o cadastro nem o prontuário: a correção é feita na ficha, e a anonimização segue a política de retenção ([#294](https://github.com/KalleoPinheiro/estomasystech/issues/294)). O paciente é avisado por e-mail no endereço de **login da conta do portal** (não o do cadastro, que pode ser de outra pessoa; sem conta ativa, não há aviso e a resposta fica no portal), sem o conteúdo do pedido nem da justificativa; falha no envio não desfaz a decisão. **Prazo de 15 dias corridos** (LGPD, art. 19) a partir do recebimento, contados em dias de calendário no fuso `APP_TIMEZONE`: a fila mostra o dia limite e os dias restantes, e o pedido vencido fica destacado. O Admin de Empresa recebe e-mail a **cada pedido novo** (só o aviso e o link da fila, sem o texto) e **um** alerta quando falta `DATA_REQUEST_ALERT_DAYS` dias (padrão 3, de 1 a 14) ou o pedido já venceu, pelo cron diário e pelo canal de e-mail da clínica (sem canal, nada é marcado e o alerta sai quando houver); falha no envio não desfaz a criação do pedido (#312) Descrição e justificativa vão cifradas (PRO-RN-12) (#293) | `src/application/patients/{data-subject-requests,alert-data-request-deadlines}.ts`, `src/domain/patient/data-subject-request.ts`, `src/app/api/data-requests/`, `tests/api/data-subject-rights.test.ts` |
| PRO-RN-17 | Paciente anonimizado (PRO-RN-15) não é reativado (ADR-017): `PATCH /api/patients/:id` com `active: true` responde `409` "Paciente anonimizado não pode ser reativado. Cadastre a pessoa novamente."; a regra mora em `Patient.reactivate`. A lista de Pacientes mostra "Anonimizado" no lugar de "Reativar" (`anonymized` no DTO). Quem volta é cadastrado como paciente novo; o prontuário anonimizado continua fechado | [ADR-017](../../adr/017-retencao-decisoes-complementares.md), `src/domain/patient/patient.ts` |
| PRO-RN-18 | Telefone do paciente (#324): a recepção digita como quiser (máscara, com ou sem `+55`/`0055`, zero de tronco) e o sistema guarda **E.164 brasileiro** (`+5511999990000`). Aceita celular (DDD + 9 dígitos começando em 9) e fixo (DDD + 8 dígitos começando em 2–5); rejeita com mensagem clara: vazio, **sem DDD** (nunca adivinhado), DDD inexistente, celular sem o 9, tamanho errado e **número internacional**. Validação no domínio (`Patient.create`/`update`), logo vale na API e na tela de cadastro (que repete a checagem antes de enviar). **Legado**: paciente com telefone fora do padrão continua funcionando — editar outro campo, ou reenviar o mesmo telefone, não trava; só um telefone **novo** é validado. Esses pacientes saem com `phoneNeedsCorrection: true` no DTO e a lista/ficha mostram o selo "Corrigir telefone" (nenhuma migração de dados: a correção é feita na ficha; anonimizado não é sinalizado). A busca por telefone ignora a máscara. O link `wa.me` só é gerado com número válido: legado que ainda normaliza (ex.: `(11) 99999-0000`) funciona; o que não normaliza responde `400` com o motivo e **não** conta como clique (COM-RN-08). Parceiro mantém a regra antiga | `src/domain/shared/phone.ts`, `src/domain/patient/patient.ts`, `src/domain/messaging/whatsapp-link.ts`, `src/components/patient-phone.tsx`, `tests/domain/phone.test.ts` |
| PRO-RN-20 | E-mail de contato do paciente (#325): **opcional e repetível** na empresa (ex.: o do cuidador, vários pacientes sob o mesmo endereço); vazio vira `null`, preenchido precisa ser válido e é guardado em minúsculas. Não identifica o titular em lugar nenhum: o portal usa a conta vinculada (POR-RN-08) e o login da conta é outro e-mail, único. `PUT /api/patients/:id` com `email` omitido mantém, com `null` ou vazio remove. Sem e-mail, a lista e a ficha não mostram o campo e os lembretes por e-mail pulam o paciente (COM-RN-18). Migração `0057` (sem alterar dados existentes) | [ADR-023](../../adr/023-email-de-contato-do-paciente-e-login-do-portal.md), `src/domain/patient/patient.ts`, `src/domain/shared/person-validation.ts`, `drizzle/0057_*` |
| PRO-RN-21 | Responsável ou cuidador do paciente (#329): entidade da empresa (`guardians`, migração `0059`) com nome, parentesco (lista fechada), telefone E.164 (PRO-RN-18) e e-mail opcional, **só de contato** — sem conta nem portal. Um paciente tem no máximo um; um responsável liga vários da mesma empresa. Admin de Empresa e Atendente cadastram, editam, vinculam (`PUT /api/patients/:id` com `guardianId`; `null` desvincula), excluem; o Profissional só vê, embutido na ficha. Excluir com paciente ligado → `409`. Trilha: `create`/`update`/`delete` em `guardian` (só os campos, nunca o contato) e `update`/`patient` ao trocar o vínculo. Entra na exportação do titular; sai com o último paciente anonimizado (PRO-RN-15). Termo de consentimento imprime nome e parentesco (CPF em branco). Lembretes: COM-RN-19. Com conta de portal (ADR-027, ACE-RN-56, POR-RN-21), o responsável acessa o portal em nome do paciente; o cadastro com conta não pode ser excluído (`409`) | [ADR-024](../../adr/024-responsavel-do-paciente.md), `src/domain/guardian/`, `src/app/api/guardians/`, `src/app/(staff)/pacientes/[id]/guardian-panel.tsx`, `tests/api/guardian-routes.test.ts` |
| PRO-RN-19 | Painel de consentimento para o parceiro indicador na ficha (#310): mostra se o paciente autorizou, a **origem** (portal ou papel, com quem lançou) e permite revogar; o Admin de Empresa e o Atendente também **registram o consentimento dado em papel** (regra completa em [POR-RN-16](../portal/README.md)). `/api/patients/:id/partner-consent` não é prontuário: a recepção acessa, o Profissional não registra em papel | `src/app/(staff)/pacientes/[id]/partner-consent-panel.tsx`, `src/app/api/patients/[id]/partner-consent/` |
| PRO-RN-22 | CPF do paciente (#326, [ADR-025](../../adr/025-cpf-no-recibo-e-protecao.md)): **opcional** no cadastro (idoso, estrangeiro) e, quando informado, validado pelos dois dígitos verificadores (sequências repetidas recusadas) e guardado em 11 dígitos. Cifrado em repouso como o texto clínico (PRO-RN-12). Telas e API da equipe mostram só `***.***.247-**`; o CPF inteiro sai no recibo (FIN-RN-15) e na exportação do titular. Em branco na edição mantém o guardado; a tela troca mas não remove (remover é `cpf: ""` na API). Sem busca nem unicidade por CPF. A anonimização (PRO-RN-15) apaga o CPF. O portal e o parceiro não recebem CPF | `src/domain/shared/cpf.ts`, `src/domain/patient/patient.ts`, `tests/domain/cpf.test.ts` |
| PRO-RN-23 | **Dois termos, duas finalidades** (#216, [ADR-030](../../adr/030-textos-lgpd-ligados-sem-revisao-juridica.md)): o aceite tem `purpose` (`treatment` = TCLE, `image` = fotos) e cada um vale só para a sua finalidade; o envio de foto pelo portal e o registro de foto exigem o termo de imagem. O hash é do **texto-base** (com `{{marcadores}}`), então mudar o cadastro da clínica não derruba aceites; a clínica e o encarregado que o paciente viu ficam em `controller_snapshot`. Sem CNPJ ou sem canal de contato a clínica não renderiza o termo: `409` (falha fechada). Aceites antigos valem como `treatment`. Migração `0064`. Termos impressos em `/documentos/consentimento/:id`. Paciente menor não aceita: o representante legal (mãe, pai, tutor) aceita e revoga pelo portal e o registro guarda quem assinou (POR-RN-26, [ADR-032](../../adr/032-paciente-menor-no-portal-pelo-representante-legal.md)); esse aceite vence 90 dias depois dos 18 anos se o paciente não aceitar em nome próprio (POR-RN-28, [ADR-033](../../adr/033-direitos-do-menor-pelo-representante-e-prazo-do-aceite.md)) | `src/lib/legal-text.ts`, `src/lib/consent-documents.ts`, `src/domain/consent/consent-record.ts`, `tests/api/consent-purposes.test.ts` ([#216](https://github.com/KalleoPinheiro/estomasystech/issues/216)) |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Cadastro, busca e desativação de paciente (CPF opcional, PRO-RN-22) | entregue | `/pacientes` |
| Anamnese estruturada | entregue | `/pacientes/[id]` |
| Evoluções SOAP | entregue | `/pacientes/[id]` |
| Condições, avaliações seriadas, gráfico de cicatrização | entregue | `/pacientes/[id]` |
| Fotos (equipe e envio remoto pelo paciente) e fila de triagem | entregue | `/pacientes/[id]`, `/triagem` |
| Plano de cuidados (diagnóstico, intervenção, resultado) | entregue | `/pacientes/[id]` |
| Documentos: atestado, relatório, plano, consentimento | entregue | `/documentos/*` |
| Responsável ou cuidador: cadastro, vínculo a vários pacientes, contato nos lembretes e no termo | entregue | ficha do paciente, `/api/guardians` ([#329](https://github.com/KalleoPinheiro/estomasystech/issues/329)) |
| Fila de pedidos do titular (correção e eliminação vindas do portal) | entregue | `/pedidos-titular` ([#293](https://github.com/KalleoPinheiro/estomasystech/issues/293)) |

Specs de execução: `.specs/features/{fase-3-compliance-ux-clinico,fase-b-clinico-legal-critico,prontuario-p1-p3-pontuais,documentos-clinicos-pontuais}/`. PRD: [fase 1](../../product/prd-fase-1.md).

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{patient,guardian,clinical,consent,taxonomy}/` |
| casos de uso | `src/application/{patients,guardians,clinical,taxonomy}/` |
| API | `src/app/api/{patients,guardians,data-requests,conditions,photos,care-plans,care-plan-interventions,care-plan-outcomes,documents,taxonomy}/` |
| UI | `src/app/(staff)/{pacientes,triagem,pedidos-titular}/`, `src/app/documentos/` |
| testes | `tests/domain/`, `tests/application/`, `e2e/{pacientes,clinico,triagem,plano-cuidados,documentos}.spec.ts` |
| exceções | [`excecoes.md`](excecoes.md) — matriz de casos de exceção e o teste de cada um |

## Decisões

- `.specs/STATE.md` AD-002 — sanitização de imagem em TypeScript puro, sem `sharp`
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — acesso clínico do Profissional por vínculo
- [ADR-024](../../adr/024-responsavel-do-paciente.md) — responsável do paciente: entidade própria, só de contato
- [ADR-006](../../adr/006-chave-de-dados-clinicos.md) — chave dedicada e versionada para o dado clínico
- Integração: [armazenamento de fotos](../../engineering/integrations/s3-storage.md)
