---
title: "ADR 115 — Cliente profissional autônoma com CPF cifrado e índice cego de escopo fixo (#977)"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-21
related:
  - docs/adr/096-pii-cifrada-em-repouso-com-indice-cego-e-busca-por-nome-em-memoria.md
  - docs/adr/111-email-de-login-cifrado-com-indice-cego-global.md
  - docs/adr/025-cpf-no-recibo-e-protecao.md
  - docs/domains/acesso/README.md
  - docs/domains/financeiro/README.md
---

# ADR 115 — Cliente profissional autônoma com CPF cifrado e índice cego de escopo fixo (#977)

- **Data:** 2026-11-21
- **Status:** aceito. Decisões do dono (Kalléo, 2026-11-20): o cliente pode ser pessoa jurídica (CNPJ) ou
  pessoa física (**só CPF**); o CPF da profissional é dado pessoal, cifrado e com índice cego; o recibo de
  pessoa física sai com o CPF dela, no modelo do Receita Saúde, sem nota fiscal.
- **Domínios afetados:** acesso (cadastro do cliente, cifra), financeiro (recibo), pacientes-prontuario
  (documentos e termos).

## Contexto

A primeira cliente é uma enfermeira estomaterapeuta autônoma, sem CNPJ. O cadastro, os documentos e o recibo
exigiam CNPJ (`REQUIRED_ON_CREATE`, `isClinicInfoComplete`, FIN-RN-15).

## Decisão

1. **Tipo de cliente** em `clinics.kind`: `company` (clínica, CNPJ) ou `individual` (profissional autônoma,
   só CPF). Linha existente nasce `company` (migração `0088`, aditiva). O tipo é escolhido na criação e fica
   fixo: trocar de tipo é cadastrar outro cliente (evita meio-estado com os dois documentos).
2. **Um documento por tipo.** A autônoma não grava CNPJ e a clínica não grava CPF: a gravação do documento
   do outro tipo é recusada (`400`). CPF validado pelo dígito verificador (`normalizeCpf`).
3. **CPF cifrado** em `clinics.cpf` com a `DATA_ENCRYPTION_KEY` (mesma chave e formato do cadastro do
   paciente, ADR-096) e **índice cego** em `clinics.cpf_hash`, tipo `provider-cpf`, **escopo fixo**
   `platform`: o CPF identifica o cliente entre todas as empresas, como o CNPJ em `uq_clinics_cnpj`. O tipo
   próprio impede que o hash bata com o CPF de um paciente. `uq_clinics_cpf_hash` recusa o mesmo CPF em dois
   cadastros (`400` "Já existe profissional autônoma com este CPF", também na corrida).
4. **Chave resolvida só quando há CPF.** O repositório de clínicas só lê a chave e o pepper ao cifrar ou
   decifrar um CPF; a clínica com CNPJ nunca depende deles.
5. **Responsável técnica é a própria profissional**: na autônoma, o nome do cadastro vale como responsável
   técnico, sem preencher duas vezes.
6. **Documentos e termos**: o timbre traz nome, CPF e COREN. Nos termos LGPD só o rótulo impresso muda
   ("Profissional:" e "CPF"); o texto-base e o hash do aceite não mudam, então nenhum aceite cai.
7. **Recibo de pessoa física** (Receita Saúde): prestadora com nome, CPF e COREN; pagador com CPF; quando
   outra pessoa paga, o CPF do paciente atendido (beneficiário) é obrigatório. Sem CPF, COREN ou CPF do
   beneficiário o recibo é bloqueado com orientação. O sistema gera os dados; o recibo oficial a profissional
   emite no Receita Saúde.
8. **Plataforma**: a lista mostra o CPF só mascarado (`***.***.789-**`); o detalhe, que edita o cadastro,
   mostra o número inteiro, como faz com o CNPJ.
9. **Recifra**: `npm run data:reencrypt` regrava o CPF fora da chave atual e recalcula o hash
   (`reencrypt-clinic-identity.ts`).

## Consequências

- Classe de risco 3 (cifra, escopo): clique no `aprovacao-classe-3`.
- Perguntas abertas (regra 5, não decididas aqui): autônoma que depois abre CNPJ (hoje é um cadastro novo);
  troca do termo "clínica" nas demais telas da equipe para a autônoma (esta mudança cobre cadastro,
  Configurações, documentos e recibo).
