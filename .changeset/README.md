# Changesets

Cada PR que toca `src/`, `drizzle/` ou `Dockerfile` traz um arquivo `.changeset/<nome>.md`
(`npm run changeset`). PR só de docs ou CI usa `npx changeset --empty`.

Escolha o nível pela regra do projeto ([ADR-043](../docs/adr/043-versionamento-com-changesets-e-release-por-tag.md)):

- **major**: migração que não é só aditiva (o rollback exige restaurar o backup) ou mudança que
  rompe contrato.
- **minor**: funcionalidade que a clínica percebe.
- **patch**: correção ou ajuste interno.

O resumo vai para o `CHANGELOG.md` e para a GitHub Release: escreva em português, para quem lê o
changelog, não para quem leu o diff. Release: `npm run release:prepare`, merge do PR de versão,
`npm run release:publish -- --rollback=redeploy|backup`. Detalhes em
[`docs/engineering/producao.md`](../docs/engineering/producao.md) § 3.1.
