---
title: "ADR 096 — PII cifrada em repouso, índice cego só para CPF, telefone e e-mail, e busca por nome em memória"
status: frozen
audience: [dev, ops, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-09
related:
  - docs/adr/006-chave-de-dados-clinicos.md
  - docs/adr/025-cpf-no-recibo-e-protecao.md
  - docs/adr/001-multi-tenancy.md
  - docs/adr/060-redacao-central-de-pii-nos-logs.md
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
---

# ADR 096 — PII cifrada em repouso, índice cego só para CPF, telefone e e-mail, e busca por nome em memória

- **Data:** 2026-11-09
- **Status:** aceito (issue #733; origem: #730 e a avaliação de 2026-11-08; decisões do PO registradas no Contexto).
  **Emenda** o [ADR-025](025-cpf-no-recibo-e-protecao.md) (a consequência "sem busca nem unicidade por CPF") e
  **estende** o [ADR-006](006-chave-de-dados-clinicos.md) (a lista de campos cifrados). Nenhum dos dois é editado.
- **Domínios afetados:** pacientes-prontuario, agenda, acesso (infraestrutura de chave)

## Contexto

O ADR-006 cifra o texto clínico e o ADR-025 cifra o CPF. O cadastro, porém, segue em claro no banco: nome completo,
e-mail, telefone e data de nascimento do paciente, e os mesmos dados do responsável (`guardians`). Quem lê um dump,
um backup ou o disco do banco identifica o paciente e liga a pessoa ao tratamento. Isso é o risco que a LGPD trata
com mais peso neste produto, e a produção ainda não tem paciente real (pendente #376): **é o menor custo de migração
que existirá**.

O que o código faz hoje e que a decisão precisa respeitar (avaliação da #730):

- A busca é `ilike` sobre nome, e-mail e telefone, apoiada por três índices GIN `pg_trgm` e `idx_patients_full_name`.
- A listagem ordena por `full_name` no SQL e pagina por keyset (`gt(fullName, cursor.fullName)`). O cursor opaco é
  `base64({fullName, id})` e viaja na URL (`?cursor=`): **já vaza o nome** em log de acesso e histórico.
- `birth_date` é usado em SQL: aviso de maioridade (`lte(birthDate, corte)`, #372) e `date_trunc('year', …)` na
  anonimização (ADR-013/017).
- O CPF é opcional (ADR-025): idoso, estrangeiro e criança podem não ter. A recepção e o seletor da agenda
  (`patient-picker.tsx`: 2 letras, 20 resultados, debounce 250 ms) acham paciente **pelo nome**.
- `guardians`, `partners`, `professionals` e `user_accounts.email` guardam dado pessoal em claro.
- O ADR-069 proíbe cache compartilhado de dado de clínica; o ADR-001 isola por `clinic_id` e a RLS (#729) é um spike
  independente.

A proposta original da #730 era cifrar o cadastro e buscar paciente **somente por CPF** exato. Decisões do PO
(coordenador, 2026-11-08), já tomadas e não reabertas aqui: o responsável (`guardians`) **entra no escopo**; CPF
duplicado na mesma clínica **bloqueia** o cadastro; `user_accounts.email` (chave de login) **fica fora** agora
(backlog #742).

## Opções consideradas

Para a **busca por nome** depois de cifrar:

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Decifrar e filtrar em memória, por clínica | Banco só tem cifra; texto claro existe só no processo, na requisição; acha qualquer trecho e ignora acento | Custo de CPU e de linhas lidas; sem cache entre requisições (ADR-069) |
| B — Índice cego de tokens, prefixos ou trigramas do nome | Busca no SQL | "maria" e "silva" têm a mesma frequência no banco: análise de frequência quebra o índice mesmo sem a chave; só prefixo/token inteiro |
| C — HMAC do nome completo normalizado | Simples | Mesma fraqueza de B para nomes comuns; só acha o nome inteiro exato, inútil para quem digita 3 letras |
| D — Cifra que preserva ordem ou busca (OPE, searchable encryption) | Ordena e busca no SQL | Vaza a ordem; fora do padrão do projeto |
| E — Nome em claro, cifrar só o resto | Nada muda na busca | O nome com o telefone ainda identifica o paciente |
| F — Buscar só por CPF (proposta original) | Mais simples de implementar | Paciente sem CPF fica inalcançável; recepção trava; o autocomplete da agenda deixa de existir |

Para o **índice cego** dos campos de valor exato: HMAC com pepper próprio (escolhida), HKDF a partir da
`DATA_ENCRYPTION_KEY` (aceitável, uma variável a menos) ou hash sem segredo (descartada: CPF tem 11 dígitos, o
espaço se enumera em segundos).

## Decisão

**Opção A para o nome; índice cego (HMAC) só para CPF, telefone e e-mail; tudo o mais cifrado.**

1. **Cifrar em repouso** com a cifra do ADR-006 (`FieldCipher`, `DATA_ENCRYPTION_KEY`): do **paciente**, `full_name`,
   `email`, `phone` e `birth_date`; do **responsável** (`guardians`), nome, telefone e e-mail. `birth_date` passa de
   `timestamp` a `text` cifrado. `partners` e `professionals` ficam para uma onda própria (decisão de produto, não
   criada aqui). `user_accounts.email` fica fora (#742).
2. **Busca por nome em memória, dentro da clínica.** O repositório lê só `id` e `full_name` cifrado em lotes (teto de
   linhas e aviso quando atingido; o `MAX_ROWS = 500` atual não serve para varrer a clínica), normaliza (sem acento,
   sem caixa), filtra e ordena em memória, e decifra o restante só da página devolvida. Não há dicionário
   determinístico do nome no banco. Os quatro índices (`pg_trgm` x3 e `idx_patients_full_name`) saem na contração.
3. **Índice cego de valor exato, nunca de nome nem de nascimento.** `cpf_hash`, `phone_hash`, `email_hash` =
   `HMAC-SHA256(pepper, clinicId + ":" + valorNormalizado)`, formato `b1.<keyId>.<hex>`. O `clinicId` no hash faz o
   mesmo CPF gerar hashes diferentes em empresas diferentes (sem correlação entre clínicas) e independe da RLS.
   Normalizar antes do hash, com funções puras no domínio: CPF só dígitos e válido (`domain/shared/cpf.ts`), telefone
   E.164, e-mail minúsculo e aparado. Valor vazio ou nulo gera hash `null`, nunca o hash de string vazia. Trocar ou
   remover o CPF recalcula ou zera o hash. Nome e data de nascimento ficam sem índice: espaço pequeno e frequência
   vazável.
4. **Pepper próprio:** `BLIND_INDEX_PEPPER` (≥ 32 caracteres), derivado por HKDF com `info` próprio, id de chave no
   valor, `BLIND_INDEX_PEPPER_PREVIOUS` na rotação (a busca testa o hash atual **e** os anteriores até
   `npm run data:reencrypt` recalcular tudo). Mora em `src/lib/blind-index.ts`, injetado como a cifra é. Em
   produção, ausente = falha fechada; em desenvolvimento, deriva com aviso, como a cifra faz. Não criar outra
   implementação de AES.
5. **CPF duplicado bloqueia:** índice único parcial `(clinic_id, cpf_hash)` onde `cpf_hash` não é nulo, com mensagem de
   negócio. Busca por CPF, telefone e e-mail é **adicional** à busca por nome, nunca a substitui.
6. **Cursor sem nome.** A paginação em memória usa posição opaca ou `id`; o cursor deixa de carregar `fullName`.
7. **CPF digitado não vai na URL.** A busca por documento usa `POST` ou Server Action (não entra no log de acesso). O
   termo de nome pode seguir em `?search=` por ora; é o ponto fraco restante e fica registrado na verificação final.
8. **Maioridade e retenção em memória.** `findAdultsAwaitingMajorityReview` filtra por `guardian_id` (indexado) e
   decifra o nascimento; a anonimização decifra, trunca para o ano e recifra (substitui o `date_trunc` do SQL).
9. **Expandir e contrair, nunca de uma vez.** Migração aditiva (`docs/engineering/migracoes-aditivas.md`): adicionar
   colunas e hashes, ler com tolerância a claro (a cifra devolve texto claro como está, o que dá a janela), recifrar
   com `data:reencrypt` estendido, só então apertar `NOT NULL` e unicidade e remover os índices GIN. A migração é
   revisada no PR e **aplicada em produção pelo Kalléo, com backup antes** (`producao.md`); o agente nunca a aplica.
10. **Logs e trilha.** `scrubText`/`redactValue` (ADR-060) continuam; acrescenta-se redação do nome do paciente em
    `message` de erro e um teste de que nenhum log nem `before/after` da auditoria leva os campos cifrados.
11. **Verificação objetiva do critério "sem legível no banco":** teste de integração em Postgres real
    (`test:integracao`) que lê `full_name`, `phone`, `birth_date` e e-mail direto da tabela e só encontra cifra, mais
    consulta no banco do ambiente local na validação final. Olhar não basta.

Por que venceu. A opção **F** foi desqualificada porque o CPF é opcional por decisão do PO: paciente sem CPF seria
inalcançável. **B** e **C** foram desqualificadas porque cifrar o nome e deixar ao lado um índice determinístico dele
entrega a distribuição por análise de frequência e anula o ganho. **D** vaza ordem. **E** deixa o paciente
identificável. **A** é a única que mantém o banco sem texto claro e a busca funcional; o ganho de segurança de
remover a busca por nome seria pequeno, porque o risco tratado é vazamento de banco e backup, e a busca em memória
não escreve nada em claro. A decisão de **índice cego só onde o valor é exato e de alta entropia** é a evolução que o
próprio ADR-025 previu ("reabrir com hash determinístico (HMAC) separado").

**Desempenho esperado (medido na avaliação, AES-256-GCM, 3 campos por paciente):** 1.000 pacientes ~18 ms, 5.000 ~76 ms,
20.000 ~380 ms de decifra, fora leitura e serialização. Uma clínica de estomaterapia tem de centenas a poucos
milhares de pacientes. Será medido com seed de 5 mil pacientes no gate de performance (ADR-074) e o resultado decide o
teto e o tamanho do lote. Se uma clínica passar de ~10 mil, o plano B é um índice cego exato de **primeiro nome**,
decisão a tomar só então, em ADR próprio.

**Gestão de chaves.** O pepper é uma variável de runtime a mais (produção passa de 10 a 11 variáveis, em `producao.md`
§ 0), com cópia no cofre, e entra na checklist de deploy e no `docker-compose.yml`. A homologação (Vercel `staging`)
leva **valor diferente** do da produção e precisa estar configurada **antes** do merge que a exige, senão o deploy da
staging falha fechado. CI, gate local, E2E e docker-smoke usam valor fixo de teste nos mesmos arquivos que hoje levam a
`DATA_ENCRYPTION_KEY`; `scripts/gate/` é regra 8 e só o Kalléo mexe nele. Perda do pepper é recuperável (gera outro e
reindexa decifrando o CPF com a chave de dados); perda da chave de dados segue irrecuperável (ADR-006). Honestamente:
o pepper separado protege pouco contra quem já tem a chave AES; o ganho real é independência de rotação e de
custódia, que justifica o custo baixo de uma variável.

**Relação com a RLS (#729).** Independentes e complementares: a cifra protege contra dump, backup e leitura do disco;
a RLS protege contra filtro de `clinic_id` esquecido. A busca em memória exige consulta com escopo correto
(`sessionScope`/`writeScope`, regra 1), então a RLS reduz o risco dessa abordagem. O `systemScope()` (retenção, cron)
lê entre empresas e precisa do mesmo `FieldCipher`. Sem conflito de ordem.

## Consequências

**Positivas**

- Dump, backup ou leitura do disco não identificam mais o paciente nem o responsável.
- Detecção de CPF duplicado e busca exata por CPF, telefone e e-mail, sem nova superfície de vazamento.
- A busca por nome ignora acento e caixa (melhor que o `ilike`); o cursor para de vazar o nome.
- Paciente sem CPF continua achável; nenhum fluxo da recepção e da agenda é removido.
- Rotação do pepper independente da chave de dados.

**Negativas / custos aceitos**

- A busca por nome custa CPU e leitura proporcionais ao tamanho da clínica, sem cache entre requisições (ADR-069).
- Ordenação e paginação deixam de ser do SQL; o `InMemoryPatientRepository` precisa do mesmo comportamento.
- `birth_date` perde comparação e `date_trunc` no SQL; maioridade e retenção passam a decifrar em memória.
- Uma variável de ambiente e uma rotina de rotação a mais; staging configurada antes do merge.
- Migração em três etapas (expandir, recifrar, contrair) e `data:reencrypt` mais longo.
- Quem tem a chave AES e o pepper ainda reconstrói tudo: a proteção é contra o dado em repouso, não contra o servidor
  comprometido.

**O que esta decisão fecha:** busca por nome no SQL (índice ou `ilike`) e qualquer índice determinístico de nome ou de
nascimento; reabrir exige ADR novo que supere este. Muda o contrato de paginação do paciente (cursor opaco sem nome).

## Plano (tickets da v0.7.0/v0.8.0)

#733 este ADR · #734 infra de chave · #735 migração 0071 e cifra do paciente · #736 busca e cursor · #737 maioridade e
anonimização · #738 CPF duplicado bloqueia · #739 responsável · #740 medição (ADR-074) · #741 validação ponta a ponta ·
#742 e-mail de login (backlog). Pendências do Kalléo: criar o valor de produção do pepper no cofre e configurar a
variável na Vercel `staging` e no Coolify; aplicar a migração em produção com backup antes.

## Relacionado

- [ADR-006](006-chave-de-dados-clinicos.md) — chave e formato da cifra; estendido na lista de campos.
- [ADR-025](025-cpf-no-recibo-e-protecao.md) — CPF cifrado; emendado na consequência "sem busca nem unicidade".
- [ADR-060](060-redacao-central-de-pii-nos-logs.md), [ADR-069](069-dados-no-servidor-e-politica-de-cache.md),
  [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md), [ADR-001](001-multi-tenancy.md).
- Issues #730 (origem), #733 (este ADR), #734–#741; backlog #742.
