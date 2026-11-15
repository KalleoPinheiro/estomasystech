## Correção da instrução do Environment aprovacao-classe-3 (#825) (2026-11-14) — EM REVISÃO
- **O que mudou**: só `docs/adr/105-*.md`: o passo do Environment mandava restringir *Deployment branches* a `release/**` e `main`, o que recusa o job em `refs/pull/N/merge` (visto no #817). Agora manda manter *No restriction*, com a explicação. Nenhum outro doc repetia a instrução (busca em `docs/`, `AGENTS.md` e `.specs/`).
- **Next step**: revisora; PR só de documentação, sem changeset. O Kalléo já voltou o painel para "No restriction".
