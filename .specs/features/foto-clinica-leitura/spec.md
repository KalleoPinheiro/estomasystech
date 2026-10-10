# Leitura do binário da foto clínica — Specification

Issue: #209 (origem: revisão pré-produção #183)

## Problem Statement

As duas rotas que servem o binário da foto de ferida/estomia — a da equipe
(`GET /api/photos/[id]`) e a do paciente (`GET /api/portal/patient/photos/[id]`)
— respondiam com `Cache-Control: private, max-age=3600`: num computador
compartilhado, a imagem ficava 1 h no cache do navegador depois do logout. O
download também não deixava rastro na auditoria (só a listagem de fotos
auditava), e a rota da equipe lia com `writeScope`, ao contrário das demais
leituras (`sessionScope`).

## Goals

- [x] `Cache-Control: no-store` nas duas rotas de binário.
- [x] Cada leitura do binário grava `recordAudit` com `action: read`,
      `resourceType: photo`, `resourceId` e `patientId`.
- [x] Leitura em `sessionScope`; `DELETE` e `PATCH` seguem em `writeScope`.
- [x] Testes de rota para os três pontos.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Dar ao `super_admin` acesso a fotos de outras empresas | Contradiz o [ADR-007](../../../docs/adr/007-super-admin-operador-da-plataforma.md) (opção B: sem acesso clínico; abrir exige ADR novo). Ver "Contradição com o ADR-007" abaixo |
| R4 (vínculo do Profissional) | Já entregue na #186 (`assertClinicalResourceAccessible`, PRO-RN-08) |
| Auditoria write-ahead (`recordAuditNow`) na leitura | A issue pede `recordAudit`, o mesmo da listagem; write-ahead fica para exportação e exclusão |

## Contradição com o ADR-007

O item 3 da issue diz que o `super_admin` "não consegue ver fotos de outras
empresas, ao contrário das demais leituras, que são auditadas como acesso
cross-empresa (ACE-RN-10)". Essa leitura do ACE-RN-10 é anterior ao ADR-007: hoje
`/api/photos` pertence à família `clinical` (`src/lib/auth/route-family.ts`),
cujos papéis são só `company_admin` e `profissional`, e o super_admin recebe
`403` no proxy e no handler (`requireStaffSession`). O comportamento foi
confirmado por teste (`tests/api/photo-binary-read.test.ts`) e **não muda**. A
contradição fica como pergunta aberta para @KalleoPinheiro na PR.

## Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Valor do cabeçalho | `no-store` (não `private, no-cache`) | Mesmo da exportação LGPD; o mais conservador dos dois que a issue aceita |
| Escopo da rota do portal | Também `sessionScope` | Leitura, como as demais rotas `GET` do portal (`/api/portal/patient`, `consent`, `slots`) |
| Auditar a leitura do próprio paciente | Sim, ator `patient` | O critério fala em "leitura do binário", e a issue aplica as correções às "duas rotas de binário"; a listagem e o envio do portal já auditam |
| Auditar só quando o binário sai | Evento gravado depois de achar foto e arquivo; `404` e `403` não gravam | Registra quem de fato abriu a imagem |

**Efeito do `sessionScope`:** pela `CHECK` do ADR-007 toda conta que não é
super_admin tem empresa, e o super_admin não passa da guarda. Para toda sessão
que chega ao handler, `sessionScope` e `writeScope` resolvem para a mesma
empresa; a troca alinha a rota ao padrão de leitura. No modo aberto de dev (sem
sessão) o storage de fotos continua na clínica legada
(`buildPhotoStorage(tenant.clinicId ?? LEGACY_CLINIC_ID)`), então nada novo fica
legível.

## Acceptance Criteria

1. WHEN a equipe da empresa baixa o binário THEN a resposta SHALL trazer
   `Cache-Control: no-store`.
2. WHEN o paciente baixa a própria foto pelo portal THEN a resposta SHALL trazer
   `Cache-Control: no-store`.
3. WHEN o binário é servido (equipe ou paciente) THEN o sistema SHALL gravar um
   evento `read`/`photo` com o id da foto e o `patientId`, na empresa da sessão.
4. WHEN a foto é de outra empresa THEN a rota SHALL responder `404` e SHALL NOT
   gravar evento de leitura.
5. WHEN a sessão é `super_admin` THEN a rota SHALL responder `403` e SHALL NOT
   servir o binário nem gravar leitura.
6. A rota da equipe SHALL ler com `sessionScope`; `DELETE` e `PATCH` SHALL
   seguir com `writeScope`.

## Test Coverage

| Critério | Teste |
| --- | --- |
| 1, 3 | `tests/api/photo-binary-read.test.ts` |
| 2, 3 | `tests/api/portal-routes.test.ts` (no-store e audita a leitura) |
| 4 | `tests/api/photo-binary-read.test.ts`, `tests/api/photo-tenant-isolation.test.ts` |
| 5 | `tests/api/photo-binary-read.test.ts` |
| 6 | revisão do código; não há sessão que distinga os dois escopos (ver "Efeito do `sessionScope`") |
