# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-17. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
PR (tira o que entregou, move o que mudou, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor.
O remoto e as issues valem se divergirem; quem notar corrige aqui.

## Estado

- **Produção:** v0.8.0 (commit `e985ec4`), publicada em 2026-11-15 pelo workflow *Release deploy* (backup
  `BACKUP_OK`, tag). Rollback = restaurar backup (a migração `0072`, CPF único, não é aditiva).
- **`main` à frente da produção.** Isolamento por clínica fechado no código: 45 tabelas com `FORCE ROW LEVEL
  SECURITY` e o papel `estomasystech_app` (#870 a #874, #889, #894). Login e manutenção usam
  `DATABASE_SYSTEM_URL` (`BYPASSRLS`). A aplicação usa `DATABASE_APP_URL`, com usuário restrito. E-mail de
  login cifrado (ADR-111, #742). Essas entregas estão na `main` (Homologação no board EST): ainda não em
  produção. As issues do GitHub seguem abertas.
- **A `main` não vai para produção** sem os passos de `docs/engineering/producao.md` § 4.5 a 4.7: papéis,
  usuário do backup, conexão de sistema, migração com o dono e `data:reencrypt`.
- **Cadastros da v0.8.0:** `data:reencrypt` regravou 2 linhas em `patients_identity`; a segunda rodada deu
  «Nada pendente». Falta o dono conferir as buscas (nome, CPF, telefone) no app.
- **Não há release aberta.** Fluxo ADR-109: branch curta da `main` (`feat/`, `fix/` ou `docs/`), um PR para a
  `main` por sessão, CI como revisor, squash automático em PR comum com CI verde. Classe 3 espera o clique no
  Environment `aprovacao-classe-3`, com o link do job e só com o CI verde. Staging publica sozinha a cada
  merge na `main`. Produção sai pelo workflow *Release deploy*, com o clique no Environment `producao`.

## Fila (ordem)

1. **#887 (P2, cifra e auditoria, classe 3 provável).** A trilha grava o e-mail de login em claro em
   `audit_events.resource_id` (`action = 'read'`, `resource_type = 'session'`): sucesso usa o e-mail da conta,
   falha usa o que a pessoa digitou (`src/app/api/auth/login/route.ts`). **Parada na decisão do dono:** id da
   conta, hash cego (`login-email`), e-mail cifrado, ou claro com retenção curta. Não escolher no código.
   Com o outro agente, junto com o deploy da v0.9.0.
2. **v0.10.0 (tema: ficha e agenda rápidas e estáveis, com evolução clínica mais legível; sem tocar em auth,
   auditoria, cifra ou release).** Label e projeto `v0.10.0`. Ordem:
   1. #559, Web Vitals de campo e medição final (P2, M), em três tickets: #903 (coleta sem PII), #904 (bundle,
      meta nova: nenhuma rota acima da linha de base, errata do ADR-080) e #905 (medição final, `check:server-first`
      com allowlist vazia; depende de #903 e #904).
   2. #906, CLS de 0,49 na ficha em 390 px (P2, P).
   3. #907, comparar duas fotos da condição à escolha (P2, M; hoje só primeira × última).
   4. #855, página e linhas do paciente num snapshot (P3, P).
   5. #896, cenários de RLS independentes da ordem (P3, P).
   6. #560, spike de PPR e CSP por hash (P3, P), só se sobrar capacidade; nota em `.specs/`, sem merge de código.
   Até três threads de código, nunca duas no mesmo domínio.
3. **Contração da cifra**, na release seguinte ao `data:reencrypt` em produção: drop de `birth_date` e dos
   índices GIN antigos; no e-mail de login, `email_hash` `NOT NULL`, fim do ramo em claro e drop dos índices
   antigos (ADR-111).
4. **Esteira e CI por último** (candidatas à v0.11.0, nesta ordem: #820, #830, #832, portões que falham abertos,
   e #745, CodeQL sem análise do TS): #744, #745, #802, #820, #828, #830, #832, #849, #862. Dívida e desempenho
   fora da v0.10.0: #815 (71 funções de complexidade, G), #883 (pacote cliente do `@still-void/ui`, decidir
   depois de #904), #651 e #650 (precisam de trace), #541 (épico, fecha com a #905).
5. **Funcionalidade que espera decisão do dono** (regra 5, não inventar): RM-14 WhatsApp com template da Meta
   (a clínica aceita custo por mensagem?), RM-16 oferta de vaga da lista de espera (prazo da oferta), RM-15
   relatório ao parceiro (cadência e canal), RM-05 pagamento online (PSP) e RM-17 TISS.

## Espera o dono

- **#887:** como a trilha identifica quem tentou entrar.
- **Publicar a `main`:** `docs/engineering/producao.md` § 4.5 a 4.7 e, em seguida,
  `npm run data:reencrypt` (também `user_accounts_email`) até «Nada pendente».
- Conferir as buscas (nome, CPF, telefone) depois da conversão da v0.8.0.
- **#376** (parecer jurídico, condição para paciente real) e **#654** (rotina mensal de 2026-11).
- P1 de segurança vem antes de tela, desempenho ou dívida. Mobile first. Cobertura: piso 90% global e 100% no
  núcleo. `Closes #N` fecha a issue no merge. Homologação no board EST quer dizer na `main` e ainda não em
  produção.
