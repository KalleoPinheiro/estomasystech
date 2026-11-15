## Fila de próximos passos no handoff (#834, ADR-107) (2026-11-14) — EM REVISÃO
- **Por quê**: a ordem do que vem a seguir vivia na memória do coordenador e em comentários de issue/PR; o agente que assume não a vê e o PR pode ser mergeado e esquecido.
- **O que mudou**: `.specs/archive/handoff/PROXIMOS-PASSOS.md` (fila única, conferida contra as issues abertas em 2026-11-14); ADR-107 (adendo ao ADR-102, congelado): todo PR de entrega e toda troca de agente atualizam a fila; `AGENTS.md` (150 linhas) e `convivencia-llms.md` mandam quem assume ler a fila junto do `npm run estado`; índice em `docs/README.md`.
- **Testes**: só `.md`; `check:docs` verde; nenhum teste nem `scripts/gate/` alterado.
- **Fora do repositório (só o Kalléo)**: nada. Possível classe 3 por tocar `AGENTS.md`/ADR de governança, conforme o portão de risco.
- **Next step**: the-judge em thread revisora; check por máquina na #835 (v0.8.0). **Blockers**: nenhum.
