# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-15. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
PR (tira o que entregou, move o que mudou, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor.
O remoto e as issues valem se divergirem; quem notar corrige aqui.

## Estado

- **Produção:** v0.8.0 (commit `e985ec4`), publicada em 2026-11-15 pelo workflow *Release deploy* em um clique
  (backup `BACKUP_OK`, tag, deploy pela API do Coolify). Cifra completa (#730, #735 a #741, #860) e deploy em um
  clique (#750 a #752, #851) fechados.
- **Cadastros convertidos:** `data:reencrypt` regravou 2 linhas em `patients_identity`; a segunda rodada deu
  «Nada pendente: tudo na chave atual.». Falta só o dono conferir as buscas (nome, CPF, telefone) no app.
- **Não há release aberta.** Fluxo ADR-109: branch curta da `main`, PR para a `main`, CI como revisor,
  auto-merge, staging automática, produção em um clique do dono.
- Rollback da v0.8.0 = restaurar backup (a migração `0072`, CPF único, não é aditiva).

## Fila (ordem)

1. **Próximo bloco de funcionalidade:** o dono ainda não escolheu. Candidatas: **#855** e **#862** (E2E a frio em
   processo dedicado, P2, a #862 é classe 3).
2. **Contração da cifra (release seguinte):** drop de `birth_date` e dos índices GIN antigos.
3. **#742** (e-mail de login cifrado): em PR (classe 3, migração `0074` aditiva, ADR-111). Depois do deploy, o dono roda `npm run data:reencrypt` (agora também `user_accounts_email`) até «Nada pendente»; a contração (hash `NOT NULL`, fim do ramo em claro, drop dos índices antigos) vai na release seguinte.
4. **Segurança do VPS (P2):** endurecer o SSH (issue aberta junto deste PR; ação do dono no servidor).
5. Apontamentos menores: **#744**, **#745**, **#802**, **#820**, **#828**, **#830**, **#832**, **#849** (P3), **#715**.
6. **Perf e backlog:** v0.9.0 (#557 entregue; #558 entregue em PR; #815) e v0.10.0 (#615, #559, #541, #560, #651).
7. **RLS (spike #729 entregue, ADR-110), em ordem, classe 3, P1:** #870 (papéis e pools; migração `0075`, conferência do dono em `producao.md` § 4.1), #871 (set_config em toda unidade de trabalho; sem migração, `producao.md` § 4.2), #872 (políticas de baixo risco em `supplies`, `partners` e `schedule_closures`; na `main`, migração `0076`, `producao.md` § 4.3; a política só filtra quando a aplicação trocar de papel, depois da #889), #873 (políticas em 35 tabelas clínicas e financeiras, entre elas `procedure_supplies`, que ganha `clinic_id`; em PR, migrações `0077` a `0079`, `producao.md` § 4.4; fora dela `user_accounts`, `google_accounts` e `audit_events`, que a #874 ou um lote de identidade e auditoria precisa mapear), #889 (readiness e boot-migrate com o papel da aplicação; migração `0080`, `producao.md` § 4.5; em PR), #874 (etapa 5: políticas em `clinics`, `auth_tokens`, `user_mfa`, `mfa_recovery_codes` e FORCE nas 45 tabelas; migrações `0082` e `0083`, ordem obrigatória em `producao.md` § 4.7; scripts de operação na conexão de sistema, sem terceiro papel; sobra a troca de `DATABASE_URL` e `DATABASE_SYSTEM_URL` pelo dono). Depois de #557 e #558. Antes da #870, conferir com que papel a produção conecta.

## Espera o dono

- **#376** (parecer jurídico, condição para paciente real). Conferir as buscas após a conversão da v0.8.0.
- O check "Veredito do the-judge" já saiu do ruleset da `main` e o `veredito-judge.yml` foi apagado (ADR-109). Auto-merge está habilitado no repositório.
- Baixa prioridade: mapeamento de estados da integração GitHub↔Linear (fechar a issue move a EST sozinha).
