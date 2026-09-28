# Ambiente e validação

## Objetivo

Este guia descreve o ambiente do repositório e as verificações antes da entrega.
O produto não possui servidor Node local para iniciar ou diagnosticar.

## Pré-requisitos

- Node.js 20 ou superior para testes, scripts de release e o projeto Worker.
- Dependências instaladas a partir de `package-lock.json`.
- PowerShell no Windows para validar scripts `.ps1`.
- `/bin/sh` no macOS ou Linux para validar scripts `.sh`.

Na raiz do repositório:

`B`powershell
npm ci
`B`

## Validação

| Objetivo | Comando |
| --- | --- |
| Testes padrão | `npm test` |
| Suíte nomeada | `npm run test:all` |
| Consistência de versão | `npm run version:check` |
| Pacote de release | `npm run package:release` |
| Worker | `npm run check` dentro de `cloudflare/` |
| Validação completa de release | `npm run release:check` |

Use `npm run test:all` antes de entregar alterações de comportamento. A
validação de release executa verificação de versão, auditoria de dependências,
testes e empacotamento.

## Escopo das alterações

- Mudanças em `extension/` devem preservar a bridge pelo `background` e
  nunca introduzir chamadas autenticadas diretas.
- Mudanças em `cloudflare/src/domain/` precisam manter o contrato usado por
  `legacy-contracts.ts` e pela suíte Node.
- Mudanças no Worker devem validar tipos e, para deploy, usar exclusivamente os
  recursos oficiais da Cloudflare.
- Mudanças em `scripts/bootstrap/` precisam considerar Windows e macOS,
  pois os arquivos são baixados por instalações existentes.
- Mudanças de produto devem atualizar a fonte correspondente em `docs/`.

## Git e releases

O fluxo de branches, commits, versão e publicação pertence exclusivamente à
skill `fluxo-git-releases`. Para a composição técnica do artefato, consulte
[Pacote de release](../reference/pacote-de-release.md).
