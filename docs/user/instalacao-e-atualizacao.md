# Instalação e atualização

## Pré-requisitos

- Windows ou macOS 13 Ventura ou superior;
- Chrome ou Edge com o modo desenvolvedor ativado;
- conta OnFrame com acesso ao workspace.

Não é necessário instalar Node.js, iniciar um serviço ou autorizar contas do
Mercado Livre no computador.

## Instalação

No Windows, abra o PowerShell:

`B`powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.ps1' | iex
`B`

No macOS, abra o Terminal:

`B`sh
onframe_bootstrap="$(mktemp)" && \
/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.sh' -o "$onframe_bootstrap" && \
/bin/sh "$onframe_bootstrap"; onframe_status=$?; rm -f "$onframe_bootstrap"; (exit "$onframe_status")
`B`

A instalação padrão fica em `%LOCALAPPDATA%\OnFrame` no Windows e em
`~/Library/Application Support/OnFrame` no macOS.

## Carregar a extensão

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em `Carregar sem compactação`.
4. Selecione a pasta `extension` da instalação.

## Entrar e conectar contas

1. Abra as opções da extensão.
2. Entre com e-mail e senha ou crie a conta. O link mágico é uma alternativa
   opcional; ele não substitui o acesso por senha.
3. Para cadastro confirmado, link mágico ou recuperação, abra o link recebido
   por e-mail e depois volte às opções ou ao popup da extensão.
4. Em `Contas do workspace`, escolha conectar uma conta do Mercado Livre.
5. Conclua a autorização na aba aberta.

As contas e suas credenciais pertencem ao workspace remoto. O computador guarda
apenas a sessão revogável da extensão, nunca a senha nem o bearer do Supabase.

## Atualizar

Use `Atualizar agora` no popup ou nas opções. O navegador pode pedir
autorização para abrir `onframe-updater://update`. Ao final, recarregue a
extensão em `chrome://extensions` ou `edge://extensions`.

Para atualizar manualmente no Windows:

`B`powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' | iex
`B`

No macOS:

`B`sh
onframe_bootstrap="$(mktemp)" && \
/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.sh' -o "$onframe_bootstrap" && \
ONFRAME_HOME="$HOME/Library/Application Support/OnFrame" /bin/sh "$onframe_bootstrap"; onframe_status=$?; rm -f "$onframe_bootstrap"; (exit "$onframe_status")
`B`

## Desinstalar

No Windows:

`B`powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/uninstall.ps1' | iex
`B`

No macOS:

`B`sh
onframe_bootstrap="$(mktemp)" && \
/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/uninstall.sh' -o "$onframe_bootstrap" && \
/bin/sh "$onframe_bootstrap"; onframe_status=$?; rm -f "$onframe_bootstrap"; (exit "$onframe_status")
`B`

Depois, remova a extensão do navegador.
