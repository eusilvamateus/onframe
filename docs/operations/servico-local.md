# Servico local

## Objetivo

O servico local e a fronteira entre a extensao e a API autenticada do Mercado
Livre. Ele roda por usuario, atende apenas no computador local e mantem as
credenciais fora da pagina do anuncio.

## Execucao

`service/server.js` inicia o processo em `127.0.0.1`. A porta padrao e
`4765` e pode ser alterada por `ML_SERVICE_PORT` no `.env`.

A instalacao via bootstrap registra os controles locais para a sessao do usuario
e inicia o servico. No macOS, o bootstrap registra um LaunchAgent por usuario.
Nao exponha o servico em uma interface de rede publica.

## Observabilidade

| Recurso | Uso |
| --- | --- |
| `GET /health` | Confirma que o processo responde. |
| `GET /diagnostics` | Informa versao, runtime, configuracao de token e estado da conta. |
| `GET /updates/status` | Informa a disponibilidade de uma release para a extensao. |
| `.onframe/logs/service.out.log` | Saida normal do processo instalado. |
| `.onframe/logs/service.err.log` | Saida de erro do processo instalado. |
| `.onframe/logs/security.log` | Registro sanitizado de requisicoes ao servico. |

Em uma instalacao padrao, os logs ficam em
`%LOCALAPPDATA%\OnFrame\.onframe\logs` no Windows e em
`~/Library/Application Support/OnFrame/.onframe/logs` no macOS.

## Operacao

Para a operacao cotidiana, use os controles do popup/opcoes ou os comandos de
[Instalacao e atualizacao](../user/instalacao-e-atualizacao.md). Eles chamam os
scripts `start`, `stop`, `restart`, `check` e `update`
da instalacao, que preservam a configuracao local.

No desenvolvimento, inicie o processo com `npm start`. Para verificar a
resposta sem a extensao:

```powershell
Invoke-RestMethod http://127.0.0.1:4765/health
```

## Recuperacao

1. Execute `check` para confirmar porta, runtime, configuracao e conta.
2. Use `restart` se `/health` nao responder.
3. Consulte `service.err.log` para falhas de inicializacao.
4. Reconecte a conta quando o diagnostico indicar token ausente, expirado ou
   invalido.
5. Use `update` ou o botao `Atualizar agora` se a instalacao estiver
   desatualizada.

A pagina de atualizacao e interna a extensao. Ela usa o protocolo local
`onframe-updater://`; `/updates/status` permanece somente como API de
consulta de versao e nao oferece uma pagina HTML de atualizacao.

## Configuracao e seguranca

A configuracao e os tokens pertencem ao diretorio da instalacao. Nao apague
`.env` ou `.onframe` para diagnosticar uma falha: isso pode desconectar
contas. A [integracao Mercado Livre](../integrations/mercado-livre.md) descreve
os arquivos, segredos e as origens permitidas.
