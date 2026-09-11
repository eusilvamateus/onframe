# Ambiente e validacao

## Objetivo

Este documento orienta contribuicoes no repositorio. Ele cobre o ambiente local,
os comandos de verificacao e os limites entre desenvolvimento e instalacao de
usuario.

## Pre-requisitos

- Node.js 20 ou superior para executar o projeto localmente.
- Dependencias instaladas a partir de `package-lock.json`.
- PowerShell no Windows quando for validar os scripts `.ps1`.
- `/bin/sh` no macOS ou Linux quando for validar os scripts `.sh`.

A instalacao de usuario e independente deste ambiente. Ela usa os scripts de
bootstrap e, no macOS, instala um runtime Node.js privado. Consulte
[Instalacao e atualizacao](../user/instalacao-e-atualizacao.md) para esse fluxo.

## Preparacao

Na raiz do repositorio:

```powershell
npm ci
```

Inicie o servico local para desenvolvimento com:

```powershell
npm start
```

O processo escuta apenas em `127.0.0.1`. Os detalhes operacionais ficam em
[Servico local](../operations/servico-local.md).

## Validacao

| Objetivo | Comando |
| --- | --- |
| Testes padrao | `npm test` |
| Suite completa nomeada | `npm run test:all` |
| Diagnostico da instalacao no Windows | `npm run check` |
| Consistencia de versao | `npm run version:check` |
| Pacote de release | `npm run package:release` |
| Validacao completa de release | `npm run release:check` |

Use `npm run test:all` antes de entregar alteracoes de comportamento. A
validacao de release tambem executa a verificacao de versao, a auditoria de
dependencias, os testes e o empacotamento.

## Escopo das alteracoes

- Mudancas em `extension/` devem preservar a separacao entre codigo
  compartilhado, modulos de dominio e telas nativas.
- Mudancas em `service/` devem manter segredos no servico local e
  contratos HTTP compativeis com a extensao.
- Mudancas em `scripts/bootstrap/` precisam considerar Windows e macOS,
  porque esses arquivos sao baixados e executados em instalacoes existentes.
- Mudancas em regras de produto devem atualizar a fonte correspondente em
  `docs/product/` na mesma entrega.

## Git e releases

O fluxo de branches, commits, versao e publicacao pertence exclusivamente a
skill `fluxo-git-releases`; ele nao possui uma copia no repositorio. Para a
composicao tecnica do artefato distribuido, consulte
[Pacote de release](../reference/pacote-de-release.md).
