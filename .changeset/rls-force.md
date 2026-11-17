---
"estomasystech": patch
---

Última etapa do isolamento entre clínicas no banco: o Postgres passa a aplicar a regra de isolamento também ao dono das tabelas e cobre as tabelas de clínicas, tokens de acesso e segundo fator. Atenção ao publicar: a conexão da aplicação precisa já estar no usuário restrito do banco antes desta versão migrar; se ela ainda usar o dono comum, passa a ver zero linhas assim que a migração rodar. A ordem exata está no runbook (§ 4.7). Para quem usa o sistema com a conexão já ajustada, nada muda.
