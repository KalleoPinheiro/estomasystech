---
title: "ADR 111 — E-mail de login cifrado em repouso com índice cego global"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-21
related:
  - docs/adr/096-pii-cifrada-em-repouso-com-indice-cego-e-busca-por-nome-em-memoria.md
  - docs/adr/003-modelo-de-papeis-multi-empresa.md
  - docs/engineering/migracoes-aditivas.md
---

# ADR 111 — E-mail de login cifrado em repouso com índice cego global

- **Data:** 2026-11-15
- **Status:** aceito (issue #742; segue o [ADR-096](096-pii-cifrada-em-repouso-com-indice-cego-e-busca-por-nome-em-memoria.md),
  que deixou `user_accounts.email` de fora por decisão do PO).
- **Domínios afetados:** acesso (login, convite, recuperação de senha, segundo fator, recuperação do super_admin).

## Contexto

O e-mail de login é dado pessoal e era a única identidade ainda em claro no banco. Ele também é a **chave de
login**: `findAllByEmail` procura a conta antes de saber a empresa, porque o mesmo e-mail pode existir em
empresas diferentes (ADR-003, ACE-RN-09), e a senha desambigua. A cifra do ADR-006 não é determinística, então
`WHERE email = ?` e os índices únicos `(clinic_id, email)` e `(email) WHERE clinic_id IS NULL` deixam de
funcionar sobre o valor cifrado.

## Decisão

1. **Coluna `email` cifrada** com a mesma cifra de campo (`FieldCipher`, `DATA_ENCRYPTION_KEY`). O domínio
   (`UserAccount`) continua vendo o e-mail legível: só o repositório cifra e decifra.
2. **Coluna nova `email_hash`** com o índice cego do ADR-096 (`b1.<keyId>.<hex>`, mesmo pepper
   `BLIND_INDEX_PEPPER`, rotação por `BLIND_INDEX_PEPPER_PREVIOUS`), com tipo próprio `login-email` para que o
   hash do e-mail de uma conta nunca bata com o do e-mail de um paciente.
3. **O hash do e-mail de login é global, sem `clinicId`** (usa o escopo fixo `login`). É a diferença para o
   ADR-096: ali o `clinicId` entra no hash para não correlacionar pacientes entre empresas; aqui o login precisa
   achar as contas de **todas** as empresas por um único hash. Quem lê um dump já vê os e-mails de todas as
   empresas na mesma tabela; o ganho de segurança do escopo por empresa seria nulo e o login quebraria.
4. **Unicidade pelo hash:** índices únicos novos `(clinic_id, email_hash)` (parcial, hash não nulo) e
   `(email_hash) WHERE clinic_id IS NULL` (o super_admin). Os índices antigos sobre o e-mail em claro ficam até a
   contração, inofensivos (o valor cifrado nunca repete).
5. **Expandir, converter, contrair.** Migração `0074` aditiva (coluna e índices novos; reversível pelo código
   anterior até a conversão). O código novo **lê com tolerância**: acha a conta pelo hash **ou** pelo e-mail
   em claro de linha ainda não convertida, e lê o e-mail decifrando (claro passa como está). Grava sempre cifrado
   com hash. A conversão dos dados existentes é o `npm run data:reencrypt` estendido (`user_accounts_email`):
   cifra o e-mail em claro, preenche ou recalcula o hash, pula conta anonimizada e e-mail que não normaliza (só o
   id vai para o log), é idempotente e roda mais de uma vez sem dano. Na release seguinte (contração): `email_hash`
   `NOT NULL` só para conta ativa (emenda: [ADR-114](./114-decisoes-de-produto-oferta-de-vaga-relatorio-parceiro-e-email-hash-anonimizado.md)), fim do ramo em claro e `DROP` dos dois índices antigos.
6. **Ordem por e-mail e conta anonimizada.** O banco não ordena cifra: `findAll`, `findByRole` e o relatório de
   contas de portal ordenam em memória (a lista de uma clínica é pequena, `MAX_ROWS`). A anonimização da
   retenção zera o `email_hash` (o endereço `anonimizado+<id>@anonimizado.invalid` não é pessoal e fica em claro).
7. **Recuperação do super_admin** (`admin:recover`) passa a ler e gravar o e-mail cifrado, com o hash, e a
   checagem de "e-mail em uso" usa o hash.

## Emenda (2026-11-19, #909): conta anonimizada e conta ativa

