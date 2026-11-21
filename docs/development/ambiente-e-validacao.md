# Ambiente e validação

## Objetivo

Este guia descreve o ambiente do repositório e as verificações antes da entrega.
O produto não possui servidor Node local para iniciar ou diagnosticar.

## Pré-requisitos

- Node.js 20 ou superior para testes, scripts de release e o projeto Worker.
- Dependências instaladas a partir de `package-lock.json` na raiz e em `cloudflare/`.

Na raiz do repositório:

`B`powershell
npm ci
`B`

## Validação

| Objetivo                      | Comando                                 |
| ----------------------------- | --------------------------------------- |
| Testes padrão                 | `npm test`                              |
| Suíte nomeada                 | `npm run test:all`                      |
| Consistência de versão        | `npm run version:check`                 |
| Pacote para a loja            | `npm run package:store`                 |
| Worker                        | `npm run check` dentro de `cloudflare/` |
| Validação completa de release | `npm run release:check`                 |

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
- Mudanças de produto devem atualizar a fonte correspondente em `docs/`.
- Testes de identidade executam as migrações PostgreSQL com PGlite e as
  migrações D1 com Miniflare, sem acessar bancos remotos. Para a ativação,
  consulte [Publicação da identidade](../operations/publicacao-identidade.md).

## Git e releases

O fluxo de branches, commits, versão e publicação pertence exclusivamente à
skill `fluxo-git-releases`. Para a composição técnica do artefato, consulte
[Pacote para a Chrome Web Store](../reference/pacote-de-release.md).
