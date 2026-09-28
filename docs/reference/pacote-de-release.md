# Pacote de release

## Escopo

Esta referência descreve o artefato consumido pelos instaladores do OnFrame.
Ela não define branches, tags ou SemVer; essas regras pertencem exclusivamente
à skill `fluxo-git-releases`.

## Conteúdo

`npm run package:release` cria
`dist/onframe-vMAJOR.MINOR.PATCH.zip`. O ZIP contém somente:

- `extension/`;
- `scripts/bootstrap/`;
- `package.json`.

O empacotador exclui `node_modules`, `dist`, `.git`, `.onframe`,
`docs`, `README.md`, `CHANGELOG.md` e `RELEASE.md`. Não há
servidor, runtime Node privado, arquivo `.env` ou credencial do Mercado
Livre no pacote.

## Instalação e atualização

Os instaladores copiam apenas a extensão, os scripts de bootstrap e
`package.json`. No Windows, o protocolo `onframe-updater://update`
executa o atualizador PowerShell. No macOS, ele abre o app auxiliar de
atualização registrado pelo instalador.

## Consistência

Antes de gerar o pacote, `npm run version:check` exige que a versão de
`package.json`, `package-lock.json` e
`extension/manifest.json` seja a mesma e use `MAJOR.MINOR.PATCH`.

`npm run release:check` executa verificação de versão, auditoria de
dependências, testes e empacotamento.

## Fonte de verdade

- Empacotamento: `scripts/release/package-release.js`.
- Validação de versão: `scripts/release/check-version.js`.
- Notas: `scripts/release/prepare-release-notes.js`.
- Publicação: `.github/workflows/release.yml`.