Decisão do dono (regra 5, registrada no [ADR-114](./114-decisoes-de-produto-oferta-de-vaga-relatorio-parceiro-e-email-hash-anonimizado.md)), que fecha a pergunta aberta da contração:

- **Conta anonimizada:** `email_hash` fica **vazio (NULL)**. A retenção já grava `email_hash = NULL` junto de `anonymized_at`;
  o `email` vira o endereço sintético `anonimizado+<id>@anonimizado.invalid` (não é pessoal). Sem valor sentinela por conta:
  nada que ligue a linha ao endereço antigo.
- **Conta ativa:** `email_hash` é **obrigatório**, garantido pelo banco com `CHECK (anonymized_at IS NOT NULL OR email_hash
  IS NOT NULL)` (`ck_user_accounts_email_hash_conta_ativa`, migração `0086`). Não usamos `NOT NULL` na coluna porque ele
  proibiria a anonimização.
- **Passos seguros:** a `0086` adiciona a restrição `NOT VALID` (vale para toda escrita nova, não varre a tabela, rollback é
  um `DROP CONSTRAINT`). Falta, em migração própria, o `VALIDATE CONSTRAINT`, depois do fim do ramo em claro, e o `DROP`
  dos dois índices antigos sobre `email`; esses passos seguem na fila da contração.
- A conta anonimizada continua fora do `data:reencrypt`. Sem hash, o ramo por `email_hash` não a acha; enquanto o ramo em
  claro existir, o endereço sintético ainda pode casar na busca, mas a conta tem senha inválida e `active = false`, então o
  login não autentica.

## Contração feita (2026-11-21, migração `0091`)

- `loginEmailCondition` procura só por `email_hash` (o atual e os peppers da rotação). Sem hash (e-mail que não
  normaliza), a condição é `false`. Conta ainda em claro deixa de ser achada no login.
- A `0091` faz o `VALIDATE CONSTRAINT ck_user_accounts_email_hash_conta_ativa` e o `DROP` de
  `uq_user_accounts_clinic_email` e `uq_user_accounts_super_admin_email`. A unicidade é só dos índices sobre `email_hash`.
- Precondição: `sem indice cego=0` na verificação de integridade. Conta ativa sem hash deixa de entrar no login (falha
  fechada); se houver alguma, a `0091` não valida a restrição (segue `NOT VALID`, já imposta a toda escrita desde a `0086`)
  e avisa com `WARNING`: rodar `data:reencrypt` e validar à mão (SQL no cabeçalho da `0091`). Rollback: redeploy da tag anterior (ela já grava cifra e hash e não
  depende dos índices removidos); o SQL para recriar os índices está no cabeçalho da `0091`.
- `data:reencrypt` (`user_accounts_email`) continua: segue útil na rotação de chave e de pepper.

## Opções descartadas

- **Hash por empresa (como o ADR-096):** o login não sabe a empresa; teria de varrer todas as empresas. Descartada.
- **Cifra determinística da coluna inteira:** vaza igualdade e foge do padrão do projeto (ADR-096, opção D).
- **Cifrar tudo de uma vez, sem janela:** o deploy e a conversão não são atômicos; o ramo em claro evita que
  alguém fique sem login entre os dois.

## Consequências

- Dump, backup ou disco do banco deixam de revelar o e-mail de login; só o hash (inútil sem o pepper) e a cifra.
- **Rollback de código depois da conversão trava o login** (a versão antiga procura o e-mail em claro). Antes de
  rodar `data:reencrypt` em produção o dono já tem o backup do deploy; reverter depois da conversão = restaurar
  o backup (`producao.md` § 3.1, passo 5).
- Perder o pepper não perde o e-mail (a cifra tem o valor), mas o login fica fora até reindexar com
  `data:reencrypt`, como já vale para CPF, telefone e e-mail do cadastro.
- A sessão carrega o e-mail como `subject` no cookie assinado: fora do escopo (não é o banco em repouso).

## Relacionado

- [ADR-096](096-pii-cifrada-em-repouso-com-indice-cego-e-busca-por-nome-em-memoria.md),
  [ADR-006](006-chave-de-dados-clinicos.md), [ADR-003](003-modelo-de-papeis-multi-empresa.md),
  [ADR-009](009-recuperacao-de-emergencia-do-super-admin.md), [`migracoes-aditivas.md`](../engineering/migracoes-aditivas.md).
