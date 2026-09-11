# Pacote de release

## Escopo

Esta referencia descreve o artefato consumido pelos instaladores do OnFrame. Ela
nao define branches, tags ou SemVer; essas regras pertencem exclusivamente a
skill `fluxo-git-releases`.

## Conteudo do pacote

`npm run package:release` cria
`dist/onframe-vMAJOR.MINOR.PATCH.zip`. O ZIP contem somente os arquivos
necessarios para executar o produto:

- `extension/`;
- `service/`;
- `scripts/bootstrap/`;
- `package.json`;
- `.env.example`.

O empacotador exclui `node_modules`, `dist`, `.git`,
`.onframe`, `docs`, `README.md`, `CHANGELOG.md` e
`RELEASE.md`. A documentacao canonica permanece no repositorio e nao e
instalada no computador da pessoa usuaria.

## Consistencia

Antes de gerar o pacote, `npm run version:check` exige que a versao de
`package.json`, `package-lock.json` e
`extension/manifest.json` seja a mesma e use `MAJOR.MINOR.PATCH`.

`npm run release:check` executa a verificacao de versao, a auditoria de
dependencias, a suite de testes e o empacotamento.

## Publicacao

O workflow `.github/workflows/release.yml` e disparado por uma tag
`vMAJOR.MINOR.PATCH`. Ele valida os scripts do macOS, executa
`npm run release:check`, prepara as notas a partir de `CHANGELOG.md`
e publica o ZIP em uma GitHub Release.

Os instaladores procuram o artefato atual com o nome
`onframe-vMAJOR.MINOR.PATCH.zip` e aceitam
`onframe-release-vMAJOR.MINOR.PATCH.zip` apenas para compatibilidade com
instalacoes antigas.

## Fonte de verdade

- Empacotamento: `scripts/release/package-release.js`.
- Validacao de versao: `scripts/release/check-version.js`.
- Notas: `scripts/release/prepare-release-notes.js`.
- Publicacao: `.github/workflows/release.yml`.
