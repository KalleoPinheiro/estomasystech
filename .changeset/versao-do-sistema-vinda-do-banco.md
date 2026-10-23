---
"estomasystech": minor
---

O rodapé da barra lateral e do portal passa a mostrar a versão registrada no banco a cada implantação, e não mais a do `package.json` embutida no build, que na homologação ainda mostrava a release anterior (`v0.1.0`). Se o banco falhar, o rodapé cai para a versão do build. A homologação continua mostrando o código curto da versão; a produção só a versão.
