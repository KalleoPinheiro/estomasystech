---
"estomasystech": patch
---

Conexão com o banco sempre com `sslmode=verify-full` explícito quando a URL pede SSL (`prefer`, `require` e `verify-ca` eram só apelido no `pg` e mudariam de significado na próxima versão). Exige Node 24.11 ou mais nos `engines` e zera os avisos de instalação do build (peer do `msw` e `allowScripts` do `esbuild`).
