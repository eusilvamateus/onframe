# Pacote para a Chrome Web Store

## Escopo

Este documento descreve o artefato de envio à Chrome Web Store. As regras de branches, tags, SemVer e GitHub Releases pertencem à skill `fluxo-git-releases`.

## Conteúdo

`npm run package:store` compila a interface e cria `dist/onframe-store-vMAJOR.MINOR.PATCH.zip`. O ZIP contém somente os arquivos da pasta `extension/`, diretamente na raiz do arquivo compactado. `manifest.json` fica na raiz, sem pasta intermediária, scripts de instalação, arquivos do Worker ou credenciais.

O arquivo é usado no envio da extensão à Chrome Web Store; não é um instalador para distribuição direta. O workflow de release preserva as notas da GitHub Release e disponibiliza o ZIP como artefato da execução, sem anexá-lo à release pública.

## Consistência

Antes do empacotamento, `npm run version:check` exige a mesma versão em `package.json`, `package-lock.json` e `extension/manifest.json`.

`npm run release:check` executa a verificação de versão, auditoria de dependências, testes e empacotamento.

## Fonte de verdade

- Empacotamento: `scripts/release/package-store.js`.
- Validação de versão: `scripts/release/check-version.js`.
- Notas: `scripts/release/prepare-release-notes.js`.
- Workflow: `.github/workflows/release.yml`.
